// ── Cycles Carburant — automatic per-truck refill cycles ────────────────────
// Pure functions only (no Supabase, no React), same convention as
// lib/camionPerformance.js. Read-only: builds on the same gasoil/voyages/
// camions rows already used everywhere else, but never feeds
// lib/services/profitability.js's money path — this module is display/
// analysis only. Cycles are computed on the fly, never persisted, so they
// always stay in sync with edits/deletes with no invalidation to get wrong.
//
// A "cycle" here is the interval between two consecutive fuel-cycle-starting
// refills of the same truck (refills with a km reading). Consecutive refills
// with no voyage between them are merged into a single cycle start — see
// groupPleinsIntoCycles — so two same-day pleins never produce a spurious
// near-zero-km cycle.

import { historicalAverages, statusFor, worstStatus, STATUS_META } from '../camionPerformance'

export { STATUS_META }

export const CYCLE_STALE_DAYS = 30      // "cycle sans fin" — open cycle with real activity but no new plein in this long
export const CYCLE_IDLE_DAYS = 20        // "camion inactif" — open cycle with ZERO voyages this long: just idle, not an anomaly (§12)
export const CYCLE_TOO_LONG_KM_FACTOR = 2 // cycle distance beyond (factor × truck's own historical average) is flagged — distance-based, never duration-based (§12)

