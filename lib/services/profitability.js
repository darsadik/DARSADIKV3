// ── Profitability engine — single source of truth ───────────────────────────
// Pure functions only (no Supabase, no React). Callers fetch rows themselves
// and pass them in already scoped to the voyage(s) being computed.
//
// Profit is measured per voyage:
//   Revenue = brique sales + grignon sales + retour amount + charges billed to clients
//   Cost    = brique purchases + grignon purchases + fuel + truck rental + operational charges
//   Profit  = Revenue − Cost
// Payments never affect this — they only affect client balances (untouched here).

// ── Remise Carburant — supplier volume discount on GASOIL litres only ───────
// Never applies to AdBlue. Configurable in Settings (app_settings row
// 'remise_carburant_rate'); this is only the fallback used when a caller
// doesn't fetch/pass the configured value.
export const DEFAULT_REMISE_CARBURANT_RATE = 0.10

// ── Fuel: km-based "full-to-full" allocation ────────────────────────────────
// Finds the refill at/before the voyage's departure km and the next refill
// after it; the voyage's distance is costed at that fuel cycle's rate.
// Fuel cycle cost = diesel total (net of Remise Carburant) + AdBlue total of
// the starting refill (g1) — AdBlue is bought together with diesel on the
// same plein, so it rides along with g1's cost the same way diesel does, and
// never receives the discount. adblue_total is 0/undefined on every plein
// that never records AdBlue, so that term is a no-op then.
export function kmFuelCost(voyage, camionRefills, remiseRate = DEFAULT_REMISE_CARBURANT_RATE) {
  if (!voyage?.km_depart || !voyage?.km_arrivee) return null
  const vKm = parseFloat(voyage.km_arrivee) - parseFloat(voyage.km_depart)
  if (vKm <= 0) return null
  // Only real Diesel refills (qte > 0) may open/close a fuel cycle — an
  // AdBlue-only row (qte === 0) still costs money but must never become g1/g2.
  const refills = (camionRefills || []).filter(g => (g.qte || 0) > 0)
  if (refills.length < 2) return null
  const sorted = [...refills].sort((a, b) => parseFloat(a.km) - parseFloat(b.km))
  const vStart = parseFloat(voyage.km_depart)
  let fillIdx = -1
  for (let i = 0; i < sorted.length; i++) {
    if (parseFloat(sorted[i].km) <= vStart) fillIdx = i
  }
  if (fillIdx < 0 || fillIdx >= sorted.length - 1) return null
  const g1 = sorted[fillIdx], g2 = sorted[fillIdx + 1]
  const cycleKm = parseFloat(g2.km) - parseFloat(g1.km)
  if (cycleKm <= 0) return null
  const dieselNet = Math.max(0, (g1.total || 0) - (g1.qte || 0) * remiseRate)
  const cycleCost = dieselNet + (g1.adblue_total || 0)
  return Math.round(vKm * cycleCost / cycleKm * 100) / 100
}

// Display-only helper for the Voyage KM & Fuel Manager (pages/voyages/km-carburant.js) —
// mirrors kmFuelCost()'s bracket-selection (same sort, same fillIdx scan) so
// the "linked fill" shown to the user can never disagree with the cost
// kmFuelCost() actually used. Never called by kmFuelCost/computeFuelCost
// itself — purely additive, the money path above is untouched.
export function findAutomaticFuelBracket(voyage, camionRefills) {
  if (!voyage?.km_depart || !voyage?.km_arrivee) return null
  // Same Diesel-only guard as kmFuelCost — must never disagree with it.
  const refills = (camionRefills || []).filter(g => (g.qte || 0) > 0)
  if (refills.length < 2) return null
  const sorted = [...refills].sort((a, b) => parseFloat(a.km) - parseFloat(b.km))
  const vStart = parseFloat(voyage.km_depart)
  let fillIdx = -1
  for (let i = 0; i < sorted.length; i++) {
    if (parseFloat(sorted[i].km) <= vStart) fillIdx = i
  }
  if (fillIdx < 0 || fillIdx >= sorted.length - 1) return null
  return { g1: sorted[fillIdx], g2: sorted[fillIdx + 1] }
}

