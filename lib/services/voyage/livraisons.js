import { supabase } from '../../supabase'

// Compute frais totals from the frais array in the form
function computeFrais(frais = []) {
  const items = (frais || []).filter(f => f.label && parseFloat(f.montant) > 0)
  const total = Math.round(items.reduce((s, f) => s + (parseFloat(f.montant) || 0), 0) * 100) / 100
  const noteStr = items.length > 0
    ? items.map(f => `${f.label} ${parseFloat(f.montant).toLocaleString('fr-MA')} DHS`).join(' · ')
    : null
  return { items, total, noteStr }
}

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

  const { items: fraisItems, total: frais_total, noteStr: frais_note } = computeFrais(form.frais)
  const accounting_total = Math.round((total_vente + frais_total) * 100) / 100

  // For brique: insert ventes FIRST to get vente_id, then insert voyage_livraisons with it set atomically.
  let venteId = null
  if (form.type_produit === 'brique') {
    const { data: venteData, error: venteErr } = await supabase.from('ventes').insert({
      date: form.date_livraison, date_fournisseur: form.date_livraison,
      client_id: clientId, client_nom: cl?.nom||'',
      camion_id: voyage?.camion_id||null, camion_plaque: voyage?.camion_plaque||'', chauffeur: voyage?.chauffeur||'',
      type_brique_id: form.type_brique_id ? parseInt(form.type_brique_id) : null,
      type_brique: ty?.nom||'', qte, prix_vente: pv, prix_achat: pa,
      voyage_id: parseInt(voyageId),
      note: form.note||null,
    }).select().single()
    if (venteErr) throw venteErr
    venteId = venteData.id
    // Store frais breakdown note on ventes (silent ignore if column not yet added)
    if (frais_note && venteId) {
      await supabase.from('ventes').update({ frais_note }).eq('id', venteId)
    }
  }

  const { data: livData, error: livErr } = await supabase.from('voyage_livraisons').insert({
    voyage_id: parseInt(voyageId), date_livraison: form.date_livraison, type_produit: form.type_produit,
    client_id: clientId, client_nom: cl?.nom||'',
    type_brique: form.type_produit==='grignon' ? 'Grignon' : (ty?.nom||''),
    qte, prix_vente: pv, prix_achat: pa, remise: rem,
    total_vente, total_achat, marge,
    note: form.note||null, vente_id: venteId,
  }).select().single()
  if (livErr) throw livErr

  // Save frais_total on livraison (awaited; silently ignored if column not yet added via SQL migration)
  if (livData?.id) {
    await supabase.from('voyage_livraisons').update({ frais_total }).eq('id', livData.id)
  }

  // Save individual frais records (awaited; silently ignored if table not yet created via SQL migration)
  if (fraisItems.length > 0 && livData?.id) {
    await supabase.from('voyage_livraison_frais').insert(
      fraisItems.map(f => ({ livraison_id: livData.id, label: f.label, montant: parseFloat(f.montant)||0, note: f.note||null }))
    )
  }

  if (form.type_produit === 'brique') {
    const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', clientId).single()
    if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde||0)+accounting_total }).eq('id', clientId)
  }

  if (form.type_produit === 'grignon') {
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
      total_vente:     accounting_total,
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
    const { data: freshGcl } = await supabase.from('grignon_clients').select('solde').eq('id', clientId).single()
    if (freshGcl) await supabase.from('grignon_clients').update({ solde: (freshGcl.solde||0)+accounting_total }).eq('id', clientId)
  }
}

