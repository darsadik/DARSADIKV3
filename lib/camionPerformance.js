// ── Performance Camions — analyse de consommation ────────────────────────────
// Fonctions pures, lecture seule. Ne modifie et ne recalcule RIEN de ce qui est
// déjà utilisé pour les voyages / la répartition gasoil / la rentabilité —
// elle lit les mêmes tables (`camions`, `gasoil`, `voyages`) et produit des
// agrégats séparés, uniquement pour ce module d'analyse.

import { buildFleetFuelPeriods } from './services/fuelPeriods'
import { buildTruckFuelHistory, buildPeriodSummary } from './services/fleetFuelMonitoring'

function hasKm(g) { return g.km !== null && g.km !== undefined && g.km !== '' }

// Same-day aggregation + missing-KM carry-forward, local to this module only.
// This deliberately does NOT reuse fuelPeriods.js's aggregateDailyRefuels:
// that shared, money-engine-facing function requires every row to carry a KM
// (isRefuelRow), so a Bon with no KM is invisible to it and its litres never
// enter any cycle at all. Since this module never feeds fuelAllocation.js/
// profitability (see file header), it's safe to diverge here — a KM-less
// Bon's litres are folded onto the next dated Bon for the SAME truck that
// DOES have a valid KM, exactly like fleetFuelMonitoring.js's Bon-table
// carry-forward and fuelCycles.js's own cycle grouping. Litres must never
// silently disappear just because their own KM reading is missing.
function aggregateDailyRefuelsWithCarry(entries) {
  const rows = (entries || []).filter(g => (g.qte || 0) > 0)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id || 0) - (b.id || 0))

  const dateEvents = []
  const byDate = new Map()
  let carryQte = 0, carryAdblueQte = 0, carryTotal = 0, carryAdblueTotal = 0

  rows.forEach(g => {
    if (!hasKm(g)) {
      carryQte += (g.qte || 0); carryAdblueQte += (g.adblue_qte || 0)
      carryTotal += (g.total || 0); carryAdblueTotal += (g.adblue_total || 0)
      return
    }
    let ev = byDate.get(g.date)
    if (!ev) {
      ev = { id: g.id, date: g.date, km: parseFloat(g.km), qte: 0, adblue_qte: 0, total: 0, adblue_total: 0, camion_plaque: g.camion_plaque }
      byDate.set(g.date, ev)
      dateEvents.push(ev)
    }
    ev.km = Math.max(ev.km, parseFloat(g.km))
    ev.qte += (g.qte || 0); ev.adblue_qte += (g.adblue_qte || 0)
    ev.total += (g.total || 0); ev.adblue_total += (g.adblue_total || 0)
    ev.qte += carryQte; ev.adblue_qte += carryAdblueQte
    ev.total += carryTotal; ev.adblue_total += carryAdblueTotal
    carryQte = 0; carryAdblueQte = 0; carryTotal = 0; carryAdblueTotal = 0
  })
  // Trailing missing-KM Bons with no later dated Bon yet are deliberately
  // left un-folded — the event they'd close doesn't exist yet, and folding
  // them onto the LAST known event would retroactively inflate that event's
  // already-closed cycle with litres it never measured (never fabricate the
  // open period). They'll correctly fold into the real closing Bon the
  // moment one is entered — nothing here is persisted, everything recomputes
  // live from the raw gasoil rows on every read.

  return dateEvents.sort((a, b) => a.km - b.km)
}

