// ── Traçabilité Fournisseur Brique — audit achats → livraisons ──────────────
// Fonctions pures, lecture seule. Ne modifie et ne recalcule RIEN de ce qui est
// déjà utilisé pour les voyages / la comptabilité / le solde client / la
// rentabilité — elle lit les mêmes tables (`voyage_achats`, `voyage_livraisons`)
// et produit des agrégats séparés, uniquement pour cet outil de contrôle.
//
// Principe de rapprochement : un achat (voyage_id + type_brique) est comparé
// aux livraisons du MÊME voyage portant le MÊME type_brique. Il n'existe pas
// de clé étrangère directe entre une ligne d'achat et une ligne de livraison
// dans le schéma actuel — ce rapprochement (voyage_id, type_brique) est la
// seule correspondance disponible.

const EPSILON = 0.005

const norm = s => (s || '').trim().toUpperCase()

export function traceStatus(diff) {
  if (Math.abs(diff) < EPSILON) return 'ok'
  return diff < 0 ? 'reste' : 'depassement'
}

export const TRACE_STATUS_META = {
  ok:          { emoji: '✅', label: 'Tout est distribué', color: '#16a34a', bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100' },
  reste:       { emoji: '⚠️', label: 'Quantité restante',  color: '#d97706', bg: 'bg-amber-50',   text: 'text-amber-600',   ring: 'ring-amber-100' },
  depassement: { emoji: '❌', label: 'Dépassement',        color: '#dc2626', bg: 'bg-red-50',     text: 'text-red-600',     ring: 'ring-red-100' },
}

// Pour chaque achat, retrouve les livraisons du même voyage/produit et les
// regroupe par client.
export function buildAchatTraceability(voyageAchats, voyageLivraisons) {
  return (voyageAchats || []).map(a => {
    const key = norm(a.type_brique)
    const matched = (voyageLivraisons || []).filter(
      l => l.voyage_id === a.voyage_id && norm(l.type_brique) === key
    )

    const byClient = {}
    matched.forEach(l => {
      const nom = l.client_nom || '—'
      byClient[nom] = (byClient[nom] || 0) + (l.qte || 0)
    })
    const repartition = Object.entries(byClient)
      .map(([client_nom, qte]) => ({ client_nom, qte }))
      .sort((x, y) => y.qte - x.qte)

    const totalDistribue = Math.round(repartition.reduce((s, r) => s + r.qte, 0) * 1000) / 1000
    const diff = Math.round((totalDistribue - (a.qte || 0)) * 1000) / 1000

    return {
      ...a,
      repartition,
      totalDistribue,
      diff,
      status: traceStatus(diff),
    }
  })
}

// Récapitulatif par type de brique — quantité achetée vs distribuée, sans
// double-compter les livraisons quand plusieurs achats partagent le même
// couple (voyage, type_brique).
export function buildProductSummary(voyageAchats, voyageLivraisons) {
  const byProduct = {}
  const seenVoyageProduct = new Set()

  ;(voyageAchats || []).forEach(a => {
    const key = norm(a.type_brique)
    if (!byProduct[key]) byProduct[key] = { label: a.type_brique || '—', achete: 0, distribue: 0 }
    byProduct[key].achete += a.qte || 0

    const vpKey = `${a.voyage_id}::${key}`
    if (!seenVoyageProduct.has(vpKey)) {
      seenVoyageProduct.add(vpKey)
      byProduct[key].distribue += (voyageLivraisons || [])
        .filter(l => l.voyage_id === a.voyage_id && norm(l.type_brique) === key)
        .reduce((s, l) => s + (l.qte || 0), 0)
    }
  })

  return Object.values(byProduct)
    .map(p => {
      const achete = Math.round(p.achete * 1000) / 1000
      const distribue = Math.round(p.distribue * 1000) / 1000
      const ecart = Math.round((distribue - achete) * 1000) / 1000
      return { ...p, achete, distribue, ecart, status: traceStatus(ecart) }
    })
    .sort((a, b) => b.achete - a.achete)
}

export function buildGrandTotal(productSummary) {
  const totalAchete = Math.round((productSummary || []).reduce((s, p) => s + p.achete, 0) * 1000) / 1000
  const totalDistribue = Math.round((productSummary || []).reduce((s, p) => s + p.distribue, 0) * 1000) / 1000
  const ecart = Math.round((totalDistribue - totalAchete) * 1000) / 1000
  return { totalAchete, totalDistribue, ecart, status: traceStatus(ecart) }
}
