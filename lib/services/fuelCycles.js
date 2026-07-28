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

export const CYCLE_STALE_DAYS = 30      // "cycle sans fin" — no plein logged in this long while the truck keeps running
export const CYCLE_TOO_LONG_DAYS = 45    // "cycle trop long" — cycle open/closed duration beyond this is flagged
export const CYCLE_TOO_LONG_KM_FACTOR = 2 // cycle distance beyond (factor × truck's own historical average) is flagged

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

      if (c.statut === 'en_cours') {
        const daysSinceStart = (Date.now() - new Date(c.dateDebut).getTime()) / 86400000
        if (daysSinceStart > CYCLE_STALE_DAYS) {
          push('warning', 'cycle_sans_fin', camionId, camionPlaque,
            `${camionPlaque} : cycle ouvert depuis le ${c.dateDebut} (${Math.round(daysSinceStart)} jours) sans nouveau plein.`)
        }
      } else {
        const durationDays = (new Date(c.dateFin) - new Date(c.dateDebut)) / 86400000
        const h = hist[camionId]
        const kmTooLong = h?.avgConso && c.distance > 0 && h.avgConso > 0 &&
          (c.distance > (c.litresGasoil > 0 ? (c.litresGasoil * 100 / h.avgConso) * CYCLE_TOO_LONG_KM_FACTOR : Infinity))
        if (durationDays > CYCLE_TOO_LONG_DAYS || kmTooLong) {
          push('warning', 'cycle_trop_long', camionId, camionPlaque,
            `${camionPlaque} : cycle du ${c.dateDebut} au ${c.dateFin} anormalement long (${fmtDist(c.distance)} km, ${Math.round(durationDays)} jours).`)
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