// Manual fallback: distance × cost/km, both typed by hand when the odometer
// chain can't produce a distance (missing reading, broken sequence, etc).
export function manualRateFuelCost(voyage) {
  const dist = parseFloat(voyage?.manual_distance_km) || 0
  const rate = parseFloat(voyage?.manual_cost_per_km) || 0
  if (dist <= 0 || rate <= 0) return null
  return Math.round(dist * rate * 100) / 100
}

// voyage.fuel_mode selects the ONE source used for this voyage's fuel cost —
// never combined. 'manual_rate'/'manual_amount' are explicit user choices
// (see FuelModeSection); 'automatic' (default, and every legacy voyage with
// fuel_mode = null) tries km-based allocation first, then falls back to the
// sum of gasoil "pleins" manually linked to the voyage. remiseRate nets out
// of both the 'automatic' path (kmFuelCost) AND the manual-link fallback
// below, so the two never disagree on the same litres — only 'manual_rate'/
// 'manual_amount' are untouched, since those are explicit user-typed overrides.
export function computeFuelCost(voyage, camionRefills, voyageGasoilRows, remiseRate = DEFAULT_REMISE_CARBURANT_RATE) {
  const mode = voyage?.fuel_mode || 'automatic'
  if (mode === 'manual_amount') {
    return { cost: parseFloat(voyage?.manual_fuel_cost) || 0, source: 'manual_amount' }
  }
  if (mode === 'manual_rate') {
    const cost = manualRateFuelCost(voyage)
    return { cost: cost ?? 0, source: cost !== null ? 'manual_rate' : 'none' }
  }
  const km = kmFuelCost(voyage, camionRefills, remiseRate)
  if (km !== null) return { cost: km, source: 'automatic' }
  const manuel = (voyageGasoilRows || []).reduce((s, g) =>
    s + Math.max(0, (g.total || 0) - (g.qte_litres || 0) * remiseRate), 0)
  return { cost: manuel, source: manuel > 0 ? 'manuel' : 'none' }
}

// ── Shared brick-type grouping — the ONLY way anywhere in the app to decide
// "these achat/livraison rows are the same brick type" (used by the WAC
// table below AND by the Validation Panel, lib/services/voyage/validation.js).
// Match by type_brique_id when present (stable — survives a type_brique
// being renamed later). A row with no type_brique_id (legacy data saved
// before the column existed) joins whichever bucket already claims its
// normalized type_brique name. Every entry is registered under BOTH its id
// alias and its name alias (once known), so a later row finds the same
// bucket via either alias regardless of which side (achat/livraison) or
// order rows are processed in — this is what prevents a single brick type
// from splitting into two rows when only one side has type_brique_id set.
// Grignon achats/livraisons both use the literal type_brique 'Grignon' with
// no type_brique_id, so they always land in their own single bucket via the
// name alias, same as before.
export function normalizeTypeName(name) {
  return (name || '').trim().toLowerCase()
}

function typeAliasKeys(type_produit, type_brique_id, type_brique) {
  const keys = []
  if (type_brique_id) keys.push(`${type_produit}::id:${type_brique_id}`)
  const normName = normalizeTypeName(type_brique)
  if (normName) keys.push(`${type_produit}::name:${normName}`)
  return keys
}

// Finds (or creates via `createEntry`) the shared bucket for one row's brick
// type inside `table`, registering every alias so future lookups land on the
// same object. Returns null when `createEntry` is omitted and no existing
// bucket matches (lookup-only calls, e.g. costForDelivery).
export function resolveTypeEntry(table, type_produit, type_brique_id, type_brique, createEntry) {
  const keys = typeAliasKeys(type_produit, type_brique_id, type_brique)
  let entry = null
  for (const k of keys) { if (table.has(k)) { entry = table.get(k); break } }
  if (!entry) {
    if (!createEntry) return null
    entry = createEntry(type_produit, type_brique_id, type_brique)
  } else if (!entry.type_brique_id && type_brique_id) {
    entry.type_brique_id = type_brique_id
  }
  keys.forEach(k => table.set(k, entry))
  return entry
}

