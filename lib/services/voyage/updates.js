import { supabase } from '../../supabase'

export async function updateStatut(id, statut) {
  await supabase.from('voyages').update({ statut }).eq('id', id)
}

export async function updateKm(id, kmDepart, kmArrivee) {
  await supabase.from('voyages').update({
    km_depart:  kmDepart  ? parseFloat(kmDepart)  : null,
    km_arrivee: kmArrivee ? parseFloat(kmArrivee) : null,
  }).eq('id', id)
}
