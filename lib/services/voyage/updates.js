import { supabase } from '../../supabase'

export async function updateStatut(id, statut) {
  await supabase.from('voyages').update({ statut }).eq('id', id)
}

// km_arrivee is never set here — it's derived automatically by
// recalcOdometerChain from the truck's next chronological voyage.
export async function updateKm(id, kmDepart) {
  await supabase.from('voyages').update({
    km_depart: kmDepart ? parseFloat(kmDepart) : null,
  }).eq('id', id)
}

// Rebuilds camion_id's whole odometer chain (see sql/06_fuel_odometer_system.sql).
// Call after any insert/update/delete that can change a voyage's km_depart,
// date_depart, camion_id, or archived status.
// Surfaces RPC errors instead of swallowing them — a missing/broken function
// on the DB side previously failed silently here, leaving km_arrivee/Distance
// stuck at null with no visible sign anything was wrong.
export async function recalcOdometerChain(camionId) {
  if (!camionId) return
  const { error } = await supabase.rpc('recalc_camion_odometer_chain', { p_camion_id: camionId })
  if (error) {
    console.error('recalc_camion_odometer_chain failed:', error)
    throw error
  }
}

// Dedup of the updateKm + recalcOdometerChain sequence VoyageDetailPanel's
// own KM editor already performs. Shared so the Control Center's Start-KM
// and Arrival-KM (= next voyage's Start-KM) editors both save through the
// exact same path.
export async function saveStartKm(voyageId, camionId, kmDepart) {
  await updateKm(voyageId, kmDepart)
  if (camionId) await recalcOdometerChain(camionId)
}

export async function updateFuelMode(id, { fuelMode, manualDistanceKm, manualCostPerKm, manualFuelCost }) {
  await supabase.from('voyages').update({
    fuel_mode:          fuelMode,
    manual_distance_km: manualDistanceKm !== undefined && manualDistanceKm !== '' ? parseFloat(manualDistanceKm) : null,
    manual_cost_per_km: manualCostPerKm  !== undefined && manualCostPerKm  !== '' ? parseFloat(manualCostPerKm)  : null,
    manual_fuel_cost:   manualFuelCost   !== undefined && manualFuelCost   !== '' ? parseFloat(manualFuelCost)   : null,
  }).eq('id', id)
}
