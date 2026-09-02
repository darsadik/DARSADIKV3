// ── Flotte Propre — Fuel Monitoring ──────────────────────────────────────────
// Pure functions only (no Supabase, no React), same convention as
// lib/services/fuelPeriods.js / fuelCycles.js. This module adds NO new
// consumption formula for its core numbers — it shapes
// lib/services/fuelPeriods.js's buildFleetFuelPeriods() output (the same
// REFUEL → VOYAGES → NEXT REFUEL model that feeds the money engine in
// fuelAllocation.js, and the one CLAUDE.md calls the single authoritative
// model) into one row per refuel event, plus a weighted (never
// averaged-of-averages) period summary per truck.
//
// Deliberately NOT built on fuelCycles.js's buildFuelCycles(): that module
// adds an extra, Truck-Control-Center-specific heuristic on top of the same
// physics — it auto-merges two refuels on DIFFERENT dates into one cycle
// whenever no voyage happened between them (useful there to avoid spurious
// near-zero "cycles" from multi-session fill-ups). This page's spec has no
// such condition — "Distance = Current Bon KM − Previous Bon KM" for every
// Bon, voyages or not — and a truck with zero voyages between two dated
// Bons must still show two separate measured periods, not one merged
// "pending" one. fuelPeriods.js only aggregates same-DAY refuels
// (mandatory, never cross-date), which matches the spec exactly.
import { buildFleetFuelPeriods, aggregateDailyRefuels } from './fuelPeriods'

// Camions Propre only — Camions Loué (and their fuel/KM/stats) must never
// appear on this page. Missing/null type_camion defaults to 'propre' (see
// sql/04_camions_loues.sql: `DEFAULT 'propre'`), matching the same
// !== 'loue' predicate already used elsewhere (e.g. pages/camions/[id].js).
export function filterPropreFleetData({ camions, gasoil, voyages }) {
  const propreCamions = (camions || []).filter(c => c.type_camion !== 'loue')
  const propreIds = new Set(propreCamions.map(c => c.id))
  const propreGasoil = (gasoil || []).filter(g => g.camion_id && propreIds.has(g.camion_id))
  const propreVoyages = (voyages || []).filter(v => v.camion_id && propreIds.has(v.camion_id))
  return { propreCamions, propreGasoil, propreVoyages }
}

// Builds the Propre-only fuel-periods byCamion array — the single entry
// point pages should use for the core distance/consumption numbers.
export function buildPropreFleetPeriods({ camions, gasoil, voyages }) {
  const { propreCamions, propreGasoil, propreVoyages } = filterPropreFleetData({ camions, gasoil, voyages })
  return buildFleetFuelPeriods({ gasoil: propreGasoil, voyages: propreVoyages, camions: propreCamions })
}

// ── Per-refuel-event (per-Bon) history rows ──────────────────────────────────
// truck.closedPeriods (from buildFleetFuelPeriods) already has one entry per
// Bon that CLOSES a period, keyed by that closing Bon's own date/km —
// offset by one boundary from the raw refuel list. The one boundary that
// can never close anything — the truck's very first Bon ever — never gets a
// closedPeriod of its own, so it is added back explicitly as the single
// "pending" row (status: 'pending', no previous KM to compare against),
// using its own purchased quantity as "Gasoil" (matching the spec's example
// row exactly). The truck's open period (awaiting its next Bon) is never
// rendered as its own extra row — that would double-count the same
// physical Bon a second time; its currentKm/distance-so-far are read
// separately via currentKmFor.
export function buildTruckFuelHistory(truck) {
  const boundaries = aggregateDailyRefuels(truck.gasoil)
  if (boundaries.length === 0) return []

  const first = boundaries[0]
  const pendingRow = {
    key: `pending-${truck.camionId}-${first.date}-${first.km}`,
    status: 'pending',
    date: first.date,
    km: first.km,
    previousKm: null,
    distance: null,
    liters: first.qte,
    consoL100: null,
    coutTotal: null,
    coutKm: null,
    editGasoilRow: first,
    period: null,
  }

  const measuredRows = (truck.closedPeriods || []).map(p => ({
    key: `measured-${truck.camionId}-${p.dateEnd}-${p.kmEnd}`,
    status: 'measured',
    date: p.dateEnd,
    km: p.kmEnd,
    previousKm: p.kmStart,
    distance: p.distance,
    liters: p.litresGasoil,
    consoL100: p.realL100km,
    coutTotal: p.coutTotal,
    coutKm: p.distance > 0 ? p.coutTotal / p.distance : null,
    editGasoilRow: p.closingEvent,
    period: p,
  }))

  return [pendingRow, ...measuredRows]
}

