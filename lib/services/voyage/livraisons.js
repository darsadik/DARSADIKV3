import { supabase } from '../../supabase'

// frais items carry a `kind`: 'charge' (default, increases balance) or
// 'deduction' (decreases balance). montant is always stored as a positive
// magnitude — kind alone determines the sign applied to the net total.
function computeFrais(frais = []) {
  const items = (frais || []).filter(f => f.label && parseFloat(f.montant) > 0)
  const total = Math.round(items.reduce((s, f) => {
    const amt = parseFloat(f.montant) || 0
    return s + (f.kind === 'deduction' ? -amt : amt)
  }, 0) * 100) / 100
  const noteStr = items.length > 0
    ? items.map(f => `${f.label} ${f.kind === 'deduction' ? '-' : ''}${parseFloat(f.montant).toLocaleString('fr-MA')} DHS`).join(' · ')
    : null
  return { items, total, noteStr }
}

export async function saveLiv(voyageId, form, { clients, grignonClients, typeBriques, voyage, achats }) {
  const qte = parseFloat(form.qte) || 0
  const pv  = parseFloat(form.prix_vente) || 0
  const pa  = parseFloat(form.prix_achat) || 0
  const rem = parseFloat(form.remise) || 0
  const total_vente = Math.round((qte * pv - rem) * 100) / 100
  const total_achat = Math.round(qte * pa * 100) / 100
  const marge       = Math.round((total_vente - total_achat) * 100) / 100
  const clientId    = parseInt(form.client_id)

  const cl = form.type_produit === 'grignon'
    ? grignonClients.find(c => c.id === clientId)
    : clients.find(c => c.id === clientId)
  const ty = typeBriques.find(t => t.id === parseInt(form.type_brique_id))

  const { items: fraisItems, total: frais_total, noteStr: frais_note } = computeFrais(form.frais)
  const accounting_total = Math.round((total_vente + frais_total) * 100) / 100

  // ── BRIQUES: try atomic RPC first, fallback with rollback ──────────────────
  if (form.type_produit === 'brique') {
    const { error: rpcErr } = await supabase.rpc('save_livraison_brique', {
      p_voyage_id:      parseInt(voyageId),
      p_date:           form.date_livraison,
      p_client_id:      clientId,
      p_client_nom:     cl?.nom || '',
      p_camion_id:      voyage?.camion_id || null,
      p_camion_plaque:  voyage?.camion_plaque || '',
      p_chauffeur:      voyage?.chauffeur || '',
      p_type_brique_id: form.type_brique_id ? parseInt(form.type_brique_id) : null,
      p_type_brique:    ty?.nom || '',
      p_qte:            qte,
      p_prix_vente:     pv,
      p_prix_achat:     pa,
      p_remise:         rem,
      p_frais_total:    frais_total,
      p_accounting_total: accounting_total,
      p_frais_note:     frais_note || null,
      p_note:           form.note || null,
      p_frais:          fraisItems.map(f => ({ label: f.label, montant: parseFloat(f.montant) || 0, note: f.note || null, kind: f.kind || 'charge' })),
    })
    if (!rpcErr) return  // committed atomically — done

    // RPC not installed yet — fallback with manual rollback on any failure
    let venteId = null
    try {
      const { data: vd, error: vErr } = await supabase.from('ventes').insert({
        date: form.date_livraison, date_fournisseur: form.date_livraison,
        client_id: clientId, client_nom: cl?.nom || '',
        camion_id: voyage?.camion_id || null, camion_plaque: voyage?.camion_plaque || '', chauffeur: voyage?.chauffeur || '',
        type_brique_id: form.type_brique_id ? parseInt(form.type_brique_id) : null,
        type_brique: ty?.nom || '', qte, prix_vente: pv, prix_achat: pa,
        total_vente: accounting_total,
        voyage_id: parseInt(voyageId),
        note: form.note || null,
      }).select().single()
      if (vErr) throw vErr
      venteId = vd.id
      if (frais_note) await supabase.from('ventes').update({ frais_note }).eq('id', venteId)

      const { data: ld, error: lErr } = await supabase.from('voyage_livraisons').insert({
        voyage_id: parseInt(voyageId), date_livraison: form.date_livraison, type_produit: 'brique',
        client_id: clientId, client_nom: cl?.nom || '',
        type_brique: ty?.nom || '',
        qte, prix_vente: pv, prix_achat: pa, remise: rem,
        frais_total, note: form.note || null, vente_id: venteId,
      }).select().single()
      if (lErr) throw lErr

      if (ld?.id) {
        await supabase.from('voyage_livraisons').update({ total_vente, total_achat, marge }).eq('id', ld.id)
        if (fraisItems.length > 0) {
          const { error: fraisInsErr } = await supabase.from('voyage_livraison_frais').insert(
            fraisItems.map(f => ({ livraison_id: ld.id, label: f.label, montant: parseFloat(f.montant) || 0, note: f.note || null, kind: f.kind || 'charge' }))
          )
          // Must not fail silently: a lost frais/déduction row still bills the client
          // (accounting_total already applied below) but becomes invisible on the statement.
          if (fraisInsErr) throw fraisInsErr
        }
      }

      const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', clientId).single()
      if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde || 0) + accounting_total }).eq('id', clientId)
    } catch (err) {
      // Rollback: remove orphaned ventes row so the client statement stays clean
      if (venteId) await supabase.from('ventes').delete().eq('id', venteId)
      throw err
    }
    return
  }

  // ── GRIGNON ────────────────────────────────────────────────────────────────
  const { data: ld, error: lErr } = await supabase.from('voyage_livraisons').insert({
    voyage_id: parseInt(voyageId), date_livraison: form.date_livraison, type_produit: 'grignon',
    client_id: clientId, client_nom: cl?.nom || '',
    type_brique: 'Grignon',
    qte, prix_vente: pv, prix_achat: pa, remise: rem,
    frais_total, note: form.note || null,
  }).select().single()
  if (lErr) throw lErr

  if (ld?.id) {
    await supabase.from('voyage_livraisons').update({ total_vente, total_achat, marge }).eq('id', ld.id)
    if (fraisItems.length > 0) {
      const { error: fraisInsErr } = await supabase.from('voyage_livraison_frais').insert(
        fraisItems.map(f => ({ livraison_id: ld.id, label: f.label, montant: parseFloat(f.montant) || 0, note: f.note || null, kind: f.kind || 'charge' }))
      )
      if (fraisInsErr) throw fraisInsErr
    }
  }

  const grignonAchats      = achats.filter(a => a.type_produit === 'grignon')
  const grignonAchat       = grignonAchats[grignonAchats.length - 1]
  const prixAchatGrignon   = pa > 0 ? pa : (grignonAchat?.prix_achat || 0)
  const totalAchatGrignon  = Math.round(qte * prixAchatGrignon * 100) / 100
  const margeGrignon       = Math.round((total_vente - totalAchatGrignon) * 100) / 100

  const grignonPayload = {
    date: form.date_livraison,
    client_id: clientId, client_nom: cl?.nom || '',
    camion_id: voyage?.camion_id || null, camion_plaque: voyage?.camion_plaque || '', chauffeur: voyage?.chauffeur || '',
    fournisseur_id: grignonAchat?.fournisseur_id || null,
    fournisseur_nom: grignonAchat?.fournisseur_nom || '',
    qte, prix_vente: pv, prix_achat: prixAchatGrignon,
    total_vente: accounting_total, total_achat: totalAchatGrignon, marge: margeGrignon,
    voyage_id: parseInt(voyageId),
  }
  let { error: grigErr } = await supabase.from('grignon_operations').insert(grignonPayload)
  if (grigErr) {
    const { voyage_id: _vid, ...payloadWithoutVid } = grignonPayload
    const { error: grigErr2 } = await supabase.from('grignon_operations').insert(payloadWithoutVid)
    if (grigErr2) throw new Error('Erreur grignon_operations: ' + grigErr2.message)
  }
  const { data: freshGcl } = await supabase.from('grignon_clients').select('solde').eq('id', clientId).single()
  if (freshGcl) await supabase.from('grignon_clients').update({ solde: (freshGcl.solde || 0) + accounting_total }).eq('id', clientId)
}

