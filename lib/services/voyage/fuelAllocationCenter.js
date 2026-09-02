// ── Fuel Allocation Center — purchase-centric view model ─────────────────────
// Pure functions only (no Supabase, no React), same convention as
// lib/services/fuelAllocation.js / voyageKmFuel.js. This module invents NO
// new numbers — it calls buildCamionFuelAllocationTable (the real engine,
// unmodified) and reshapes its output into one card per fuel purchase for
// the Control Center's "Contrôle Allocation" tab. The existing "Chronologie"
// tab (lib/services/voyageKmFuel.js) is untouched and keeps building its own
// independent table — this is a second, additive call site, never a shared
// mutation of engine state (there is none: everything here is derived fresh
// from the same voyages/gasoil/voyage_gasoil rows on every call).

import { buildCamionFuelAllocationTable, sortDieselBoundaries, purchaseTotal } from '../fuelAllocation'

function groupByCamion(rows) {
  const map = new Map()
  ;(rows || []).forEach(r => {
    const id = r.camion_id
    if (id === null || id === undefined) return
    if (!map.has(id)) map.set(id, [])
    map.get(id).push(r)
  })
  return map
}

// The confirmed 4-step priority chain — checked in this exact order.
// Red now means "impossible to resolve cleanly on its own": either there's
// no KM to even attempt automatic allocation (`status:'waiting'`), or a
// manual_fixed amount didn't fit and had to be scaled down
// (`fixedAmountsCapped` — see fuelAllocation.js's resolveFuelPurchaseAllocation).
// `remaining` is checked BEFORE `hasManualLink`: a purchase whose only pool
// members are manual_fixed voyages that don't cover the whole total can be
// status:'manual' yet still have remaining > 0 — that's Orange (still
// incomplete), never Purple. "Has a manual link" only decides the color once
// the purchase is already fully allocated. Blue is NOT a card color here —
// it's reserved for the assign modal's suggestion stars only.
export function classifyAllocationColor(allocation, hasManualLink) {
  if (allocation.status === 'waiting' || allocation.fixedAmountsCapped) return 'red'
  if (allocation.remaining > 0.01) return 'orange'
  if (hasManualLink) return 'purple'
  return 'green'
}

// The Remaining figure's OWN small badge — independent of the card's overall
// color above, purely a function of remaining/total. Returns null when
// there's nothing left to flag (remaining ≈ 0).
export function remainingBadgeTone(card) {
  if (!card || card.remaining <= 0.01) return null
  const pct = card.total > 0 ? card.remaining / card.total : 1
  if (pct <= 0) return 'green'
  if (pct < 0.05) return 'light-green'
  return 'orange'
}

// The "why" behind a nonzero Remaining (spec item 7). Derived strictly from
// how the engine actually behaves, not invented: distributeFuelPurchase
// always consumes the ENTIRE residual whenever at least one distance member
// exists (its shares sum to exactly the residual), so remaining > 0 can only
// happen when a purchase's pool is empty, or when it contains only
// manual_fixed members that don't cover the total. There is no third case.
export function explainRemaining(card) {
  if (!card || card.remaining <= 0.01) return null
  if (card.voyageAllocations.length === 0) {
    if (!card.hasKm) return "Ce plein n'a pas de KM — associez un voyage manuellement pour commencer l'allocation."
    // First refuel event ever recorded for this truck: there is no previous
    // refuel to measure a period from, so this purchase can never auto-close
    // a bracket. This is the truck's reference starting point, not a data
    // problem — no full-tank requirement is involved.
    if (card.isFirstBoundary) return "Premier plein enregistré pour ce camion — sert de point de départ ; la consommation réelle sera mesurée au prochain plein."
    return 'Aucun voyage dans la période couverte par ce plein pour l\'instant.'
  }
  // Non-empty pool with remaining > 0 can only be a fixed-only, underfunded pool.
  return 'Allocation manuelle incomplète — le montant saisi ne couvre pas la totalité du plein.'
}

