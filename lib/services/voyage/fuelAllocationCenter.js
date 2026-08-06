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

import { buildCamionFuelAllocationTable } from '../fuelAllocation'

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
    if (card.isOpenBracket) return 'En attente du prochain voyage pour clôturer ce plein.'
    return 'Aucun voyage ne couvre ce plein pour l\'instant.'
  }
  // Non-empty pool with remaining > 0 can only be a fixed-only, underfunded pool.
  return 'Allocation manuelle incomplète — le montant saisi ne couvre pas la totalité du plein.'
}

// A voyage's display "mode" for the Allocation List — distinct from the
// engine's own internal pool-membership kind ('distance'/'fixed'): this is
// what the dispatcher needs to understand *why* it's here.
function modeForVoyage(voyage, isLinkedToThisPurchase) {
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
    const purchaseById = new Map(camionGasoil.map(g => [g.id, g]))

    // For §7's "waiting for next voyage" message — this truck's most recent
    // diesel+km purchase (no newer one yet) has an open, still-growing
    // bracket; display-only, mirrors fuelAllocation.js's own km-boundary
    // sort without touching it.
    const kmBoundaries = camionGasoil.filter(g => (g.qte || 0) > 0 && g.km !== null && g.km !== undefined && g.km !== '')
    const maxKm = kmBoundaries.length ? Math.max(...kmBoundaries.map(g => parseFloat(g.km))) : null

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

      cards.push({
        gasoilId: a.gasoilId,
        camionId,
        plaque: camion?.plaque || purchase.camion_plaque || '—',
        chauffeur: camion?.chauffeur || purchase.chauffeur || '—',
        date: purchase.date,
        station: purchase.station || '',
        km: purchase.km ?? null,
        hasKm,
        isOpenBracket: hasKm && maxKm !== null && parseFloat(purchase.km) === maxKm,
        qte: purchase.qte || 0,
        prixUnitaire: purchase.prix_unitaire || 0,
        adblueTotal: purchase.adblue_total || 0,
        adblueQte: purchase.adblue_qte || 0,
        adblueUnitPrice: purchase.adblue_prix_unitaire || 0,
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
export function computeAllocationPreview({ camionGasoil, camionVoyages, voyageGasoilRows, remiseRate, voyageId, addToGasoilId, removeFromGasoilId }) {
  const before = buildCamionFuelAllocationTable({ camionGasoil, camionVoyages, voyageGasoilLinks: voyageGasoilRows, remiseRate })

  const augmented = (voyageGasoilRows || []).filter(l =>
    !(removeFromGasoilId && l.voyage_id === voyageId && l.gasoil_id === removeFromGasoilId))
  augmented.push({ gasoil_id: addToGasoilId, voyage_id: voyageId })

  const after = buildCamionFuelAllocationTable({ camionGasoil, camionVoyages, voyageGasoilLinks: augmented, remiseRate })

  const snap = (table, gasoilId) => {
    const a = table.allocations.find(x => x.gasoilId === gasoilId)
    return a ? { allocated: a.allocated, remaining: a.remaining, total: a.total } : null
  }

  // Since the real engine guarantees remaining can never go negative, "this
  // won't fit" surfaces as fixedAmountsCapped (a manual_fixed amount got
  // scaled down), read straight off the real "after" allocation — never a
  // fabricated negative number.
  const targetAfter = after.allocations.find(x => x.gasoilId === addToGasoilId)

  return {
    target: { gasoilId: addToGasoilId, before: snap(before, addToGasoilId), after: snap(after, addToGasoilId) },
    source: removeFromGasoilId
      ? { gasoilId: removeFromGasoilId, before: snap(before, removeFromGasoilId), after: snap(after, removeFromGasoilId) }
      : null,
    voyageAmountBefore: before.voyageFuelMap.get(voyageId) || 0,
    voyageAmountAfter: after.voyageFuelMap.get(voyageId) || 0,
    targetWasCapped: !!targetAfter?.fixedAmountsCapped,
  }
}
