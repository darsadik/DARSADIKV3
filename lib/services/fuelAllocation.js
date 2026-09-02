// ── Fuel Allocation Engine — real-refueling-period-scoped, distance-proportional
// Pure functions only (no Supabase, no React), same convention as
// lib/services/profitability.js / kilometrage.js / fuelCycles.js.
//
// Authoritative model (see lib/services/fuelPeriods.js): REFUEL → VOYAGES →
// NEXT REFUEL. The fuel added after a group of voyages is what those voyages
// consumed — a refuel measures what was already burned, never what will be
// burned next. There is NO full-tank requirement: any diesel purchase with a
// KM reading can close a period, partial top-ups included. Same-date refuels
// for the same truck are always aggregated into ONE fuel event first (see
// fuelPeriods.js:aggregateDailyRefuels) — 100L + 50L on the same date is
// 150L, never two separate 100L/50L periods.
//
// So for every aggregated refuel event, its total is distributed across the
// voyages that happened BEFORE it (back to the previous refuel event), not
// after it. An event with no previous event (the truck's first-ever refuel)
// closes nothing and distributes nothing automatically; the most recent
// event opens a period that stays open — voyages after it get no automatic
// allocation until a later event closes it (§7/§15: never fabricate a real
// consumption figure for an unclosed period).
//
// Manual links (voyage_gasoil) are a deliberate exception/override, kept
// fully independent of the period model per the app's business rule that
// manual corrections must never be blocked by whether a period has closed
// yet: a manual link always draws from its target event's own (aggregated)
// total, automatic bracket membership or not — the same
// distributeFuelPurchase() is used either way, there is no second formula. A
// link to any individual gasoil row resolves to whichever aggregated event
// that row belongs to (see buildCamionFuelAllocationTable's eventIdForRow).
//
// voyage_gasoil is a pure (gasoil_id, voyage_id) membership table here — no
// amount is ever read from or written to it. A voyage with ANY row in
// voyage_gasoil is fully manual (excluded from automatic bracket detection
// for every purchase); a voyage can legitimately have links to more than one
// purchase (e.g. it refueled mid-trip) — each purchase still only ever
// distributes its own total, so no purchase can ever be over-allocated
// regardless of how many purchases a given voyage draws from.

import { isRefuelRow, aggregateDailyRefuels } from './fuelPeriods'

function hasKm(g) {
  return g.km !== null && g.km !== undefined && g.km !== ''
}

function voyageHasKm(v) {
  return v.km_depart !== null && v.km_depart !== undefined && v.km_depart !== '' &&
         v.km_arrivee !== null && v.km_arrivee !== undefined && v.km_arrivee !== ''
}

// The one place that decides what a voyage contributes to a purchase's pool,
// by fuel_mode — the single source of truth for "does this voyage
// participate, and as a distance share or a fixed amount". Returns null when
// the voyage has nothing usable yet (missing km/manual value), which the
// caller treats as "not in the pool", never an error.
//
// 'manual_rate'/'manual_amount' deliberately return null unconditionally —
// they are fully independent overrides (see profitability.js's
// computeFuelCost) and never enter this engine, exactly as before this
// voyage-level manual-KM support was added.
function poolEntryForVoyage(v) {
  const mode = v.fuel_mode || 'automatic'
  if (mode === 'automatic') {
    if (voyageHasKm(v) && parseFloat(v.km_arrivee) > parseFloat(v.km_depart)) {
      return { voyageId: v.id, kind: 'distance', distance: parseFloat(v.km_arrivee) - parseFloat(v.km_depart) }
    }
    return null
  }
  if (mode === 'manual_km') {
    // "Approximate KM" — a voyage with no real odometer reading, given a
    // manually-typed distance instead. Contributes to the DISTANCE pool
    // exactly like a real-km voyage — same distributeFuelPurchase formula,
    // no special-casing once it has a number to work with.
    const d = parseFloat(v.manual_distance_km)
    return d > 0 ? { voyageId: v.id, kind: 'distance', distance: d } : null
  }
  if (mode === 'manual_fixed') {
    // "Manual fuel amount" — a fixed DHS slice of its chosen purchase,
    // taken before the distance-proportional split runs on whatever's left
    // (see resolveFuelPurchaseAllocation). Never a distance share itself.
    const amt = parseFloat(v.manual_fuel_cost)
    return amt > 0 ? { voyageId: v.id, kind: 'fixed', amount: amt } : null
  }
  return null
}

