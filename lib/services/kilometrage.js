// ── Kilométrage — per-truck odometer chain monitoring ───────────────────────
// Pure functions only (no Supabase, no React), same convention as
// lib/services/fuelCycles.js. Distance is never stored/edited directly — it
// is always derived from km_depart of consecutive voyages of the SAME truck
// (see sql/06_fuel_odometer_system.sql / recalc_camion_odometer_chain). This
// module re-derives the chain independently in JS so it can (a) render a
// monitoring table without another round-trip and (b) detect drift between
// what's stored (voyage.km_arrivee) and what the chain SHOULD say — which is
// exactly how the "distance not calculated even though both KMs exist" bug
// was found: recalc_camion_odometer_chain didn't exist in the DB yet, so
// km_arrivee stayed null forever no matter how many voyages had km_depart.

export const ROW_STATUS = {
  calculated:        { emoji: '✓', label: 'Calculé',                 tone: 'ok' },
  waiting:            { emoji: '⚠', label: 'En attente du prochain voyage', tone: 'warning' },
  missing_km:         { emoji: '❌', label: 'KM manquant',             tone: 'error' },
  broken_chronology:  { emoji: '❌', label: 'Chronologie incohérente', tone: 'error' },
}

export const TRUCK_STATUS = {
  ok:               { emoji: '✓', label: 'OK',                          tone: 'ok' },
  waiting:          { emoji: '⚠', label: 'En attente du prochain KM',   tone: 'warning' },
  missing_km:       { emoji: '❌', label: 'KM manquant',                 tone: 'error' },
  chronology_error: { emoji: '❌', label: 'Erreur de chronologie',       tone: 'error' },
}

// Same ordering as recalc_camion_odometer_chain: date_depart ASC, id ASC.
// Keeping the two in lockstep is what lets this module detect drift between
// the JS-recomputed chain and what's actually stored in km_arrivee.
function chronoSort(a, b) {
  if (a.date_depart !== b.date_depart) return a.date_depart < b.date_depart ? -1 : 1
  return (a.id || 0) - (b.id || 0)
}

function hasKm(v) {
  return v.km_depart !== null && v.km_depart !== undefined && v.km_depart !== ''
}

// Builds one row per voyage: current/next KM, the freshly-derived distance,
// what's actually stored in the DB, and a status. Pass every (non-deleted)
// voyage with camion_id/date_depart/km_depart/km_arrivee already loaded.
export function buildOdometerRows(voyages, camions = []) {
  const active = (voyages || []).filter(v => !v.deleted_at)
  const camionById = new Map((camions || []).map(c => [c.id, c]))

  const byCamion = new Map()
  active.forEach(v => {
    if (!v.camion_id) return
    if (!byCamion.has(v.camion_id)) byCamion.set(v.camion_id, [])
    byCamion.get(v.camion_id).push(v)
  })

  const rows = []
  byCamion.forEach((list, camionId) => {
    const sorted = [...list].sort(chronoSort)
    const camion = camionById.get(camionId)
    const plaque = camion?.plaque || list[0]?.camion_plaque || `Camion #${camionId}`

    sorted.forEach((v, i) => {
      const next = sorted[i + 1] || null
      const kmDepart = hasKm(v) ? parseFloat(v.km_depart) : null
      const kmNext = next && hasKm(next) ? parseFloat(next.km_depart) : null
      const distance = kmDepart !== null && kmNext !== null ? kmNext - kmDepart : null
      const storedKmArrivee = v.km_arrivee !== null && v.km_arrivee !== undefined ? parseFloat(v.km_arrivee) : null
      const storedDistance = kmDepart !== null && storedKmArrivee !== null ? storedKmArrivee - kmDepart : null

      let status
      if (kmDepart === null) status = 'missing_km'
      else if (!next || kmNext === null) status = 'waiting'
      else if (distance < 0) status = 'broken_chronology'
      else status = 'calculated'

      // The chain is "out of sync" when what recalc_camion_odometer_chain
      // would compute (distance, from kmNext) disagrees with what's actually
      // stored on this row (storedDistance, from v.km_arrivee) — e.g. an
      // edit happened without the recalc RPC running. Only meaningful when
      // both sides have an opinion.
      const outOfSync = distance !== null && storedDistance !== null && distance !== storedDistance
        ? true
        : (distance === null) !== (storedDistance === null)

      rows.push({
        camionId, plaque,
        voyageId: v.id, reference: v.reference || `#${v.id}`,
        date: v.date_depart,
        kmDepart, kmNext,
        nextVoyageId: next?.id || null,
        distance, storedDistance, outOfSync,
        isLastForTruck: !next,
        status,
      })
    })
  })

  return rows.sort((a, b) => {
    if (a.plaque !== b.plaque) return a.plaque < b.plaque ? -1 : 1
    return chronoSort({ date_depart: a.date, id: a.voyageId }, { date_depart: b.date, id: b.voyageId })
  })
}

