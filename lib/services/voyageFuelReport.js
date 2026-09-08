// ── Voyage Fuel Report — data layer ──────────────────────────────────────────
// Pure functions only (no Supabase, no React). This is a reporting layer over
// the Truck Control Center's own already-computed voyage timeline
// (lib/services/voyageKmFuel.js's buildVoyageKmFuelTimeline, itself built on
// the authoritative fuel engine — lib/services/fuelAllocation.js's
// buildCamionFuelAllocationTable) — it computes NOTHING new. `voyageRows` is
// the EXACT array the page already builds once (pages/voyages/km-carburant.js)
// and passes to every tab; this module only filters, groups by truck, and
// totals it. No second engine call, no second calculation.
//
// The date range is a DISPLAY filter only, applied here to `voyageRows`
// (already built from the full, unfiltered history) — never fed back into the
// engine, so a period starting mid-sequence still uses the true previous
// boundary internally (see fuelAllocation.js's Priority 2 date fallback).
import { TIMELINE_STATUS } from './voyageKmFuel'

// Camions Loué never appear in this report — Truck Control Center itself may
// show every truck, but this report is Camions Propre only, matching every
// other fuel/consumption report in the app (Contrôle KM & Carburant, Truck
// Fuel Consumption Report).
function propreCamions(camions) {
  return (camions || []).filter(c => c.type_camion !== 'loue')
}

// A contribution with share === null came from a 'fixed' pool member
// (fuel_mode 'manual_fixed' — a fixed DHS slice, never a real litre figure —
// see fuelAllocation.js's poolEntryForVoyage). voyageKmFuel.js's own
// litersLinked still computes to 0 (not null) for these, since `null * qte`
// arithmetically coerces to 0 — left uncorrected there (out of scope, and
// still correct for its own display, which never divides by it), but this
// report must never let a fabricated 0 dilute a real weighted L/100km ratio.
// 'manual_amount'/'manual_rate' voyages never enter the pool at all
// (contributions.length === 0), so litersLinked already stays null for them —
// no special-casing needed beyond this same check.
export function hasRealLiters(row) {
  if (row.litersLinked === null || row.litersLinked === undefined) return false
  const contribs = row.contributions || []
  if (contribs.length === 0) return false
  return !contribs.some(c => c.share === null || c.share === undefined)
}

// KM manquant sur le Plein qui clôture la période de ce voyage, résolu par
// chronologie plutôt que par KM (fuelAllocation.js's Priority 2 fallback —
// resolvedBy: 'date' on the contribution, threaded through unchanged from the
// engine). Purely informational (§5/§11) — never changes the amount.
function isDateResolved(row) {
  return (row.contributions || []).some(c => c.resolvedBy === 'date')
}

// One label per voyage row — the three states spec'd in §5/§11. A real,
// non-zero fuelCost is checked FIRST and is always trustworthy on its own
// (computeFuelCost never returns a nonzero cost for a fabricated/pending
// source — see profitability.js) — deliberately ahead of `row.status`, which
// is deriveVoyageStatus's own odometer-CHAIN-first priority order
// (voyageKmFuel.js): a voyage with no following voyage yet shows
// 'missing_end_km' there purely because the chain can't confirm its
// endpoint, even when its fuel is fully, correctly measured (e.g. a
// manual_fixed voyage manually linked to a plein). Only once a voyage
// genuinely has no real cost do we fall back to that odometer-chain status,
// reusing voyageKmFuel.js's own TIMELINE_STATUS labels rather than a second,
// re-invented wording for the same states.
export function voyageReportStatus(row) {
  if (row.fuelCost !== null && row.fuelCost !== undefined && row.fuelCost > 0) {
    return isDateResolved(row) ? { text: 'KM manquant → associé par date', tone: 'date' } : { text: 'Mesuré', tone: 'ok' }
  }
  if (row.status === 'pending_measurement') return { text: 'En attente de mesure', tone: 'pending' }
  if (row.status === 'fuel_not_assigned') return { text: 'Non assigné', tone: 'pending' }
  return { text: TIMELINE_STATUS[row.status]?.label || 'KM manquant', tone: 'missing' }
}