// A voyage's display "mode" for the Allocation List — distinct from the
// engine's own internal pool-membership kind ('distance'/'fixed'): this is
// what the dispatcher needs to understand *why* it's here. Exported so the
// Voyage Detail panel's own fuel summary (components/voyage/GasoilSection.js)
// can label each contribution identically instead of re-deriving this
// classification a second time.
export function modeForVoyage(voyage, isLinkedToThisPurchase) {
  const fm = voyage?.fuel_mode || 'automatic'
  if (fm === 'manual_km') return 'manual_km'
  if (fm === 'manual_fixed') return 'manual_fixed'
  return isLinkedToThisPurchase ? 'manual_override' : 'automatic'
}

// Builds one card per diesel purchase (qte > 0 — same gate the engine itself
// uses; an AdBlue-only row never opens its own bracket and never gets a card
// of its own, exactly matching buildCamionFuelAllocationTable's behavior).
// `voyageRows` is the Timeline tab's own already-built array (from
// buildVoyageKmFuelTimeline) — reused here only for display fields
// (reference/km/distance) so the two tabs can never show a different KM or
// reference for the same voyage; it never affects the money in `allocations`.
export function buildAllocationCards({ camions, activeVoyages, voyageRows, gasoil, voyageGasoilRows, clientNamesByVoyageId, remiseRate }) {
  const camionById = new Map((camions || []).map(c => [c.id, c]))
  const voyageById = new Map((activeVoyages || []).map(v => [v.id, v]))
  const voyageRowById = new Map((voyageRows || []).map(r => [r.voyageId, r]))

  const gasoilByCamion = groupByCamion(gasoil)
  const voyagesByCamion = groupByCamion(activeVoyages)

  const linksByGasoilId = new Map()
  ;(voyageGasoilRows || []).forEach(l => {
    if (!l.gasoil_id || !l.voyage_id) return
    if (!linksByGasoilId.has(l.gasoil_id)) linksByGasoilId.set(l.gasoil_id, [])
    linksByGasoilId.get(l.gasoil_id).push(l)
  })

  const cards = []
  gasoilByCamion.forEach((camionGasoil, camionId) => {
    const camionVoyages = voyagesByCamion.get(camionId) || []
    const camion = camionById.get(camionId)
    const table = buildCamionFuelAllocationTable({
      camionGasoil, camionVoyages, voyageGasoilLinks: voyageGasoilRows, remiseRate,
    })
    // Purchases here are already the engine's own aggregated-per-day events
    // (or individual km-less rows) — reading them straight off the table
    // guarantees a card's qte/total/km can never disagree with what the
    // engine actually distributed (see fuelAllocation.js's purchasesById).
    const purchaseById = table.purchasesById

    // Same sort the engine itself uses (imported, not re-derived) — no full-
    // tank requirement, any KM-bearing event can be a boundary. isOpenBracket
    // flags this truck's most recent refuel event (the currently-open
    // period's reference point — real consumption for voyages after it stays
    // unmeasured until a later refuel closes it, but this purchase's OWN
    // bracket, closing the period before it, is resolved exactly like any
    // other). isFirstBoundary flags the truck's very first refuel event
    // (nothing before it to close).
    const kmBoundaries = sortDieselBoundaries(camionGasoil)
    const maxKm = kmBoundaries.length ? kmBoundaries[kmBoundaries.length - 1].km : null
    const minKm = kmBoundaries.length ? kmBoundaries[0].km : null

    table.allocations.forEach(a => {
      const purchase = purchaseById.get(a.gasoilId)
      if (!purchase) return
      const links = linksByGasoilId.get(a.gasoilId) || []
      const linkedVoyageIds = new Set(links.map(l => l.voyage_id))
      const hasManualLink = links.length > 0
      const colorClass = classifyAllocationColor(a, hasManualLink)

      const voyageAllocations = a.voyageAllocations.map(va => {
        const voyage = voyageById.get(va.voyageId)
        const row = voyageRowById.get(va.voyageId)
        return {
          voyageId: va.voyageId,
          reference: row?.reference || voyage?.reference || `#${va.voyageId}`,
          date: row?.date || voyage?.date_depart || null,
          kmDepart: row?.kmDepart ?? (voyage?.km_depart ?? null),
          kmArrivee: row?.kmArrivee ?? (voyage?.km_arrivee ?? null),
          distance: va.distance,
          share: va.share,
          amount: va.amount,
          mode: modeForVoyage(voyage, linkedVoyageIds.has(va.voyageId)),
          clientNames: clientNamesByVoyageId?.get(va.voyageId) || [],
        }
      })

      const hasKm = purchase.km !== null && purchase.km !== undefined && purchase.km !== ''
      const total = a.total
      const remaining = a.remaining

      // Display-only — mirrors the exact subtraction fuelAllocation.js's own
      // purchaseTotal() already performs internally (dieselNet = total −
      // qte*remiseRate) so this number can never disagree with what's
      // actually inside `total` above. Never fed back into any calculation.
      const discount = remiseRate > 0 ? Math.round((purchase.qte || 0) * remiseRate * 100) / 100 : 0

      // Sum of covered voyages' own distance (spec item 5's "Visual
      // Coverage" line) — ignores manual_fixed members (distance null).
      const coveredDistance = voyageAllocations.reduce((s, v) => s + (v.distance || 0), 0)

      cards.push({
        gasoilId: a.gasoilId,
        // Present only on a same-day aggregate (see
        // fuelPeriods.js:aggregateDailyRefuels) — every underlying gasoil row
        // this card's qte/total actually sums across, for transparency.
        gasoilIds: purchase.gasoilIds || [a.gasoilId],
        isAggregate: !!purchase.isAggregate,
        camionId,
        plaque: camion?.plaque || purchase.camion_plaque || '—',
        chauffeur: camion?.chauffeur || purchase.chauffeur || '—',
        date: purchase.date,
        station: purchase.station || '',
        km: purchase.km ?? null,
        hasKm,
        isOpenBracket: hasKm && maxKm !== null && parseFloat(purchase.km) === maxKm,
        isFirstBoundary: hasKm && minKm !== null && parseFloat(purchase.km) === minKm,
        qte: purchase.qte || 0,
        prixUnitaire: purchase.prix_unitaire || 0,
        adblueTotal: purchase.adblue_total || 0,
        adblueQte: purchase.adblue_qte || 0,
        adblueUnitPrice: purchase.adblue_prix_unitaire || 0,
        discount,
        coveredDistance,
        total,
        allocated: a.allocated,
        remaining,
        remainingPct: total > 0 ? Math.round((remaining / total) * 1000) / 10 : 0,
        status: a.status,
        fixedAmountsCapped: a.fixedAmountsCapped,
        hasManualLink,
        colorClass,
        fullyAllocated: colorClass === 'purple' || colorClass === 'green',
        voyageAllocations,
      })
    })
  })

  return cards.sort((a, b) => {
    if (a.plaque !== b.plaque) return a.plaque < b.plaque ? -1 : 1
    if (a.date !== b.date) return (a.date || '') < (b.date || '') ? -1 : 1
    return a.gasoilId - b.gasoilId
  })
}

