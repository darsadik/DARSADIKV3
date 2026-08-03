// ── Truck Timeline & KM/Fuel Control Center — unified event layer ───────────
// Pure functions only (no Supabase, no React), same convention as
// lib/services/kilometrage.js / voyageKmFuel.js. This module NEVER recomputes
// distance, fuel cost, or any money figure — it only merges the already-built
// per-voyage rows (lib/services/voyageKmFuel.js: buildVoyageKmFuelTimeline)
// with raw gasoil (plein) rows into one chronological list, and stamps join
// flags (assignment status, "used automatically", estimated position) that
// are pure lookups against voyage_gasoil links already loaded by the page.

function hasKm(g) {
  return g.km !== null && g.km !== undefined && g.km !== ''
}

function daysBetween(a, b) {
  if (!a || !b) return Infinity
  return Math.abs((new Date(a) - new Date(b)) / 86400000)
}

// For a plein with no odometer km, finds the closest-by-date voyage of the
// SAME truck so the UI can place it "immediately before/after that voyage"
// (spec §2). Purely a display suggestion — never writes gasoil.km, never
// changes which voyage's fuel cost the plein actually affects.
export function estimatePleinPosition(plein, camionVoyageRows) {
  const candidates = (camionVoyageRows || []).filter(v => v.date)
  if (!candidates.length) return null
  let best = null
  let bestGap = Infinity
  candidates.forEach(v => {
    const gap = daysBetween(plein.date, v.date)
    if (gap < bestGap) { bestGap = gap; best = v }
  })
  if (!best) return null
  return {
    anchorVoyageId: best.voyageId,
    anchorReference: best.reference,
    position: (plein.date || '') <= (best.date || '') ? 'before' : 'after',
    daysGap: bestGap,
  }
}

// Merges per-voyage rows (already carrying KM + fuel cost/source) and raw
// gasoil rows into ONE chronological array of events (spec §1). Each plein
// event is stamped with:
//   - assignmentStatus: 'unassigned' | 'assigned' | 'split' — purely a
//     lookup against voyage_gasoil rows already linked to this plein.
//   - implicitlyUsed: true when the plein has a km value, i.e. it already
//     participates in the automatic bracket engine (profitability.js) even
//     though it was never "assigned" to a single voyage.
//   - needsAssignment: the plein is invisible to both the automatic engine
//     AND any manual link — the actual audience for manual assignment/
//     suggestions (spec §3/§8).
//   - estimatedPosition: only set when the plein has no km (spec §2).
//   - hasProblem: set membership against the ids the existing detectors
//     (kilometrage.js/voyageKmFuel.js) already produce — no new detection.
export function buildUnifiedTimeline({
  voyageRows = [], gasoil = [], voyageGasoilRows = [],
  problemVoyageIds = new Set(), problemGasoilIds = new Set(),
}) {
  const voyageRowsByCamion = new Map()
  voyageRows.forEach(v => {
    if (!voyageRowsByCamion.has(v.camionId)) voyageRowsByCamion.set(v.camionId, [])
    voyageRowsByCamion.get(v.camionId).push(v)
  })

  const linksByGasoilId = new Map()
  voyageGasoilRows.forEach(l => {
    if (!l.gasoil_id) return
    if (!linksByGasoilId.has(l.gasoil_id)) linksByGasoilId.set(l.gasoil_id, [])
    linksByGasoilId.get(l.gasoil_id).push(l)
  })

  const voyageEvents = voyageRows.map(v => ({
    type: 'voyage',
    id: `voyage:${v.voyageId}`,
    date: v.date,
    camionId: v.camionId,
    hasProblem: problemVoyageIds.has(v.voyageId),
    ...v,
  }))

  const pleinEvents = gasoil.map(g => {
    const links = linksByGasoilId.get(g.id) || []
    const km = hasKm(g)
    const assignmentStatus = links.length === 0 ? 'unassigned' : (links.some(l => l.is_split) ? 'split' : 'assigned')
    const needsAssignment = !km && assignmentStatus === 'unassigned'
    const estimatedPosition = !km
      ? estimatePleinPosition(g, voyageRowsByCamion.get(g.camion_id) || [])
      : null

    return {
      type: 'plein',
      id: `plein:${g.id}`,
      gasoilId: g.id,
      date: g.date,
      camionId: g.camion_id,
      plaque: g.camion_plaque || '—',
      station: g.station || '',
      km: km ? parseFloat(g.km) : null,
      qte: g.qte,
      prixUnitaire: g.prix_unitaire,
      total: g.total,
      adblueTotal: g.adblue_total,
      adblueQte: g.adblue_qte,
      adblueUnitPrice: g.adblue_prix_unitaire,
      hasKm: km,
      implicitlyUsed: km,
      assignmentStatus,
      needsAssignment,
      links,
      estimatedPosition,
      anchorVoyageId: estimatedPosition?.anchorVoyageId ?? null,
      hasProblem: problemGasoilIds.has(g.id),
    }
  })

  return [...voyageEvents, ...pleinEvents].sort((a, b) => {
    if (a.date !== b.date) return (a.date || '') < (b.date || '') ? -1 : 1
    if (a.type !== b.type) return a.type === 'voyage' ? -1 : 1
    return 0
  })
}

