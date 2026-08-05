// ── Fuel Allocation Engine — purchase-scoped, distance-proportional ─────────
// Pure functions only (no Supabase, no React), same convention as
// lib/services/profitability.js / kilometrage.js / fuelCycles.js.
//
// Replaces the old voyage-scoped "km-bracket rate" formula (kmFuelCost) with
// a purchase-scoped model: for every diesel purchase, decide which voyage(s)
// it belongs to (automatic bracket detection, or a manual link in
// voyage_gasoil — manual always wins), then split that purchase's total
// across exactly those voyages, proportional to each voyage's own distance.
// Automatic and manual voyage sets are fed through the exact same
// distributeFuelPurchase() — there is no second formula.
//
// voyage_gasoil is a pure (gasoil_id, voyage_id) membership table here — no
// amount is ever read from or written to it. A voyage with ANY row in
// voyage_gasoil is fully manual (excluded from automatic bracket detection
// for every purchase); a voyage can legitimately have links to more than one
// purchase (e.g. it refueled mid-trip) — each purchase still only ever
// distributes its own total, so no purchase can ever be over-allocated
// regardless of how many purchases a given voyage draws from.

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

// Diesel purchases (qte > 0) with a km reading, sorted ascending — only these
// can open/close an automatic bracket. Same gate as the old kmFuelCost.
export function sortDieselBoundaries(camionGasoil) {
  return (camionGasoil || [])
    .filter(g => (g.qte || 0) > 0 && hasKm(g))
    .slice()
    .sort((a, b) => parseFloat(a.km) - parseFloat(b.km))
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

// The bracket a km-bearing purchase opens: [this purchase's km, next
// boundary's km), or an open-ended [km, +∞) bracket if it's currently the
// most recent purchase for this truck — an open bracket is a normal, live
// state (it keeps absorbing new voyages automatically as they're added; no
// manual action needed), not a dead end the way the old formula treated it.
function bracketFor(purchase, sortedBoundaries) {
  const idx = sortedBoundaries.findIndex(b => b.id === purchase.id)
  if (idx < 0) return null
  const next = sortedBoundaries[idx + 1] || null
  return { kmStart: parseFloat(purchase.km), kmEnd: next ? parseFloat(next.km) : null }
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
          return vStart >= bracket.kmStart && (bracket.kmEnd === null || vStart < bracket.kmEnd)
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
export function buildCamionFuelAllocationTable({ camionGasoil, camionVoyages, voyageGasoilLinks, remiseRate }) {
  const sortedBoundaries = sortDieselBoundaries(camionGasoil)

  const linksByGasoilId = new Map()
  const manuallyLinkedVoyageIds = new Set()
  ;(voyageGasoilLinks || []).forEach(l => {
    if (!l.gasoil_id || !l.voyage_id) return
    if (!linksByGasoilId.has(l.gasoil_id)) linksByGasoilId.set(l.gasoil_id, [])
    linksByGasoilId.get(l.gasoil_id).push(l)
    manuallyLinkedVoyageIds.add(l.voyage_id)
  })

  const ctx = { sortedBoundaries, camionVoyages, linksByGasoilId, manuallyLinkedVoyageIds, remiseRate }

  const purchases = (camionGasoil || []).filter(g => (g.qte || 0) > 0)
  const allocations = purchases.map(p => resolveFuelPurchaseAllocation(p, ctx))

  const voyageFuelMap = new Map()
  const voyageContributions = new Map()
  allocations.forEach(a => {
    const purchase = purchases.find(p => p.id === a.gasoilId)
    a.voyageAllocations.forEach(va => {
      voyageFuelMap.set(va.voyageId, (voyageFuelMap.get(va.voyageId) || 0) + va.amount)
      if (!voyageContributions.has(va.voyageId)) voyageContributions.set(va.voyageId, [])
      voyageContributions.get(va.voyageId).push({
        gasoilId: a.gasoilId, date: purchase?.date, amount: va.amount,
        distance: va.distance, share: va.share, purchaseQte: purchase?.qte || 0,
      })
    })
  })

  return { allocations, voyageFuelMap, voyageContributions }
}
