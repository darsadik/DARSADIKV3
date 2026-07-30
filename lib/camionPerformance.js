// ── Performance Camions — analyse de consommation ────────────────────────────
// Fonctions pures, lecture seule. Ne modifie et ne recalcule RIEN de ce qui est
// déjà utilisé pour les voyages / la répartition gasoil / la rentabilité —
// elle lit les mêmes tables (`camions`, `gasoil`, `voyages`) et produit des
// agrégats séparés, uniquement pour ce module d'analyse.

// ── Cycle carburant : intervalle entre deux pleins consécutifs (KM renseigné)
// Même convention que la section "Cycles carburant" de la page /gasoil :
// litres/DH du cycle = litres/DH du plein de départ (g1), car c'est ce plein
// qui couvre la distance jusqu'au plein suivant. `dh` inclut l'AdBlue acheté
// sur ce même plein (adblue_total, 0 si aucun AdBlue) — voir dieselDh/adblueDh
// pour le détail.
export function buildFuelCycles(gasoil) {
  const byCamion = {}
  gasoil
    .filter(g => g.camion_id && g.km !== null && g.km !== undefined && g.km !== '')
    .forEach(g => {
      if (!byCamion[g.camion_id]) byCamion[g.camion_id] = []
      byCamion[g.camion_id].push(g)
    })

  const cycles = []
  Object.entries(byCamion).forEach(([camionId, entries]) => {
    const sorted = [...entries].sort((a, b) => parseFloat(a.km) - parseFloat(b.km) || (a.date || '').localeCompare(b.date || ''))
    for (let i = 0; i < sorted.length - 1; i++) {
      const g1 = sorted[i], g2 = sorted[i + 1]
      const kmDebut = parseFloat(g1.km)
      const kmFin = parseFloat(g2.km)
      const kmParcourus = kmFin - kmDebut
      if (kmParcourus <= 0) continue
      const litres = g1.qte || 0
      const dieselDh = g1.total || 0
      const adblueDh = g1.adblue_total || 0
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

// ── Vue "période" par camion — km/litres/DH agrégés sur l'intervalle choisi.
// Km parcourus = dernier KM compteur renseigné − premier KM compteur renseigné
// (même logique que le bloc "Conso. L/100km" déjà en place sur /gasoil).
// Litres/DH = somme de TOUS les pleins de la période (KM renseigné ou non).
export function buildPeriodStats({ camions, gasoil, voyages, cycles, from, to, thresholdPct }) {
  const hist = historicalAverages(cycles)
  return camions.map(cam => {
    const inRange = gasoil.filter(g => g.camion_id === cam.id && g.date >= from && g.date <= to)
    const withKm = inRange
      .filter(g => g.km !== null && g.km !== undefined && g.km !== '')
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || parseFloat(a.km) - parseFloat(b.km))
    const firstKm = withKm.length ? parseFloat(withKm[0].km) : null
    const lastKm = withKm.length > 1 ? parseFloat(withKm[withKm.length - 1].km) : null
    const kmTotal = firstKm !== null && lastKm !== null && lastKm > firstKm ? lastKm - firstKm : null
    const litresTotal = inRange.reduce((s, g) => s + (g.qte || 0), 0)
    const dhTotal = inRange.reduce((s, g) => s + (g.total || 0) + (g.adblue_total || 0), 0)
    const consoL100 = kmTotal ? (litresTotal * 100) / kmTotal : null
    const coutKm = kmTotal ? dhTotal / kmTotal : null
    const nbPleins = inRange.length
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
  if (kind === 'semaine') {
    const d = new Date(now); d.setDate(d.getDate() - 7)
    return { from: toStr(d), to }
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
