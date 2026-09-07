// ── Contrôle KM & Carburant print/PDF report ─────────────────────────────────
// Presentation only: every number here is read straight off
// lib/services/fleetFuelMonitoring.js's own output (buildTruckFuelHistory /
// buildPeriodSummary / buildFleetPeriodTotals / buildOpeningAnchoredPeriodRows,
// already computed once in pages/carburant/index.js's handleExportGenerate)
// — nothing here recomputes distance, litres, or consumption. `trucks` is
// `[{ camion, currentKm, summary, displayRows }, ...]`, the exact same shape
// the on-screen TruckControlCard renders, already scoped to Camions Propre
// and already filtered to the selected truck(s)/period chosen in
// ExportPdfModal — so the printed/PDF numbers can never drift from what the
// app itself shows (spec §12).
import { fmt, fmtD, fmtDate, fmtMoney, openPrintWindow } from './utils'
import { printBaseCss, printHeader, printGeneratedDate, printFooter } from './printLayout'

const ACCENT = '#f97316' // same orange used by every other fuel/gasoil report (pages/gasoil, pages/fournisseurs/gasoil)

// DD/MM/YYYY -> DD-MM-YYYY, filesystem-safe for the generated filename.
function fmtDateDash(d) {
  const s = fmtDate(d)
  return s === '—' ? '' : s.replace(/\//g, '-')
}

function consoStr(v) {
  return v !== null && v !== undefined ? v.toFixed(2).replace('.', ',') : '—'
}

function statusLabel(row) {
  if (row.status === 'pending') return 'En attente de mesure'
  if (row.status === 'invalid') return 'KM invalide — non mesuré'
  if (row.status === 'missing_km') {
    return row.linkedToDate
      ? `KM manquant → inclus dans mesure du ${fmtDate(row.linkedToDate)}`
      : 'KM manquant → en attente'
  }
  return 'Mesuré'
}

function bonRow(row) {
  const merged = row.mergedFrom && row.mergedFrom.length > 0
  const footnoteMark = merged ? '*' : ''
  return `<tr class="${row.status === 'missing_km' ? 'band' : ''}">
    <td class="m">${fmtDate(row.date)}</td>
    <td class="r">${row.km !== null ? fmt(row.km) : '—'}</td>
    <td class="r">${row.distance !== null ? `${fmt(row.distance)} km` : '—'}</td>
    <td class="r">${fmtD(row.liters)} L${footnoteMark}</td>
    <td class="r">${row.consoL100 !== null ? consoStr(row.consoL100) : '—'}</td>
    <td class="m">${statusLabel(row)}</td>
  </tr>`
}

// One clearly separated block per truck — CONSOMMATION is the single most
// prominent figure in the section (spec §2/§13), everything else supports it.
function truckSection({ camion, currentKm, summary, displayRows }) {
  // The hero KPI + mini-stats stay sourced from `summary` (closing-anchored
  // aggregate, unaffected by the opening-Plein re-attachment below) — the
  // per-Bon table uses `displayRows` (buildOpeningAnchoredPeriodRows) so a
  // period's distance/litres/consumption print on the Bon that opens it,
  // matching the on-screen TruckControlCard exactly (spec §12).
  const rows = [...displayRows].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
  const hasMerged = rows.some(r => r.mergedFrom && r.mergedFrom.length > 0)

  return `
  <div class="truck-section">
    <div class="truck-titlebar">
      <div class="truck-title">🚛 CAMION : ${camion.plaque}</div>
      <div class="truck-meta">${camion.chauffeur ? camion.chauffeur + ' · ' : ''}KM actuel : ${currentKm !== null ? `${fmt(currentKm)} km` : '—'}</div>
    </div>

    <div class="hero">
      <div class="hero-lbl">CONSOMMATION</div>
      <div class="hero-val">${consoStr(summary.consoL100)}<span class="hero-unit">L / 100 KM</span></div>
    </div>

    <div class="mini-grid">
      <div class="mini-item"><div class="mini-lbl">Total KM</div><div class="mini-val">${fmt(summary.distanceTotal)} KM</div></div>
      <div class="mini-item"><div class="mini-lbl">Total Gasoil</div><div class="mini-val">${fmtD(summary.litresTotal)} L</div></div>
      <div class="mini-item"><div class="mini-lbl">Coût carburant</div><div class="mini-val">${fmtMoney(summary.coutTotal)} DH</div></div>
      <div class="mini-item"><div class="mini-lbl">DH / KM</div><div class="mini-val">${summary.coutKm !== null ? fmtMoney(summary.coutKm) : '—'} DH/KM</div></div>
    </div>

    <div class="sec-title">HISTORIQUE CONSOMMATION</div>
    <table>
      <thead><tr>
        <th>Date</th><th class="r">KM Compteur</th><th class="r">KM Parcourus</th>
        <th class="r">Gasoil</th><th class="r">L/100 KM</th><th>Statut</th>
      </tr></thead>
      <tbody>${rows.length ? rows.map(bonRow).join('') : '<tr class="empty-row"><td colspan="6">Aucun bon sur la période sélectionnée</td></tr>'}</tbody>
    </table>
    ${hasMerged ? '<div class="footnote">* Ce Bon inclut les litres d\'un ou plusieurs Bons avec KM manquant, mesurés ensemble sur la même période (voir statut détaillé ci-dessus).</div>' : ''}

    <div class="conso-globale">CONSOMMATION GLOBALE&nbsp;&nbsp;<b>${consoStr(summary.consoL100)} L/100 KM</b></div>
  </div>`
}

function summaryTableRow(t) {
  return `<tr>
    <td class="m"><b>${t.camion.plaque}</b></td>
    <td class="r">${fmt(t.summary.distanceTotal)} km</td>
    <td class="r">${fmtD(t.summary.litresTotal)} L</td>
    <td class="r conso-cell">${consoStr(t.summary.consoL100)}</td>
    <td class="r">${t.summary.coutKm !== null ? fmtMoney(t.summary.coutKm) : '—'}</td>
  </tr>`
}

// `trucks`: [{ camion, currentKm, summary, displayRows }] — the truck(s) the
// user picked in ExportPdfModal, already period-scoped. `fleetTotals` is
// buildFleetPeriodTotals(trucks.map(t => t.summary)) — the same weighted
// (Σlitres ÷ Σkm, never averaged-of-averages) total shown on screen.
// `allPropreCount` (total Camions Propre available) tells the header/filename
// apart: exactly that many trucks selected = "Tous les Camions Propre" /
// "Flotte", 1 truck = its own plaque, anything else = "Multi-Camions".
export function printControleKmCarburantReport({ trucks, fleetTotals, from, to, allPropreCount }) {
  if (!trucks || trucks.length === 0) return
  const printDate = printGeneratedDate()
  const periode = `${fmtDate(from)} → ${fmtDate(to)}`
  const isAll = allPropreCount != null && trucks.length === allPropreCount
  const isMulti = trucks.length > 1

  const plaques = trucks.map(t => t.camion.plaque)
  const camionLabel = isAll ? 'Tous les Camions Propre'
    : plaques.length <= 6 ? plaques.join(', ')
    : `${plaques.length} camions sélectionnés`
  const filenameTruckPart = isAll ? 'Flotte' : (trucks.length === 1 ? trucks[0].camion.plaque : 'Multi-Camions')
  const filename = `Controle_KM_Carburant_${filenameTruckPart}_${fmtDateDash(from)}_${fmtDateDash(to)}`

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>${filename}</title>
<style>
${printBaseCss(ACCENT)}
@page {
  size: A4 landscape;
  margin: 14mm 12mm 16mm 12mm;
  @bottom-left  { content: "Généré par DAR SADIK ERP · ${printDate}"; font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; }
  @bottom-right { content: "Page " counter(page) " / " counter(pages); font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; }
}
.report-title{margin:18px 24px 0;text-align:center}
.rt-main{font-size:22px;font-weight:900;letter-spacing:0.08em;color:#0f172a}
.rt-sub{font-size:13px;font-weight:800;letter-spacing:0.12em;color:${ACCENT};margin-top:2px}
.report-meta{display:flex;justify-content:center;gap:28px;margin:10px 24px 0;padding-bottom:12px;border-bottom:2px solid #e2e8f0;font-size:12px;color:#374151}
.summary-title{margin:20px 24px 8px;font-size:12px;font-weight:900;letter-spacing:0.08em;color:${ACCENT};text-transform:uppercase;border-bottom:1.5px solid ${ACCENT};padding-bottom:4px}
.conso-cell{font-weight:900;color:${ACCENT};font-size:14px}
.truck-section{margin:22px 24px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;page-break-inside:avoid}
.truck-titlebar{background:${ACCENT};color:#fff;padding:11px 18px;display:flex;align-items:center;justify-content:space-between;gap:10px;page-break-after:avoid}
.truck-title{font-size:15px;font-weight:900;letter-spacing:0.04em}
.truck-meta{font-size:11.5px;opacity:0.92}
.hero{background:#fff7ed;border-bottom:1px solid #fed7aa;padding:16px 20px;text-align:center;page-break-after:avoid}
.hero-lbl{font-size:11px;font-weight:800;letter-spacing:0.14em;color:#c2410c}
.hero-val{font-size:40px;font-weight:900;color:${ACCENT};line-height:1.1;margin-top:2px;font-family:'Courier New',monospace}
.hero-unit{font-size:15px;font-weight:800;color:#c2410c;margin-left:10px;font-family:Arial,sans-serif}
.mini-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#e2e8f0;page-break-after:avoid}
.mini-item{background:#fff;padding:11px 14px}
.mini-lbl{font-size:9.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em}
.mini-val{font-size:15px;font-weight:900;color:#0f172a;margin-top:3px;font-family:'Courier New',monospace}
.sec-title{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;color:#64748b;padding:12px 18px 6px}
.truck-section table{width:calc(100% - 36px);margin:0 18px}
tr.band td{background:#fffbeb !important}
.footnote{font-size:10px;color:#92400e;padding:8px 18px 4px;font-style:italic}
.empty-row td{text-align:center;color:#94a3b8;padding:16px;font-style:italic}
.conso-globale{background:#f8fafc;border-top:2px solid ${ACCENT};padding:10px 18px;margin-top:12px;font-size:12px;font-weight:700;color:#374151;text-align:right}
.conso-globale b{color:${ACCENT};font-size:15px;font-family:'Courier New',monospace}
.grand-totals{margin:22px 24px 8px;border:2px solid ${ACCENT};border-radius:12px;overflow:hidden;page-break-inside:avoid}
.gt-title{background:${ACCENT};color:#fff;padding:10px 18px;font-size:13px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase}
.gt-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:#e2e8f0}
.gt-item{background:#fff;padding:14px 16px}
.gt-lbl{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em}
.gt-val{font-size:19px;font-weight:900;color:#0f172a;margin-top:4px;font-family:'Courier New',monospace}
</style></head><body>
${printHeader({ date: printDate })}
<div class="report-title">
  <div class="rt-main">CONTRÔLE KM &amp; CARBURANT</div>
  <div class="rt-sub">RAPPORT DE CONSOMMATION</div>
</div>
<div class="report-meta">
  <span>Période : <b>${periode}</b></span>
  <span>Camion(s) : <b>${camionLabel}</b></span>
  <span>Généré le : <b>${printDate}</b></span>
</div>
${isMulti ? `
<div class="summary-title">Résumé Consommation</div>
<div class="bdy" style="padding-top:0">
<table>
  <thead><tr>
    <th>Camion</th><th class="r">Total KM</th><th class="r">Total Gasoil</th>
    <th class="r">L/100 KM</th><th class="r">DH/KM</th>
  </tr></thead>
  <tbody>${trucks.map(summaryTableRow).join('')}</tbody>
</table>
</div>` : ''}
${trucks.map(truckSection).join('')}
${isMulti ? `
<div class="grand-totals">
  <div class="gt-title">Consommation Globale — ${camionLabel}</div>
  <div class="gt-grid">
    <div class="gt-item"><div class="gt-lbl">Total KM</div><div class="gt-val">${fmt(fleetTotals.distanceTotal)}</div></div>
    <div class="gt-item"><div class="gt-lbl">Total Litres</div><div class="gt-val">${fmt(fleetTotals.litresTotal)} L</div></div>
    <div class="gt-item"><div class="gt-lbl">L/100 KM</div><div class="gt-val">${consoStr(fleetTotals.consoL100)}</div></div>
    <div class="gt-item"><div class="gt-lbl">Coût total</div><div class="gt-val">${fmtMoney(fleetTotals.coutTotal)}</div></div>
    <div class="gt-item"><div class="gt-lbl">DH / km</div><div class="gt-val">${fleetTotals.coutKm !== null ? fmtMoney(fleetTotals.coutKm) : '—'}</div></div>
  </div>
</div>` : ''}
${printFooter(printDate)}
</body></html>`

  openPrintWindow(html)
}