// ── 5-tier cycle health classification (v2 intelligence layer) ──────────────
// 'in_progress' is not a health verdict — it just means the cycle isn't
// closed yet, so score/verdict aren't available (see evaluateCycle).
export const CYCLE_STATUS_META = {
  excellent:   { emoji: '🟢', label: 'Excellent',    bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-100' },
  normal:      { emoji: '🟢', label: 'Normal',       bg: 'bg-green-50',   text: 'text-green-700',   ring: 'ring-green-100' },
  attention:   { emoji: '🟡', label: 'Attention',    bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-100' },
  to_verify:   { emoji: '🟠', label: 'À vérifier',   bg: 'bg-orange-50',  text: 'text-orange-700',  ring: 'ring-orange-100' },
  critical:    { emoji: '🔴', label: 'Critique',     bg: 'bg-red-50',     text: 'text-red-700',     ring: 'ring-red-100' },
  in_progress: { emoji: '🔵', label: 'Cycle en cours', bg: 'bg-blue-50',  text: 'text-blue-700',    ring: 'ring-blue-100' },
}

function hasKm(g) {
  return g.km !== null && g.km !== undefined && g.km !== ''
}

// Chronological order per truck: date, then heure (time-of-day) only when
// both sides have it and differ, then created_at, then id — never creation
// order alone. Matches the "chronologique (date + heure si disponible),
// jamais l'ordre de création" requirement.
export function comparePleins(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.heure && b.heure && a.heure !== b.heure) return a.heure < b.heure ? -1 : 1
  const ac = a.created_at || '', bc = b.created_at || ''
  if (ac !== bc) return ac < bc ? -1 : 1
  return (a.id || 0) - (b.id || 0)
}

// A voyage of this truck genuinely happened "between" two refills only if
// its date_depart is strictly between their dates. Same-day refills (the
// spec's 08h00/15h00 example) can never have a voyage "strictly between"
// the same date and itself, so they auto-merge — exactly the desired
// behavior — without needing time-of-day data on voyages (which doesn't
// exist). A real same-day voyage squeezed between two same-day refills is
// the one case this can't auto-detect; the user's manual fusion/split
// override (merge_with_previous) always wins over this heuristic.
function hasVoyageBetween(prevPlein, nextPlein, voyagesForCamion) {
  return voyagesForCamion.some(v => v.date_depart > prevPlein.date && v.date_depart < nextPlein.date)
}

// Groups a truck's km-bearing refills into cycle-start groups: consecutive
// refills merge when merge_with_previous === true (forced), never merge
// when === false (forced), and otherwise (null/auto) merge only when no
// voyage happened between them. A group's km is its FIRST (earliest) plein's
// km; litres/montants are summed across the group.
export function groupPleinsIntoCycles(gasoilForCamion, voyagesForCamion) {
  const boundary = (gasoilForCamion || []).filter(hasKm).sort(comparePleins)
  const groups = []
  boundary.forEach(g => {
    const current = groups[groups.length - 1]
    let merge = false
    if (current) {
      const prev = current.pleins[current.pleins.length - 1]
      if (g.merge_with_previous === true) merge = true
      else if (g.merge_with_previous === false) merge = false
      else merge = !hasVoyageBetween(prev, g, voyagesForCamion)
    }
    if (merge) {
      current.pleins.push(g)
    } else {
      groups.push({ pleins: [g] })
    }
  })
  return groups.map(group => {
    const pleins = group.pleins
    const first = pleins[0]
    const last = pleins[pleins.length - 1]
    return {
      pleins,
      kmDebut: parseFloat(first.km),
      dateDebut: first.date,
      dateFin: last.date,
      litresGasoil: pleins.reduce((s, p) => s + (p.qte || 0), 0),
      litresAdblue: pleins.reduce((s, p) => s + (p.adblue_qte || 0), 0),
      montantGasoil: pleins.reduce((s, p) => s + (p.total || 0), 0),
      montantAdblue: pleins.reduce((s, p) => s + (p.adblue_total || 0), 0),
      merged: pleins.length > 1,
      mergedManually: pleins.slice(1).some(p => p.merge_with_previous === true),
    }
  })
}

function voyagesInRange(voyagesForCamion, kmDebut, kmFin) {
  return voyagesForCamion
    .filter(v => v.km_depart !== null && v.km_depart !== undefined &&
      parseFloat(v.km_depart) >= kmDebut &&
      (kmFin === null ? true : parseFloat(v.km_depart) < kmFin))
    .map(v => {
      const vKm = (v.km_arrivee !== null && v.km_arrivee !== undefined)
        ? Math.max(0, parseFloat(v.km_arrivee) - parseFloat(v.km_depart))
        : null
      return { ...v, vKm }
    })
}

// Builds every cycle (closed + one open "en cours" per truck) for the given
// data. Pass camions/gasoil/voyages already loaded (no Supabase calls here).
export function buildFuelCycles({ gasoil, voyages, camions }) {
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
    const groups = groupPleinsIntoCycles(gFor, vFor)
    const camionPlaque = camion?.plaque || gFor[0]?.camion_plaque || vFor[0]?.camion_plaque || `Camion #${camionId}`

    const cycles = groups.map((group, i) => {
      const next = groups[i + 1]
      const isOpen = !next
      const kmDebut = group.kmDebut
      const coutTotal = group.montantGasoil + group.montantAdblue

      if (!isOpen) {
        const kmFin = next.kmDebut
        const distance = kmFin - kmDebut
        const coutKm = distance > 0 ? coutTotal / distance : null
        const consoL100 = distance > 0 ? (group.litresGasoil * 100) / distance : null
        const vs = voyagesInRange(vFor, kmDebut, kmFin)
        return {
          camionId, camionPlaque, statut: 'termine',
          dateDebut: group.dateDebut, dateFin: next.dateDebut,
          kmDebut, kmFin, distance,
          litresGasoil: group.litresGasoil, litresAdblue: group.litresAdblue,
          montantGasoil: group.montantGasoil, montantAdblue: group.montantAdblue,
          coutTotal, coutKm, consoL100,
          nbVoyages: vs.length, voyages: vs,
          pleins: group.pleins, merged: group.merged, mergedManually: group.mergedManually,
        }
      }

      // Open cycle: current km = the highest km_depart/km_arrivee this truck
      // has reported since the cycle started (or null = "en attente", no
      // data yet since the last plein).
      const vs = voyagesInRange(vFor, kmDebut, null)
      let kmActuel = null
      vs.forEach(v => {
        const cand = v.vKm !== null ? parseFloat(v.km_arrivee) : parseFloat(v.km_depart)
        if (kmActuel === null || cand > kmActuel) kmActuel = cand
      })
      const distance = kmActuel !== null ? kmActuel - kmDebut : null
      const coutKm = distance > 0 ? coutTotal / distance : null
      const consoL100 = distance > 0 ? (group.litresGasoil * 100) / distance : null
      return {
        camionId, camionPlaque, statut: 'en_cours',
        dateDebut: group.dateDebut, dateFin: null,
        kmDebut, kmFin: null, kmActuel, distance,
        litresGasoil: group.litresGasoil, litresAdblue: group.litresAdblue,
        montantGasoil: group.montantGasoil, montantAdblue: group.montantAdblue,
        coutTotal, coutKm, consoL100,
        nbVoyages: vs.length, voyages: vs,
        pleins: group.pleins, merged: group.merged, mergedManually: group.mergedManually,
      }
    })

    byCamion.push({ camionId, camionPlaque, camion, cycles, gasoil: gFor, voyages: vFor })
  })

  return byCamion.sort((a, b) => (a.camionPlaque || '').localeCompare(b.camionPlaque || ''))
}

