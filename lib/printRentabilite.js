// ── Rentabilité print/PDF report — grouped-by-voyage chronological ledger ───
// Presentation only: every total below is read straight off computeVoyageProfit's
// own output (results[i].revenue/.cost/.profit/.marge, already built once in
// pages/rentabilite/index.js) or off lib/services/profitability.js's own
// aggregateVoyageProfits() — nothing here recomputes revenue, cost, fuel
// allocation, or margin. The only "new" numbers are the itemized operation
// rows (one per voyage_achats/voyage_livraisons/voyage_charges/voyage_retours/
// voyage_locations row, plus the livraison's own voyage_livraison_frais
// charges/déductions unbundled the same way pages/clients/index.js's
// expandVenteEntry() does), and those are built directly from the exact same
// raw rows the engine already summed — so per-voyage they always foot to
// r.revenue.total / r.cost.total / r.profit exactly.
import { fmt, fmtMoney, fmtDate, openPrintWindow } from './utils'
import { printBaseCss, printHeader, printGeneratedDate, entityCard, summaryCards, soldeFinal } from './printLayout'
import { aggregateVoyageProfits } from './services/profitability'
import { marginTier } from '../components/profitability/MarginBadge'
import { CHARGE_CATS } from './voyage-constants'

const ACCENT = '#2563eb'

function chargeCategoryLabel(c) {
  if (c.description) return c.description
  const cat = CHARGE_CATS.find(x => x.key === c.categorie)
  return cat ? cat.label : (c.categorie || 'Charge')
}

// Sort key: real business date first (each voyage_* row carries its own
// date_achat/date_livraison/date_charge/date_retour — falls back to the
// voyage's date_depart only when a row has none, e.g. voyage_locations).
// created_at (a true cross-table timestamp) breaks same-day ties; row id is
// the final tiebreak; subOrder keeps a livraison's own frais/déduction rows
// immediately after their parent. This never reorders by type — two
// different-typed rows on the same date/time simply sort by id.
function opSortKey(op) {
  return [op.date || '9999-99-99', op.createdAt || '', String(op.id ?? 0).padStart(12, '0'), op.subOrder ?? 0]
}
function cmpOps(a, b) {
  const ka = opSortKey(a), kb = opSortKey(b)
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] < kb[i]) return -1
    if (ka[i] > kb[i]) return 1
  }
  return 0
}