// ── Cycle carburant : intervalle entre deux refuels consécutifs ────────────
// REFUEL → VOYAGES → NEXT REFUEL (see lib/services/fuelPeriods.js, the
// authoritative model): litres/DH du cycle = litres/DH du plein qui CLÔTURE
// le cycle (g2), puisque c'est ce plein qui mesure ce qui a été réellement
// consommé depuis le plein précédent — jamais le plein d'ouverture (g1), qui
// ne fait que marquer le début de la période. Aucun plein complet n'est
// requis : un appoint partiel est une frontière tout aussi valable. Plusieurs
// pleins du même camion à la même date sont agrégés en un seul événement
// (jamais scindés), et un plein sans KM ne perd jamais ses litres — voir
// aggregateDailyRefuelsWithCarry. `dh` inclut l'AdBlue acheté sur ce même
// plein de clôture (adblue_total, 0 si aucun AdBlue) — voir dieselDh/adblueDh
// pour le détail.
export function buildFuelCycles(gasoil) {
  const byCamion = {}
  gasoil
    .filter(g => g.camion_id)
    .forEach(g => {
      if (!byCamion[g.camion_id]) byCamion[g.camion_id] = []
      byCamion[g.camion_id].push(g)
    })

  const cycles = []
  Object.entries(byCamion).forEach(([camionId, entries]) => {
    const sorted = aggregateDailyRefuelsWithCarry(entries)
    for (let i = 0; i < sorted.length - 1; i++) {
      const g1 = sorted[i], g2 = sorted[i + 1]
      const kmDebut = g1.km
      const kmFin = g2.km
      const kmParcourus = kmFin - kmDebut
      if (kmParcourus <= 0) continue
      const litres = g2.qte || 0
      const dieselDh = g2.total || 0
      const adblueDh = g2.adblue_total || 0
      const dh = dieselDh + adblueDh
      cycles.push({
        key: `${camionId}-${g1.id}-${g2.id}`,
        camionId: parseInt(camionId),
        camionPlaque: g1.camion_plaque,
        dateDebut: g1.date,
        dateFin: g2.date,
        kmDebut, kmFin, kmParcourus,
        litres, dh, dieselDh, adblueDh,
        consoL100: (litres * 100) / kmParcourus,
        coutKm: dh / kmParcourus,
      })
    }
  })
  return cycles.sort((a, b) => (a.dateFin || '').localeCompare(b.dateFin || ''))
}

// Moyenne historique (tous cycles confondus) par camion — sert de référence
// pour la détection d'anomalie.
export function historicalAverages(cycles) {
  const byCamion = {}
  cycles.forEach(c => {
    if (!byCamion[c.camionId]) byCamion[c.camionId] = { conso: [], cout: [] }
    byCamion[c.camionId].conso.push(c.consoL100)
    byCamion[c.camionId].cout.push(c.coutKm)
  })
  const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
  const out = {}
  Object.entries(byCamion).forEach(([id, d]) => {
    out[id] = { avgConso: avg(d.conso), avgCoutKm: avg(d.cout), count: d.conso.length }
  })
  return out
}

const STATUS_RANK = { normal: 0, surveiller: 1, anormale: 2 }

// value dépasse la moyenne historique de +thresholdPct% → anormale
// value dépasse la moyenne historique de +thresholdPct/2% → à surveiller
export function statusFor(value, avg, thresholdPct) {
  if (value === null || value === undefined || !avg || avg <= 0) return 'normal'
  const dev = (value - avg) / avg
  if (dev >= thresholdPct / 100) return 'anormale'
  if (dev >= thresholdPct / 200) return 'surveiller'
  return 'normal'
}

export function worstStatus(...statuses) {
  return statuses.reduce((worst, s) => STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst, 'normal')
}

export function statusForCycle(cycle, hist, thresholdPct) {
  const h = hist[cycle.camionId] || {}
  return worstStatus(
    statusFor(cycle.consoL100, h.avgConso, thresholdPct),
    statusFor(cycle.coutKm, h.avgCoutKm, thresholdPct)
  )
}

export function countVoyagesInRange(voyages, camionId, from, to) {
  return voyages.filter(v => v.camion_id === camionId && v.date_depart >= from && v.date_depart <= to).length
}

// ── Vue "période" par camion — km/litres/DH/consommation mesurés sur
// l'intervalle choisi. Reuses the same authoritative sequential REFUEL →
// VOYAGES → NEXT REFUEL engine (lib/services/fuelPeriods.js's
// buildFleetFuelPeriods + lib/services/fleetFuelMonitoring.js's
// buildTruckFuelHistory/buildPeriodSummary) already powering Contrôle KM &
// Carburant and /gasoil's Conso. L/100km card, instead of a second,
// conflicting window-based calculation. Distance/litres/coût always come
// from the truck's FULL fuel history, never truncated to `from`/`to` — a
// full-refill period that crosses the window boundary is never split, it's
// counted under the period whose CLOSING refuel falls inside [from, to].
// `nbPleins`/`nbVoyages`/cycle list/alert counts are unrelated raw counts and
// stay window-filtered exactly as before.
export function buildPeriodStats({ camions, gasoil, voyages, cycles, from, to, thresholdPct }) {
  const hist = historicalAverages(cycles)
  const byCamionPeriods = buildFleetFuelPeriods({ gasoil, voyages, camions })

  return camions.map(cam => {
    const truck = byCamionPeriods.find(t => t.camionId === cam.id)
    const summary = truck ? buildPeriodSummary(truck, buildTruckFuelHistory(truck), from, to) : null

    const kmTotal = summary && summary.distanceTotal > 0 ? summary.distanceTotal : null
    const litresTotal = summary ? summary.litresTotal : 0
    const dhTotal = summary ? summary.coutTotal : 0
    const consoL100 = summary ? summary.consoL100 : null
    const coutKm = summary ? summary.coutKm : null

    const inRange = gasoil.filter(g => g.camion_id === cam.id && g.date >= from && g.date <= to)
    // Plein = diesel purchase only — AdBlue-only rows (qte===0) never count.
    const nbPleins = inRange.filter(g => (g.qte || 0) > 0).length
    const nbVoyages = countVoyagesInRange(voyages, cam.id, from, to)
    const h = hist[cam.id] || {}
    const status = kmTotal
      ? worstStatus(statusFor(consoL100, h.avgConso, thresholdPct), statusFor(coutKm, h.avgCoutKm, thresholdPct))
      : 'normal'
    const cyclesInRange = cycles.filter(c => c.camionId === cam.id && c.dateFin >= from && c.dateFin <= to)
    const alertCycles = cyclesInRange.filter(c => statusForCycle(c, hist, thresholdPct) !== 'normal').length

    return {
      camionId: cam.id, plaque: cam.plaque, chauffeur: cam.chauffeur,
      kmTotal, litresTotal, dhTotal, consoL100, coutKm, nbPleins, nbVoyages,
      cyclesInRange, alertCycles, status, hist: h,
    }
  }).sort((a, b) => a.plaque.localeCompare(b.plaque))
}