// ── Fleet dashboard aggregates (spec §10) ────────────────────────────────────
export function buildFleetFuelStats(byCamion) {
  return byCamion.map(({ camionId, camionPlaque, cycles, gasoil }) => {
    const closed = cycles.filter(c => c.statut === 'termine')
    const kmTotal = closed.reduce((s, c) => s + Math.max(0, c.distance || 0), 0)
    const litresGasoil = cycles.reduce((s, c) => s + c.litresGasoil, 0)
    const litresAdblue = cycles.reduce((s, c) => s + c.litresAdblue, 0)
    const coutTotal = cycles.reduce((s, c) => s + c.coutTotal, 0)
    const coutKm = kmTotal > 0 ? coutTotal / kmTotal : null
    const consoL100 = kmTotal > 0 ? (litresGasoil * 100) / kmTotal : null
    const withCoutKm = closed.filter(c => c.coutKm !== null)
    const meilleurCycle = withCoutKm.length ? [...withCoutKm].sort((a, b) => a.coutKm - b.coutKm)[0] : null
    const pireCycle = withCoutKm.length ? [...withCoutKm].sort((a, b) => b.coutKm - a.coutKm)[0] : null
    return {
      camionId, camionPlaque,
      kmTotal, litresGasoil, litresAdblue, coutTotal, coutKm, consoL100,
      nbCycles: cycles.length, nbPleins: gasoil.length,
      nbVoyages: cycles.reduce((s, c) => s + c.nbVoyages, 0),
      meilleurCycle, pireCycle,
    }
  })
}

