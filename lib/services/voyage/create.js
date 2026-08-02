import { supabase } from '../../supabase'
import { recalcOdometerChain } from './updates'

// Same voyages-insert shape as pages/voyages/index.js's createVoyage — used
// by the Control Center's "Edit Arrival KM" flow when a truck has no next
// voyage yet to write the arrival KM onto. Not a new insert path, just a
// second caller of the exact same field set.
export async function createFollowUpVoyage({ camionId, camionPlaque, chauffeur, dateDepart, kmDepart }) {
  const { data, error } = await supabase.from('voyages').insert({
    date_depart:   dateDepart,
    camion_id:     camionId,
    camion_plaque: camionPlaque || '',
    chauffeur:     chauffeur || '',
    destination:   null,
    note:          null,
    statut:        'en_cours',
    km_depart:     kmDepart !== undefined && kmDepart !== '' && kmDepart !== null ? parseFloat(kmDepart) : null,
  }).select().single()
  if (error) throw error
  await recalcOdometerChain(camionId)
  return data
}