// Builds the itemized, chronologically-sorted operation list for one voyage.
// `r` is one entry of `results` (raw voyage row spread with computeVoyageProfit's
// output). `ctx` holds the full (unfiltered) per-voyage-line-item arrays fetched
// by pages/rentabilite/index.js — filtered down to this voyage's rows here.
function buildVoyageOperations(r, ctx) {
  const vId = r.id
  const vDate = r.date_depart
  const ops = []

  ctx.achats.filter(a => a.voyage_id === vId).forEach(a => {
    const label = a.type_produit === 'grignon' ? 'Grignon' : (a.type_brique || 'Brique')
    ops.push({
      date: a.date_achat || vDate, createdAt: a.created_at || null, id: a.id, subOrder: 0,
      description: `Achat — ${label}${a.fournisseur_nom ? ' · ' + a.fournisseur_nom : ''}`,
      qtyDetail: `${fmt(a.qte)} × ${fmtMoney(a.prix_achat || 0)} DHS`,
      debit: a.total_achat || 0, credit: 0,
    })
  })

  ctx.livraisons.filter(l => l.voyage_id === vId).forEach(l => {
    const label = l.type_produit === 'grignon' ? 'Grignon' : (l.type_brique || 'Brique')
    const baseDate = l.date_livraison || vDate
    ops.push({
      date: baseDate, createdAt: l.created_at || null, id: l.id, subOrder: 0,
      description: `Livraison — ${label} → ${l.client_nom || '—'}`,
      qtyDetail: `${fmt(l.qte)} × ${fmtMoney(l.prix_vente || 0)} DHS`,
      debit: 0, credit: l.total_vente || 0,
    })
    ctx.livraisonFrais.filter(f => f.livraison_id === l.id).forEach((f, i) => {
      const isDed = f.kind === 'deduction'
      ops.push({
        date: baseDate, createdAt: f.created_at || l.created_at || null, id: l.id, subOrder: i + 1,
        description: `↳ ${isDed ? 'Déduction' : 'Frais'} — ${f.label}${f.note ? ' (' + f.note + ')' : ''}`,
        qtyDetail: '',
        debit: isDed ? (f.montant || 0) : 0,
        credit: isDed ? 0 : (f.montant || 0),
      })
    })
  })

  ctx.charges.filter(c => c.voyage_id === vId).forEach(c => {
    const billed = !!c.facture_client
    ops.push({
      date: c.date_charge || vDate, createdAt: c.created_at || null, id: c.id, subOrder: 0,
      description: `${billed ? 'Charge facturée' : 'Charge'} — ${chargeCategoryLabel(c)}${billed && c.client_nom ? ' · ' + c.client_nom : ''}`,
      qtyDetail: '',
      debit: billed ? 0 : (c.montant || 0),
      credit: billed ? (c.montant || 0) : 0,
    })
  })

  ctx.retours.filter(rt => rt.voyage_id === vId).forEach(rt => {
    ops.push({
      date: rt.date_retour || vDate, createdAt: rt.created_at || null, id: rt.id, subOrder: 0,
      description: `Retour${rt.destination ? ' — ' + rt.destination : ''}${rt.client_nom ? ' · ' + rt.client_nom : ''}`,
      qtyDetail: '',
      debit: 0, credit: rt.montant || 0,
    })
  })

  ctx.locations.filter(l => l.voyage_id === vId).forEach(l => {
    ops.push({
      date: vDate, createdAt: l.created_at || null, id: l.id, subOrder: 0,
      description: `Location camion${l.loueur_nom ? ' — ' + l.loueur_nom : ''}`,
      qtyDetail: '',
      debit: l.montant_location || 0, credit: 0,
    })
  })

  // One synthetic line for the voyage's already-computed fuel share — the
  // Fuel Allocation Engine's own per-purchase bracket detail is never
  // touched here; this simply displays the exact r.cost.fuel figure already
  // shown on the Rentabilité screen (ByVoyageSection / VoyageDrawer).
  if ((r.cost.fuel || 0) > 0) {
    ops.push({
      date: vDate, createdAt: null, id: 0, subOrder: 0,
      description: 'Gasoil (Carburant) — allocation voyage',
      qtyDetail: '',
      debit: r.cost.fuel, credit: 0,
    })
  }

  ops.sort(cmpOps)

  let running = 0
  return ops.map(op => {
    running += (op.credit || 0) - (op.debit || 0)
    return { ...op, balance: running }
  })
}

function marginColor(marge) {
  return { high: '#059669', medium: '#2563eb', low: '#d97706', loss: '#dc2626' }[marginTier(marge).key]
}

function opRow(op) {
  return `<tr>
    <td class="m" style="white-space:nowrap">${fmtDate(op.date)}</td>
    <td>
      <div style="font-weight:600;color:#1e293b">${op.description}</div>
      ${op.qtyDetail ? `<div style="font-size:10px;color:#94a3b8;margin-top:1px">${op.qtyDetail}</div>` : ''}
    </td>
    <td class="r">${op.debit ? `<span class="debit">− ${fmtMoney(op.debit)}</span>` : '<span class="dash">—</span>'}</td>
    <td class="r">${op.credit ? `<span class="credit">+ ${fmtMoney(op.credit)}</span>` : '<span class="dash">—</span>'}</td>
    <td class="r" style="font-weight:800;color:${op.balance >= 0 ? '#0f172a' : '#dc2626'}">${op.balance >= 0 ? '+ ' : '− '}${fmtMoney(Math.abs(op.balance))}</td>
  </tr>`
}

