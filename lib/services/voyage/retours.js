import { supabase } from '../../supabase'

export async function saveRetour(voyageId, form, { voyage }) {
  const montant = parseFloat(form.montant)||0, montant_paye = parseFloat(form.montant_paye)||0
  const restant = Math.max(0, montant-montant_paye)
  const { data: rtData } = await supabase.from('retours_transport').insert({
    date: form.date_retour, client_nom: form.client_nom.trim(), destination: form.destination||null,
    camion_id: voyage?.camion_id||null, camion_plaque: voyage?.camion_plaque||null, chauffeur: voyage?.chauffeur||null,
    montant, montant_paye, restant, voyage_id: parseInt(voyageId),
  }).select().single()
  const rtId = rtData?.id || null

  const { error } = await supabase.from('voyage_retours').insert({
    voyage_id:    parseInt(voyageId),
    date_retour:  form.date_retour,
    client_nom:   form.client_nom.trim(),
    destination:  form.destination || null,
    montant,
    montant_paye,
    retour_id:    rtId,
    note:         form.note || null,
  })
  if (error) {
    // fallback without retour_id if column not yet added
    const { error: err2 } = await supabase.from('voyage_retours').insert({
      voyage_id: parseInt(voyageId), date_retour: form.date_retour, client_nom: form.client_nom.trim(),
      destination: form.destination||null, montant, montant_paye, note: form.note||null,
    })
    if (err2) throw err2
  }
}

export async function updateRetour(old, editForm) {
  const montant = parseFloat(editForm.montant)||0, montant_paye = parseFloat(editForm.montant_paye)||0
  const restant = Math.max(0, montant-montant_paye)
  const { error } = await supabase.from('voyage_retours').update({
    date_retour: editForm.date_retour, client_nom: editForm.client_nom,
    destination: editForm.destination||null, montant, montant_paye, note: editForm.note||null
  }).eq('id', old.id)
  if (error) throw error
  if (old.retour_id) {
    await supabase.from('retours_transport').update({ montant, montant_paye, restant }).eq('id', old.retour_id)
  }
}

export async function delRetour(row) {
  const { error: rpcErr } = await supabase.rpc('delete_voyage_retour', { p_id: row.id })
  if (rpcErr) {
    // Fallback
    await supabase.from('voyage_retours').delete().eq('id', row.id)
    if (row.retour_id) await supabase.from('retours_transport').delete().eq('id', row.retour_id)
  }
}
