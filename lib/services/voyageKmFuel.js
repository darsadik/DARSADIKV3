// ── Voyage KM & Fuel Manager — unified per-voyage timeline ───────────────────
// Pure functions only (no Supabase, no React), same convention as
// kilometrage.js / fuelCycles.js. This module invents NO new numbers — it
// joins the outputs of the odometer chain (kilometrage.js: buildOdometerRows)
// and the fuel allocation engine's own decision (lib/services/fuelAllocation.js,
// via profitability.js's computeFuelCost) into one row per voyage, so a
// single timeline can show "what Voyage would compute" without re-deriving
// any of it. Read-only — writing still goes through the exact same functions
// the Voyage page already uses (updateKm, recalcOdometerChain, updateFuelMode,
// linkGasoilToVoyage/unlinkGasoilFromVoyage).

import { buildOdometerRows } from './kilometrage'
import { computeFuelCost, DEFAULT_REMISE_CARBURANT_RATE } from './profitability'
import { buildCamionFuelAllocationTable } from './fuelAllocation'
import { fmtMoney } from '../utils'

export const TIMELINE_STATUS = {
  complete:                { emoji: '🟢', label: 'Complet',                          tone: 'ok' },
  missing_start_km:        { emoji: '🟡', label: 'KM départ manquant',                tone: 'warning' },
  missing_end_km:          { emoji: '🟠', label: 'KM arrivée manquant',               tone: 'warning' },
  fuel_not_assigned:       { emoji: '⚪', label: 'Carburant non assigné',             tone: 'warning' },
  fuel_assigned_manually:  { emoji: '🔵', label: 'Carburant assigné manuellement',    tone: 'info' },
  impossible_distance:     { emoji: '🔴', label: 'Distance impossible',               tone: 'error' },
}

const FUEL_SOURCE_LABEL = {
  automatic:     'Automatique (chaîne KM)',
  manuel:        'Manuel (pleins liés)',
  manual_rate:   'Estimation KM manuelle',
  manual_amount: 'Montant manuel',
  none:          '—',
}

// Builds one row per (non-deleted) voyage. Pass every voyage/camion/gasoil
// row already loaded — no Supabase calls in here. `gasoil` may include rows
// with no km reading (a purchase with no odometer can still be manually
// linked — see lib/services/fuelAllocation.js's 'waiting' status); this
// module no longer filters them out itself, so the allocation table it
// builds sees exactly what computeFuelCost sees.
export function buildVoyageKmFuelTimeline({ voyages, camions, gasoil, voyageGasoilRows, remiseRate = DEFAULT_REMISE_CARBURANT_RATE }) {
  const active = (voyages || []).filter(v => !v.deleted_at)
  const camionById = new Map((camions || []).map(c => [c.id, c]))

  const odometerRows = buildOdometerRows(active, camions)
  const odometerByVoyageId = new Map(odometerRows.map(r => [r.voyageId, r]))

  const refillsByCamion = new Map()
  ;(gasoil || []).forEach(g => {
    if (!refillsByCamion.has(g.camion_id)) refillsByCamion.set(g.camion_id, [])
    refillsByCamion.get(g.camion_id).push(g)
  })

  const voyagesByCamion = new Map()
  active.forEach(v => {
    if (!v.camion_id) return
    if (!voyagesByCamion.has(v.camion_id)) voyagesByCamion.set(v.camion_id, [])
    voyagesByCamion.get(v.camion_id).push(v)
  })

  const voyageGasoilByVoyageId = new Map()
  ;(voyageGasoilRows || []).forEach(g => {
    if (!voyageGasoilByVoyageId.has(g.voyage_id)) voyageGasoilByVoyageId.set(g.voyage_id, [])
    voyageGasoilByVoyageId.get(g.voyage_id).push(g)
  })

  // Built ONCE per truck (not once per voyage) — the exact same engine
  // computeFuelCost uses internally, so this timeline can never disagree
  // with the real cost shown anywhere else in the app.
  const tableByCamion = new Map()
  voyagesByCamion.forEach((camionVoyages, camionId) => {
    tableByCamion.set(camionId, buildCamionFuelAllocationTable({
      camionGasoil: refillsByCamion.get(camionId) || [],
      camionVoyages,
      voyageGasoilLinks: voyageGasoilRows || [],
      remiseRate,
    }))
  })

  const rows = active.map(v => {
    const camion = camionById.get(v.camion_id) || null
    const odo = odometerByVoyageId.get(v.id) || null
    const camionRefills = refillsByCamion.get(v.camion_id) || []
    const camionVoyages = voyagesByCamion.get(v.camion_id) || []
    const vGasoil = voyageGasoilByVoyageId.get(v.id) || []
    const table = tableByCamion.get(v.camion_id)

    const { cost: fuelCost, source: fuelSource } = computeFuelCost(v, camionRefills, camionVoyages, voyageGasoilRows, remiseRate)

    const distance = odo ? odo.distance : null
    const costPerKm = (distance && distance > 0 && fuelCost)
      ? Math.round((fuelCost / distance) * 100) / 100
      : null

    // Litres/label are always THIS voyage's own contribution(s), read from
    // the same allocation table computeFuelCost just used above — never
    // re-derived by a second calculation. A voyage can draw from more than
    // one purchase (e.g. a manual link covering a mid-trip refuel), so this
    // sums every purchase it appears in.
    const contributions = table?.voyageContributions.get(v.id) || []
    let litersLinked = null
    let fillLabel = null
    if (contributions.length > 0) {
      litersLinked = Math.round(contributions.reduce((s, c) => s + c.share * c.purchaseQte, 0) * 100) / 100
      fillLabel = contributions.length === 1
        ? `Plein du ${contributions[0].date || ''}`.trim()
        : `${contributions.length} pleins liés`
    }

    const status = deriveVoyageStatus({ hasCamion: !!v.camion_id, odo, fuelSource })

    return {
      voyageId: v.id,
      reference: v.reference || `#${v.id}`,
      date: v.date_depart,
      camionId: v.camion_id,
      plaque: camion?.plaque || v.camion_plaque || '—',
      chauffeur: camion?.chauffeur || '—',
      kmDepart: odo?.kmDepart ?? (v.km_depart !== null && v.km_depart !== undefined ? parseFloat(v.km_depart) : null),
      kmArrivee: odo?.kmNext ?? null,
      distance,
      fuelSource, fuelSourceLabel: FUEL_SOURCE_LABEL[fuelSource] || fuelSource,
      fuelCost, costPerKm,
      fillLabel, litersLinked,
      contributions, voyageGasoil: vGasoil,
      status,
      outOfSync: odo?.outOfSync || false,
      isLastForTruck: odo?.isLastForTruck ?? null,
      nextVoyageId: odo?.nextVoyageId ?? null,
      hasManualFuelLink: vGasoil.length > 0,
    }
  })

  return rows.sort((a, b) => {
    if (a.date !== b.date) return (a.date || '') < (b.date || '') ? -1 : 1
    return a.voyageId - b.voyageId
  })
}