export async function updateLiv(old, editForm) {
  const qte = parseFloat(editForm.qte)||0, pv = parseFloat(editForm.prix_vente)||0
  const pa  = parseFloat(editForm.prix_achat)||0, rem = parseFloat(editForm.remise)||0
  const total_vente = Math.round((qte*pv-rem)*100)/100
  const total_achat = Math.round(qte*pa*100)/100
  const marge = Math.round((total_vente-total_achat)*100)/100

  const { items: fraisItems, total: new_frais_total, noteStr: frais_note } = computeFrais(editForm.frais)
  const new_accounting_total = Math.round((total_vente + new_frais_total) * 100) / 100
  const old_accounting_total = Math.round(((old.total_vente||0) + (old.frais_total||0)) * 100) / 100

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
      remise: rem, note: editForm.note||null,
      total_vente, total_achat, marge,
    }).eq('id', old.id)
    if (old.vente_id) await supabase.from('ventes').update({
      qte, prix_vente: pv, prix_achat: pa,
      note: editForm.note||null,
    }).eq('id', old.vente_id)
    const diff = new_accounting_total - old_accounting_total
    if (diff !== 0 && old.client_id) {
      const tbl = old.type_produit === 'grignon' ? 'grignon_clients' : 'clients'
      const { data: freshCl } = await supabase.from(tbl).select('solde').eq('id', old.client_id).single()
      if (freshCl) await supabase.from(tbl).update({ solde: (freshCl.solde||0)+diff }).eq('id', old.client_id)
    }
  } else {
    // RPC succeeded for base product fields; handle note + frais separately
    if (old.vente_id) {
      await supabase.from('ventes').update({
        note: editForm.note||null,
      }).eq('id', old.vente_id)
    }
    const diff = new_accounting_total - old_accounting_total
    if (diff !== 0 && old.client_id) {
      const tbl = old.type_produit === 'grignon' ? 'grignon_clients' : 'clients'
      const { data: freshCl } = await supabase.from(tbl).select('solde').eq('id', old.client_id).single()
      if (freshCl) await supabase.from(tbl).update({ solde: (freshCl.solde||0)+diff }).eq('id', old.client_id)
    }
  }

  // Always sync note on voyage_livraisons (works regardless of RPC path)
  await supabase.from('voyage_livraisons').update({ note: editForm.note||null }).eq('id', old.id)

  // Update frais_total on livraison (awaited; silently ignored if column not yet added)
  await supabase.from('voyage_livraisons').update({ frais_total: new_frais_total }).eq('id', old.id)

  // Update frais_note on ventes (awaited; silently ignored if column not yet added)
  if (old.vente_id) {
    await supabase.from('ventes').update({ frais_note: frais_note||null }).eq('id', old.vente_id)
  }

  // Replace frais records: delete old, insert new (awaited; silently ignored if table not yet created)
  const { error: delFraisErr } = await supabase.from('voyage_livraison_frais').delete().eq('livraison_id', old.id)
  if (!delFraisErr && fraisItems.length > 0) {
    await supabase.from('voyage_livraison_frais').insert(
      fraisItems.map(f => ({ livraison_id: old.id, label: f.label, montant: parseFloat(f.montant)||0, note: f.note||null }))
    )
  }

  // Keep grignon_operations in sync
  if (old.type_produit === 'grignon' && old.client_id) {
    const grigUpdate = { date: editForm.date_livraison, qte, prix_vente: pv, prix_achat: pa, total_vente: new_accounting_total, total_achat, marge }
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
  const frais_total = row.frais_total || 0
  const accounting_total = Math.round(((row.total_vente||0) + frais_total) * 100) / 100

  const { error: rpcErr } = await supabase.rpc('delete_voyage_livraison', { p_id: row.id })
  if (rpcErr) {
    // Fallback: manual multi-step with fresh-read
    await supabase.from('voyage_livraisons').delete().eq('id', row.id)
    if (row.client_id) {
      const tbl = row.type_produit==='grignon' ? 'grignon_clients' : 'clients'
      const { data: freshCl } = await supabase.from(tbl).select('solde').eq('id', row.client_id).single()
      if (freshCl) await supabase.from(tbl).update({ solde: (freshCl.solde||0)-accounting_total }).eq('id', row.client_id)
    }
  } else if (frais_total > 0 && row.client_id) {
    // RPC reversed only the product total_vente; also reverse frais
    const tbl = row.type_produit==='grignon' ? 'grignon_clients' : 'clients'
    const { data: freshCl } = await supabase.from(tbl).select('solde').eq('id', row.client_id).single()
    if (freshCl) await supabase.from(tbl).update({ solde: (freshCl.solde||0)-frais_total }).eq('id', row.client_id)
  }

  // Clean up frais records (awaited; silently ignored if table not yet created)
  await supabase.from('voyage_livraison_frais').delete().eq('livraison_id', row.id)

  // Always clean up the linked vente — idempotent even if RPC already deleted it.
  if (row.vente_id) {
    await supabase.from('ventes').delete().eq('id', row.vente_id)
  } else if (row.type_produit !== 'grignon' && row.voyage_id && row.client_id) {
    await supabase.from('ventes')
      .delete()
      .eq('voyage_id', row.voyage_id)
      .eq('client_id', row.client_id)
      .eq('date', row.date_livraison)
      .eq('total_vente', accounting_total)
      .is('type_entree', null)
  }
  // Clean up grignon_operations for grignon livraisons (not handled by RPC)
  if (row.type_produit === 'grignon' && row.client_id) {
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