// ── v2 intelligence layer — per-cycle evaluation (health/score/comparisons) ─
// Single source of truth for "what's wrong with this cycle": both
// evaluateCycle (structured, per-cycle) and detectAlerts (flat message list)
// read the same checks below, so a card's badge/score can never disagree
// with the alerts panel or the auto-generated conclusion text.
//
// `context` = { avgConso, avgCoutKm, avgDistance, fullVoyages } — avgDistance
// is distance-based (never duration-based, per the "never trust dates alone"
// requirement); fullVoyages is the truck's complete voyage list (not just
// the km-bearing ones) so a voyage missing km_depart inside this cycle's
// date window can be detected even though it's invisible to km-based
// range filtering elsewhere.
export function evaluateCycle(cycle, context = {}, thresholdPct = 15, prevClosedCycle = null) {
  const { avgConso = null, avgCoutKm = null, avgDistance = null, fullVoyages = [] } = context
  const isClosed = cycle.statut === 'termine'
  const checks = []

  checks.push({ key: 'km_chain', label: 'Chaîne KM complète', pass: isClosed ? true : null, severity: 'info' })

  const noDuplicate = cycle.distance === null || cycle.distance > 0
  checks.push({ key: 'no_duplicate', label: 'Aucun plein en double au même KM', pass: noDuplicate, severity: 'critical' })

  const noNegative = cycle.distance === null || cycle.distance >= 0
  checks.push({ key: 'no_negative', label: 'Distance non négative', pass: noNegative, severity: 'critical' })

  const windowFrom = cycle.dateDebut
  const windowTo = cycle.dateFin
  const missingKmVoyages = (fullVoyages || []).filter(v =>
    v.date_depart >= windowFrom && (windowTo === null || v.date_depart < windowTo) &&
    (v.km_depart === null || v.km_depart === undefined))
  const allVoyagesLinked = missingKmVoyages.length === 0
  checks.push({ key: 'voyages_linked', label: 'Tous les voyages ont un KM', pass: allVoyagesLinked, severity: 'to_verify', count: missingKmVoyages.length })

  const consoStatus = isClosed ? statusFor(cycle.consoL100, avgConso, thresholdPct) : 'normal'
  const coutStatus  = isClosed ? statusFor(cycle.coutKm, avgCoutKm, thresholdPct) : 'normal'
  const worstConso  = worstStatus(consoStatus, coutStatus)
  checks.push({
    key: 'consumption', label: 'Consommation dans la norme', pass: worstConso !== 'anormale',
    severity: worstConso === 'anormale' ? 'critical' : (worstConso === 'surveiller' ? 'attention' : 'info'),
  })

  const noManualMerge = !cycle.mergedManually
  checks.push({ key: 'no_manual_merge', label: 'Aucune fusion manuelle', pass: noManualMerge, severity: 'to_verify' })

  const distanceNotOutlier = !isClosed || !avgDistance || cycle.distance <= avgDistance * CYCLE_TOO_LONG_KM_FACTOR
  checks.push({ key: 'distance_outlier', label: "Distance cohérente avec l'historique", pass: distanceNotOutlier, severity: 'to_verify' })

  const comparisonToAverage = (isClosed && avgConso && cycle.consoL100 !== null) ? {
    diffPct: Math.round(((cycle.consoL100 - avgConso) / avgConso) * 1000) / 10,
    direction: cycle.consoL100 <= avgConso ? 'better' : 'worse',
  } : null

  const comparisonToPrevious = (isClosed && prevClosedCycle?.consoL100) ? {
    diffPct: Math.round(((cycle.consoL100 - prevClosedCycle.consoL100) / prevClosedCycle.consoL100) * 1000) / 10,
    direction: cycle.consoL100 <= prevClosedCycle.consoL100 ? 'better' : 'worse',
  } : null

  let score = null
  if (isClosed) {
    score = 100
    if (!noDuplicate) score -= 25
    if (!noNegative) score -= 35
    if (!allVoyagesLinked) score -= Math.min(20, missingKmVoyages.length * 10)
    if (worstConso === 'anormale') score -= 20
    else if (worstConso === 'surveiller') score -= 8
    if (!noManualMerge) score -= 5
    if (!distanceNotOutlier) score -= 10
    score = Math.max(0, Math.min(100, score))
  }

  let status
  const severeDeviation = comparisonToAverage && comparisonToAverage.direction === 'worse' && comparisonToAverage.diffPct >= thresholdPct * 2
  if (!isClosed) {
    status = 'in_progress'
  } else if (!noNegative || !noDuplicate || (worstConso === 'anormale' && severeDeviation)) {
    status = 'critical'
  } else if (!allVoyagesLinked || !noManualMerge || !distanceNotOutlier || score < 75) {
    status = 'to_verify'
  } else if (worstConso === 'surveiller' || score < 90) {
    status = 'attention'
  } else if (comparisonToAverage && comparisonToAverage.direction === 'better' && comparisonToAverage.diffPct <= -5) {
    status = 'excellent'
  } else {
    status = 'normal'
  }

  return { status, score, checks, comparisonToAverage, comparisonToPrevious, missingKmVoyages }
}