// Best-known current position for a truck: the open period's furthest
// voyage KM if any voyage happened since the last Bon, otherwise that Bon's
// own KM (buildFleetFuelPeriods always opens one once ≥1 Bon exists).
export function currentKmFor(truck) {
  if (!truck.openPeriod) return null
  return truck.openPeriod.kmActuel ?? truck.openPeriod.kmStart ?? null
}

// ── Period summary per truck — weighted from totals, never an average of
// individual L/100km values (Σliters ÷ Σkm × 100, not mean(consoL100 per
// period)). `rows` = buildTruckFuelHistory(truck) output.
//
// pendingCount: the "pending" table row counts if its date falls in the
// selected period (rare — a truck's very first-ever Bon); the truck's
// currently-open trailing period (awaiting its next Bon to be measured)
// counts too when it has started by `to`. The `rows.length > 1` guard avoids
// double-counting the degenerate case where a truck has exactly one Bon
// ever — there the pending row IS that same open period, not a second one.
export function buildPeriodSummary(truck, rows, from, to) {
  const inPeriod = rows.filter(r => r.date >= from && r.date <= to)
  const measured = inPeriod.filter(r => r.status === 'measured')
  const pendingInPeriod = inPeriod.filter(r => r.status === 'pending')

  const distanceTotal = measured.reduce((s, r) => s + (r.distance || 0), 0)
  const litresTotal = measured.reduce((s, r) => s + (r.liters || 0), 0)
  const coutTotal = measured.reduce((s, r) => s + (r.coutTotal || 0), 0)
  const consoL100 = distanceTotal > 0 ? (litresTotal * 100) / distanceTotal : null
  const coutKm = distanceTotal > 0 ? coutTotal / distanceTotal : null

  const openCycleCountsAsPending = !!truck.openPeriod && truck.openPeriod.dateStart <= to && rows.length > 1
  const pendingCount = pendingInPeriod.length + (openCycleCountsAsPending ? 1 : 0)

  return {
    distanceTotal, litresTotal, coutTotal, consoL100, coutKm,
    measuredCount: measured.length, pendingCount,
    currentKm: currentKmFor(truck), rowsInPeriod: inPeriod,
  }
}

// ── Fleet-wide totals (the same weighted-average rule applied across the
// whole Propre fleet, not just per truck) ────────────────────────────────────
export function buildFleetPeriodTotals(perTruckSummaries) {
  const distanceTotal = perTruckSummaries.reduce((s, t) => s + t.distanceTotal, 0)
  const litresTotal = perTruckSummaries.reduce((s, t) => s + t.litresTotal, 0)
  const coutTotal = perTruckSummaries.reduce((s, t) => s + t.coutTotal, 0)
  const consoL100 = distanceTotal > 0 ? (litresTotal * 100) / distanceTotal : null
  const coutKm = distanceTotal > 0 ? coutTotal / distanceTotal : null
  const measuredCount = perTruckSummaries.reduce((s, t) => s + t.measuredCount, 0)
  const pendingCount = perTruckSummaries.reduce((s, t) => s + t.pendingCount, 0)
  return { distanceTotal, litresTotal, coutTotal, consoL100, coutKm, measuredCount, pendingCount }
}

// ── Period filter — display-only window. Never passed into the period
// engine itself (which always reads full history), only used to filter
// which already-computed rows are shown — so a Bon just inside the window
// still uses its real previous Bon for distance/consumption, even when that
// previous Bon is outside the window (spec's 31/08 example).
export function monitoringPeriodRange(kind, customFrom, customTo) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const pad = n => String(n).padStart(2, '0')
  const toStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (kind === 'mois_precedent') {
    const from = new Date(y, m - 1, 1)
    const to = new Date(y, m, 0)
    return { from: toStr(from), to: toStr(to) }
  }
  if (kind === 'perso') {
    return { from: customFrom || toStr(now), to: customTo || toStr(now) }
  }
  // 'mois' (default) — this month, 1st through today
  return { from: `${y}-${pad(m + 1)}-01`, to: toStr(now) }
}