// Display-layer filtering — never refetches, never rebuilds the cards.
// `search` (spec item 9) matches, case-insensitively, against the purchase's
// own date/truck/KM, and — per linked voyage — reference/client/KM, plus a
// numeric match against the purchase's own remaining amount (typing "981"
// matches a purchase whose remaining rounds to 981).
export function filterAllocationCards(cards, { camionId, dateFrom, dateTo, statusFilter, search } = {}) {
  const q = (search || '').trim().toLowerCase()
  return (cards || [])
    .filter(c => !camionId || c.camionId === camionId)
    .filter(c => !dateFrom || (c.date || '') >= dateFrom)
    .filter(c => !dateTo || (c.date || '') <= dateTo)
    .filter(c => {
      if (!statusFilter) return true
      if (statusFilter === 'remaining') return c.remaining > 0.01
      if (statusFilter === 'waiting') return c.status === 'waiting'
      if (statusFilter === 'manual') return c.hasManualLink
      if (statusFilter === 'automatic') return !c.hasManualLink && c.status !== 'waiting'
      if (statusFilter === 'full') return c.fullyAllocated
      return true
    })
    .filter(c => {
      if (!q) return true
      if ((c.plaque || '').toLowerCase().includes(q)) return true
      if ((c.date || '').includes(q)) return true
      if (c.km !== null && String(c.km).includes(q)) return true
      if (String(Math.round(c.remaining)).includes(q)) return true
      if (String(c.gasoilId) === q) return true
      return c.voyageAllocations.some(v =>
        v.reference.toLowerCase().includes(q) ||
        (v.clientNames || []).some(n => n.toLowerCase().includes(q)) ||
        (v.kmDepart !== null && String(v.kmDepart).includes(q)))
    })
}

