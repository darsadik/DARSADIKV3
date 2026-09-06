// ── Flotte Propre — Fuel Monitoring ──────────────────────────────────────────
// Pure functions only (no Supabase, no React), same convention as
// lib/services/fuelPeriods.js / fuelCycles.js. This module is the ONLY place
// that implements Contrôle KM & Carburant's own consumption math — it does
// not reuse fuelPeriods.js's aggregateDailyRefuels()/buildTruckFuelPeriods()
// for the per-Bon rows below (see aggregateDailyGasoil/buildTruckFuelHistory)
// because that function REQUIRES a KM reading to even see a row
// (`isRefuelRow` filters on `hasKm`) — a Gasoil Bon with a missing KM is
// silently invisible to it, so its litres never enter any period's total.
// That is a real bug for this page (consumption reads artificially low) but
// is NOT something fuelPeriods.js itself may be changed to fix — it is the
// shared, authoritative model behind fuelAllocation.js's money engine
// (Rentabilité/Review/dashboards) and must stay untouched. So this module
// carries its own local day-aggregation + missing-KM carry-forward logic,
// scoped to Contrôle KM & Carburant only. `buildPropreFleetPeriods` and
// `currentKmFor` below still read `buildFleetFuelPeriods()` — read-only,
// unmodified — purely for "current known position" (openPeriod), which has
// no missing-KM bug to fix (a KM-less Bon was never a position reading).
import { buildFleetFuelPeriods } from './fuelPeriods'

function hasKm(g) {
  return g.km !== null && g.km !== undefined && g.km !== ''
}

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

// Same-day aggregation (mandatory rule, unchanged) — but unlike
// fuelPeriods.js's aggregateDailyRefuels, a day with NO km-bearing row is
// still kept (hasKm: false) rather than dropped, so its litres are never
// silently lost before the carry-forward pass below even sees them. `km` is
// the highest reading among that day's km-bearing rows, if any; `editRow` is
// always a real row from that day — the km-holding one when there is one,
// otherwise the first raw row, so a currently-missing KM can still be added
// via the same edit affordance. `bonsCount` > 1 means several raw Bons were
// aggregated into this one fuel event (accounting/audit visibility, §5) —
// the raw rows themselves are never touched, only read.
function aggregateDailyGasoil(camionGasoil) {
  const rows = (camionGasoil || []).filter(g => (g.qte || 0) > 0)
  const byDate = new Map()
  rows.forEach(g => {
    if (!byDate.has(g.date)) byDate.set(g.date, [])
    byDate.get(g.date).push(g)
  })

  const events = []
  byDate.forEach((group, date) => {
    const sorted = [...group].sort((a, b) => (a.id || 0) - (b.id || 0))
    const withKm = sorted.filter(hasKm)
    const kmRow = withKm.length
      ? withKm.reduce((best, g) => parseFloat(g.km) > parseFloat(best.km) ? g : best)
      : null
    events.push({
      date,
      hasKm: withKm.length > 0,
      km: kmRow ? parseFloat(kmRow.km) : null,
      editRow: kmRow || sorted[0],
      qte: sorted.reduce((s, g) => s + (g.qte || 0), 0),
      cost: sorted.reduce((s, g) => s + (g.total || 0) + (g.adblue_total || 0), 0),
      bonsCount: sorted.length,
    })
  })

  return events.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
}

