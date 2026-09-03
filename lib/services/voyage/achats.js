import { supabase } from '../../supabase'

export async function saveAchat(voyageId, form, { fournisseurs, grignonFournisseurs, typeBriques, voyage }) {
  const qte = parseFloat(form.qte)||0, prix = parseFloat(form.prix_achat)||0
  const total_achat = Math.round(qte*prix*100)/100
  const fourn = form.type_produit==='brique'
    ? fournisseurs.find(f=>f.id===parseInt(form.fournisseur_id))
    : grignonFournisseurs.find(f=>f.id===parseInt(form.fournisseur_id))
  const ty = typeBriques.find(t=>t.id===parseInt(form.type_brique_id))

  // total_achat is NOT included here — voyage_achats.total_achat is a
  // Postgres GENERATED ALWAYS AS (qte * prix_achat) STORED column (confirmed
  // live in Supabase; CLAUDE.md's "no GENERATED columns" note predates this),
  // so an explicit value in the insert throws. The ventes mirror below is a
  // plain column and does need it written explicitly.
  const { data: vaData, error } = await supabase.from('voyage_achats').insert({
    voyage_id: parseInt(voyageId), date_achat: form.date_achat, type_produit: form.type_produit,
    fournisseur_id: form.fournisseur_id ? parseInt(form.fournisseur_id) : null,
    fournisseur_nom: fourn?.nom || '',
    type_brique: form.type_produit==='grignon' ? 'Grignon' : (ty?.nom||''),
    type_brique_id: form.type_produit==='grignon' ? null : (form.type_brique_id ? parseInt(form.type_brique_id) : null),
    qte, prix_achat: prix, note: form.note||null,
  }).select().single()
  if (error) throw error
  const voyageAchatId = vaData?.id || null

  // ── Mirror to existing tables ──
  // The mirror row's id is written back onto voyage_achats.vente_id /
  // .grignon_operation_id (sql/08_transaction_mirror_links.sql) so statement
  // pages can resolve the exact source row to edit later. Best-effort: if the
  // link column isn't migrated yet, the mirror insert itself still succeeds.
  if (form.type_produit === 'brique') {
    // Save to ventes table as purchase (for fournisseur accounting)
    const { data: vd } = await supabase.from('ventes').insert({
      date:             form.date_achat,
      date_fournisseur: form.date_achat,
      fournisseur_id:   form.fournisseur_id ? parseInt(form.fournisseur_id) : null,
      fournisseur:      fourn?.nom || '',
      type_brique_id:   form.type_brique_id ? parseInt(form.type_brique_id) : null,
      type_brique:      ty?.nom || '',
      qte,
      prix_achat:       prix,
      total_achat,
      prix_vente:       0,
      camion_id:        voyage?.camion_id || null,
      camion_plaque:    voyage?.camion_plaque || '',
      chauffeur:        voyage?.chauffeur || '',
      voyage_id:        parseInt(voyageId),
      type_entree:      'achat',
    }).select().single()
    if (voyageAchatId && vd?.id) {
      await supabase.from('voyage_achats').update({ vente_id: vd.id }).eq('id', voyageAchatId)
    }
  } else {
    // Grignon achat → grignon_operations (achat side only — no client yet)
    // Try with voyage_id first, fallback without if column missing
    const grignonPayload = {
      date:            form.date_achat,
      fournisseur_id:  form.fournisseur_id ? parseInt(form.fournisseur_id) : null,
      fournisseur_nom: fourn?.nom || '',
      qte,
      prix_achat:      prix,
      prix_vente:      0,
      total_achat,
      total_vente:     0,
      marge:           -total_achat,
      camion_id:       voyage?.camion_id || null,
      camion_plaque:   voyage?.camion_plaque || '',
      chauffeur:       voyage?.chauffeur || '',
      voyage_id:       parseInt(voyageId),
      note:            form.note || null,
    }
    let { data: grigData, error: grigErr } = await supabase.from('grignon_operations').insert(grignonPayload).select().single()
    if (grigErr) {
      // Only retry (without voyage_id) when the column itself is genuinely
      // missing (Postgres undefined_column, code 42703) — the one case the
      // first insert is guaranteed to have committed nothing, so a second
      // insert cannot duplicate it. Retrying on ANY other error (e.g. a
      // network drop after the first insert already committed server-side)
      // blindly re-inserted the same payload and was the actual source of
      // duplicated Fournisseur Grignon records — see CLAUDE.md Grignon sync notes.
      const isMissingVoyageIdCol = grigErr.code === '42703' && /voyage_id/i.test(grigErr.message || '')
      if (!isMissingVoyageIdCol) throw new Error('grignon_operations: ' + grigErr.message)
      const { voyage_id: _v, ...payloadWithoutVid } = grignonPayload
      const { data: grigData2, error: grigErr2 } = await supabase.from('grignon_operations').insert(payloadWithoutVid).select().single()
      if (grigErr2) throw new Error('grignon_operations: ' + grigErr2.message)
      grigData = grigData2
    }
    if (voyageAchatId && grigData?.id) {
      await supabase.from('voyage_achats').update({ grignon_operation_id: grigData.id }).eq('id', voyageAchatId)
    }
  }

  // Update fournisseur solde (our debt to supplier increases)
  if (form.fournisseur_id) {
    const fTbl = form.type_produit === 'grignon' ? 'grignon_fournisseurs' : 'fournisseurs'
    const fId  = parseInt(form.fournisseur_id)
    const { data: freshF } = await supabase.from(fTbl).select('solde').eq('id', fId).single()
    if (freshF) await supabase.from(fTbl).update({ solde: (freshF.solde||0) + total_achat }).eq('id', fId)
  }
}