// Rolling per-truck stats (spec §6) — distance-based, no duration input.
export function buildTruckHealth(closedCycles) {
  if (!closedCycles.length) {
    return { nbCycles: 0, avgConso: null, bestCycle: null, worstCycle: null, avgCoutKm: null, avgDistance: null }
  }
  const withConso = closedCycles.filter(c => c.consoL100 !== null)
  const withCout  = closedCycles.filter(c => c.coutKm !== null)
  const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
  return {
    nbCycles: closedCycles.length,
    avgConso: avg(withConso.map(c => c.consoL100)),
    avgCoutKm: avg(withCout.map(c => c.coutKm)),
    avgDistance: avg(closedCycles.map(c => c.distance || 0)),
    bestCycle: withConso.length ? [...withConso].sort((a, b) => a.consoL100 - b.consoL100)[0] : null,
    worstCycle: withConso.length ? [...withConso].sort((a, b) => b.consoL100 - a.consoL100)[0] : null,
  }
}

// Annotates buildFuelCycles() output with cycle numbers, health evaluation,
// and per-truck rolling stats — additive, does not change any existing
// field. Reuses the same arrays already computed by buildFuelCycles (no new
// queries, no duplicated math) per the performance requirement (§13).
export function enrichByCamion(byCamion, thresholdPct = 15) {
  return byCamion.map(truck => {
    const closedCycles = truck.cycles.filter(c => c.statut === 'termine')
    const truckHist = historicalAverages(closedCycles)[truck.camionId] || {}
    const avgDistance = closedCycles.length ? closedCycles.reduce((s, c) => s + (c.distance || 0), 0) / closedCycles.length : null
    const context = { avgConso: truckHist.avgConso ?? null, avgCoutKm: truckHist.avgCoutKm ?? null, avgDistance, fullVoyages: truck.voyages }

    let prevClosed = null
    const cycles = truck.cycles.map((c, i) => {
      const evaluation = evaluateCycle(c, context, thresholdPct, prevClosed)
      if (c.statut === 'termine') prevClosed = c
      return { ...c, number: i + 1, evaluation }
    })

    return { ...truck, cycles, health: buildTruckHealth(closedCycles) }
  })
}

// Chronological event feed per truck (spec §11) — merges the truck's own
// pleins + voyages + closed-cycle markers already in memory, pure sort, no
// new data. UI decides how to render each event type.
export function buildTimeline(truck) {
  const events = []
  ;(truck.gasoil || []).forEach(g => events.push({
    type: 'plein', date: g.date, heure: g.heure || null,
    sortKey: `${g.date}T${g.heure || '00:00'}_${String(g.id).padStart(10, '0')}`,
    ref: g,
  }))
  ;(truck.voyages || []).forEach(v => events.push({
    type: 'voyage', date: v.date_depart, heure: null,
    sortKey: `${v.date_depart}T12:00_v${String(v.id).padStart(10, '0')}`,
    ref: v,
  }))
  ;(truck.cycles || []).filter(c => c.statut === 'termine').forEach(c => events.push({
    type: 'cycle_closed', date: c.dateFin, heure: null,
    sortKey: `${c.dateFin}T23:59_c${String(c.number || 0).padStart(6, '0')}`,
    ref: c,
  }))
  return events.sort((a, b) => a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0)
}

// Auto-generated conclusion (spec §9) — built directly from the same
// evaluation object shown on the card/badges, so it can never contradict them.
export function generateCycleConclusion(cycle) {
  const ev = cycle.evaluation
  if (!ev) return []
  if (ev.status === 'in_progress') return ['Cycle en cours — analyse complète disponible à la clôture.']

  const suspicious = ev.status === 'critical' || ev.status === 'to_verify'
  const lines = [suspicious ? 'Cycle suspect.' : 'Cycle validé.']
  const failed = ev.checks.filter(c => c.pass === false)

  if (failed.length === 0) {
    lines.push('Consommation normale.', 'Aucune anomalie détectée.')
  } else {
    failed.forEach(c => {
      if (c.key === 'consumption' && ev.comparisonToAverage) {
        const d = ev.comparisonToAverage.diffPct
        lines.push(`Consommation ${d > 0 ? '+' : ''}${d}% vs moyenne du camion.`)
      } else if (c.key === 'no_manual_merge') {
        lines.push('Fusion manuelle appliquée sur ce cycle.')
      } else if (c.key === 'voyages_linked') {
        lines.push(`${c.count} voyage(s) sans KM départ dans ce cycle.`)
      } else if (c.key === 'no_negative') {
        lines.push('Distance négative détectée.')
      } else if (c.key === 'no_duplicate') {
        lines.push('Deux pleins enregistrés au même KM.')
      } else if (c.key === 'distance_outlier') {
        lines.push('Distance du cycle nettement supérieure à la moyenne du camion.')
      }
    })
  }
  if (suspicious) lines.push('Vérification recommandée.')
  return lines
}