// Diesel purchases with a KM reading, aggregated per truck+date (see
// fuelPeriods.js:aggregateDailyRefuels) and sorted ascending by km — these
// aggregated events are what can open/close an automatic bracket. No full-
// tank requirement: a partial top-up is just as valid a boundary as a full
// one, it only needs a KM reading.
export function sortDieselBoundaries(camionGasoil) {
  return aggregateDailyRefuels(camionGasoil)
}

// One purchase's total DHS to distribute: diesel net of the Remise Carburant
// (litres only, never AdBlue) plus this purchase's own AdBlue total. Same
// formula the old kmFuelCost applied to a bracket's opening plein.
export function purchaseTotal(gasoilRow, remiseRate) {
  const dieselNet = Math.max(0, (gasoilRow.total || 0) - (gasoilRow.qte || 0) * remiseRate)
  return dieselNet + (gasoilRow.adblue_total || 0)
}

// The one shared split — used identically whether the voyage list came from
// automatic bracket detection or from manual links. Largest-remainder
// apportionment in integer cents guarantees the amounts sum back to `total`
// exactly, for any number of voyages, and no single amount can ever exceed
// `total` (the two mathematical guarantees this redesign is built around).
export function distributeFuelPurchase(total, voyageDistances) {
  const pool = (voyageDistances || []).filter(v => v && v.distance > 0)
  const D = pool.reduce((s, v) => s + v.distance, 0)
  if (!(total > 0) || !(D > 0) || pool.length === 0) return []

  const totalCents = Math.round(total * 100)
  const items = pool.map(v => {
    const rawCents = totalCents * (v.distance / D)
    const floorCents = Math.floor(rawCents)
    return { voyageId: v.voyageId, distance: v.distance, floorCents, remainder: rawCents - floorCents }
  })
  const allocatedCents = items.reduce((s, it) => s + it.floorCents, 0)
  const leftover = totalCents - allocatedCents

  // Deterministic tie-break by voyageId so re-running with the same inputs
  // always gives the same cent-level result.
  const byRemainderDesc = [...items].sort((a, b) => b.remainder - a.remainder || a.voyageId - b.voyageId)
  for (let i = 0; i < leftover && i < byRemainderDesc.length; i++) byRemainderDesc[i].floorCents += 1

  return items.map(it => ({
    voyageId: it.voyageId,
    distance: it.distance,
    share: it.distance / D,
    amount: Math.round(it.floorCents) / 100,
  }))
}

// The bracket a refuel event CLOSES: [previous boundary's km, this event's
// km) — this event's own (aggregated) total measures what those voyages
// consumed since the previous refuel. The first refuel event for a truck
// (idx 0) has no previous boundary, so it closes nothing (never fabricate a
// period out of nothing). The most recent event still closes the bracket
// before it exactly like any other; it simply has no *next* event yet, which
// is why voyages after it naturally fall outside every bracket and get no
// automatic allocation until a later refuel closes their period — no
// separate "open" case needed here.
function bracketFor(purchase, sortedBoundaries) {
  const idx = sortedBoundaries.findIndex(b => b.id === purchase.id)
  if (idx <= 0) return null
  const prev = sortedBoundaries[idx - 1]
  return { kmStart: parseFloat(prev.km), kmEnd: parseFloat(purchase.km) }
}