// Groups rows into per-truck summaries with a single worst-first status.
// Priority: chronology_error > missing_km > waiting > ok — mirrors the
// worst-status pattern used across the app (see camionPerformance.js).
export function buildTruckSummaries(rows) {
  const byCamion = new Map()
  rows.forEach(r => {
    if (!byCamion.has(r.camionId)) byCamion.set(r.camionId, { camionId: r.camionId, plaque: r.plaque, rows: [] })
    byCamion.get(r.camionId).rows.push(r)
  })

  return [...byCamion.values()].map(t => {
    const hasChronologyError = t.rows.some(r => r.status === 'broken_chronology')
    const hasMissingKm = t.rows.some(r => r.status === 'missing_km')
    const hasWaiting = t.rows.some(r => r.status === 'waiting')
    const hasOutOfSync = t.rows.some(r => r.outOfSync)

    let status
    if (hasChronologyError) status = 'chronology_error'
    else if (hasMissingKm) status = 'missing_km'
    else if (hasWaiting) status = 'waiting'
    else status = 'ok'

    return {
      ...t,
      nbVoyages: t.rows.length,
      nbCalculated: t.rows.filter(r => r.status === 'calculated').length,
      status, hasOutOfSync,
    }
  }).sort((a, b) => (a.plaque || '').localeCompare(b.plaque || ''))
}

// Flat, clickable problem list — each item carries the affected voyage ids
// so the UI can filter the table down to exactly what's wrong (spec: "clicking
// a warning opens the affected voyages").
export function detectProblems(rows) {
  const problems = []
  const push = (severity, type, camionId, plaque, message, voyageIds) =>
    problems.push({ severity, type, camionId, plaque, message, voyageIds })

  const byCamion = new Map()
  rows.forEach(r => {
    if (!byCamion.has(r.camionId)) byCamion.set(r.camionId, [])
    byCamion.get(r.camionId).push(r)
  })

  byCamion.forEach((list, camionId) => {
    const plaque = list[0]?.plaque

    list.filter(r => r.status === 'missing_km').forEach(r => {
      push('error', 'missing_km', camionId, plaque,
        `${plaque} : voyage ${r.reference} du ${r.date} sans KM départ — la chaîne est cassée à partir d'ici.`,
        [r.voyageId])
    })

    list.filter(r => r.status === 'broken_chronology').forEach(r => {
      push('error', 'negative_distance', camionId, plaque,
        `${plaque} : voyage ${r.reference} du ${r.date} — KM suivant (${r.kmNext}) inférieur au KM départ (${r.kmDepart}), distance négative (${r.distance} km).`,
        [r.voyageId, r.nextVoyageId].filter(Boolean))
    })

    list.filter(r => r.status === 'calculated' && r.distance === 0).forEach(r => {
      push('warning', 'zero_distance', camionId, plaque,
        `${plaque} : voyage ${r.reference} du ${r.date} — distance de 0 km (même KM que le voyage suivant).`,
        [r.voyageId, r.nextVoyageId].filter(Boolean))
    })

    const waiting = list.filter(r => r.status === 'waiting' && r.kmDepart !== null)
    if (waiting.length) {
      const last = waiting[waiting.length - 1]
      push('info', 'missing_next_voyage', camionId, plaque,
        `${plaque} : voyage ${last.reference} du ${last.date} en attente du prochain voyage pour calculer sa distance.`,
        [last.voyageId])
    }

    list.filter(r => r.outOfSync).forEach(r => {
      push('warning', 'out_of_sync', camionId, plaque,
        `${plaque} : voyage ${r.reference} du ${r.date} — la distance enregistrée ne correspond plus à la chaîne recalculée. Relancer "Recalculer la chaîne".`,
        [r.voyageId])
    })
  })

  const order = { error: 0, warning: 1, info: 2 }
  return problems.sort((a, b) => order[a.severity] - order[b.severity])
}

// Dashboard aggregates (spec §4): trucks OK / waiting / missing KM /
// chronology errors, built entirely from truck summaries already computed
// above — no new queries, no re-derivation.
export function buildDashboard(truckSummaries) {
  const okTrucks = truckSummaries.filter(t => t.status === 'ok')
  const waitingTrucks = truckSummaries.filter(t => t.status === 'waiting')
  const missingKmTrucks = truckSummaries.filter(t => t.status === 'missing_km')
  const chronologyErrorTrucks = truckSummaries.filter(t => t.status === 'chronology_error')

  return {
    total: truckSummaries.length,
    okTrucks, waitingTrucks, missingKmTrucks, chronologyErrorTrucks,
  }
}

// "Help entering KM" — suggests a truck's last known odometer reading before
// a given voyage: the chronologically-previous voyage's km_arrivee, or its
// km_depart if that voyage is itself still waiting on its own next reading.
// Pure suggestion, same chronoSort order recalc_camion_odometer_chain uses —
// callers decide whether/how to offer it (e.g. fill an input on click), it
// is never written on its own. Shared by the Voyage page and the Voyage KM &
// Fuel Manager so both offer the exact same suggestion.
export function suggestPreviousKm(camionVoyages, voyageId) {
  const sorted = [...(camionVoyages || [])].filter(v => !v.deleted_at).sort(chronoSort)
  const idx = sorted.findIndex(v => v.id === voyageId)
  if (idx <= 0) return null
  const prev = sorted[idx - 1]
  const val = prev.km_arrivee ?? prev.km_depart
  return (val !== null && val !== undefined) ? parseFloat(val) : null
}