// Dashboard widgets (spec §10) — built from the already-enriched structure,
// no new queries. Longest cycle is picked by DISTANCE, never by duration
// (per §12).
export function buildFleetIntelligenceSummary(enrichedByCamion) {
  const allClosed = enrichedByCamion.flatMap(t => t.cycles.filter(c => c.statut === 'termine'))
  const withConso = allClosed.filter(c => c.consoL100 !== null)
  const fleetAvgConso = withConso.length ? withConso.reduce((s, c) => s + c.consoL100, 0) / withConso.length : null

  const trucksWithHealth = enrichedByCamion.filter(t => t.health.nbCycles > 0 && t.health.avgConso !== null)
  const bestTruck  = trucksWithHealth.length ? [...trucksWithHealth].sort((a, b) => a.health.avgConso - b.health.avgConso)[0] : null
  const worstTruck = trucksWithHealth.length ? [...trucksWithHealth].sort((a, b) => b.health.avgConso - a.health.avgConso)[0] : null

  const openCyclesCount = enrichedByCamion.reduce((s, t) => s + t.cycles.filter(c => c.statut === 'en_cours').length, 0)
  const criticalAlertsCount = enrichedByCamion.reduce((s, t) => s + t.cycles.filter(c => c.evaluation?.status === 'critical').length, 0)

  const trucksNeedingInspection = enrichedByCamion.filter(t => {
    const last = t.cycles[t.cycles.length - 1]
    return last && (last.evaluation?.status === 'critical' || last.evaluation?.status === 'to_verify')
  })

  const longestCycle = allClosed.length ? [...allClosed].sort((a, b) => (b.distance || 0) - (a.distance || 0))[0] : null

  const monthKey = new Date().toISOString().slice(0, 7)
  const monthlyCostByTruck = enrichedByCamion.map(t => ({
    camionId: t.camionId, camionPlaque: t.camionPlaque,
    cost: t.cycles.reduce((s, c) => {
      const key = c.statut === 'en_cours' ? monthKey : (c.dateFin || '').slice(0, 7)
      return key === monthKey ? s + c.coutTotal : s
    }, 0),
  }))
  const topMonthly = monthlyCostByTruck.length ? [...monthlyCostByTruck].sort((a, b) => b.cost - a.cost)[0] : null

  return {
    fleetAvgConso, bestTruck, worstTruck, openCyclesCount, criticalAlertsCount,
    trucksNeedingInspection, longestCycle,
    mostExpensiveTruckThisMonth: topMonthly && topMonthly.cost > 0 ? topMonthly : null,
  }
}