function voyageSection(r, ctx) {
  const ops = buildVoyageOperations(r, ctx)
  const clientNames = (r.clients || []).map(c => c.client_nom).filter(Boolean)
  const mColor = marginColor(r.marge)

  return `<div class="voy-section">
  <div class="voy-header-group">
    <div class="voy-titlebar">
      <div class="voy-title">VOYAGE ${r.reference || `#${r.id}`}</div>
      <div class="voy-badge" style="background:${mColor}22;color:${mColor};border:1px solid ${mColor}55">${Math.round(r.marge)}% marge</div>
    </div>
    <div class="voy-meta-bar">
      <div><b>Date</b> ${fmtDate(r.date_depart)}</div>
      <div><b>Camion</b> ${r.camion_plaque || '—'}${r.chauffeur ? ' · ' + r.chauffeur : ''}</div>
      <div><b>Client(s)</b> ${clientNames.join(', ') || '—'}</div>
      ${r.destination ? `<div><b>Destination</b> ${r.destination}</div>` : ''}
    </div>
  </div>
  <table>
    <thead><tr>
      <th>Date</th><th>Description</th><th class="r">Débit</th><th class="r">Crédit</th><th class="r">Solde</th>
    </tr></thead>
    <tbody>
      ${ops.length ? ops.map(opRow).join('') : '<tr class="empty-row"><td colspan="5">Aucune opération</td></tr>'}
    </tbody>
  </table>
  <div class="voy-totals">
    <table class="summary-table">
      <tbody>
        <tr><td class="sl">Revenu</td><td class="sv" style="color:#16a34a">+ ${fmtMoney(r.revenue.total)} DHS</td></tr>
        <tr><td class="sl">Achats</td><td class="sv" style="color:#dc2626">− ${fmtMoney(r.cost.achatTotal)} DHS</td></tr>
        <tr><td class="sl">Gasoil</td><td class="sv" style="color:#dc2626">− ${fmtMoney(r.cost.fuel)} DHS</td></tr>
        <tr><td class="sl">Charges</td><td class="sv" style="color:#dc2626">− ${fmtMoney(r.cost.chargesOperationnelles)} DHS</td></tr>
        <tr class="final"><td class="sl">Coût total</td><td class="sv" style="color:#b91c1c">− ${fmtMoney(r.cost.total)} DHS</td></tr>
      </tbody>
    </table>
    <div class="voy-profit-row">
      <div class="vp-item"><div class="vp-lbl">Profit net</div><div class="vp-val" style="color:${r.profit >= 0 ? '#059669' : '#dc2626'}">${r.profit >= 0 ? '+' : ''}${fmtMoney(r.profit)} DHS</div></div>
      <div class="vp-item"><div class="vp-lbl">Marge</div><div class="vp-val" style="color:${mColor}">${r.marge}%</div></div>
    </div>
  </div>
</div>`
}

function buildFiltersLabel(filters, options) {
  const parts = []
  if (filters.camionId) {
    const c = options.camions.find(x => String(x.id) === String(filters.camionId))
    if (c) parts.push(`Camion: ${c.plaque}`)
  }
  if (filters.typeCamion) parts.push(`Type camion: ${filters.typeCamion === 'loue' ? 'Loué' : 'Propre'}`)
  if (filters.chauffeur) parts.push(`Chauffeur: ${filters.chauffeur}`)
  if (filters.clientKey) {
    const [tp, cid] = filters.clientKey.split(':')
    const c = (tp === 'grignon' ? options.grignonClients : options.clients).find(x => String(x.id) === cid)
    if (c) parts.push(`Client: ${c.nom}${tp === 'grignon' ? ' (Grignon)' : ''}`)
  }
  if (filters.supplierKey) {
    const [tp, sid] = filters.supplierKey.split(':')
    const f = (tp === 'grignon' ? options.grignonFournisseurs : options.fournisseurs).find(x => String(x.id) === sid)
    if (f) parts.push(`Fournisseur: ${f.nom}${tp === 'grignon' ? ' (Grignon)' : ''}`)
  }
  if (filters.typeProduit) parts.push(`Produit: ${filters.typeProduit === 'grignon' ? 'Grignon' : 'Briques'}`)
  if (filters.typeBrique) parts.push(`Type brique: ${filters.typeBrique}`)
  return parts.length ? parts.join(' · ') : 'Aucun filtre'
}

// `results` must already be the exact filtered array driving the on-screen
// tabs (visibleVoyages + computeVoyageProfit) — this function never
// re-filters or recomputes profit, it only sorts (oldest → newest) and
// renders. `achats/livraisons/livraisonFrais/charges/retours/locations` are
// the full period-scoped raw arrays fetched in pages/rentabilite/index.js.
export function printRentabiliteReport({ results, achats, livraisons, livraisonFrais, charges, retours, locations, filters, options }) {
  const printDate = printGeneratedDate()
  const sorted = [...results].sort((a, b) => (a.date_depart || '') < (b.date_depart || '') ? -1 : (a.date_depart || '') > (b.date_depart || '') ? 1 : (a.id - b.id))
  const ctx = { achats, livraisons, livraisonFrais, charges, retours, locations }
  const global = aggregateVoyageProfits(results)
  const gColor = marginColor(global.marge)
  const periode = `${fmtDate(filters.from)} → ${fmtDate(filters.to)}`
  const filtersLabel = buildFiltersLabel(filters, options)

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Rentabilité — DAR SADIK</title>
<style>
${printBaseCss(ACCENT)}
/* Real page margin (base print stylesheets use margin:0mm + internal padding;
   this report needs actual paper margin so the @page footer has room to sit
   in, repeating on every physical page — something a body-flow footer div
   cannot do). Modern Chromium supports @page margin-box content/counters
   (page/pages), which is the only reliable cross-page way to number pages
   in a plain window.print() flow with no PDF engine in this stack. */
@page {
  size: A4;
  margin: 15mm 10mm 16mm 10mm;
  @bottom-left  { content: "Généré par DAR SADIK ERP · ${printDate}"; font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; }
  @bottom-right { content: "Page " counter(page) " / " counter(pages); font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; }
}
.voy-section{margin:20px 24px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
.voy-header-group{page-break-inside:avoid;page-break-after:avoid}
.voy-titlebar{background:${ACCENT};color:#fff;padding:9px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.voy-title{font-size:14px;font-weight:900;letter-spacing:0.04em}
.voy-badge{font-size:10.5px;font-weight:800;padding:3px 10px;border-radius:20px;white-space:nowrap}
.voy-meta-bar{background:#f0f5fb;padding:7px 16px;font-size:11px;color:#374151;border-bottom:1px solid #e2e8f0;display:flex;gap:16px;flex-wrap:wrap}
.voy-meta-bar b{color:#0f172a}
.voy-totals{page-break-inside:avoid;background:#f8fafc;border-top:2px solid ${ACCENT};padding:10px 16px 14px;display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;justify-content:space-between}
.summary-table{flex:1;min-width:220px;width:auto}
.summary-table td{padding:4px 10px 4px 0;font-size:11px;border-bottom:1px solid #e2e8f0}
.summary-table tr:last-child td{border-bottom:none}
.summary-table td.sl{color:#374151;font-weight:600}
.summary-table td.sv{text-align:right;font-family:'Courier New',monospace;font-weight:700}
.summary-table tr.final td{border-top:1.5px solid #c3ccd6;padding-top:6px}
.summary-table tr.final td.sl{font-weight:800;font-size:11.5px}
.summary-table tr.final td.sv{font-weight:900;font-size:12.5px}
.voy-profit-row{display:flex;gap:18px;flex-shrink:0}
.vp-item{background:#fff;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px 16px;text-align:right;min-width:110px}
.vp-lbl{font-size:9.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em}
.vp-val{font-size:16px;font-weight:900;font-family:'Courier New',monospace;margin-top:2px}
.debit{color:#dc2626;font-weight:700;white-space:nowrap}
.credit{color:#16a34a;font-weight:700;white-space:nowrap}
.dash{color:#cbd5e1}
.empty-row td{text-align:center;color:#94a3b8;padding:16px;font-style:italic}
.grand-totals{margin:24px 24px 8px;border:2px solid ${ACCENT};border-radius:12px;overflow:hidden;page-break-inside:avoid}
.gt-title{background:${ACCENT};color:#fff;padding:10px 18px;font-size:13px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase}
.gt-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#e2e8f0}
.gt-item{background:#fff;padding:14px 16px}
.gt-lbl{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em}
.gt-val{font-size:19px;font-weight:900;font-family:'Courier New',monospace;margin-top:5px}
.no-data{margin:40px 24px;text-align:center;color:#94a3b8;font-style:italic;padding:40px;border:1.5px dashed #e2e8f0;border-radius:12px}
</style></head><body>
${printHeader({ date: printDate })}
${entityCard({
  avatarText: '📊',
  name: 'Rapport de Rentabilité',
  metaHtml: `<strong>Période:</strong> ${periode} &nbsp;·&nbsp; <strong>Filtres:</strong> ${filtersLabel} &nbsp;·&nbsp; <strong>${results.length} voyage(s)</strong>`,
})}
${sorted.length > 0 ? summaryCards([
  { label: 'Revenu Total', value: `${fmtMoney(global.revenue.total)} DHS`, color: '#16a34a' },
  { label: 'Total Achats', value: `− ${fmtMoney(global.cost.achatTotal)} DHS`, color: '#dc2626' },
  { label: 'Total Gasoil', value: `− ${fmtMoney(global.cost.fuel)} DHS`, color: '#dc2626' },
  { label: 'Total Charges', value: `− ${fmtMoney(global.cost.chargesOperationnelles)} DHS`, color: '#dc2626' },
  { label: 'Coût Total', value: `− ${fmtMoney(global.cost.total)} DHS`, color: '#b91c1c' },
  { label: 'Profit Net', value: `${global.profit >= 0 ? '+' : ''}${fmtMoney(global.profit)} DHS`, color: global.profit >= 0 ? '#059669' : '#dc2626' },
  { label: 'Marge', value: `${global.marge}%`, color: gColor },
]) : ''}
${sorted.length === 0 ? '<div class="no-data">Aucun voyage pour cette période / ces filtres</div>' : sorted.map(r => voyageSection(r, ctx)).join('')}
${sorted.length > 0 ? `<div class="grand-totals">
  <div class="gt-title">Totaux Généraux</div>
  <div class="gt-grid">
    <div class="gt-item"><div class="gt-lbl">Revenu Total</div><div class="gt-val" style="color:#16a34a">${fmtMoney(global.revenue.total)} DHS</div></div>
    <div class="gt-item"><div class="gt-lbl">Total Achats</div><div class="gt-val" style="color:#dc2626">− ${fmtMoney(global.cost.achatTotal)} DHS</div></div>
    <div class="gt-item"><div class="gt-lbl">Total Gasoil</div><div class="gt-val" style="color:#dc2626">− ${fmtMoney(global.cost.fuel)} DHS</div></div>
    <div class="gt-item"><div class="gt-lbl">Total Charges</div><div class="gt-val" style="color:#dc2626">− ${fmtMoney(global.cost.chargesOperationnelles)} DHS</div></div>
    <div class="gt-item"><div class="gt-lbl">Coût Total</div><div class="gt-val" style="color:#b91c1c">− ${fmtMoney(global.cost.total)} DHS</div></div>
    <div class="gt-item"><div class="gt-lbl">Profit Net Total</div><div class="gt-val" style="color:${global.profit >= 0 ? '#059669' : '#dc2626'}">${global.profit >= 0 ? '+' : ''}${fmtMoney(global.profit)} DHS</div></div>
    <div class="gt-item"><div class="gt-lbl">Marge Moyenne</div><div class="gt-val" style="color:${gColor}">${global.marge}%</div></div>
  </div>
</div>
${soldeFinal({ label: 'Profit Net Total', amountFormatted: fmtMoney(global.profit), amount: global.profit, sub: `${periode} — Marge moyenne ${global.marge}%` })}` : ''}
</body></html>`

  openPrintWindow(html)
}
