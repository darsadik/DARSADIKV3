import { supabase } from '../../supabase'

// Shared by components/voyage/VoyageDetailPanel.js (the "+ Lier un plein"
// picker) and pages/voyages/km-carburant.js (the Control Center's assign/
// split actions) — one write path so both surfaces stay byte-identical in
// behavior instead of drifting apart.
//
// splitQte (optional): a portion of plein.qte to assign to voyageId instead
// of the whole fill — the same plein can then be linked again to other
// voyages for the rest. Omitted/falsy = whole-plein link (stamps
// gasoil.voyage_id as "claimed"). When splitting, the source plein is left
// unstamped since several voyages now share it (sql/16_voyage_gasoil_split.sql).
export async function linkGasoilToVoyage({ plein, voyageId, splitQte }) {
  const isSplit = !!splitQte && splitQte > 0 && splitQte < (plein.qte || 0)
  const { error } = await supabase.from('voyage_gasoil').insert({
    voyage_id:     voyageId,
    date_gasoil:   plein.date,
    station:       plein.station || '',
    qte_litres:    isSplit ? splitQte : (plein.qte || 0),
    prix_unitaire: plein.prix_unitaire || 0,
    gasoil_id:     plein.id,
    is_split:      isSplit,
  })
  if (error) throw error
  // Whole-plein link only: mark the source plein as claimed. A split link
  // leaves it unstamped so it can still be found/linked again.
  if (!isSplit) await supabase.from('gasoil').update({ voyage_id: voyageId }).eq('id', plein.id)
}

// Removes one voyage_gasoil link row. A split assignment (row.is_split) only
// owns a PORTION of the source plein — the plein and camion totals were
// already accounted for once at the original /gasoil insert, so only the
// link row is removed. A whole-plein link also deletes the shared gasoil
// row and reverses camion totals, mirroring the delete_voyage_gasoil RPC
// (the primary path — this fallback only runs if the RPC itself errors,
// e.g. not yet deployed).
export async function unlinkGasoilFromVoyage(row) {
  const { error: rpcErr } = await supabase.rpc('delete_voyage_gasoil', { p_id: row.id })
  if (!rpcErr) return
  await supabase.from('voyage_gasoil').delete().eq('id', row.id)
  if (row.is_split) return
  if (!row.gasoil_id) return
  const { data: g } = await supabase.from('gasoil').select('camion_id').eq('id', row.gasoil_id).single()
  await supabase.from('gasoil').delete().eq('id', row.gasoil_id)
  if (g?.camion_id && row.total) {
    const { data: freshCam } = await supabase.from('camions').select('gasoil_dhs,pleins,litres').eq('id', g.camion_id).single()
    if (freshCam) await supabase.from('camions').update({
      gasoil_dhs: Math.max(0, (freshCam.gasoil_dhs || 0) - row.total),
      pleins:     Math.max(0, (freshCam.pleins || 0) - 1),
      litres:     Math.max(0, (freshCam.litres || 0) - (row.qte_litres || 0)),
    }).eq('id', g.camion_id)
  }
}
