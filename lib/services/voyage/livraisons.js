import { supabase } from '../../supabase'

export async function saveLiv(voyageId, form, { clients, grignonClients, typeBriques, voyage, achats }) {
  const qte = parseFloat(form.qte)||0, pv = parseFloat(form.prix_vente)||0
  const pa  = parseFloat(form.prix_achat)||0, rem = parseFloat(form.remise)||0
  const total_vente = Math.round((qte*pv-rem)*100)/100
  const total_achat = Math.round(qte*pa*100)/100
  const marge = Math.round((total_vente-total_achat)*100)/100
  const clientId = parseInt(form.client_id)
  const cl = form.type_produit==='grignon'
    ? grignonClients.find(c=>c.id===clientId)
    : clients.find(c=>c.id===clientId)
  const ty = typeBriques.find(t=>t.id===parseInt(form.type_brique_id))

  // For brique: insert ventes FIRST to get vente_id, then insert voyage_livraisons with it set atomically.
  // This guarantees vente_id is never null, so delete always finds the linked vente.
  let venteId = null
  if (form.type_produit === 'brique') {
    const { data: venteData, error: venteErr } = await supabase.from('ventes').insert({
      date: form.date_livraison, date_fournisseur: form.date_livraison,
      client_id: clientId, client_nom: cl?.nom||'',
      camion_id: voyage?.camion_id||null, camion_plaque: voyage?.camion_plaque||'', chauffeur: voyage?.chauffeur||'',
      type_brique_id: form.type_brique_id ? parseInt(form.type_brique_id) : null,
      type_brique: ty?.nom||'', qte, prix_vente: pv, prix_achat: pa, total_vente, total_achat, marge, voyage_id: parseInt(voyageId),
    }).select().single()
    if (venteErr) throw venteErr
    venteId = venteData.id
  }

  const { error: livErr } = await supabase.from('voyage_livraisons').insert({
    voyage_id: parseInt(voyageId), date_livraison: form.date_livraison, type_produit: form.type_produit,
    client_id: clientId, client_nom: cl?.nom||'',
    type_brique: form.type_produit==='grignon' ? 'Grignon' : (ty?.nom||''),
    qte, prix_vente: pv, prix_achat: pa, remise: rem,
    note: form.note||null, vente_id: venteId,
  }).select().single()
  if (livErr) throw livErr

  if (form.type_produit === 'brique') {
    const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', clientId).single()
    if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde||0)+total_vente }).eq('id', clientId)
  }

  if (form.type_produit === 'grignon') {
    // Get prix_achat from the grignon achat in this voyage (most recent)
    const grignonAchats = achats.filter(a => a.type_produit === 'grignon')
    const grignonAchat  = grignonAchats[grignonAchats.length - 1]
    const prixAchatGrignon = pa > 0 ? pa : (grignonAchat?.prix_achat || 0)
    const totalAchatGrignon = Math.round(qte * prixAchatGrignon * 100) / 100
    const margeGrignon = Math.round((total_vente - totalAchatGrignon) * 100) / 100

    const grignonPayload = {
      date:            form.date_livraison,
      client_id:       clientId,
      client_nom:      cl?.nom || '',
      camion_id:       voyage?.camion_id || null,
      camion_plaque:   voyage?.camion_plaque || '',
      chauffeur:       voyage?.chauffeur || '',
      fournisseur_id:  grignonAchat?.fournisseur_id || null,
      fournisseur_nom: grignonAchat?.fournisseur_nom || '',
      qte,
      prix_vente:      pv,
      prix_achat:      prixAchatGrignon,
      total_vente,
      total_achat:     totalAchatGrignon,
      marge:           margeGrignon,
      voyage_id:       parseInt(voyageId),
    }
    let { error: grigErr } = await supabase.from('grignon_operations').insert(grignonPayload)
    if (grigErr) {
      // voyage_id column may not exist yet — retry without it
      const { voyage_id: _vid, ...payloadWithoutVid } = grignonPayload
      const { error: grigErr2 } = await supabase.from('grignon_operations').insert(payloadWithoutVid)
      if (grigErr2) throw new Error('Erreur grignon_operations: ' + grigErr2.message)
    }
    // Update grignon client solde
    const { data: freshGcl } = await supabase.from('grignon_clients').select('solde').eq('id', clientId).single()
    if (freshGcl) await supabase.from('grignon_clients').update({ solde: (freshGcl.solde||0)+total_vente }).eq('id', clientId)
  }
}