export async function updateLiv(old, editForm) {
  const qte = parseFloat(editForm.qte) || 0
  const pv  = parseFloat(editForm.prix_vente) || 0
  const pa  = parseFloat(editForm.prix_achat) || 0
  const rem = parseFloat(editForm.remise) || 0
  const total_vente = Math.round((qte * pv - rem) * 100) / 100
  const total_achat = Math.round(qte * pa * 100) / 100
  const marge       = Math.round((total_vente - total_achat) * 100) / 100

  const { items: fraisItems, total: new_frais_total, noteStr: frais_note } = computeFrais(editForm.frais)
  const new_accounting_total = Math.round((total_vente + new_frais_total) * 100) / 100
  const old_accounting_total = Math.round(((old.total_vente || 0) + (old.frais_total || 0)) * 100) / 100
  const diff = new_accounting_total - old_accounting_total

  // Try atomic RPC first
  const { error: rpcErr } = await supabase.rpc('update_voyage_livraison', {
    p_id: old.id, p_date: editForm.date_livraison, p_qte: qte,
    p_prix_vente: pv, p_prix_achat: pa, p_remise: rem,
    p_total_vente: total_vente, p_total_achat: total_achat, p_marge: marge,
    p_note: editForm.note || null,
  })

  if (rpcErr) {
    // Fallback: manual updates
    await supabase.from('voyage_livraisons').update({
      date_livraison: editForm.date_livraison, qte, prix_vente: pv, prix_achat: pa,
      remise: rem, note: editForm.note || null, total_vente, total_achat, marge,
    }).eq('id', old.id)
    if (old.vente_id) await supabase.from('ventes').update({
      qte, prix_vente: pv, prix_achat: pa,
      total_vente: new_accounting_total,
      note: editForm.note || null,
    }).eq('id', old.vente_id)
  } else {
    if (old.vente_id) await supabase.from('ventes').update({
      total_vente: new_accounting_total,
      note: editForm.note || null,
    }).eq('id', old.vente_id)
  }

  // Always sync note + frais on voyage_livraisons
  await supabase.from('voyage_livraisons').update({ note: editForm.note || null, frais_total: new_frais_total }).eq('id', old.id)
  if (old.vente_id) await supabase.from('ventes').update({ frais_note: frais_note || null }).eq('id', old.vente_id)

  // Replace frais records
  await supabase.from('voyage_livraison_frais').delete().eq('livraison_id', old.id)
  if (fraisItems.length > 0) {
    const { error: fraisInsErr } = await supabase.from('voyage_livraison_frais').insert(
      fraisItems.map(f => ({ livraison_id: old.id, label: f.label, montant: parseFloat(f.montant) || 0, note: f.note || null, kind: f.kind || 'charge' }))
    )
    if (fraisInsErr) throw fraisInsErr
  }

  // Update solde by difference
  if (diff !== 0 && old.client_id) {
    const tbl = old.type_produit === 'grignon' ? 'grignon_clients' : 'clients'
    const { data: freshCl } = await supabase.from(tbl).select('solde').eq('id', old.client_id).single()
    if (freshCl) await supabase.from(tbl).update({ solde: (freshCl.solde || 0) + diff }).eq('id', old.client_id)
  }

  // Sync grignon_operations
  if (old.type_produit === 'grignon' && old.client_id) {
    const grigUpdate = {
      date: editForm.date_livraison, qte, prix_vente: pv, prix_achat: pa,
      total_vente: new_accounting_total, total_achat, marge,
    }
    const { error: updGrigErr } = await supabase.from('grignon_operations')
      .update(grigUpdate).eq('voyage_id', old.voyage_id).eq('client_id', old.client_id).eq('date', old.date_livraison)
    if (updGrigErr) {
      await supabase.from('grignon_operations')
        .update(grigUpdate).eq('client_id', old.client_id).eq('date', old.date_livraison)
    }
  }
}

