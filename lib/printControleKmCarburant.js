// ── Contrôle KM & Carburant print/PDF report ─────────────────────────────────
// Presentation only: every number here is read straight off
// lib/services/fleetFuelMonitoring.js's own output (buildTruckFuelHistory /
// buildPeriodSummary / buildFleetPeriodTotals / buildOpeningAnchoredPeriodRows,
// already computed once in pages/carburant/index.js) — nothing here
// recomputes distance, litres, or consumption. `trucks` is
// `[{ camion, currentKm, summary, displayRows }, ...]`, the exact same shape
// the on-screen TruckControlCard renders, already scoped to Camions Propre
// and already filtered to the selected truck(s)/period.
import { fmt, fmtD, fmtDate, fmtMoney, openPrintWindow } from './utils'
import { printBaseCss, printHeader, printGeneratedDate, entityCard, summaryCards, printFooter } from './printLayout'

const ACCENT = '#f97316' // same orange used by every other fuel/gasoil report (pages/gasoil, pages/fournisseurs/gasoil)

function statusLabel(row) {
  if (row.status === 'pending') return 'En attente de mesure'
  if (row.status === 'invalid') return 'KM invalide — non mesuré'
  if (row.status === 'missing_km') {
    return row.linkedToDate
      ? `KM manquant → inclus dans mesure du ${fmtDate(row.linkedToDate)}`
      : 'KM manquant → en attente'
  }
  return 'Mesure clôturée'
}

function bonRow(row) {
  const merged = row.mergedFrom && row.mergedFrom.length > 0
  const footnoteMark = merged ? '*' : ''
  return `<tr class="${row.status === 'missing_km' ? 'band' : ''}">
    <td class="m">${fmtDate(row.date)}</td>
    <td class="r">${row.km !== null ? fmt(row.km) : '—'}</td>
    <td class="r">${row.distance !== null ? `${fmt(row.distance)} km` : '—'}</td>
    <td class="r">${fmtD(row.liters)} L${footnoteMark}</td>
    <td class="r">${row.consoL100 !== null ? row.consoL100.toFixed(2) : '—'}</td>
    <td class="m">${statusLabel(row)}</td>
  </tr>`
}

function truckSection({ camion, currentKm, summary, displayRows }) {
  // The truck-level KPI table above stays sourced from `summary` (closing-
  // anchored aggregate, unaffected). The per-Bon table below uses
  // `displayRows` (buildOpeningAnchoredPeriodRows) so a period's distance/
  // litres/consumption print on the Bon that opens it, matching the on-screen
  // TruckControlCard exactly.
  const rows = [...displayRows].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
  const hasMerged = rows.some(r => r.mergedFrom && r.mergedFrom.length > 0)

  return `
  <div class="truck-section">
    <div class="truck-titlebar">
      <div class="truck-title">🚛 ${camion.plaque}</div>
      <div class="truck-meta">${camion.chauffeur ? camion.chauffeur + ' · ' : ''}KM actuel : ${currentKm !== null ? `${fmt(currentKm)} km` : '—'}</div>
    </div>
    <table class="summary-table">
      <tbody>
        <tr><td class="sl">Total KM</td><td class="sv">${fmt(summary.distanceTotal)} km</td></tr>
        <tr><td class="sl">Total Gasoil</td><td class="sv">${fmtD(summary.litresTotal)} L</td></tr>
        <tr><td class="sl">Consommation moyenne</td><td class="sv">${summary.consoL100 !== null ? summary.consoL100.toFixed(2) : '—'} L/100km</td></tr>
        <tr><td class="sl">Coût total carburant</td><td class="sv">${fmtMoney(summary.coutTotal)} DHS</td></tr>
        <tr class="final"><td class="sl">DH / km</td><td class="sv">${summary.coutKm !== null ? fmtMoney(summary.coutKm) : '—'} DHS</td></tr>
      </tbody>
    </table>
    <table>
      <thead><tr>
        <th>Date</th><th class="r">KM Compteur</th><th class="r">KM Parcourus</th>
        <th class="r">Gasoil</th><th class="r">L/100 KM</th><th>Statut</th>
      </tr></thead>
      <tbody>${rows.length ? rows.map(bonRow).join('') : '<tr class="empty-row"><td colspan="6">Aucun bon sur la période sélectionnée</td></tr>'}</tbody>
    </table>
    ${hasMerged ? '<div class="footnote">* Ce Bon inclut les litres d\'un ou plusieurs Bons avec KM manquant, mesurés ensemble sur la même période (voir statut détaillé ci-dessus).</div>' : ''}
  </div>`
}

