// ── Smart fuel→voyage suggestions (spec §8) ─────────────────────────────────
// Pure heuristic ranking, NOT a calculation — reads only plein.date/km and
// each candidate voyage row's date/kmDepart/kmArrivee/camionId (already
// computed by lib/services/voyageKmFuel.js). Never touches total/qte/
// prix_unitaire, so it cannot influence any cost figure. Advisory only: the
// caller (FuelAssignPopover) only ever pre-fills a one-click suggestion —
// assignment still goes through lib/services/voyage/gasoilLink.js exactly
// like a manual pick.

const DATE_WINDOW_DAYS = 45
const CONFIDENCE_CAP = 80

function daysBetween(a, b) {
  if (!a || !b) return Infinity
  return Math.abs((new Date(a) - new Date(b)) / 86400000)
}

function scoreCandidate(plein, voyage) {
  const diffDays = daysBetween(plein.date, voyage.date)
  const dateScore = Math.max(0, Math.min(70, 70 - diffDays * 2))

  let kmScore = 0
  const tags = ['same_truck']
  // Descriptive only — same_day/no_km never change dateScore/kmScore, they
  // just give the UI a clearer "why" to show alongside the existing score.
  if (diffDays === 0) tags.push('same_day')
  if (voyage.kmDepart === null || voyage.kmDepart === undefined) tags.push('no_km')
  if (plein.km !== null && plein.km !== undefined) {
    const km = parseFloat(plein.km)
    const start = voyage.kmDepart
    const end = voyage.kmArrivee
    if (start !== null && end !== null && km >= start && km <= end) {
      kmScore = 25
      tags.push('km_in_range')
    } else if (start !== null && end === null && km >= start) {
      kmScore = 15
      tags.push('km_after_start')
    } else if (start !== null) {
      const span = Math.max(1, (end !== null ? end : start) - start)
      const outside = km < start ? start - km : km - (end !== null ? end : start)
      kmScore = Math.max(0, 15 - Math.round((outside / span) * 15))
    }
  }

  return { diffDays, dateScore, kmScore, tags, score: dateScore + kmScore }
}

// Returns up to maxCandidates voyages of the SAME truck as the plein, ranked
// by a 0-80 confidence score (never higher — always advisory, never implies
// certainty). Falls back to the single closest-by-date candidate when
// nothing scores above minConfidence, so the UI still has something to
// offer; returns [] only when the truck has zero voyages.
export function suggestVoyagesForPlein(plein, camionVoyageRows, { maxCandidates = 3, minConfidence = 15 } = {}) {
  const candidates = (camionVoyageRows || []).filter(v => v.camionId === plein.camion_id)
  if (!candidates.length) return []

  const scored = candidates.map(v => ({ voyage: v, ...scoreCandidate(plein, v) }))
  const closestDiff = Math.min(...scored.map(s => s.diffDays))

  const ranked = scored
    .filter(s => s.diffDays <= DATE_WINDOW_DAYS)
    .map(s => ({
      voyageId: s.voyage.voyageId,
      reference: s.voyage.reference,
      date: s.voyage.date,
      confidence: Math.min(CONFIDENCE_CAP, Math.round(s.score)),
      reasons: s.diffDays === closestDiff ? [...s.tags, 'closest_date'] : s.tags,
    }))
    .sort((a, b) => b.confidence - a.confidence)

  const qualified = ranked.filter(r => r.confidence >= minConfidence)
  const result = qualified.length ? qualified : ranked.slice(0, 1)
  return result.slice(0, maxCandidates)
}