// ── Per-Bon history rows, with missing-KM carry-forward ──────────────────────
// Walks a truck's day-events chronologically. A day-event with no KM never
// closes or opens a period on its own, but it DOES get its own visible row
// (status: 'missing_km') — it is never merged away silently. Its litres/cost
// are also held in `carryEvents` and folded into the next day-event that
// does have a KM (however many KM-less events pile up in between: 1, 2, or
// 20, all of them) — that Bon's litres are never discarded just because ITS
// OWN KM is missing, they simply measure the period alongside whichever Bon
// closes it. Each missing-KM row records `linkedToDate` (the closing Bon
// that absorbed it, or null while still unresolved); the row that absorbs
// them records `mergedFrom` (which missing-KM Bons, and how many litres
// each contributed) — the two are two views of the same link, so the UI can
// never show one without the other.
//
// Four row outcomes:
//   'pending'    — the truck's first-ever KM-bearing day-event (no previous
//                  KM to diff against — never invented).
//   'measured'   — a normal closed period: distance > 0, ratio computed.
//   'invalid'    — KM did not increase (duplicate/decreasing odometer);
//                  litres are shown, no ratio is ever computed from bad KM.
//   'missing_km' — a Bon with no KM of its own; always visible, linked
//                  forward to whichever later Bon measures it (or
//                  unresolved — `linkedToDate: null` — if none exists yet).
export function buildTruckFuelHistory(truck) {
  const events = aggregateDailyGasoil(truck.gasoil)
  const rows = []
  let carryEvents = []
  let prevKm = null
  let prevDate = null

  const flushMissingRows = linkedToDate => {
    carryEvents.forEach(ev => {
      rows.push({
        key: `missing-${truck.camionId}-${ev.date}`,
        status: 'missing_km', date: ev.date, km: null,
        previousKm: null, distance: null, liters: ev.qte, coutTotal: ev.cost,
        coutKm: null, consoL100: null,
        editGasoilRow: ev.editRow, bonsCount: ev.bonsCount, mergedFrom: null, linkedToDate,
      })
    })
    carryEvents = []
  }

  events.forEach(ev => {
    if (!ev.hasKm) {
      carryEvents.push(ev)
      return
    }

    const carryLiters = carryEvents.reduce((s, e) => s + e.qte, 0)
    const carryCost = carryEvents.reduce((s, e) => s + e.cost, 0)
    const liters = ev.qte + carryLiters
    const coutTotal = ev.cost + carryCost
    const mergedFrom = carryEvents.map(e => ({ date: e.date, liters: e.qte }))

    flushMissingRows(ev.date)

    if (prevKm === null) {
      rows.push({
        key: `pending-${truck.camionId}-${ev.date}-${ev.km}`,
        status: 'pending', date: ev.date, km: ev.km,
        previousKm: null, previousDate: null, distance: null, liters, coutTotal, coutKm: null, consoL100: null,
        editGasoilRow: ev.editRow, bonsCount: ev.bonsCount, mergedFrom, linkedToDate: null,
      })
    } else {
      const distance = ev.km - prevKm
      if (distance > 0) {
        rows.push({
          key: `measured-${truck.camionId}-${ev.date}-${ev.km}`,
          status: 'measured', date: ev.date, km: ev.km,
          previousKm: prevKm, previousDate: prevDate, distance, liters, coutTotal,
          coutKm: coutTotal / distance, consoL100: (liters / distance) * 100,
          editGasoilRow: ev.editRow, bonsCount: ev.bonsCount, mergedFrom, linkedToDate: null,
        })
      } else {
        // Non-increasing KM (duplicate or decreasing odometer reading) — a
        // data anomaly, never a ratio: no distance can be trusted here.
        rows.push({
          key: `invalid-${truck.camionId}-${ev.date}-${ev.km}`,
          status: 'invalid', date: ev.date, km: ev.km,
          previousKm: prevKm, previousDate: prevDate, distance, liters, coutTotal, coutKm: null, consoL100: null,
          editGasoilRow: ev.editRow, bonsCount: ev.bonsCount, mergedFrom, linkedToDate: null,
        })
      }
    }

    prevKm = ev.km
    prevDate = ev.date
  })

  // Missing KM at the end: litres purchased but no next KM reading yet to
  // close a period with — each stays its own visible row, unresolved
  // (linkedToDate: null), never invented, never dropped.
  flushMissingRows(null)

  return rows
}