// Per-truck KM read-point sequence (spec §11) — interleaves voyage
// km_depart readings (already computed by kilometrage.js's buildOdometerRows)
// with plein km readings for the SAME truck, sorted chronologically. Flags
// are purely comparative (this point's km vs the previous point's km) —
// never a recomputation of distance/status, which stay exactly as
// kilometrage.js already produced them for voyage-to-voyage transitions.
export function buildTruckOdometerChain(camionId, odometerRows, gasoil) {
  const voyagePoints = (odometerRows || [])
    .filter(r => r.camionId === camionId && r.kmDepart !== null)
    .map(r => ({ type: 'voyage', km: r.kmDepart, date: r.date, label: r.reference, voyageId: r.voyageId, status: r.status }))

  const pleinPoints = (gasoil || [])
    .filter(g => g.camion_id === camionId && hasKm(g))
    .map(g => ({ type: 'plein', km: parseFloat(g.km), date: g.date, label: `Plein · ${g.date}`, gasoilId: g.id }))

  const points = [...voyagePoints, ...pleinPoints].sort((a, b) => (a.date || '') < (b.date || '') ? -1 : (a.date || '') > (b.date || '') ? 1 : a.km - b.km)

  return points.map((p, i) => {
    const prev = points[i - 1]
    let warning = null
    if (prev) {
      if (p.km === prev.km) warning = 'duplicate'
      else if (p.km < prev.km) warning = 'decreasing'
    }
    return { ...p, warning }
  })
}

// Display-layer filtering for the unified timeline — never refetches, never
// rebuilds anything from buildUnifiedTimeline's output.
export function filterUnifiedTimeline(events, { camionId, dateFrom, dateTo, show, search, statusFilter, needsAssignmentOnly, brokenChainOnly } = {}) {
  const q = (search || '').trim().toLowerCase()
  return (events || [])
    .filter(e => !camionId || e.camionId === camionId)
    .filter(e => !dateFrom || (e.date || '') >= dateFrom)
    .filter(e => !dateTo || (e.date || '') <= dateTo)
    .filter(e => !needsAssignmentOnly || (e.type === 'plein' && e.needsAssignment))
    .filter(e => !brokenChainOnly || (e.type === 'voyage' && e.status === 'impossible_distance'))
    .filter(e => {
      if (!show || show === 'all') return true
      if (show === 'voyages') return e.type === 'voyage'
      if (show === 'fuel') return e.type === 'plein'
      if (show === 'problems') return e.type === 'voyage'
        ? e.status !== 'complete'
        : (e.hasProblem || e.needsAssignment)
      // Not exposed as its own filter chip (spec keeps the chip row to
      // All/Voyages/Fuel/Problems) — driven only by the dashboard's "Fuel
      // Not Assigned" / "Manual Assignments" cards (KmFuelDashboardCards).
      if (show === 'assigned') return e.type === 'plein' && (e.assignmentStatus === 'assigned' || e.assignmentStatus === 'split')
      if (show === 'not_assigned') return e.type === 'plein' && e.needsAssignment
      return true
    })
    .filter(e => !statusFilter || (e.type === 'voyage' && e.status === statusFilter))
    .filter(e => {
      if (!q) return true
      if (e.type === 'voyage') return (e.reference || '').toLowerCase().includes(q) || (e.plaque || '').toLowerCase().includes(q)
      return (e.plaque || '').toLowerCase().includes(q) || (e.station || '').toLowerCase().includes(q)
    })
}