export async function updateAchat(old, editForm, { fournisseurs = [], grignonFournisseurs = [], typeBriques = [] } = {}) {
  const qte = parseFloat(editForm.qte)||0, prix = parseFloat(editForm.prix_achat)||0
  const total_achat = Math.round(qte*prix*100)/100

  // Fournisseur/type_brique can now move within the achat's existing
  // type_produit (see EditTransactionModal — briques↔briques or
  // grignon↔grignon only, never across the business line). Falls back to
  // the row's current value when the field wasn't in editForm (e.g. callers
  // that don't pass the fournisseurs/typeBriques lists yet).
  const isGrignon        = old.type_produit === 'grignon'
  const newFournisseurId = editForm.fournisseur_id !== undefined
    ? (editForm.fournisseur_id ? parseInt(editForm.fournisseur_id) : null)
    : (old.fournisseur_id ?? null)
  const newTypeBriqueId  = isGrignon ? null : (editForm.type_brique_id !== undefined
    ? (editForm.type_brique_id ? parseInt(editForm.type_brique_id) : null)
    : (old.type_brique_id ?? null))
  const fournChanged = newFournisseurId !== (old.fournisseur_id ?? null)
  const typeChanged  = !isGrignon && newTypeBriqueId !== (old.type_brique_id ?? null)

  const fTbl      = isGrignon ? 'grignon_fournisseurs' : 'fournisseurs'
  const fournList  = isGrignon ? grignonFournisseurs : fournisseurs
  const newFourn   = fournChanged ? fournList.find(f => f.id === newFournisseurId) : null
  const newTy      = typeChanged  ? typeBriques.find(t => t.id === newTypeBriqueId) : null

  const fournisseur_nom = fournChanged ? (newFourn?.nom || '') : old.fournisseur_nom
  const type_brique      = isGrignon ? 'Grignon' : (typeChanged ? (newTy?.nom || '') : old.type_brique)

  // total_achat omitted — voyage_achats.total_achat is a GENERATED column
  // (see saveAchat above); Postgres recomputes it from qte/prix_achat itself.
  const { error } = await supabase.from('voyage_achats').update({
    date_achat: editForm.date_achat, qte, prix_achat: prix, note: editForm.note||null,
    fournisseur_id: newFournisseurId, fournisseur_nom,
    type_brique, type_brique_id: newTypeBriqueId,
  }).eq('id', old.id)
  if (error) throw error

  const oldTotal = Math.round((old.qte||0)*(old.prix_achat||0)*100)/100

  if (fournChanged) {
    // A supplier switch is a full move, not a delta — reverse the entire old
    // amount off the OLD fournisseur's solde and add the entire new amount
    // to the NEW one (the two soldes are otherwise unrelated).
    if (old.fournisseur_id) {
      const { data: freshOld } = await supabase.from(fTbl).select('solde').eq('id', old.fournisseur_id).single()
      if (freshOld) await supabase.from(fTbl).update({ solde: Math.max(0, (freshOld.solde||0) - oldTotal) }).eq('id', old.fournisseur_id)
    }
    if (newFournisseurId) {
      const { data: freshNew } = await supabase.from(fTbl).select('solde').eq('id', newFournisseurId).single()
      if (freshNew) await supabase.from(fTbl).update({ solde: (freshNew.solde||0) + total_achat }).eq('id', newFournisseurId)
    }
  } else {
    // Same fournisseur — adjust its solde by the qty/prix difference only.
    const diff = total_achat - oldTotal
    if (diff !== 0 && old.fournisseur_id) {
      const { data: freshF } = await supabase.from(fTbl).select('solde').eq('id', old.fournisseur_id).single()
      if (freshF) await supabase.from(fTbl).update({ solde: (freshF.solde||0) + diff }).eq('id', old.fournisseur_id)
    }
  }

  // Keep the mirror row (ventes for brique, grignon_operations for grignon)
  // in sync so Fournisseur statements don't show stale numbers.
  if (old.vente_id) {
    await supabase.from('ventes').update({
      date: editForm.date_achat, date_fournisseur: editForm.date_achat,
      qte, prix_achat: prix, total_achat,
      fournisseur_id: newFournisseurId, fournisseur: fournisseur_nom,
      type_brique, type_brique_id: newTypeBriqueId,
    }).eq('id', old.vente_id)
  }
  if (old.grignon_operation_id) {
    const marge = Math.round((0 - total_achat) * 100) / 100 // grignon achat mirror has prix_vente=0, same formula as saveAchat
    await supabase.from('grignon_operations').update({
      date: editForm.date_achat, qte, prix_achat: prix, total_achat, marge,
      fournisseur_id: newFournisseurId, fournisseur_nom,
    }).eq('id', old.grignon_operation_id)
  }
}

