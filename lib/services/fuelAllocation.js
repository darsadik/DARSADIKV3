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
//
// ── Priority 2 — KM-missing Plein → voyage association (added; see §§ below
// this line for the KM-only Priority 1 engine, entirely unmodified) ─────────
// A Gasoil Plein/Bon with no KM reading must never be discarded from the
// voyage-association picture just because fuelPeriods.js's shared,
// KM-required boundary detector (isRefuelRow/aggregateDailyRefuels — the
// truck-consumption model used by fuelCycles.js / fleetFuelMonitoring.js /
// camionPerformance.js, all untouched) can't see it. Decision tree, checked
// per Plein independently:
//   Step 1: does THIS Plein have a valid KM?
//     YES → Priority 1, unchanged: it brackets/associates exactly as before
//           (bracketFor over the KM-only sortedBoundaries).
//     NO  → Priority 2: walk the full chronological history (KM-bearing AND
//           KM-less purchases together) to decide one of two outcomes:
//       (a) a later (or same-date) KM-bearing purchase exists → this
//           Plein's litres are carried FORWARD into that purchase's own
//           total (never a separate bracket of its own) — the KM-bearing
//           purchase's bracket/voyage-membership stays 100% KM-based and
//           byte-identical to before this feature existed. This is what
//           keeps §1's "do not change existing KM-based behavior" true even
//           when a KM-less Bon sits between two real measurements.
//       (b) no such purchase exists yet (this Plein is the most recent
//           purchase in the truck's whole known history, or every purchase
//           after it also lacks KM) → it becomes its OWN closing boundary,
//           anchored by DATE instead of KM. Its bracket's lower bound still
//           prefers KM when the previous boundary has one (a real, precise
//           reading never gets replaced by a guess); only the side that
//           truly has no KM ever falls back to date. No KM value is ever
//           invented anywhere in this — see dateBracketFor/voyageInBracket.
// Once a bracket (KM- or date-anchored) is resolved, voyage pool detection,
// the distance-proportional split (distributeFuelPurchase), manual overrides,
// and every downstream consumer (profitability.js, voyageKmFuel.js,
// fuelAllocationCenter.js, Rentabilité, dashboards) are 100% unchanged — this
// is still the single authoritative engine, not a second one.

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

// ── Priority 2 helpers — KM-missing Plein → date/chronology fallback ────────

// Same-day aggregation for purchases with NO km reading — mirrors
// fuelPeriods.js:aggregateDailyRefuels exactly (never double-count litres),
// just without requiring a km reading, so a Plein missing its KM is never
// silently dropped. Kept local to this module (never exported from
// fuelPeriods.js itself), which stays the shared, unmodified truck-
// consumption model used by fuelCycles.js / fleetFuelMonitoring.js /
// camionPerformance.js — none of those are touched by this feature.
function aggregateDailyNoKmPurchases(camionGasoil) {
  const rows = (camionGasoil || []).filter(g => (g.qte || 0) > 0 && !hasKm(g))
  const byDate = new Map()
  rows.forEach(g => {
    if (!byDate.has(g.date)) byDate.set(g.date, [])
    byDate.get(g.date).push(g)
  })
  const events = []
  byDate.forEach((group, date) => {
    const sorted = [...group].sort((a, b) => (a.id || 0) - (b.id || 0))
    const first = sorted[0]
    events.push({
      id: first.id,
      date,
      km: null,
      qte: sorted.reduce((s, g) => s + (g.qte || 0), 0),
      adblue_qte: sorted.reduce((s, g) => s + (g.adblue_qte || 0), 0),
      total: sorted.reduce((s, g) => s + (g.total || 0), 0),
      adblue_total: sorted.reduce((s, g) => s + (g.adblue_total || 0), 0),
      camion_id: first.camion_id,
      camion_plaque: first.camion_plaque,
      chauffeur: first.chauffeur,
      station: first.station,
      prix_unitaire: first.prix_unitaire,
      adblue_prix_unitaire: first.adblue_prix_unitaire,
      gasoilIds: sorted.map(g => g.id),
      isAggregate: sorted.length > 1,
    })
  })
  return events.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
}

