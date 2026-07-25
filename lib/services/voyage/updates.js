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
export async function recalcOdometerChain(camionId) {
  if (!camionId) return
  await supabase.rpc('recalc_camion_odometer_chain', { p_camion_id: camionId })
}

export async function updateFuelMode(id, { fuelMode, manualDistanceKm, manualCostPerKm, manualFuelCost }) {
  await supabase.from('voyages').update({
    fuel_mode:          fuelMode,
    manual_distance_km: manualDistanceKm !== undefined && manualDistanceKm !== '' ? parseFloat(manualDistanceKm) : null,
    manual_cost_per_km: manualCostPerKm  !== undefined && manualCostPerKm  !== '' ? parseFloat(manualCostPerKm)  : null,
    manual_fuel_cost:   manualFuelCost   !== undefined && manualFuelCost   !== '' ? parseFloat(manualFuelCost)   : null,
  }).eq('id', id)
}