export async function delLiv(row) {
  const frais_total       = row.frais_total || 0
  const accounting_total  = Math.round(((row.total_vente || 0) + frais_total) * 100) / 100

  const { error: rpcErr } = await supabase.rpc('delete_voyage_livraison', { p_id: row.id })
  if (rpcErr) {
    await supabase.from('voyage_livraisons').delete().eq('id', row.id)
    if (row.client_id) {
      const tbl = row.type_produit === 'grignon' ? 'grignon_clients' : 'clients'
      const { data: freshCl } = await supabase.from(tbl).select('solde').eq('id', row.client_id).single()
      if (freshCl) await supabase.from(tbl).update({ solde: (freshCl.solde || 0) - accounting_total }).eq('id', row.client_id)
    }
  } else if (frais_total !== 0 && row.client_id) {
    const tbl = row.type_produit === 'grignon' ? 'grignon_clients' : 'clients'
    const { data: freshCl } = await supabase.from(tbl).select('solde').eq('id', row.client_id).single()
    if (freshCl) await supabase.from(tbl).update({ solde: (freshCl.solde || 0) - frais_total }).eq('id', row.client_id)
  }

  await supabase.from('voyage_livraison_frais').delete().eq('livraison_id', row.id)

  if (row.vente_id) {
    await supabase.from('ventes').delete().eq('id', row.vente_id)
  } else if (row.type_produit !== 'grignon' && row.voyage_id && row.client_id) {
    await supabase.from('ventes').delete()
      .eq('voyage_id', row.voyage_id).eq('client_id', row.client_id)
      .eq('date', row.date_livraison).is('type_entree', null)
  }

  if (row.type_produit === 'grignon' && row.client_id) {
    const { error: delGrigErr } = await supabase.from('grignon_operations')
      .delete().eq('voyage_id', row.voyage_id).eq('client_id', row.client_id).eq('date', row.date_livraison)
    if (delGrigErr) {
      await supabase.from('grignon_operations')
        .delete().eq('client_id', row.client_id).eq('date', row.date_livraison)
    }
  }
}