// Classifies every km-less purchase as either carried-forward (a km-bearing
// purchase exists at the same date or later — its litres fold into that
// purchase's own total, so that purchase's bracket stays purely km-based and
// unchanged — Scenario C) or trailing (nothing with km at/after it in the
// truck's known history yet — it must become its own date-anchored closing
// boundary — Scenario B/§2/§6). `kmEventsByDate` must be sorted ascending by
// date; `.find` then always resolves to the NEAREST qualifying km-bearing
// purchase, never a later one skipped over.
function classifyNoKmEvents(kmEventsByDate, noKmEvents) {
  const carryTargetByNoKmId = new Map()
  const trailingNoKmEvents = []
  noKmEvents.forEach(e => {
    const target = kmEventsByDate.find(k => k.date >= e.date)
    if (target) carryTargetByNoKmId.set(e.id, target)
    else trailingNoKmEvents.push(e)
  })
  return { carryTargetByNoKmId, trailingNoKmEvents }
}

// The bracket a TRAILING km-less purchase closes: DATE-anchored, never a
// fabricated KM. Its lower bound still prefers a real KM reading whenever
// the previous boundary has one (precise, Priority 1 for that side); only
// the side that truly lacks KM falls back to date. `closingEvent` here is
// always km-less by construction, so its own side (kmEnd) is always null.
function dateBracketFor(prevEvent, closingEvent) {
  if (!prevEvent) return null
  return {
    kmStart: prevEvent.km !== null && prevEvent.km !== undefined ? parseFloat(prevEvent.km) : null,
    kmEnd: null,
    dateStart: prevEvent.date,
    dateEnd: closingEvent.date,
  }
}

// Per-side bracket membership test — KM wherever that side of the bracket
// has a real reading (Priority 1), DATE wherever it doesn't (Priority 2).
// The voyage itself always has real KM here (callers only reach this after
// confirming voyageHasKm) — only the PLEIN side of the comparison ever falls
// back, and only ever to a real recorded date, never an invented KM.
function voyageInBracket(v, bracket) {
  const vStart = parseFloat(v.km_depart)
  const vDate = v.date_depart
  const afterStart = bracket.kmStart !== null
    ? vStart >= bracket.kmStart
    : (vDate !== null && vDate !== undefined && vDate >= bracket.dateStart)
  const beforeEnd = bracket.kmEnd !== null
    ? vStart < bracket.kmEnd
    : (vDate !== null && vDate !== undefined && vDate < bracket.dateEnd)
  return afterStart && beforeEnd
}

