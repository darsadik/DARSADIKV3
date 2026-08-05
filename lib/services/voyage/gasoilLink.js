import { supabase } from '../../supabase'

// Shared by components/voyage/VoyageDetailPanel.js (the "+ Lier un plein"
// picker) and components/carburant/FuelAssignPopover.js — one write path so
// both surfaces stay byte-identical in behavior instead of drifting apart.
//
// voyage_gasoil is a pure (gasoil_id, voyage_id) membership fact — it never
// stores an amount. How much of the purchase this voyage actually gets is
// always computed dynamically by lib/services/fuelAllocation.js (distance-
// proportional, same formula as automatic detection), so there is nothing
// to type or split here: linking just declares "this voyage draws from this
// purchase." A voyage can legitimately be linked to more than one purchase
// (e.g. it refueled mid-trip) — the allocation engine, not this table,
// guarantees no single purchase is ever over-allocated.
export async function linkGasoilToVoyage({ plein, voyageId }) {
  const { error } = await supabase.from('voyage_gasoil').insert({
    gasoil_id: plein.id,
    voyage_id: voyageId,
  })
  if (error) throw error
}

// Removes one voyage↔purchase link. This only ever removes the membership
// fact — it must never touch the underlying `gasoil` purchase row or
// camion/supplier stats, since a mapping row no longer represents ownership
// of the purchase (unlike the old split/whole-link model).
export async function unlinkGasoilFromVoyage(row) {
  const { error } = await supabase.from('voyage_gasoil').delete().eq('id', row.id)
  if (error) throw error
}
