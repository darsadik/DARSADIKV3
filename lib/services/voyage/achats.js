import { supabase } from '../../supabase'

export async function saveAchat(voyageId, form, { fournisseurs, grignonFournisseurs, typeBriques, voyage }) {
  const qte = parseFloat(form.qte)||0, prix = parseFloat(form.prix_achat)||0
  const total_achat = Math.round(qte*prix*100)/100
  const fourn = form.type_produit==='brique'
    ? fournisseurs.find(f=>f.id===parseInt(form.fournisseur_id))
    : grignonFournisseurs.find(f=>f.id===parseInt(form.fournisseur_id))
  const ty = typeBriques.find(t=>t.id===parseInt(form.type_brique_id))

  const { error } = await supabase.from('voyage_achats').insert({
    voyage_id: parseInt(voyageId), date_achat: form.date_achat, type_produit: form.type_produit,
    fournisseur_id: form.fournisseur_id ? parseInt(form.fournisseur_id) : null,
    fournisseur_nom: fourn?.nom || '',
    type_brique: form.type_produit==='grignon' ? 'Grignon' : (ty?.nom||''),
    qte, prix_achat: prix, note: form.note||null,
  }).select().single()
  if (error) throw error

  // ── Mirror to existing tables ──
  if (form.type_produit === 'brique') {
    // Save to ventes table as purchase (for fournisseur accounting)
    await supabase.from('ventes').insert({
      date:             form.date_achat,
      date_fournisseur: form.date_achat,
      fournisseur_id:   form.fournisseur_id ? parseInt(form.fournisseur_id) : null,
      fournisseur:      fourn?.nom || '',
      type_brique_id:   form.type_brique_id ? parseInt(form.type_brique_id) : null,
      type_brique:      ty?.nom || '',
      qte,
      prix_achat:       prix,
      prix_vente:       0,
      camion_id:        voyage?.camion_id || null,
      camion_plaque:    voyage?.camion_plaque || '',
      chauffeur:        voyage?.chauffeur || '',
      voyage_id:        parseInt(voyageId),
      type_entree:      'achat',
    })
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
    const { error: grigErr } = await supabase.from('grignon_operations').insert(grignonPayload)
    if (grigErr) {
      // Retry without voyage_id if that column doesn't exist
      const { voyage_id: _v, ...payloadWithoutVid } = grignonPayload
      const { error: grigErr2 } = await supabase.from('grignon_operations').insert(payloadWithoutVid)
      if (grigErr2) throw new Error('grignon_operations: ' + grigErr2.message)
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

export async function updateAchat(old, editForm) {
  const qte = parseFloat(editForm.qte)||0, prix = parseFloat(editForm.prix_achat)||0
  const total_achat = Math.round(qte*prix*100)/100
  const { error } = await supabase.from('voyage_achats').update({
    date_achat: editForm.date_achat, qte, prix_achat: prix, note: editForm.note||null
  }).eq('id', old.id)
  if (error) throw error

  // Adjust fournisseur solde by the difference
  const oldTotal = Math.round((old.qte||0)*(old.prix_achat||0)*100)/100
  const diff = total_achat - oldTotal
  if (diff !== 0 && old.fournisseur_id) {
    const fTbl = old.type_produit === 'grignon' ? 'grignon_fournisseurs' : 'fournisseurs'
    const { data: freshF } = await supabase.from(fTbl).select('solde').eq('id', old.fournisseur_id).single()
    if (freshF) await supabase.from(fTbl).update({ solde: (freshF.solde||0) + diff }).eq('id', old.fournisseur_id)
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
}
