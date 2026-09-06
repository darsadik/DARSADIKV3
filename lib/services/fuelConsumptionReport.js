// ── Truck Fuel Consumption Report — data layer ───────────────────────────────
// Pure functions only (no Supabase, no React). This is a reporting layer over
// the existing authoritative fuel history — it computes NOTHING new: every
// number here comes straight from the same REFUEL → VOYAGES → NEXT REFUEL
// sequential engine already used by /gasoil's Conso. L/100km card, Performance
// Camions, and Contrôle KM & Carburant (lib/services/fuelPeriods.js's
// buildFleetFuelPeriods + lib/services/fleetFuelMonitoring.js's
// buildTruckFuelHistory/buildPeriodSummary/buildFleetPeriodTotals). No second
// consumption algorithm, no duplicated fuel records.
//
// One report row = one Full Tank → next Full Tank period (a 'measured' or
// 'invalid' row from buildTruckFuelHistory — both carry a real opening +
// closing KM/date pair). 'pending' (a truck's very first-ever Bon — no prior
// reference, so no period yet) and 'missing_km' (its litres are already
// folded into whichever later Bon closes them) never produce a period row of
// their own; their presence is still surfaced via hasOpeningReference /
// unresolvedMissingKm so nothing is silently hidden from the report.
//
// Because buildTruckFuelHistory always walks a truck's FULL history and
// buildPeriodSummary only filters by each row's own (closing) date, a
// selected period that starts mid-sequence automatically uses the true
// previous Full Tank as its opening reference, even when that Full Tank
// falls before `from` — never fabricating a new opening point.
import { buildFleetFuelPeriods } from './fuelPeriods'
import { buildTruckFuelHistory, buildPeriodSummary, buildFleetPeriodTotals } from './fleetFuelMonitoring'

// `selectedCamionIds`: null/undefined = every truck; an array (including an
// empty one, for an explicit "none selected") narrows to exactly those ids —
// the two are NOT the same thing, so an empty selection correctly reports
// zero trucks instead of silently falling back to "all".
export function buildConsumptionReport({ camions, gasoil, voyages, selectedCamionIds, from, to }) {
  const wantedIds = selectedCamionIds != null ? new Set(selectedCamionIds.map(Number)) : null
  const selectedCamions = (wantedIds ? camions.filter(c => wantedIds.has(c.id)) : camions)
    .slice()
    .sort((a, b) => (a.plaque || '').localeCompare(b.plaque || ''))

  const byCamionPeriods = buildFleetFuelPeriods({ gasoil, voyages, camions })

  const byTruck = selectedCamions.map(camion => {
    const truck = byCamionPeriods.find(t => t.camionId === camion.id) ||
      { camionId: camion.id, camionPlaque: camion.plaque, gasoil: [], openPeriod: null }
    const rows = buildTruckFuelHistory(truck)
    const summary = buildPeriodSummary(truck, rows, from, to)

    const periods = summary.rowsInPeriod
      .filter(r => r.status === 'measured' || r.status === 'invalid')
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)

    return {
      camion, camionId: camion.id, camionPlaque: camion.plaque,
      periods, summary,
      hasOpeningReferenceOnly: summary.rowsInPeriod.some(r => r.status === 'pending'),
      unresolvedMissingKm: summary.rowsInPeriod.filter(r => r.status === 'missing_km').length,
    }
  })

  const fleetTotals = buildFleetPeriodTotals(byTruck.map(t => t.summary))
  return { byTruck, fleetTotals }
}