export function globalStats(rows) {
  const withData = rows.filter(r => r.kmTotal)
  const totalKm = withData.reduce((s, r) => s + r.kmTotal, 0)
  const totalLitres = rows.reduce((s, r) => s + r.litresTotal, 0)
  const totalDh = rows.reduce((s, r) => s + r.dhTotal, 0)
  const avgConso = totalKm > 0 ? (withData.reduce((s, r) => s + r.litresTotal, 0) * 100) / totalKm : null
  const avgCoutKm = totalKm > 0 ? withData.reduce((s, r) => s + r.dhTotal, 0) / totalKm : null
  const mostEconomical = withData.length ? [...withData].sort((a, b) => a.consoL100 - b.consoL100)[0] : null
  const mostCostly = withData.length ? [...withData].sort((a, b) => b.coutKm - a.coutKm)[0] : null
  const alertsSorted = [...rows].sort((a, b) => b.alertCycles - a.alertCycles)
  const mostAlerts = alertsSorted.length && alertsSorted[0].alertCycles > 0 ? alertsSorted[0] : null
  return { totalKm, totalLitres, totalDh, avgConso, avgCoutKm, mostEconomical, mostCostly, mostAlerts }
}

export function periodRange(kind, customFrom, customTo) {
  const now = new Date()
  const toStr = d => d.toISOString().split('T')[0]
  const to = toStr(now)
  if (kind === 'jour') {
    return { from: to, to }
  }
  if (kind === 'semaine') {
    const d = new Date(now); d.setDate(d.getDate() - 7)
    return { from: toStr(d), to }
  }
  if (kind === 'mois_dernier') {
    // Pure local-calendar-field arithmetic (getMonth/getDate reads, never
    // toISOString on a freshly-built midnight Date) — a UTC round-trip on a
    // local-midnight Date silently shifts the day backwards for any
    // timezone ahead of UTC, which toStr()'s toISOString conversion would
    // otherwise do here.
    const y = now.getFullYear(), m = now.getMonth() // current month, 0-indexed
    const prevMonthIndex = m === 0 ? 11 : m - 1
    const prevYear = m === 0 ? y - 1 : y
    const lastDay = new Date(prevYear, prevMonthIndex + 1, 0).getDate()
    const pad = n => String(n).padStart(2, '0')
    return {
      from: `${prevYear}-${pad(prevMonthIndex + 1)}-01`,
      to: `${prevYear}-${pad(prevMonthIndex + 1)}-${pad(lastDay)}`,
    }
  }
  if (kind === 'annee') {
    return { from: `${now.getFullYear()}-01-01`, to }
  }
  if (kind === 'perso') {
    return { from: customFrom || to, to: customTo || to }
  }
  // mois (default)
  return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to }
}

export const STATUS_META = {
  normal:     { emoji: '🟢', label: 'Normal',                   color: '#16a34a', bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100' },
  surveiller: { emoji: '🟡', label: 'À surveiller',              color: '#d97706', bg: 'bg-amber-50',   text: 'text-amber-600',   ring: 'ring-amber-100' },
  anormale:   { emoji: '🔴', label: 'Consommation anormale',     color: '#dc2626', bg: 'bg-red-50',     text: 'text-red-600',     ring: 'ring-red-100' },
}