// Quick Statistics header — computed over whatever list is passed in. The
// caller passes the ALREADY-FILTERED cards, so these numbers reflect active
// filters (deliberately different from KmFuelDashboardCards on the
// Chronologie tab, which is intentionally fleet-wide — do not "fix" this to
// match, it's a conscious choice for this tab).
export function buildAllocationStats(cards) {
  const list = cards || []
  const waiting = list.filter(c => c.status === 'waiting').length
  const fullyAllocated = list.filter(c => c.fullyAllocated).length
  const partiallyAllocated = list.length - waiting - fullyAllocated
  const manualOverrides = list.filter(c => c.colorClass === 'purple').length
  const totalRemaining = Math.round(list.reduce((s, c) => s + (c.remaining || 0), 0) * 100) / 100
  return { totalPurchases: list.length, waiting, partiallyAllocated, fullyAllocated, manualOverrides, totalRemaining }
}

// Real-time "before/after" preview for a pending link/move — calls the real
// engine TWICE (once against the actual voyage_gasoil rows, once against a
// locally-cloned array with the hypothetical change applied) and reads the
// affected purchase(s) + voyage's resulting amount out of both runs. Never a
// separate formula, never writes anything — the caller decides whether to
// actually commit via lib/services/voyage/gasoilLink.js afterward.
export function computeAllocationPreview({ camionGasoil, camionVoyages, voyageGasoilRows, remiseRate, voyageId, addToGasoilId, removeFromGasoilId, camionVoyageRows }) {
  const before = buildCamionFuelAllocationTable({ camionGasoil, camionVoyages, voyageGasoilLinks: voyageGasoilRows, remiseRate })

  const augmented = (voyageGasoilRows || []).filter(l =>
    !(removeFromGasoilId && l.voyage_id === voyageId && l.gasoil_id === removeFromGasoilId))
  augmented.push({ gasoil_id: addToGasoilId, voyage_id: voyageId })

  const after = buildCamionFuelAllocationTable({ camionGasoil, camionVoyages, voyageGasoilLinks: augmented, remiseRate })

  // A manual pick is a raw gasoil row, which may be a member of a same-day
  // aggregate — resolve to that aggregate's canonical id (the same one
  // buildCamionFuelAllocationTable itself resolves to internally) before
  // looking anything up in `allocations`/`voyageFuelMap`, which are keyed by
  // event id, not by every individual row id. The aggregation structure only
  // depends on camionGasoil (identical in both calls), so before's mapping
  // is equally valid for after.
  const addEventId = before.eventIdForRow.get(addToGasoilId) ?? addToGasoilId
  const removeEventId = removeFromGasoilId ? (before.eventIdForRow.get(removeFromGasoilId) ?? removeFromGasoilId) : null

  const snap = (table, gasoilId) => {
    const a = table.allocations.find(x => x.gasoilId === gasoilId)
    return a ? { allocated: a.allocated, remaining: a.remaining, total: a.total } : null
  }

  // Since the real engine guarantees remaining can never go negative, "this
  // won't fit" surfaces as fixedAmountsCapped (a manual_fixed amount got
  // scaled down), read straight off the real "after" allocation — never a
  // fabricated negative number.
  const targetAfter = after.allocations.find(x => x.gasoilId === addEventId)

  // Spec item 6 ("live recalculation") — every OTHER voyage sharing the
  // target (and, when moving, the source) purchase can also shift amount,
  // since distributeFuelPurchase redistributes the whole pool whenever its
  // membership changes. Read straight off the same before/after tables
  // already built above — no third engine call, no separate formula. Only
  // voyages whose amount actually changed are worth showing.
  const refByVoyageId = new Map((camionVoyageRows || []).map(v => [v.voyageId, v.reference]))
  const siblingVoyageIds = new Set()
  ;[addEventId, removeEventId].filter(Boolean).forEach(gid => {
    ;(before.allocations.find(x => x.gasoilId === gid)?.voyageAllocations || []).forEach(va => siblingVoyageIds.add(va.voyageId))
    ;(after.allocations.find(x => x.gasoilId === gid)?.voyageAllocations || []).forEach(va => siblingVoyageIds.add(va.voyageId))
  })
  siblingVoyageIds.delete(voyageId)
  const siblingImpacts = [...siblingVoyageIds]
    .map(vid => ({
      voyageId: vid,
      reference: refByVoyageId.get(vid) || `#${vid}`,
      before: Math.round((before.voyageFuelMap.get(vid) || 0) * 100) / 100,
      after: Math.round((after.voyageFuelMap.get(vid) || 0) * 100) / 100,
    }))
    .filter(s => Math.abs(s.after - s.before) > 0.01)
    .sort((a, b) => a.reference.localeCompare(b.reference))

  return {
    target: { gasoilId: addToGasoilId, before: snap(before, addEventId), after: snap(after, addEventId) },
    source: removeFromGasoilId
      ? { gasoilId: removeFromGasoilId, before: snap(before, removeEventId), after: snap(after, removeEventId) }
      : null,
    voyageAmountBefore: before.voyageFuelMap.get(voyageId) || 0,
    voyageAmountAfter: after.voyageFuelMap.get(voyageId) || 0,
    targetWasCapped: !!targetAfter?.fixedAmountsCapped,
    siblingImpacts,
  }
}