// wacPrice = purchase cost of that type on this voyage / DELIVERED qty of
// that type on this voyage (not purchased qty). This denominator is chosen
// deliberately so that summing every delivery's imputed cost for a type
// reproduces that type's total purchase cost exactly, with no residual —
// which is what lets per-client profit sum exactly to voyage profit.
export function computeWACTable(achats, livraisons) {
  const table = new Map()
  const createEntry = (type_produit, type_brique_id, type_brique) =>
    ({ type_produit, type_brique_id: type_brique_id || null, type_brique, achatCost: 0, achatQte: 0, deliveredQte: 0, wacPrice: null })
  ;(achats || []).forEach(a => {
    const entry = resolveTypeEntry(table, a.type_produit, a.type_brique_id, a.type_brique, createEntry)
    entry.achatCost += a.total_achat || 0
    entry.achatQte  += a.qte || 0
  })
  // Only accumulate delivered qty for types that have at least one purchase
  // recorded — a delivery type with zero achats must stay absent from the
  // table (not a 0/qty = 0 entry) so costForDelivery reports it as undetermined.
  ;(livraisons || []).forEach(l => {
    const entry = resolveTypeEntry(table, l.type_produit, l.type_brique_id, l.type_brique)
    if (entry) entry.deliveredQte += l.qte || 0
  })
  const seen = new Set()
  table.forEach(entry => {
    if (seen.has(entry)) return
    seen.add(entry)
    entry.wacPrice = entry.deliveredQte > 0 ? entry.achatCost / entry.deliveredQte : null
  })
  return table
}

// Cost = 0 and undetermined = true when this delivery's type has no matching
// purchase (or zero delivered qty overall for that type) on this voyage —
// per business rule, never falls back to a manual/historical price.
export function costForDelivery(livraisonRow, wacTable) {
  const entry = resolveTypeEntry(wacTable, livraisonRow.type_produit, livraisonRow.type_brique_id, livraisonRow.type_brique)
  if (!entry || entry.wacPrice === null) return { cost: 0, undetermined: true }
  return { cost: (livraisonRow.qte || 0) * entry.wacPrice, undetermined: false }
}

// ── Shared allocator — the ONLY split rule for fuel, rental, and operational
// charges. Allocated strictly by brique quantity share; grignon never carries
// any share of truck-level costs. No equal-split fallback: a voyage with zero
// brique quantity simply allocates 0 to every client for these three costs.
export function briqueQtyShare(clientBriqueQte, totalBriqueQteVoyage) {
  if (!totalBriqueQteVoyage || totalBriqueQteVoyage <= 0) return 0
  return (clientBriqueQte || 0) / totalBriqueQteVoyage
}

// clients.id and grignon_clients.id are independent sequences that can
// collide — always key client aggregation on (type_produit, client_id),
// never client_id alone.
export function clientKey(type_produit, client_id) {
  return `${type_produit}:${client_id}`
}