// Resolves the voyage pool for ONE purchase: manually-linked voyages (via
// voyage_gasoil) — resolved through poolEntryForVoyage, so a link can
// contribute a real-km distance, a manual-KM distance, or a fixed amount —
// plus, for voyages with no manual link anywhere, whatever automatic bracket
// detection finds (real km + fuel_mode 'automatic' only; manual-KM/fixed
// voyages have no real km position to bracket against, so they can only ever
// join a pool via an explicit manual link). A voyage with any manual link,
// to this purchase or any other, is never pulled into an automatic bracket;
// that is what "manual always overrides automatic" means in code.
export function resolveVoyagePool(purchase, { sortedBoundaries, camionVoyages, linksByGasoilId, manuallyLinkedVoyageIds }) {
  // Defensive, not trusting every caller's query: same convention as
  // fuelCycles.js's buildFuelCycles (filters !v.deleted_at internally).
  const active = (camionVoyages || []).filter(v => !v.deleted_at)

  const manualVoyageIds = new Set((linksByGasoilId.get(purchase.id) || []).map(l => l.voyage_id))
  const manualEntries = active
    .filter(v => manualVoyageIds.has(v.id))
    .map(poolEntryForVoyage)
    .filter(Boolean)

  const autoCandidates = active.filter(v =>
    (v.fuel_mode || 'automatic') === 'automatic' && voyageHasKm(v) &&
    parseFloat(v.km_arrivee) > parseFloat(v.km_depart)
  )

  const bracket = (purchase.qte || 0) > 0 && hasKm(purchase) ? bracketFor(purchase, sortedBoundaries) : null
  const autoEntries = bracket
    ? autoCandidates
        .filter(v => {
          // manuallyLinkedVoyageIds already covers manualVoyageIds (a subset,
          // this purchase's own manual links) — one check excludes both:
          // any voyage with a manual link anywhere is never auto-detected.
          if (manuallyLinkedVoyageIds.has(v.id)) return false
          const vStart = parseFloat(v.km_depart)
          return vStart >= bracket.kmStart && vStart < bracket.kmEnd
        })
        .map(poolEntryForVoyage)
        .filter(Boolean)
    : []

  return [...manualEntries, ...autoEntries]
}

// Full resolution for one purchase: pool + split + remaining. `remaining`
// is always Total − Allocated, and Allocated can never exceed Total because
// both halves below are built to guarantee it.
//
// The pool can mix two kinds of member (see poolEntryForVoyage): 'fixed'
// (a manual_fixed voyage's exact DHS slice) and 'distance' (everyone else —
// real-km or manual_km). Fixed members are settled FIRST, then
// distributeFuelPurchase — the one shared formula, unmodified — splits
// whatever's left across the distance members. If fixed amounts alone would
// exceed the purchase total (e.g. a typo), they are scaled down
// proportionally so they land at exactly 100% of the total: reusing
// distributeFuelPurchase itself for that scaling (treating each member's
// raw requested amount as its "weight") keeps the cent-exact guarantee in
// the overflow case too, instead of a second, separately-rounded formula.
// When a purchase has no 'fixed' members at all (the overwhelmingly common
// case, and every purchase before manual_fixed existed), this reduces to
// exactly today's behavior: distributeFuelPurchase(total, distanceMembers).
export function resolveFuelPurchaseAllocation(purchase, ctx) {
  const total = purchaseTotal(purchase, ctx.remiseRate)
  const pool = resolveVoyagePool(purchase, ctx)
  const fixedMembers = pool.filter(p => p.kind === 'fixed')
  const distanceMembers = pool.filter(p => p.kind === 'distance')

  const rawFixedSum = fixedMembers.reduce((s, f) => s + f.amount, 0)
  const fixedAmountsCapped = rawFixedSum > total + 0.001
  const fixedAllocations = fixedAmountsCapped
    ? distributeFuelPurchase(total, fixedMembers.map(f => ({ voyageId: f.voyageId, distance: f.amount })))
        .map(a => ({ voyageId: a.voyageId, distance: null, share: null, amount: a.amount }))
    : fixedMembers.map(f => ({ voyageId: f.voyageId, distance: null, share: null, amount: Math.round(f.amount * 100) / 100 }))

  const cappedFixedSum = Math.round(fixedAllocations.reduce((s, f) => s + f.amount, 0) * 100) / 100
  const residual = Math.max(0, Math.round((total - cappedFixedSum) * 100) / 100)
  const distanceAllocations = distributeFuelPurchase(residual, distanceMembers)

  const voyageAllocations = [...fixedAllocations, ...distanceAllocations]
  const allocated = Math.round(voyageAllocations.reduce((s, a) => s + a.amount, 0) * 100) / 100
  const remaining = Math.round((total - allocated) * 100) / 100
  const hasManualLinks = (ctx.linksByGasoilId.get(purchase.id) || []).length > 0
  const status = voyageAllocations.length > 0
    ? (hasManualLinks ? 'manual' : 'automatic')
    : (hasKm(purchase) ? 'idle' : 'waiting')
  return { gasoilId: purchase.id, total, status, voyageAllocations, allocated, remaining, fixedAmountsCapped }
}