// ── Opening-anchored display rows — Contrôle KM & Carburant's per-Bon table
// ONLY ────────────────────────────────────────────────────────────────────
// buildTruckFuelHistory's own rows are CLOSING-anchored (a row's own
// distance/liters/consoL100 measure the period ENDING at that Bon) — that
// stays exactly as-is and is NOT changed here: it's what buildPeriodSummary
// sums for every KPI/aggregate in the app (Σdistance/Σlitres don't depend on
// which row "displays" them), and what the Consumption Report reads (it
// already shows a period's opening AND closing Bon explicitly on the same
// row, so it's immune to this ambiguity). But the per-Bon TABLE on Contrôle
// KM & Carburant shows one row per Bon with a single date/KM, and a period's
// distance/litres/consumption must appear on the Bon that OPENS it, not the
// one that closes it — the KM traveled since a refuel belongs on that
// refuel's own line. This is a pure re-attachment of already-computed
// numbers, never a new calculation: the closing Bon's own litres (with any
// missing-KM carry-forward already folded in by buildTruckFuelHistory) are
// exactly what move onto the opening row here. The most recent Bon ever
// always ends up 'pending' — there is no next Bon yet to close the period it
// opens, so its distance/litres/conso stay null even if ITS OWN backward
// (pre-shift) value had been a valid measurement.
//
// `rows` = buildTruckFuelHistory(truck)'s own output (closing-anchored) —
// pass the same array already computed at the call site, nothing here
// re-derives it. `from`/`to` are a display scope only, exactly like
// buildPeriodSummary: a Bon opens a period visible in the window either
// because the Bon itself falls in it, or — when the window starts
// mid-sequence — because it's the true previous Full Tank whose period
// closes just inside the window (never fabricate a new opening at `from`).
export function buildOpeningAnchoredPeriodRows(rows, from, to) {
  const kmRows = rows.filter(r => r.status !== 'missing_km')
  const missingRows = rows.filter(r => r.status === 'missing_km')

  const anchored = kmRows.map((r, i) => {
    const next = kmRows[i + 1]
    if (!next) {
      return {
        ...r, status: 'pending', distance: null, liters: null,
        coutTotal: null, coutKm: null, consoL100: null, mergedFrom: null, closingDate: null,
      }
    }
    return {
      ...r,
      status: next.status === 'invalid' ? 'invalid' : 'measured',
      distance: next.distance, liters: next.liters, coutTotal: next.coutTotal,
      coutKm: next.coutKm, consoL100: next.consoL100, mergedFrom: next.mergedFrom,
      closingDate: next.date,
    }
  })

  const visible = [
    ...anchored.filter(r => r.date <= to && (r.date >= from || (r.closingDate !== null && r.closingDate >= from))),
    ...missingRows.filter(r => r.date >= from && r.date <= to),
  ]
  return visible.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
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
  // Only 'measured' rows have a trustworthy distance, so only they enter the
  // ratio — 'pending'/'invalid'/'missing_km' rows still show their own
  // litres/cost in the table (never discarded), just never blended into a
  // ratio computed from a KM that's missing or doesn't increase.
  const measured = inPeriod.filter(r => r.status === 'measured')
  const pendingInPeriod = inPeriod.filter(r => r.status === 'pending')
  const missingKmInPeriod = inPeriod.filter(r => r.status === 'missing_km')

  const distanceTotal = measured.reduce((s, r) => s + (r.distance || 0), 0)
  const litresTotal = measured.reduce((s, r) => s + (r.liters || 0), 0)
  const coutTotal = measured.reduce((s, r) => s + (r.coutTotal || 0), 0)
  const consoL100 = distanceTotal > 0 ? (litresTotal * 100) / distanceTotal : null
  const coutKm = distanceTotal > 0 ? coutTotal / distanceTotal : null

  const openCycleCountsAsPending = !!truck.openPeriod && truck.openPeriod.dateStart <= to && rows.length > 1
  const pendingCount = pendingInPeriod.length + (openCycleCountsAsPending ? 1 : 0)

  return {
    distanceTotal, litresTotal, coutTotal, consoL100, coutKm,
    measuredCount: measured.length, pendingCount, missingKmCount: missingKmInPeriod.length,
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
  const missingKmCount = perTruckSummaries.reduce((s, t) => s + t.missingKmCount, 0)
  return { distanceTotal, litresTotal, coutTotal, consoL100, coutKm, measuredCount, pendingCount, missingKmCount }
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