// Single place that picks ONE status per voyage out of the 6 TIMELINE_STATUS
// buckets — same inputs the inline branch used before (camion presence, the
// odometer row's own status, and computeFuelCost's source), just reorganized
// so "fuel covered via manually-linked pleins" (source === 'manuel') gets its
// own informational bucket instead of silently reading as "complete". First
// match wins; order encodes severity (impossible data > missing KM > missing
// fuel > informational > complete).
export function deriveVoyageStatus({ hasCamion, odo, fuelSource }) {
  if (!hasCamion) return 'impossible_distance'
  if (!odo) return 'impossible_distance'
  if (odo.status === 'broken_chronology') return 'impossible_distance'
  if (odo.status === 'missing_km') return 'missing_start_km'
  if (odo.status === 'waiting') return 'missing_end_km'
  if (fuelSource === 'none') return 'fuel_not_assigned'
  if (fuelSource === 'manuel') return 'fuel_assigned_manually'
  return 'complete'
}

export function buildTimelineDashboard(rows) {
  const byStatus = {}
  Object.keys(TIMELINE_STATUS).forEach(k => { byStatus[k] = 0 })
  rows.forEach(r => { byStatus[r.status] = (byStatus[r.status] || 0) + 1 })

  const withCost = rows.filter(r => r.costPerKm !== null && r.costPerKm !== undefined)
  const avgCostPerKm = withCost.length
    ? Math.round((withCost.reduce((s, r) => s + r.costPerKm, 0) / withCost.length) * 100) / 100
    : null
  const manualAssignmentsCount = rows.filter(r => r.hasManualFuelLink).length

  return { total: rows.length, byStatus, avgCostPerKm, manualAssignmentsCount }
}

// Flat, clickable anomaly list scoped to what THIS page is about (KM +
// fuel assignment) — duplicated fuel assignment is new here (not covered by
// kilometrage.js's detectProblems or fuelCycles.js's detectAlerts, both of
// which are per-truck/per-cycle, not per-plein-allocation).
// Advisory only (never blocks) — flags a single voyage's distance far beyond
// what's typical for its truck, using the truck's own historical average
// (same "never a fixed magic number" approach as fuelCycles.js's
// CYCLE_TOO_LONG_KM_FACTOR). Skips trucks with too little history to have a
// meaningful average.
export function detectUnrealisticDistances(rows, factor = 3) {
  const problems = []
  const byCamion = new Map()
  rows.forEach(r => {
    if (r.distance === null || r.distance <= 0) return
    if (!byCamion.has(r.camionId)) byCamion.set(r.camionId, [])
    byCamion.get(r.camionId).push(r)
  })
  byCamion.forEach((list, camionId) => {
    if (list.length < 3) return
    const avg = list.reduce((s, r) => s + r.distance, 0) / list.length
    if (!avg) return
    list.filter(r => r.distance > avg * factor).forEach(r => {
      problems.push({
        severity: 'warning', type: 'unrealistic_distance', camionId,
        message: `${r.plaque} : voyage ${r.reference} du ${r.date} — distance de ${Math.round(r.distance)} km, bien au-delà de la moyenne du camion (${Math.round(avg)} km).`,
        voyageIds: [r.voyageId],
      })
    })
  })
  return problems
}

export function detectFuelAssignmentProblems({ gasoil, voyageGasoilRows }) {
  const problems = []
  const gasoilById = new Map((gasoil || []).map(g => [g.id, g]))
  const byGasoilId = new Map()
  ;(voyageGasoilRows || []).filter(g => g.gasoil_id).forEach(g => {
    if (!byGasoilId.has(g.gasoil_id)) byGasoilId.set(g.gasoil_id, [])
    byGasoilId.get(g.gasoil_id).push(g)
  })

  byGasoilId.forEach((links, gasoilId) => {
    const source = gasoilById.get(gasoilId)
    if (!source) return
    const assigned = links.reduce((s, l) => s + (l.total || 0), 0)
    if (assigned > (source.total || 0) + 0.01) {
      problems.push({
        severity: 'error', type: 'over_allocated_fill',
        camionId: source.camion_id ?? null,
        message: `Plein du ${source.date} (${source.camion_plaque || ''}) : ${fmtMoney(assigned)} DHS assignés à ${links.length} voyage(s) pour un plein de ${fmtMoney(source.total || 0)} DHS.`,
        gasoilId, voyageIds: links.map(l => l.voyage_id),
      })
    }
  })

  return problems
}