export async function updateLiv(old, editForm) {
  const qte = parseFloat(editForm.qte)||0, pv = parseFloat(editForm.prix_vente)||0
  const pa  = parseFloat(editForm.prix_achat)||0, rem = parseFloat(editForm.remise)||0
  const total_vente = Math.round((qte*pv-rem)*100)/100
  const total_achat = Math.round(qte*pa*100)/100
  const marge = Math.round((total_vente-total_achat)*100)/100

  // Try atomic RPC first, fallback to manual
  const { error: rpcErr } = await supabase.rpc('update_voyage_livraison', {
    p_id: old.id, p_date: editForm.date_livraison, p_qte: qte,
    p_prix_vente: pv, p_prix_achat: pa, p_remise: rem,
    p_total_vente: total_vente, p_total_achat: total_achat, p_marge: marge,
    p_note: editForm.note||null,
  })

  if (rpcErr) {
    // Fallback: manual multi-step
    await supabase.from('voyage_livraisons').update({
      date_livraison: editForm.date_livraison, qte, prix_vente: pv, prix_achat: pa,
      remise: rem, note: editForm.note||null
    }).eq('id', old.id)
    if (old.vente_id) await supabase.from('ventes').update({
      qte, prix_vente: pv, prix_achat: pa, total_vente, total_achat, marge
    }).eq('id', old.vente_id)
    // Fetch fresh client before updating solde
    const diff = total_vente - (old.total_vente||0)
    if (diff !== 0 && old.client_id) {
      const tbl = old.type_produit === 'grignon' ? 'grignon_clients' : 'clients'
      const { data: freshCl } = await supabase.from(tbl).select('solde').eq('id', old.client_id).single()
      if (freshCl) await supabase.from(tbl).update({ solde: (freshCl.solde||0)+diff }).eq('id', old.client_id)
    }
  }

  // Keep grignon_operations in sync — update by (voyage_id, client_id, date) or fallback (client_id, date)
  if (old.type_produit === 'grignon' && old.client_id) {
    const grigUpdate = { date: editForm.date_livraison, qte, prix_vente: pv, prix_achat: pa, total_vente, total_achat, marge }
    const { error: updGrigErr } = await supabase.from('grignon_operations')
      .update(grigUpdate)
      .eq('voyage_id', old.voyage_id)
      .eq('client_id', old.client_id)
      .eq('date', old.date_livraison)
    if (updGrigErr) {
      await supabase.from('grignon_operations')
        .update(grigUpdate)
        .eq('client_id', old.client_id)
        .eq('date', old.date_livraison)
    }
  }
}

export async function delLiv(row) {
  const { error: rpcErr } = await supabase.rpc('delete_voyage_livraison', { p_id: row.id })
  if (rpcErr) {
    // Fallback: manual multi-step with fresh-read
    await supabase.from('voyage_livraisons').delete().eq('id', row.id)
    if (row.client_id) {
      const tbl = row.type_produit==='grignon' ? 'grignon_clients' : 'clients'
      const { data: freshCl } = await supabase.from(tbl).select('solde').eq('id', row.client_id).single()
      if (freshCl) await supabase.from(tbl).update({ solde: (freshCl.solde||0)-(row.total_vente||0) }).eq('id', row.client_id)
    }
  }
  // Always clean up the linked vente — idempotent even if RPC already deleted it.
  // vente_id can be null on old rows so also fall back to matching by context.
  if (row.vente_id) {
    await supabase.from('ventes').delete().eq('id', row.vente_id)
  } else if (row.type_produit !== 'grignon' && row.voyage_id && row.client_id) {
    await supabase.from('ventes')
      .delete()
      .eq('voyage_id', row.voyage_id)
      .eq('client_id', row.client_id)
      .eq('date', row.date_livraison)
      .eq('total_vente', row.total_vente)
      .is('type_entree', null)
  }
  // Clean up grignon_operations for grignon livraisons (not handled by RPC)
  if (row.type_produit === 'grignon' && row.client_id) {
    // Try precise match with voyage_id first; fall back to date+client if column missing
    const { error: delGrigErr } = await supabase.from('grignon_operations')
      .delete()
      .eq('voyage_id', row.voyage_id)
      .eq('client_id', row.client_id)
      .eq('date', row.date_livraison)
    if (delGrigErr) {
      await supabase.from('grignon_operations')
        .delete()
        .eq('client_id', row.client_id)
        .eq('date', row.date_livraison)
    }
  }
}