function truckTotals(rows) {
  // "Cost-measured" = a REAL, non-fabricated cost exists — never gated by
  // the odometer-chain status (see voyageReportStatus above for why).
  const costMeasured = rows.filter(r => r.fuelCost !== null && r.fuelCost !== undefined && r.fuelCost > 0)
  const litersMeasured = costMeasured.filter(hasRealLiters)

  const kmTotal = costMeasured.reduce((s, r) => s + (r.distance || 0), 0)
  const coutTotal = costMeasured.reduce((s, r) => s + (r.fuelCost || 0), 0)
  const litersKmTotal = litersMeasured.reduce((s, r) => s + (r.distance || 0), 0)
  const litersTotal = litersMeasured.reduce((s, r) => s + (r.litersLinked || 0), 0)
  // Weighted — Σlitres ÷ Σkm over the SAME (litres-measured) scope, never an
  // average of individual voyage L/100km values (§9).
  const consoL100 = litersKmTotal > 0 ? (litersTotal * 100) / litersKmTotal : null
  const coutKm = kmTotal > 0 ? coutTotal / kmTotal : null

  return {
    voyagesCount: rows.length, measuredCount: costMeasured.length,
    kmTotal, coutTotal, coutKm, litersTotal, litersKmTotal, consoL100,
  }
}

// `voyageRows`: the page's own buildVoyageKmFuelTimeline() output — already
// scoped to every camion (Propre + Loué), full unfiltered history. `camions`:
// same array the page already loaded. `selectedCamionIds`: null = every
// Camion Propre; an array (possibly empty) narrows to exactly those ids.
export function buildVoyageFuelReport({ voyageRows, camions, selectedCamionIds, from, to }) {
  const propre = propreCamions(camions)
  const propreIds = new Set(propre.map(c => c.id))

  const wantedIds = selectedCamionIds != null ? new Set(selectedCamionIds.map(Number)) : null
  const selectedCamions = (wantedIds ? propre.filter(c => wantedIds.has(c.id)) : propre)
    .slice()
    .sort((a, b) => (a.plaque || '').localeCompare(b.plaque || ''))

  const byTruck = selectedCamions.map(camion => {
    const rows = (voyageRows || [])
      .filter(r => r.camionId === camion.id && propreIds.has(r.camionId) && r.date >= from && r.date <= to)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.voyageId - b.voyageId))

    return { camion, camionId: camion.id, camionPlaque: camion.plaque, rows, ...truckTotals(rows) }
  })

  const fleetTotals = buildFleetTotals(byTruck)
  return { byTruck, fleetTotals, from, to }
}

// Fleet-wide weighted total — accumulates the SAME litres-scoped km each
// truck already used for its own ratio (never re-weights against a
// differently-scoped "total activity km"), so this is never an average of
// per-truck ratios either.
function buildFleetTotals(byTruck) {
  const kmTotal = byTruck.reduce((s, t) => s + t.kmTotal, 0)
  const coutTotal = byTruck.reduce((s, t) => s + t.coutTotal, 0)
  const litersTotal = byTruck.reduce((s, t) => s + t.litersTotal, 0)
  const litersKmTotal = byTruck.reduce((s, t) => s + t.litersKmTotal, 0)
  const consoL100 = litersKmTotal > 0 ? (litersTotal * 100) / litersKmTotal : null
  const coutKm = kmTotal > 0 ? coutTotal / kmTotal : null
  const voyagesCount = byTruck.reduce((s, t) => s + t.voyagesCount, 0)
  return { voyagesCount, kmTotal, coutTotal, litersTotal, consoL100, coutKm }
}