export async function delAchat(row) {
  const { error } = await supabase.from('voyage_achats').delete().eq('id', row.id)
  if (error) throw error

  // Reverse fournisseur solde
  if (row.fournisseur_id) {
    const fTbl  = row.type_produit === 'grignon' ? 'grignon_fournisseurs' : 'fournisseurs'
    const total = Math.round((row.qte||0)*(row.prix_achat||0)*100)/100
    const { data: freshF } = await supabase.from(fTbl).select('solde').eq('id', row.fournisseur_id).single()
    if (freshF) await supabase.from(fTbl).update({ solde: Math.max(0,(freshF.solde||0) - total) }).eq('id', row.fournisseur_id)
  }

  // Remove the mirror row so the Fournisseur statement doesn't keep a ghost entry.
  // Prefer the exact id link; fall back to matching the achat-only mirror row
  // (fournisseur_id + date + qte, client_id always null for achats — see
  // saveAchat above) only for rows saved before sql/08's link column existed
  // or when the link write itself failed to persist — same precedent as the
  // client_id+date fallback documented in sql/14_grignon_livraison_link.sql.
  // Without this fallback an unlinked mirror is never deleted and lingers as
  // a ghost record that looks like a duplicate the next time this achat is re-entered.
  if (row.vente_id) await supabase.from('ventes').delete().eq('id', row.vente_id)
  if (row.grignon_operation_id) {
    await supabase.from('grignon_operations').delete().eq('id', row.grignon_operation_id)
  } else if (row.type_produit === 'grignon' && row.fournisseur_id) {
    await supabase.from('grignon_operations').delete()
      .eq('fournisseur_id', row.fournisseur_id).eq('date', row.date_achat).eq('qte', row.qte).is('client_id', null)
  }
}