// ── Alerts (spec §9) — advisory only, never blocks anything ─────────────────
export function detectAlerts({ byCamion, thresholdPct = 15 }) {
  const alerts = []
  const push = (severity, type, camionId, camionPlaque, message, refIds = []) =>
    alerts.push({ severity, type, camionId, camionPlaque, message, refIds })

  // historicalAverages() only reads .camionId/.consoL100/.coutKm — our cycle
  // shape matches it exactly, so we reuse it (and statusFor/worstStatus)
  // as-is from camionPerformance.js instead of duplicating the anomaly math.
  const allClosedCycles = byCamion.flatMap(({ cycles }) => cycles.filter(c => c.statut === 'termine'))
  const hist = historicalAverages(allClosedCycles)

  byCamion.forEach(({ camionId, camionPlaque, cycles, gasoil, voyages }) => {
    // Camion sans plein
    if (voyages.length > 0 && gasoil.length === 0) {
      push('warning', 'camion_sans_plein', camionId, camionPlaque, `${camionPlaque} a des voyages mais aucun plein enregistré.`)
    }

    // KM incohérent — deux pleins consécutifs (chronologiquement) où le KM diminue
    const boundary = gasoil.filter(hasKm).sort(comparePleins)
    for (let i = 1; i < boundary.length; i++) {
      const prev = boundary[i - 1], cur = boundary[i]
      if (parseFloat(cur.km) < parseFloat(prev.km)) {
        push('error', 'km_incoherent', camionId, camionPlaque,
          `${camionPlaque} : KM du plein du ${cur.date} (${cur.km}) inférieur au plein précédent du ${prev.date} (${prev.km}).`,
          [prev.id, cur.id])
      } else if (parseFloat(cur.km) === parseFloat(prev.km)) {
        push('warning', 'deux_pleins_meme_km', camionId, camionPlaque,
          `${camionPlaque} : deux pleins au même KM (${cur.km}) — ${prev.date} et ${cur.date}.`,
          [prev.id, cur.id])
      }
    }

    // Voyage sans KM
    voyages.filter(v => v.km_depart === null || v.km_depart === undefined).forEach(v => {
      push('info', 'voyage_sans_km', camionId, camionPlaque,
        `${camionPlaque} : voyage ${v.reference || `#${v.id}`} du ${v.date_depart} sans KM départ renseigné.`, [v.id])
    })

    // Voyage hors cycle — km_depart en dehors de tout intervalle de cycle connu
    if (cycles.length) {
      const firstKm = cycles[0].kmDebut
      voyages.filter(v => v.km_depart !== null && v.km_depart !== undefined && parseFloat(v.km_depart) < firstKm)
        .forEach(v => {
          push('warning', 'voyage_hors_cycle', camionId, camionPlaque,
            `${camionPlaque} : voyage ${v.reference || `#${v.id}`} (KM ${v.km_depart}) antérieur au premier plein connu (KM ${firstKm}).`, [v.id])
        })
    }

    cycles.forEach(c => {
      // Distance négative
      if (c.distance !== null && c.distance < 0) {
        push('error', 'distance_negative', camionId, camionPlaque,
          `${camionPlaque} : distance négative sur le cycle du ${c.dateDebut} (${c.distance} km).`)
      }

      // Duration alone NEVER drives these two alerts (§12 — "never trust
      // dates alone"): a truck parked for weeks with zero activity is just
      // idle, not an anomaly. Only real activity (voyages/distance) without
      // a matching plein, or distance far beyond the truck's own history,
      // is actionable.
      if (c.statut === 'en_cours') {
        const daysSinceStart = (Date.now() - new Date(c.dateDebut).getTime()) / 86400000
        if (c.nbVoyages > 0 && daysSinceStart > CYCLE_STALE_DAYS) {
          push('warning', 'cycle_sans_fin', camionId, camionPlaque,
            `${camionPlaque} : cycle ouvert depuis le ${c.dateDebut} (${Math.round(daysSinceStart)} jours) avec ${c.nbVoyages} voyage(s) mais sans nouveau plein — un plein a peut-être été oublié.`)
        } else if (c.nbVoyages === 0 && daysSinceStart > CYCLE_IDLE_DAYS) {
          push('info', 'camion_inactif', camionId, camionPlaque,
            `${camionPlaque} : aucune activité depuis le ${c.dateDebut} (${Math.round(daysSinceStart)} jours) — camion probablement à l'arrêt.`)
        }
      } else {
        const h = hist[camionId]
        const kmTooLong = h?.avgConso && c.distance > 0 && h.avgConso > 0 &&
          (c.distance > (c.litresGasoil > 0 ? (c.litresGasoil * 100 / h.avgConso) * CYCLE_TOO_LONG_KM_FACTOR : Infinity))
        if (kmTooLong) {
          const durationDays = Math.round((new Date(c.dateFin) - new Date(c.dateDebut)) / 86400000)
          push('warning', 'cycle_trop_long', camionId, camionPlaque,
            `${camionPlaque} : cycle du ${c.dateDebut} au ${c.dateFin} anormalement long en distance (${fmtDist(c.distance)} km sur ${durationDays} jours) — bien au-delà de la moyenne du camion.`)
        }
      }

      if (c.statut === 'termine') {
        const status = worstStatus(
          statusFor(c.consoL100, hist[camionId]?.avgConso, thresholdPct),
          statusFor(c.coutKm, hist[camionId]?.avgCoutKm, thresholdPct)
        )
        if (status !== 'normal') {
          push(status === 'anormale' ? 'error' : 'warning', 'consommation_anormale', camionId, camionPlaque,
            `${camionPlaque} : cycle du ${c.dateDebut} — ${STATUS_META[status].label.toLowerCase()} (${c.consoL100?.toFixed(1)} L/100km, ${c.coutKm?.toFixed(2)} DHS/km).`)
        }
      }
    })
  })

  return alerts
}

function fmtDist(n) { return Math.round(n || 0).toLocaleString('fr-MA') }

// ── Pre-save preview (spec §13) ──────────────────────────────────────────────
// Simulates adding one hypothetical plein (not yet saved) to a truck's
// history and reports which cycle it would close (or extend, if it merges
// into the currently-open cycle), the computed distance/coût/km, the
// voyages it would cover, and any alerts it would trigger. Purely
// additive — never writes anything.
export function previewCycleForNewPlein({ camionId, date, heure, km, qte, prixUnitaire, adblueQte, adblueTotal, gasoil, voyages, camions, mergeOverride }) {
  if (!camionId || !date || km === null || km === undefined || km === '') {
    return { ready: false, cycleClosing: null, extendsOpenCycle: false, alerts: [] }
  }
  const hypothetical = {
    id: -1, camion_id: parseInt(camionId), date, heure: heure || null,
    km: parseFloat(km), qte: parseFloat(qte) || 0,
    total: (parseFloat(qte) || 0) * (parseFloat(prixUnitaire) || 0),
    adblue_qte: parseFloat(adblueQte) || 0, adblue_total: parseFloat(adblueTotal) || 0,
    merge_with_previous: mergeOverride === undefined ? null : mergeOverride,
    created_at: new Date().toISOString(),
  }
  // Compare the truck's cycle count before/after adding the hypothetical
  // plein: if it merges into the currently-open cycle's group, the count is
  // unchanged (that cycle just gets bigger totals). If it starts a brand
  // new group, one more cycle appears — the formerly-open cycle is now
  // 'termine' (closed by this plein) and a new one opens with just this plein.
  const beforeByCamion = buildFuelCycles({ gasoil, voyages, camions })
  const before = beforeByCamion.find(b => b.camionId === parseInt(camionId))
  const beforeCount = before ? before.cycles.length : 0

  const augmented = [...(gasoil || []), hypothetical]
  const afterByCamion = buildFuelCycles({ gasoil: augmented, voyages, camions })
  const truck = afterByCamion.find(b => b.camionId === parseInt(camionId))
  if (!truck) return { ready: false, cycleClosing: null, extendsOpenCycle: false, alerts: [] }

  const extendsOpenCycle = truck.cycles.length === beforeCount && beforeCount > 0
  const cycleClosing = truck.cycles.length === beforeCount + 1
    ? truck.cycles[truck.cycles.length - 2] || null
    : null
  const thisCycle = truck.cycles[truck.cycles.length - 1]

  const alerts = detectAlerts({ byCamion: [truck] })
  return { ready: true, cycleClosing, thisCycle, extendsOpenCycle, allCycles: truck.cycles }
}