// ── Main entry point: one voyage ────────────────────────────────────────────
export function computeVoyageProfit({
  voyage, achats = [], livraisons = [], charges = [], retours = [], locations = [],
  camionRefills = [], voyageGasoilRows = [], remiseRate = DEFAULT_REMISE_CARBURANT_RATE,
}) {
  const briqueLivs    = livraisons.filter(l => l.type_produit !== 'grignon')
  const grignonLivs   = livraisons.filter(l => l.type_produit === 'grignon')
  const briqueAchats  = achats.filter(a => a.type_produit !== 'grignon')
  const grignonAchats = achats.filter(a => a.type_produit === 'grignon')

  const briqueSales      = briqueLivs.reduce((s, l) => s + (l.total_vente || 0) + (l.frais_total || 0), 0)
  const grignonSales     = grignonLivs.reduce((s, l) => s + (l.total_vente || 0) + (l.frais_total || 0), 0)
  const retoursTotal     = retours.reduce((s, r) => s + (r.montant || 0), 0)
  const chargesFacturees = charges.filter(c => c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)
  const revenueTotal     = briqueSales + grignonSales + retoursTotal + chargesFacturees

  const briqueAchatTotal  = briqueAchats.reduce((s, a) => s + (a.total_achat || (a.qte || 0) * (a.prix_achat || 0)), 0)
  const grignonAchatTotal = grignonAchats.reduce((s, a) => s + (a.total_achat || (a.qte || 0) * (a.prix_achat || 0)), 0)
  const achatTotal        = briqueAchatTotal + grignonAchatTotal

  const { cost: fuel, source: fuelSource } = computeFuelCost(voyage, camionRefills, voyageGasoilRows, remiseRate)
  const rental                 = locations.reduce((s, l) => s + (l.montant_location || 0), 0)
  const chargesOperationnelles = charges.filter(c => !c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)

  const wacTable = computeWACTable(achats, livraisons)
  const warnings = []
  let achatUnallocated = 0
  const seenWacEntries = new Set()
  wacTable.forEach(entry => {
    if (seenWacEntries.has(entry)) return
    seenWacEntries.add(entry)
    if (entry.deliveredQte === 0 && entry.achatCost > 0) {
      achatUnallocated += entry.achatCost
      warnings.push({
        type: 'achat_without_delivery', type_produit: entry.type_produit, type_brique: entry.type_brique,
        qte: entry.achatQte, total_achat: entry.achatCost,
      })
    }
  })

  const costTotal = achatTotal + fuel + rental + chargesOperationnelles
  const profit    = revenueTotal - costTotal
  const marge     = revenueTotal > 0 ? Math.round(profit / revenueTotal * 100) : 0

  const totalBriqueQteVoyage = briqueLivs.reduce((s, l) => s + (l.qte || 0), 0)

  // ── per-client aggregation ──
  const cliMap = new Map()
  function ensureClient(type_produit, client_id, client_nom) {
    const key = clientKey(type_produit, client_id)
    if (!cliMap.has(key)) {
      cliMap.set(key, {
        key, type_produit, client_id, client_nom,
        qte: 0, briqueQte: 0, ventes: 0, chargesFacturees: 0,
        achatWAC: 0, hasUndeterminedCost: false,
      })
    }
    return cliMap.get(key)
  }

  livraisons.forEach(l => {
    if (!l.client_id) return
    const c = ensureClient(l.type_produit, l.client_id, l.client_nom)
    c.qte += (l.qte || 0)
    if (l.type_produit !== 'grignon') c.briqueQte += (l.qte || 0)
    c.ventes += (l.total_vente || 0) + (l.frais_total || 0)
    const { cost, undetermined } = costForDelivery(l, wacTable)
    c.achatWAC += cost
    if (undetermined) {
      c.hasUndeterminedCost = true
      warnings.push({
        type: 'delivery_cost_undetermined', type_produit: l.type_produit, type_brique: l.type_brique,
        client_id: l.client_id, client_nom: l.client_nom, qte: l.qte,
      })
    }
  })

  // Charges billed to a client are always attributed to a brique client
  // (voyage_charges.client_id only ever references `clients`, never grignon_clients).
  charges.filter(c => c.facture_client && c.client_id).forEach(c => {
    const cli = ensureClient('brique', c.client_id, c.client_nom)
    cli.chargesFacturees += (c.montant || 0)
  })

  const clients = Array.from(cliMap.values()).map(c => {
    const share             = briqueQtyShare(c.briqueQte, totalBriqueQteVoyage)
    const fuelAllocated      = fuel * share
    const rentalAllocated    = rental * share
    const chargesAllocated   = chargesOperationnelles * share
    const revTotal           = c.ventes + c.chargesFacturees
    const costTotalClient    = c.achatWAC + fuelAllocated + rentalAllocated + chargesAllocated
    const profitClient       = revTotal - costTotalClient
    return {
      key: c.key, type_produit: c.type_produit, client_id: c.client_id, client_nom: c.client_nom,
      qte: c.qte, briqueQte: c.briqueQte, briqueShare: share,
      revenue: { ventes: c.ventes, chargesFacturees: c.chargesFacturees, total: revTotal },
      cost: { achatWAC: c.achatWAC, fuelAllocated, rentalAllocated, chargesAllocated, total: costTotalClient },
      profit: profitClient,
      // Same formula as the voyage-level marge above — this field was
      // previously missing here, which is what made per-client rows in the
      // "Par Client" drill-down always show 0% regardless of actual profit.
      marge: revTotal > 0 ? Math.round(profitClient / revTotal * 100) : 0,
      hasUndeterminedCost: c.hasUndeterminedCost,
    }
  })

  return {
    voyageId: voyage?.id,
    revenue: { briqueSales, grignonSales, retours: retoursTotal, chargesFacturees, total: revenueTotal },
    cost: {
      briqueAchat: briqueAchatTotal, grignonAchat: grignonAchatTotal, achatTotal, achatUnallocated,
      fuel, fuelSource, rental, chargesOperationnelles, total: costTotal,
    },
    profit, marge, totalBriqueQteVoyage,
    clients,
    warnings,
  }
}