// ── Fuel-cost transparency (spec item 9) ────────────────────────────────────
// Same per-camion grouping pattern as profitability.js's buildFuelMapsByCamion
// (calls the SAME unmodified engine), but keeps `voyageContributions` instead
// of discarding it — that Map already holds everything the Rentabilité
// drawer needs to show "where did this DHS come from", the engine just never
// had a caller asking for it before. `totalDistance` is algebra on the
// engine's own returned fields (distance / share = the pool's total distance
// D), not a new computation the engine doesn't already imply.
export function buildVoyageFuelContributions({ gasoil, voyages, voyageGasoilLinks, remiseRate }) {
  const gasoilByCamion = groupByCamion(gasoil)
  const voyagesByCamion = groupByCamion(voyages)
  const camionIds = new Set([...gasoilByCamion.keys(), ...voyagesByCamion.keys()])

  const result = new Map()
  camionIds.forEach(camionId => {
    const table = buildCamionFuelAllocationTable({
      camionGasoil: gasoilByCamion.get(camionId) || [],
      camionVoyages: voyagesByCamion.get(camionId) || [],
      voyageGasoilLinks,
      remiseRate,
    })
    // table.purchasesById already holds the engine's own aggregated-per-day
    // event (or individual km-less row) — never re-derived from a raw
    // per-row lookup, which would show only one row's own slice instead of
    // the full aggregate this contribution was actually computed from.
    table.voyageContributions.forEach((contribs, voyageId) => {
      result.set(voyageId, contribs.map(c => {
        const purchase = table.purchasesById.get(c.gasoilId)
        const isFixed = c.distance === null || c.share === null
        return {
          gasoilId: c.gasoilId,
          date: c.date,
          camionPlaque: purchase?.camion_plaque || '—',
          station: purchase?.station || '',
          amount: c.amount,
          distance: c.distance,
          share: c.share,
          totalDistance: isFixed || !c.share ? null : Math.round((c.distance / c.share) * 10) / 10,
          purchaseTotal: purchase ? purchaseTotal(purchase, remiseRate) : null,
          isFixed,
        }
      }))
    })
  })
  return result
}
