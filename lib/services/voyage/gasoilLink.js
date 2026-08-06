import { supabase } from '../../supabase'

// Shared by components/voyage/VoyageDetailPanel.js (the "+ Lier un plein"
// picker) and components/carburant/FuelAssignPopover.js — one write path so
// both surfaces stay byte-identical in behavior instead of drifting apart.
//
// voyage_gasoil is treated as a pure (gasoil_id, voyage_id) membership fact
// by every reader — no amount is ever read from it. How much of the
// purchase this voyage actually gets is always computed dynamically by
// lib/services/fuelAllocation.js (distance-proportional, same formula as
// automatic detection), so there is nothing to type or split here: linking
// just declares "this voyage draws from this purchase." A voyage can
// legitimately be linked to more than one purchase (e.g. it refueled
// mid-trip) — the allocation engine, not this table, guarantees no single
// purchase is ever over-allocated.
//
// date_gasoil/station/qte_litres/prix_unitaire are still written (the live
// schema has NOT NULL constraints on some of them, e.g. date_gasoil) but
// carry no meaning going forward: date_gasoil/station are copied from the
// purchase for legacy readers, and qte_litres/prix_unitaire are always 0 so
// nothing derives an amount from a single link row anymore (that's exactly
// what let the same plein be double-claimed before this redesign — see
// sql/22_voyage_gasoil_pure_mapping.sql). `total` is a generated column and
// is never set explicitly.
export async function linkGasoilToVoyage({ plein, voyageId }) {
  const { error } = await supabase.from('voyage_gasoil').insert({
    gasoil_id: plein.id,
    voyage_id: voyageId,
    date_gasoil: plein.date,
    station: plein.station || '',
    qte_litres: 0,
    prix_unitaire: 0,
    is_split: false,
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
