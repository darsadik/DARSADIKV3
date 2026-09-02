// ── Fuel Periods — REFUEL → VOYAGES → NEXT REFUEL ───────────────────────────
// Pure functions only (no Supabase, no React), same convention as
// kilometrage.js / fuelCycles.js / fuelAllocation.js. This is the single
// place that defines a truck's fuel consumption periods — the authoritative
// physics behind the app's real-refueling-based consumption model.
//
// Core rule: the fuel added AFTER a group of voyages is what those voyages
// consumed. A refuel — full tank or partial top-up, it makes no difference —
// closes the period that started at the previous refuel. There is no "full
// tank" requirement anywhere in this model: any diesel purchase with a KM
// reading can open/close a period, and its own litres (aggregated per day,
// see below) are the period's real, measured consumption (spec invariant:
// allocated voyage litres = closing refuel's litres, exactly — nothing added,
// nothing dropped). The very first refuel for a truck closes nothing (no
// prior boundary to measure from). The most recent refuel opens a period
// that stays OPEN (real consumption unknown, never fabricated) until a later
// refuel closes it.
//
// Same-date refuels for the same truck are always ONE fuel event, never
// separate consumption periods — see aggregateDailyRefuels. This is a
// mandatory business rule, not a user choice: 100L + 50L on the same date is
// 150L for consumption purposes, exactly as if it had been entered as one
// row. The individual database rows are preserved as-is for accounting/
// audit purposes (supplier ledger, /gasoil's own list) — only the
// consumption/allocation engines aggregate them.
//
// This module intentionally has NO dependency on lib/services/fuelAllocation.js
// (which depends on this module) to avoid a circular import — voyage-level
// cent-exact money distribution stays owned by fuelAllocation.js's
// distributeFuelPurchase; this module only produces period-level totals and
// each period's own voyage list (with each voyage's own distance already
// computed, ready for a caller to allocate).

function hasKm(g) {
  return g.km !== null && g.km !== undefined && g.km !== ''
}

// Any diesel purchase with a KM reading can open/close a consumption period.
// A full tank is NOT required — the business unit of measurement is "how
// much fuel was added after this group of voyages", however much that was.
export function isRefuelRow(g) {
  return (g?.qte || 0) > 0 && hasKm(g)
}

// Aggregates every refuel row for the SAME truck on the SAME date into one
// fuel event (business rule: "never split same-day refuels into separate
// consumption periods"). `id` is the lowest-id member row (a stable,
// traceable reference into the real `gasoil` table); `gasoilIds` lists every
// underlying row so manual links to any of them resolve to this one event;
// `km` is the highest KM reading recorded that day (the truck's position by
// the time that day's fueling was done); descriptive fields (station,
// camion_plaque, chauffeur, unit prices) come from the first (lowest-id) row
// — display-only, never used in a money calculation. Sorted ascending by km,
// the only ordering that matters for bracket detection.
export function aggregateDailyRefuels(camionGasoil) {
  const rows = (camionGasoil || []).filter(isRefuelRow)
  const byDate = new Map()
  rows.forEach(g => {
    if (!byDate.has(g.date)) byDate.set(g.date, [])
    byDate.get(g.date).push(g)
  })

  const events = []
  byDate.forEach((group, date) => {
    const sorted = [...group].sort((a, b) => (a.id || 0) - (b.id || 0))
    const first = sorted[0]
    events.push({
      id: first.id,
      date,
      km: Math.max(...sorted.map(g => parseFloat(g.km))),
      qte: sorted.reduce((s, g) => s + (g.qte || 0), 0),
      adblue_qte: sorted.reduce((s, g) => s + (g.adblue_qte || 0), 0),
      total: sorted.reduce((s, g) => s + (g.total || 0), 0),
      adblue_total: sorted.reduce((s, g) => s + (g.adblue_total || 0), 0),
      camion_id: first.camion_id,
      camion_plaque: first.camion_plaque,
      chauffeur: first.chauffeur,
      station: first.station,
      prix_unitaire: first.prix_unitaire,
      adblue_prix_unitaire: first.adblue_prix_unitaire,
      gasoilIds: sorted.map(g => g.id),
      isAggregate: sorted.length > 1,
    })
  })

  return events.sort((a, b) => a.km - b.km)
}

