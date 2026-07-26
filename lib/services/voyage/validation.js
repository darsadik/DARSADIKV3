// ── Voyage Validation — data-integrity check, advisory only ────────────────
// Pure, read-only comparison of purchased vs delivered quantity per product
// type on a single voyage. Never touches profit/WAC/accounting — it only
// helps an operator spot a mistyped type_brique or a forgotten achat/
// livraison before it becomes an accounting error.
//
// Grouping mirrors the WAC engine's key exactly (lib/services/profitability.js
// wacTypeKey): type_brique_id when present on both sides, else falls back to
// the type_brique name. This guarantees a mismatch shown here always
// corresponds to the same bucket the WAC engine used for costing.
function groupKey(type_produit, type_brique_id, type_brique) {
  return type_brique_id ? `${type_produit}::id:${type_brique_id}` : `${type_produit}::name:${type_brique}`
}

// 'perfect' | 'remaining' (unused purchase, info only) | 'exceeds' (delivered > purchased) | 'no_purchase' (delivery with zero matching achat)
export function computeVoyageValidation(achats = [], livraisons = []) {
  const table = new Map()
  function ensure(type_produit, type_brique_id, type_brique) {
    const key = groupKey(type_produit, type_brique_id, type_brique)
    if (!table.has(key)) {
      table.set(key, { key, type_produit, type_brique_id: type_brique_id || null, type_brique, achatQte: 0, deliveredQte: 0 })
    }
    return table.get(key)
  }

  ;(achats || []).forEach(a => {
    ensure(a.type_produit, a.type_brique_id, a.type_brique).achatQte += a.qte || 0
  })
  ;(livraisons || []).forEach(l => {
    ensure(l.type_produit, l.type_brique_id, l.type_brique).deliveredQte += l.qte || 0
  })

  return Array.from(table.values())
    .map(row => {
      const diff = Math.round((row.deliveredQte - row.achatQte) * 100) / 100
      let status
      if (row.achatQte === 0 && row.deliveredQte > 0) status = 'no_purchase'
      else if (diff > 0)                              status = 'exceeds'
      else if (diff < 0)                              status = 'remaining'
      else                                             status = 'perfect'
      return { ...row, diff, status }
    })
    .sort((a, b) => (a.type_brique || '').localeCompare(b.type_brique || ''))
}
