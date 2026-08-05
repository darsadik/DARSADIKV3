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

// ── Fuel: purchase-scoped, distance-proportional allocation ─────────────────
// See lib/services/fuelAllocation.js for the actual engine (single source of
// truth for both automatic bracket detection AND manual voyage_gasoil links —
// same distribution formula either way). This module only picks which of the
// voyage's fuel_mode branches applies and, for 'automatic', looks this
// voyage's share up in that engine's output.
import { buildCamionFuelAllocationTable } from './fuelAllocation'

// Manual fallback: distance × cost/km, both typed by hand when the odometer
// chain can't produce a distance (missing reading, broken sequence, etc).
export function manualRateFuelCost(voyage) {
  const dist = parseFloat(voyage?.manual_distance_km) || 0
  const rate = parseFloat(voyage?.manual_cost_per_km) || 0
  if (dist <= 0 || rate <= 0) return null
  return Math.round(dist * rate * 100) / 100
}

// voyage.fuel_mode selects the ONE source used for this voyage's fuel cost —
// never combined. 'manual_rate'/'manual_amount' are explicit, fully
// independent user overrides (see FuelModeSection) and never enter the
// allocation engine at all. Every other voyage — 'automatic' (the default,
// and every legacy voyage with fuel_mode = null), 'manual_km' (a manually-
// typed approximate distance), and 'manual_fixed' (a manually-typed fixed
// DHS slice) — reads its share straight out of buildCamionFuelAllocationTable.
// That table already resolved, for every purchase of this truck, whether
// each voyage is covered by an automatic bracket or a manual voyage_gasoil
// link (manual always wins, and 'manual_km'/'manual_fixed' can only ever
// join a pool via a manual link — see fuelAllocation.js:poolEntryForVoyage),
// and split each purchase's total across its voyages accordingly. A
// voyage's total cost here is the sum of its shares across every purchase
// it appears in (normally one, but legitimately more than one if it
// refueled mid-trip via manual links).
export function computeFuelCost(voyage, camionRefills, camionVoyages, voyageGasoilLinks, remiseRate = DEFAULT_REMISE_CARBURANT_RATE) {
  if (!voyage) return { cost: 0, source: 'none' }
  const mode = voyage.fuel_mode || 'automatic'
  if (mode === 'manual_amount') {
    return { cost: parseFloat(voyage.manual_fuel_cost) || 0, source: 'manual_amount' }
  }
  if (mode === 'manual_rate') {
    const cost = manualRateFuelCost(voyage)
    return { cost: cost ?? 0, source: cost !== null ? 'manual_rate' : 'none' }
  }
  const table = buildCamionFuelAllocationTable({
    camionGasoil: camionRefills, camionVoyages, voyageGasoilLinks, remiseRate,
  })
  const cost = Math.round((table.voyageFuelMap.get(voyage.id) || 0) * 100) / 100
  if (cost <= 0) return { cost: 0, source: 'none' }
  const isManual = (voyageGasoilLinks || []).some(l => l.voyage_id === voyage.id)
  return { cost, source: isManual ? 'manuel' : 'automatic' }
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
  camionRefills = [], camionVoyages = [], voyageGasoilLinks = [], remiseRate = DEFAULT_REMISE_CARBURANT_RATE,
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

  const { cost: fuel, source: fuelSource } = computeFuelCost(voyage, camionRefills, camionVoyages, voyageGasoilLinks, remiseRate)
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