// `trucks`: [{ camion, currentKm, summary }] — one or every Camion Propre,
// already filtered/period-scoped by the page. `fleetTotals` is
// buildFleetPeriodTotals(trucks.map(t => t.summary)) — the same weighted
// (Σlitres ÷ Σkm, never averaged-of-averages) total shown on screen.
export function printControleKmCarburantReport({ trucks, fleetTotals, from, to }) {
  if (!trucks || trucks.length === 0) return
  const printDate = printGeneratedDate()
  const periode = `${fmtDate(from)} → ${fmtDate(to)}`
  const isFleet = trucks.length > 1
  const title = isFleet ? 'Tous les Camions Propre' : trucks[0].camion.plaque

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Contrôle KM & Carburant — DAR SADIK</title>
<style>
${printBaseCss(ACCENT)}
@page {
  size: A4;
  margin: 15mm 10mm 16mm 10mm;
  @bottom-left  { content: "Généré par DAR SADIK ERP · ${printDate}"; font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; }
  @bottom-right { content: "Page " counter(page) " / " counter(pages); font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; }
}
.truck-section{margin:20px 24px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
.truck-titlebar{background:${ACCENT};color:#fff;padding:9px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;page-break-inside:avoid;page-break-after:avoid}
.truck-title{font-size:14px;font-weight:900;letter-spacing:0.04em}
.truck-meta{font-size:11px;opacity:0.92}
.summary-table{width:auto;margin:14px 16px 4px}
.summary-table td{padding:5px 14px 5px 0;font-size:11.5px;border-bottom:1px solid #e2e8f0}
.summary-table td.sl{color:#374151;font-weight:600}
.summary-table td.sv{text-align:right;font-family:'Courier New',monospace;font-weight:700}
.summary-table tr.final td{border-top:1.5px solid #c3ccd6;font-weight:900;padding-top:8px}
tr.band td{background:#fffbeb !important}
.footnote{font-size:10px;color:#92400e;padding:8px 16px 14px;font-style:italic}
.empty-row td{text-align:center;color:#94a3b8;padding:16px;font-style:italic}
.grand-totals{margin:24px 24px 8px;border:2px solid ${ACCENT};border-radius:12px;overflow:hidden;page-break-inside:avoid}
.gt-title{background:${ACCENT};color:#fff;padding:10px 18px;font-size:13px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase}
.gt-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:#e2e8f0}
.gt-item{background:#fff;padding:14px 16px}
.gt-lbl{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em}
.gt-val{font-size:18px;font-weight:900;color:#0f172a;margin-top:4px;font-family:'Courier New',monospace}
</style></head><body>
${printHeader({ date: printDate })}
${entityCard({
  avatarText: '🚛',
  name: title,
  metaHtml: `<strong>Contrôle KM & Carburant</strong> — Camions Propre uniquement &nbsp;·&nbsp; <strong>Période:</strong> ${periode}`,
})}
${summaryCards([
  { label: 'Total KM', value: `${fmt(fleetTotals.distanceTotal)} km` },
  { label: 'Total Gasoil', value: `${fmt(fleetTotals.litresTotal)} L` },
  { label: 'Consommation globale', value: fleetTotals.consoL100 !== null ? `${fleetTotals.consoL100.toFixed(2)} L/100km` : '—', color: ACCENT },
  { label: 'Coût total carburant', value: `${fmtMoney(fleetTotals.coutTotal)} DHS` },
  { label: 'DH / km', value: fleetTotals.coutKm !== null ? `${fmtMoney(fleetTotals.coutKm)} DHS` : '—' },
])}
${trucks.map(truckSection).join('')}
${isFleet ? `
<div class="grand-totals">
  <div class="gt-title">Total Flotte Propre</div>
  <div class="gt-grid">
    <div class="gt-item"><div class="gt-lbl">Total KM</div><div class="gt-val">${fmt(fleetTotals.distanceTotal)}</div></div>
    <div class="gt-item"><div class="gt-lbl">Total Litres</div><div class="gt-val">${fmt(fleetTotals.litresTotal)} L</div></div>
    <div class="gt-item"><div class="gt-lbl">Consommation globale</div><div class="gt-val">${fleetTotals.consoL100 !== null ? fleetTotals.consoL100.toFixed(2) : '—'}</div></div>
    <div class="gt-item"><div class="gt-lbl">Coût total</div><div class="gt-val">${fmtMoney(fleetTotals.coutTotal)}</div></div>
    <div class="gt-item"><div class="gt-lbl">DH / km</div><div class="gt-val">${fleetTotals.coutKm !== null ? fmtMoney(fleetTotals.coutKm) : '—'}</div></div>
  </div>
</div>` : ''}
${printFooter(printDate)}
</body></html>`

  openPrintWindow(html)
}