// ── Aggregate voyage-level totals across many voyages (Rentabilité global/
// month/camion views, Dashboard). ────────────────────────────────────────────
export function aggregateVoyageProfits(results = []) {
  const sum = fn => results.reduce((s, r) => s + fn(r), 0)
  const revenue = {
    briqueSales:      sum(r => r.revenue.briqueSales),
    grignonSales:     sum(r => r.revenue.grignonSales),
    retours:          sum(r => r.revenue.retours),
    chargesFacturees: sum(r => r.revenue.chargesFacturees),
    total:            sum(r => r.revenue.total),
  }
  const cost = {
    briqueAchat:            sum(r => r.cost.briqueAchat),
    grignonAchat:           sum(r => r.cost.grignonAchat),
    achatTotal:             sum(r => r.cost.achatTotal),
    achatUnallocated:       sum(r => r.cost.achatUnallocated),
    fuel:                   sum(r => r.cost.fuel),
    rental:                 sum(r => r.cost.rental),
    chargesOperationnelles: sum(r => r.cost.chargesOperationnelles),
    total:                  sum(r => r.cost.total),
  }
  const profit = revenue.total - cost.total
  const marge  = revenue.total > 0 ? Math.round(profit / revenue.total * 100) : 0
  return { revenue, cost, profit, marge, warnings: results.flatMap(r => r.warnings) }
}

// ── Aggregate per-client rows across many voyages (all "Par client" views). ──
export function aggregateClientProfits(results = []) {
  const map = new Map()
  results.forEach(r => {
    r.clients.forEach(c => {
      if (!map.has(c.key)) {
        map.set(c.key, {
          key: c.key, type_produit: c.type_produit, client_id: c.client_id, client_nom: c.client_nom,
          qte: 0, briqueQte: 0,
          revenue: { ventes: 0, chargesFacturees: 0, total: 0 },
          cost: { achatWAC: 0, fuelAllocated: 0, rentalAllocated: 0, chargesAllocated: 0, total: 0 },
          hasUndeterminedCost: false,
        })
      }
      const acc = map.get(c.key)
      acc.qte                       += c.qte
      acc.briqueQte                 += c.briqueQte
      acc.revenue.ventes            += c.revenue.ventes
      acc.revenue.chargesFacturees  += c.revenue.chargesFacturees
      acc.revenue.total             += c.revenue.total
      acc.cost.achatWAC             += c.cost.achatWAC
      acc.cost.fuelAllocated        += c.cost.fuelAllocated
      acc.cost.rentalAllocated      += c.cost.rentalAllocated
      acc.cost.chargesAllocated     += c.cost.chargesAllocated
      acc.cost.total                += c.cost.total
      if (c.hasUndeterminedCost) acc.hasUndeterminedCost = true
      if (!acc.client_nom && c.client_nom) acc.client_nom = c.client_nom
    })
  })
  return Array.from(map.values())
    .map(c => ({
      ...c,
      profit: c.revenue.total - c.cost.total,
      marge: c.revenue.total > 0 ? Math.round((c.revenue.total - c.cost.total) / c.revenue.total * 100) : 0,
    }))
    .sort((a, b) => b.profit - a.profit)
}