// Spec §7 — for every event, expose the nearest KNOWN odometer readings
// immediately before/after it on the SAME truck, so a discontinuity is
// visible without opening the separate chain modal. Built by locating each
// event inside the already-computed buildTruckOdometerChain(camionId, ...)
// sequence (or, when the event itself carries no km — e.g. a voyage missing
// its start KM, or a km-less plein — by walking to the nearest chain point
// before/after it by date). Pure lookup: never invents a KM value, never
// recomputes a warning beyond what buildTruckOdometerChain already flags.
export function attachChainContext(events, odometerRows, gasoil) {
  const chainByCamion = new Map()
  function chainFor(camionId) {
    if (!chainByCamion.has(camionId)) chainByCamion.set(camionId, buildTruckOdometerChain(camionId, odometerRows, gasoil))
    return chainByCamion.get(camionId)
  }

  return (events || []).map(e => {
    const chain = chainFor(e.camionId)
    const ownIdx = chain.findIndex(p =>
      (e.type === 'voyage' && p.type === 'voyage' && p.voyageId === e.voyageId) ||
      (e.type === 'plein' && p.type === 'plein' && p.gasoilId === e.gasoilId))

    let prevPoint = null, nextPoint = null, chainWarning = null
    if (ownIdx >= 0) {
      prevPoint = chain[ownIdx - 1] || null
      nextPoint = chain[ownIdx + 1] || null
      chainWarning = chain[ownIdx].warning
    } else {
      for (let i = chain.length - 1; i >= 0; i--) {
        if ((chain[i].date || '') <= (e.date || '')) { prevPoint = chain[i]; break }
      }
      nextPoint = chain.find(p => (p.date || '') > (e.date || '')) || null
    }

    return {
      ...e,
      chainPrevKm: prevPoint?.km ?? null,
      chainPrevLabel: prevPoint?.label ?? null,
      chainNextKm: nextPoint?.km ?? null,
      chainNextLabel: nextPoint?.label ?? null,
      chainWarning,
    }
  })
}

// Spec "GROUP BY TRUCK" — splits an already-built, already-filtered event
// list into one independent per-truck timeline (each internally still
// chronological, exactly the order buildUnifiedTimeline/filterUnifiedTimeline
// already produced — this only partitions, never re-sorts across trucks).
// Also computes the small per-truck header summary (spec §7): every number
// is a plain count/lookup over the events already passed in, same pattern as
// kilometrage.js's buildTruckSummaries. Events with no camion_id (shouldn't
// happen in practice — every voyage/gasoil row is truck-scoped) are dropped
// rather than silently mis-grouped.
export function groupTimelineByTruck(events, camions = []) {
  const camionById = new Map(camions.map(c => [c.id, c]))
  const byCamion = new Map()
  ;(events || []).forEach(e => {
    if (!e.camionId) return
    if (!byCamion.has(e.camionId)) byCamion.set(e.camionId, [])
    byCamion.get(e.camionId).push(e)
  })

  const groups = [...byCamion.entries()].map(([camionId, items]) => {
    let lastKnownKm = null
    for (let i = items.length - 1; i >= 0; i--) {
      const km = items[i].type === 'plein' ? items[i].km : (items[i].kmArrivee ?? items[i].kmDepart)
      if (km !== null && km !== undefined) { lastKnownKm = km; break }
    }
    const camion = camionById.get(camionId)
    return {
      camionId,
      plaque: camion?.plaque || items[0]?.plaque || `Camion #${camionId}`,
      chauffeur: camion?.chauffeur || '',
      events: items,
      lastKnownKm,
      nbVoyages: items.filter(e => e.type === 'voyage').length,
      nbFuel: items.filter(e => e.type === 'plein').length,
      fuelNotAssigned: items.filter(e => e.type === 'plein' && e.needsAssignment).length,
      problems: items.filter(e => e.hasProblem || (e.type === 'voyage' && e.status !== 'complete' && e.status !== 'fuel_assigned_manually')).length,
    }
  })

  return groups.sort((a, b) => (a.plaque || '').localeCompare(b.plaque || ''))
}
