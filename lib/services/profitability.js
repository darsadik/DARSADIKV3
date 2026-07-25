// ── Profitability engine — single source of truth ───────────────────────────
// Pure functions only (no Supabase, no React). Callers fetch rows themselves
// and pass them in already scoped to the voyage(s) being computed.
//
// Profit is measured per voyage:
//   Revenue = brique sales + grignon sales + retour amount + charges billed to clients
//   Cost    = brique purchases + grignon purchases + fuel + truck rental + operational charges
//   Profit  = Revenue − Cost
// Payments never affect this — they only affect client balances (untouched here).

// ── Fuel: km-based "full-to-full" allocation ────────────────────────────────
// Finds the refill at/before the voyage's departure km and the next refill
// after it; the voyage's distance is costed at that fuel cycle's rate.
export function kmFuelCost(voyage, camionRefills) {
  if (!voyage?.km_depart || !voyage?.km_arrivee) return null
  const vKm = parseFloat(voyage.km_arrivee) - parseFloat(voyage.km_depart)
  if (vKm <= 0) return null
  const refills = camionRefills || []
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
  return Math.round(vKm * (g1.total || 0) / cycleKm * 100) / 100
}

// Falls back to the sum of gasoil "pleins" manually linked to the voyage
// when km-based allocation isn't available (missing km, insufficient history).
export function computeFuelCost(voyage, camionRefills, voyageGasoilRows) {
  const km = kmFuelCost(voyage, camionRefills)
  if (km !== null) return { cost: km, source: 'km' }
  const manuel = (voyageGasoilRows || []).reduce((s, g) => s + (g.total || 0), 0)
  return { cost: manuel, source: manuel > 0 ? 'manuel' : 'none' }
}

// ── Weighted Average Cost per brick type, scoped to one voyage ─────────────
// Grouping key is `type_produit::type_brique` (text match — type_brique_id is
// not persisted on voyage_achats/voyage_livraisons by the current save code).
// Grignon achats/livraisons both use the literal type_brique 'Grignon', so
// they land in their own single bucket automatically.
//
// wacPrice = purchase cost of that type on this voyage / DELIVERED qty of
// that type on this voyage (not purchased qty). This denominator is chosen
// deliberately so that summing every delivery's imputed cost for a type
// reproduces that type's total purchase cost exactly, with no residual —
// which is what lets per-client profit sum exactly to voyage profit.
export function computeWACTable(achats, livraisons) {
  const table = new Map()
  function ensure(type_produit, type_brique) {
    const key = `${type_produit}::${type_brique}`
    if (!table.has(key)) {
      table.set(key, { type_produit, type_brique, achatCost: 0, achatQte: 0, deliveredQte: 0, wacPrice: null })
    }
    return table.get(key)
  }
  ;(achats || []).forEach(a => {
    const entry = ensure(a.type_produit, a.type_brique)
    entry.achatCost += a.total_achat || 0
    entry.achatQte  += a.qte || 0
  })
  // Only accumulate delivered qty for types that have at least one purchase
  // recorded — a delivery type with zero achats must stay absent from the
  // table (not a 0/qty = 0 entry) so costForDelivery reports it as undetermined.
  ;(livraisons || []).forEach(l => {
    const entry = table.get(`${l.type_produit}::${l.type_brique}`)
    if (entry) entry.deliveredQte += l.qte || 0
  })
  table.forEach(entry => {
    entry.wacPrice = entry.deliveredQte > 0 ? entry.achatCost / entry.deliveredQte : null
  })
  return table
}

// Cost = 0 and undetermined = true when this delivery's type has no matching
// purchase (or zero delivered qty overall for that type) on this voyage —
// per business rule, never falls back to a manual/historical price.
export function costForDelivery(livraisonRow, wacTable) {
  const key = `${livraisonRow.type_produit}::${livraisonRow.type_brique}`
  const entry = wacTable.get(key)
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
  camionRefills = [], voyageGasoilRows = [],
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

  const { cost: fuel, source: fuelSource } = computeFuelCost(voyage, camionRefills, voyageGasoilRows)
  const rental                 = locations.reduce((s, l) => s + (l.montant_location || 0), 0)
  const chargesOperationnelles = charges.filter(c => !c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)

  const wacTable = computeWACTable(achats, livraisons)
  const warnings = []
  let achatUnallocated = 0
  wacTable.forEach(entry => {
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
    return {
      key: c.key, type_produit: c.type_produit, client_id: c.client_id, client_nom: c.client_nom,
      qte: c.qte, briqueQte: c.briqueQte, briqueShare: share,
      revenue: { ventes: c.ventes, chargesFacturees: c.chargesFacturees, total: revTotal },
      cost: { achatWAC: c.achatWAC, fuelAllocated, rentalAllocated, chargesAllocated, total: costTotalClient },
      profit: revTotal - costTotalClient,
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