// Runs the above for every diesel purchase of one truck, and builds the
// per-voyage reverse index computeFuelCost needs — a voyage's total fuel
// cost is the sum of its shares across every purchase it appears in (never
// just one, since a voyage may legitimately draw from several).
//
// "Purchase" here means one of two things: an aggregated same-day refuel
// event (sortedBoundaries — anything with a KM reading, full or partial,
// merged per date) or an individual km-less row (kept separate since it can
// never anchor a bracket anyway, but must still be linkable manually — see
// fuelAllocationCenter.js's 'waiting' status). Either way every "purchase"
// object exposes the same id/qte/total/adblue_total/km/date shape, so
// resolveFuelPurchaseAllocation/purchaseTotal/bracketFor need no branching.
export function buildCamionFuelAllocationTable({ camionGasoil, camionVoyages, voyageGasoilLinks, remiseRate }) {
  const sortedBoundaries = sortDieselBoundaries(camionGasoil) // aggregated, km-bearing events only

  // A manual link stores the ONE gasoil row a dispatcher picked, but that
  // row may now be a member of a same-day aggregate — resolve it to that
  // aggregate's canonical id so the link draws from the full aggregated
  // total, not just this one row's own slice (see module header).
  const eventIdForRow = new Map()
  sortedBoundaries.forEach(ev => ev.gasoilIds.forEach(gid => eventIdForRow.set(gid, ev.id)))

  const noKmPurchases = (camionGasoil || []).filter(g => (g.qte || 0) > 0 && !isRefuelRow(g))
  const purchases = [...sortedBoundaries, ...noKmPurchases]
  const purchasesById = new Map(purchases.map(p => [p.id, p]))

  const linksByGasoilId = new Map()
  const manuallyLinkedVoyageIds = new Set()
  ;(voyageGasoilLinks || []).forEach(l => {
    if (!l.gasoil_id || !l.voyage_id) return
    const eventId = eventIdForRow.get(l.gasoil_id) ?? l.gasoil_id
    if (!linksByGasoilId.has(eventId)) linksByGasoilId.set(eventId, [])
    linksByGasoilId.get(eventId).push(l)
    manuallyLinkedVoyageIds.add(l.voyage_id)
  })

  const ctx = { sortedBoundaries, camionVoyages, linksByGasoilId, manuallyLinkedVoyageIds, remiseRate }

  const allocations = purchases.map(p => resolveFuelPurchaseAllocation(p, ctx))

  const voyageFuelMap = new Map()
  const voyageContributions = new Map()
  allocations.forEach(a => {
    const purchase = purchasesById.get(a.gasoilId)
    a.voyageAllocations.forEach(va => {
      voyageFuelMap.set(va.voyageId, (voyageFuelMap.get(va.voyageId) || 0) + va.amount)
      if (!voyageContributions.has(va.voyageId)) voyageContributions.set(va.voyageId, [])
      voyageContributions.get(va.voyageId).push({
        gasoilId: a.gasoilId, date: purchase?.date, amount: va.amount,
        distance: va.distance, share: va.share, purchaseQte: purchase?.qte || 0,
      })
    })
  })

  // Voyages sitting in the currently OPEN period (real km, automatic mode,
  // no manual override, km_depart at/after the truck's most recent refuel
  // event) — genuinely different from "no data at all": these will get a
  // real automatic cost the moment a later refuel closes their period, per
  // §7/§15 (never fabricate a real consumption figure before that).
  // Display-only (voyageKmFuel.js), never read by computeFuelCost/
  // profitability.js — the money contract (`source: 'none'` when nothing is
  // allocated yet) is unchanged.
  const pendingVoyageIds = new Set()
  const lastBoundary = sortedBoundaries[sortedBoundaries.length - 1] || null
  if (lastBoundary) {
    const lastKm = parseFloat(lastBoundary.km)
    ;(camionVoyages || []).filter(v => !v.deleted_at).forEach(v => {
      if ((v.fuel_mode || 'automatic') !== 'automatic') return
      if (manuallyLinkedVoyageIds.has(v.id)) return
      if (!voyageHasKm(v)) return
      if (voyageFuelMap.has(v.id)) return
      if (parseFloat(v.km_depart) >= lastKm) pendingVoyageIds.add(v.id)
    })
  }

  return { allocations, voyageFuelMap, voyageContributions, pendingVoyageIds, purchasesById, eventIdForRow }
}