// Voyages of this truck whose km_depart falls in [kmStart, kmEnd) — kmEnd
// null means "no upper bound yet" (the open period). Each voyage carries its
// own distance (vKm), ready for a caller to allocate proportionally.
function voyagesInKmRange(camionVoyages, kmStart, kmEnd) {
  return (camionVoyages || [])
    .filter(v => !v.deleted_at &&
      v.km_depart !== null && v.km_depart !== undefined &&
      parseFloat(v.km_depart) >= kmStart &&
      (kmEnd === null || parseFloat(v.km_depart) < kmEnd))
    .map(v => {
      const vKm = (v.km_arrivee !== null && v.km_arrivee !== undefined)
        ? Math.max(0, parseFloat(v.km_arrivee) - parseFloat(v.km_depart))
        : null
      return { ...v, vKm }
    })
}

// Builds every CLOSED period plus the one OPEN period (if any) for a single
// truck. Pass this truck's own gasoil/voyages rows already loaded (no
// Supabase calls here).
export function buildTruckFuelPeriods({ camionGasoil, camionVoyages }) {
  const boundaries = aggregateDailyRefuels(camionGasoil)
  const closedPeriods = []

  for (let i = 1; i < boundaries.length; i++) {
    const prev = boundaries[i - 1]
    const closing = boundaries[i]
    const kmStart = prev.km
    const kmEnd = closing.km
    const distance = kmEnd - kmStart
    // Duplicate/decreasing KM between two consecutive refuel events is bad
    // data, not a real period — surfaced as an anomaly elsewhere
    // (fuelCycles.js's detectAlerts), never silently divided into a
    // fabricated consumption figure here.
    if (!(distance > 0)) continue

    const realLKm = closing.qte > 0 ? closing.qte / distance : null

    closedPeriods.push({
      status: 'closed',
      kmStart, kmEnd, distance,
      dateStart: prev.date, dateEnd: closing.date,
      openingEventId: prev.id, closingEventId: closing.id, closingEvent: closing,
      litresGasoil: closing.qte, litresAdblue: closing.adblue_qte,
      montantGasoil: closing.total, montantAdblue: closing.adblue_total,
      coutTotal: closing.total + closing.adblue_total,
      voyageIds: voyagesInKmRange(camionVoyages, kmStart, kmEnd).map(v => v.id),
      voyages: voyagesInKmRange(camionVoyages, kmStart, kmEnd),
      realLKm, realL100km: realLKm !== null ? realLKm * 100 : null,
    })
  }

  // The open period: bounded by the most recent refuel event, real
  // consumption unknown until a later refuel closes it. Distance-so-far and
  // voyages ARE legitimately known (never fabricate them away) — only the
  // consumption fields are absent by design.
  let openPeriod = null
  if (boundaries.length > 0) {
    const last = boundaries[boundaries.length - 1]
    const kmStart = last.km
    const voyages = voyagesInKmRange(camionVoyages, kmStart, null)
    let kmActuel = null
    voyages.forEach(v => {
      const cand = v.vKm !== null ? parseFloat(v.km_arrivee) : parseFloat(v.km_depart)
      if (kmActuel === null || cand > kmActuel) kmActuel = cand
    })
    openPeriod = {
      status: 'open',
      kmStart, dateStart: last.date, openingEventId: last.id, openingEvent: last,
      voyageIds: voyages.map(v => v.id), voyages,
      kmActuel, distanceSoFar: kmActuel !== null ? kmActuel - kmStart : null,
    }
  }

  return { closedPeriods, openPeriod }
}

// Per-truck grouping across the whole fleet — same byCamion array shape
// pattern already used by lib/services/fuelCycles.js's buildFuelCycles, so a
// caller can iterate identically.
export function buildFleetFuelPeriods({ gasoil, voyages, camions }) {
  const activeVoyages = (voyages || []).filter(v => !v.deleted_at)
  const camionIds = new Set([
    ...(camions || []).map(c => c.id),
    ...(gasoil || []).map(g => g.camion_id),
    ...activeVoyages.map(v => v.camion_id),
  ].filter(Boolean))

  const byCamion = []
  camionIds.forEach(camionId => {
    const camion = (camions || []).find(c => c.id === camionId)
    const gFor = (gasoil || []).filter(g => g.camion_id === camionId)
    const vFor = activeVoyages.filter(v => v.camion_id === camionId)
    const camionPlaque = camion?.plaque || gFor[0]?.camion_plaque || vFor[0]?.camion_plaque || `Camion #${camionId}`
    const { closedPeriods, openPeriod } = buildTruckFuelPeriods({ camionGasoil: gFor, camionVoyages: vFor })
    byCamion.push({ camionId, camionPlaque, camion, closedPeriods, openPeriod, gasoil: gFor, voyages: vFor })
  })

  return byCamion.sort((a, b) => (a.camionPlaque || '').localeCompare(b.camionPlaque || ''))
}
