// ── Voyage Validation — data-integrity check, advisory only ────────────────
// Pure, read-only comparison of purchased vs delivered quantity per product
// type on a single voyage. Never touches profit/WAC/accounting — it only
// helps an operator spot a mistyped type_brique or a forgotten achat/
// livraison before it becomes an accounting error.
//
// Grouping reuses the profitability engine's own resolveTypeEntry (see
// lib/services/profitability.js) instead of re-deriving a matching rule —
// this guarantees a mismatch shown here always corresponds to the same
// bucket the WAC engine used for costing, with no independent grouping logic.
import { resolveTypeEntry, normalizeTypeName } from '../profitability'

// 'perfect' | 'remaining' (unused purchase, info only) | 'exceeds' (delivered > purchased) | 'no_purchase' (delivery with zero matching achat)
export function computeVoyageValidation(achats = [], livraisons = []) {
  const table = new Map()
  const createEntry = (type_produit, type_brique_id, type_brique) =>
    ({ type_produit, type_brique_id: type_brique_id || null, type_brique, achatQte: 0, deliveredQte: 0 })

  ;(achats || []).forEach(a => {
    resolveTypeEntry(table, a.type_produit, a.type_brique_id, a.type_brique, createEntry).achatQte += a.qte || 0
  })
  ;(livraisons || []).forEach(l => {
    resolveTypeEntry(table, l.type_produit, l.type_brique_id, l.type_brique, createEntry).deliveredQte += l.qte || 0
  })

  const seen = new Set()
  const rows = []
  table.forEach(entry => {
    if (seen.has(entry)) return
    seen.add(entry)
    rows.push(entry)
  })

  return rows
    .map(row => {
      const diff = Math.round((row.deliveredQte - row.achatQte) * 100) / 100
      let status
      if (row.achatQte === 0 && row.deliveredQte > 0) status = 'no_purchase'
      else if (diff > 0)                              status = 'exceeds'
      else if (diff < 0)                              status = 'remaining'
      else                                             status = 'perfect'
      const key = `${row.type_produit}::${row.type_brique_id ? `id:${row.type_brique_id}` : `name:${normalizeTypeName(row.type_brique)}`}`
      return { ...row, key, diff, status }
    })
    .sort((a, b) => (a.type_brique || '').localeCompare(b.type_brique || ''))
}

// Same classification ValidationPanel uses to color itself, exposed so
// other pages (Review Mode's summary badge) can reuse it instead of
// re-deriving it. Additive-only — ValidationPanel's own logic is untouched.
// 'ok' | 'warning' | 'error'
export function voyageValidationStatus(rows = []) {
  const hasError   = rows.some(r => r.status === 'no_purchase' || r.status === 'exceeds')
  const hasWarning = !hasError && rows.some(r => r.status === 'remaining')
  return hasError ? 'error' : hasWarning ? 'warning' : 'ok'
}