// The shared split — used identically whether the voyage list came from
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
// separate "open" case needed here. `dateStart`/`dateEnd` are additive
// (never read when kmStart/kmEnd are both present, which they always are
// here) — kept only so voyageInBracket can treat every bracket uniformly.
function bracketFor(purchase, sortedBoundaries) {
  const idx = sortedBoundaries.findIndex(b => b.id === purchase.id)
  if (idx <= 0) return null
  const prev = sortedBoundaries[idx - 1]
  return { kmStart: parseFloat(prev.km), kmEnd: parseFloat(purchase.km), dateStart: prev.date, dateEnd: purchase.date }
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
//
// `bracketByPurchaseId` (precomputed once in buildCamionFuelAllocationTable)
// replaces what used to be an inline `hasKm(purchase) ? bracketFor(...) :
// null` call here — every purchase this function is ever called with (every
// member of `sortedBoundaries`/`trailingNoKmEvents`) already has its bracket
// resolved there, KM-based or DATE-based per the Priority 1/2 decision tree;
// this function no longer needs to know which kind it got.
export function resolveVoyagePool(purchase, { bracketByPurchaseId, camionVoyages, linksByGasoilId, manuallyLinkedVoyageIds }) {
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

  const bracket = bracketByPurchaseId.get(purchase.id) || null
  const autoEntries = bracket
    ? autoCandidates
        .filter(v => !manuallyLinkedVoyageIds.has(v.id) && voyageInBracket(v, bracket))
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
//
// `resolvedBy` ('km' | 'date' | null — added for Priority 2 transparency,
// §11/§12) records which side of the decision tree this purchase's bracket
// came from: 'km' whenever the purchase itself has a KM reading (Priority 1,
// exactly as before), 'date' when it doesn't but chronology still resolved a
// bracket (Priority 2, the new capability), null when no bracket could be
// established at all (first-ever purchase in the truck's history — status
// stays 'waiting', unchanged meaning). `status`'s own idle/waiting split is
// unchanged: a purchase with a real KM reading is 'idle' (never 'waiting')
// even with an empty pool, exactly as before — `resolvedBy !== null` is a
// strict superset of the old `hasKm(purchase)` condition, so this can never
// regress a KM-bearing purchase's status.
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
  const bracket = ctx.bracketByPurchaseId.get(purchase.id) || null
  const resolvedBy = hasKm(purchase) ? 'km' : (bracket !== null ? 'date' : null)
  const status = voyageAllocations.length > 0
    ? (hasManualLinks ? 'manual' : 'automatic')
    : (resolvedBy !== null ? 'idle' : 'waiting')
  return { gasoilId: purchase.id, total, status, resolvedBy, voyageAllocations, allocated, remaining, fixedAmountsCapped }
}

// Runs the above for every diesel purchase of one truck, and builds the
// per-voyage reverse index computeFuelCost needs — a voyage's total fuel
// cost is the sum of its shares across every purchase it appears in (never
// just one, since a voyage may legitimately draw from several).
//
// "Purchase" here means one of two things: an aggregated same-day refuel
// event (sortedBoundaries — anything with a KM reading, full or partial,
// merged per date — Priority 1) or an aggregated same-day km-less event that
// couldn't be carried forward into a later KM-bearing purchase, so it closes
// its own DATE-anchored bracket instead (trailingNoKmEvents — Priority 2,
// §2/§6). A km-less purchase that CAN be carried forward (a KM-bearing
// purchase exists at its date or later) never gets its own entry here at
// all — its litres/cost are folded into that purchase's own total before
// this runs, and its bracket stays untouched (§1, Scenario C). Either way
// every "purchase" object exposes the same id/qte/total/adblue_total/km/date
// shape, so resolveFuelPurchaseAllocation/purchaseTotal/bracketFor need no
// branching.
export function buildCamionFuelAllocationTable({ camionGasoil, camionVoyages, voyageGasoilLinks, remiseRate }) {
  const kmBoundariesRaw = sortDieselBoundaries(camionGasoil) // aggregated, km-bearing events only — Priority 1, UNCHANGED
  const kmEventsByDate = [...kmBoundariesRaw].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)

  // ── Priority 2 — classify every km-less purchase (carried forward into a
  // later/same-date km-bearing purchase, or trailing and needing its own
  // date-anchored bracket) — see module header and the helpers above.
  const noKmEvents = aggregateDailyNoKmPurchases(camionGasoil)
  const { carryTargetByNoKmId, trailingNoKmEvents } = classifyNoKmEvents(kmEventsByDate, noKmEvents)

  const carryInByKmId = new Map()
  noKmEvents.forEach(e => {
    const target = carryTargetByNoKmId.get(e.id)
    if (!target) return
    if (!carryInByKmId.has(target.id)) carryInByKmId.set(target.id, [])
    carryInByKmId.get(target.id).push(e)
  })

  // A km-bearing purchase's own bracket/voyage-membership NEVER changes —
  // only its litres/cost grow by whatever earlier (or same-date) km-less
  // purchases carried into it. bracketFor (below) is still computed from
  // `.id`/`.km` only, both untouched by this augmentation.
  const sortedBoundaries = kmBoundariesRaw.map(ev => {
    const carried = carryInByKmId.get(ev.id)
    if (!carried || carried.length === 0) return ev
    return {
      ...ev,
      qte: ev.qte + carried.reduce((s, c) => s + c.qte, 0),
      adblue_qte: ev.adblue_qte + carried.reduce((s, c) => s + c.adblue_qte, 0),
      total: ev.total + carried.reduce((s, c) => s + c.total, 0),
      adblue_total: ev.adblue_total + carried.reduce((s, c) => s + c.adblue_total, 0),
      gasoilIds: [...ev.gasoilIds, ...carried.flatMap(c => c.gasoilIds)],
      isAggregate: true,
      carriedFrom: carried.map(c => ({ gasoilId: c.id, date: c.date, qte: c.qte })),
    }
  })

  // A manual link stores the ONE gasoil row a dispatcher picked, but that
  // row may now be a member of a same-day aggregate (km-bearing OR, new,
  // carried-forward km-less) — resolve it to that aggregate's canonical id
  // so the link draws from the full aggregated total, not just this one
  // row's own slice (see module header).
  const eventIdForRow = new Map()
  sortedBoundaries.forEach(ev => ev.gasoilIds.forEach(gid => eventIdForRow.set(gid, ev.id)))
  trailingNoKmEvents.forEach(ev => ev.gasoilIds.forEach(gid => eventIdForRow.set(gid, ev.id)))

  // Bracket per purchase id — km-bearing purchases keep using the untouched
  // km-only bracketFor (Priority 1, byte-identical to before this feature).
  // Trailing km-less purchases get a NEW date-anchored bracket (Priority 2),
  // chained off whichever boundary (km- or date-anchored) precedes them.
  const bracketByPurchaseId = new Map()
  sortedBoundaries.forEach(ev => bracketByPurchaseId.set(ev.id, bracketFor(ev, sortedBoundaries)))
  trailingNoKmEvents.forEach((ev, i) => {
    const prev = i === 0 ? (sortedBoundaries[sortedBoundaries.length - 1] || null) : trailingNoKmEvents[i - 1]
    bracketByPurchaseId.set(ev.id, dateBracketFor(prev, ev))
  })

  const purchases = [...sortedBoundaries, ...trailingNoKmEvents]
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

  const ctx = { bracketByPurchaseId, camionVoyages, linksByGasoilId, manuallyLinkedVoyageIds, remiseRate }

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
        resolvedBy: a.resolvedBy,
      })
    })
  })

  // Voyages sitting in the currently OPEN period (real km, automatic mode,
  // no manual override, km_depart at/after the truck's most recent boundary)
  // — genuinely different from "no data at all": these will get a real
  // automatic cost the moment a later purchase closes their period, per
  // §7/§15 (never fabricate a real consumption figure before that). The most
  // recent boundary can now be a trailing date-anchored purchase, not only a
  // km-bearing one — same never-fabricate rule, just falling back to date
  // when that boundary itself has no km. Display-only (voyageKmFuel.js),
  // never read by computeFuelCost/profitability.js (the money contract —
  // `source: 'none'` when nothing is allocated yet — is unchanged).
  const pendingVoyageIds = new Set()
  const lastBoundary = trailingNoKmEvents.length > 0
    ? trailingNoKmEvents[trailingNoKmEvents.length - 1]
    : (sortedBoundaries[sortedBoundaries.length - 1] || null)
  if (lastBoundary) {
    const lastKm = lastBoundary.km !== null && lastBoundary.km !== undefined ? parseFloat(lastBoundary.km) : null
    ;(camionVoyages || []).filter(v => !v.deleted_at).forEach(v => {
      if ((v.fuel_mode || 'automatic') !== 'automatic') return
      if (manuallyLinkedVoyageIds.has(v.id)) return
      if (!voyageHasKm(v)) return
      if (voyageFuelMap.has(v.id)) return
      const isAfter = lastKm !== null
        ? parseFloat(v.km_depart) >= lastKm
        : (v.date_depart !== null && v.date_depart !== undefined && v.date_depart >= lastBoundary.date)
      if (isAfter) pendingVoyageIds.add(v.id)
    })
  }

  return { allocations, voyageFuelMap, voyageContributions, pendingVoyageIds, purchasesById, eventIdForRow }
}
