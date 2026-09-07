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
// app itself shows. Layout only: true A4 portrait, a color system with
// distinct roles (neutral charcoal for structure, ONE blue accent reserved
// for the consumption KPI, muted status colors), bold/dark typography sized
// for comfortable reading, truck-by-truck order with the fleet summary at
// the very end, and page breaks that keep a truck's header+KPIs together
// without forcing its whole history onto a single page.
import { fmt, fmtD, fmtDate, fmtMoney, openPrintWindow } from './utils'
import { printBaseCss, printHeader, printGeneratedDate, printFooter } from './printLayout'

const INK    = '#111827' // near-black neutral charcoal — headings, truck titles, table headers
const MUTED  = '#6b7280' // secondary labels
const LINE   = '#d1d5db' // borders
const LINE_SOFT = '#e5e7eb'
const BG_SOFT = '#f3f4f6' // light neutral — structural backgrounds, row alternation
const ACCENT = '#1d4ed8' // the ONE accent — main consumption KPI only
const OK_COLOR = '#166534'      // muted green — mesuré
const WARN_COLOR = '#92400e'    // muted amber — KM manquant
const BAD_COLOR = '#991b1b'     // muted red — KM invalide

// DD/MM/YYYY -> DD-MM-YYYY, filesystem-safe for the generated filename.
function fmtDateDash(d) {
  const s = fmtDate(d)
  return s === '—' ? '' : s.replace(/\//g, '-')
}

function consoStr(v) {
  return v !== null && v !== undefined ? v.toFixed(2).replace('.', ',') : '—'
}

function statusLabel(row) {
  if (row.status === 'pending') return { text: 'En attente de mesure', cls: 'st-pending' }
  if (row.status === 'invalid') return { text: 'KM invalide — non mesuré', cls: 'st-invalid' }
  if (row.status === 'missing_km') {
    return {
      text: row.linkedToDate
        ? `KM manquant → inclus dans mesure du ${fmtDate(row.linkedToDate)}`
        : 'KM manquant → en attente',
      cls: 'st-missing',
    }
  }
  return { text: 'Mesuré', cls: 'st-ok' }
}

function bonRow(row) {
  const merged = row.mergedFrom && row.mergedFrom.length > 0
  const footnoteMark = merged ? '*' : ''
  const st = statusLabel(row)
  return `<tr class="${row.status === 'missing_km' ? 'band' : ''}">
    <td class="m">${fmtDate(row.date)}</td>
    <td class="r">${row.km !== null ? fmt(row.km) : '—'}</td>
    <td class="r">${row.distance !== null ? `${fmt(row.distance)} km` : '—'}</td>
    <td class="r">${fmtD(row.liters)} L${footnoteMark}</td>
    <td class="r">${row.consoL100 !== null ? consoStr(row.consoL100) : '—'}</td>
    <td class="statut-cell"><span class="status ${st.cls}">${st.text}</span></td>
  </tr>`
}

// Value-over-label KPI tiles, plain and uncolored except the one main figure
// — never four separate colorful cards.
function kpiRow(summary) {
  return `<div class="kpi-row">
    <div class="kpi-main-block">
      <div class="kpi-main-val">${consoStr(summary.consoL100)}<span class="kpi-main-unit">L / 100 KM</span></div>
      <div class="kpi-main-lbl">Consommation</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-tile"><div class="kpi-val">${fmt(summary.distanceTotal)} KM</div><div class="kpi-lbl">Total KM</div></div>
      <div class="kpi-tile"><div class="kpi-val">${fmtD(summary.litresTotal)} L</div><div class="kpi-lbl">Total Gasoil</div></div>
      <div class="kpi-tile"><div class="kpi-val">${fmtMoney(summary.coutTotal)} DH</div><div class="kpi-lbl">Coût carburant</div></div>
      <div class="kpi-tile"><div class="kpi-val">${summary.coutKm !== null ? fmtMoney(summary.coutKm) : '—'} DH/KM</div><div class="kpi-lbl">DH/KM</div></div>
    </div>
  </div>`
}

// One clearly separated block per truck. The header+KPI block is kept
// together on one page (page-break-inside:avoid on that sub-block only) —
// the history table itself is free to flow onto following pages so a long
// truck never leaves a large empty gap on the page before it.
function truckSection({ camion, currentKm, summary, displayRows }) {
  // The KPI block stays sourced from `summary` (closing-anchored aggregate,
  // unaffected by the opening-Plein re-attachment below) — the per-Bon table
  // uses `displayRows` (buildOpeningAnchoredPeriodRows) so a period's
  // distance/litres/consumption print on the Bon that opens it, matching the
  // on-screen TruckControlCard exactly.
  const rows = [...displayRows].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
  const hasMerged = rows.some(r => r.mergedFrom && r.mergedFrom.length > 0)

  return `
  <div class="truck-section">
    <div class="truck-head">
      <div class="truck-titlebar">
        <div class="truck-title">CAMION : ${camion.plaque}</div>
        <div class="truck-meta">${camion.chauffeur ? camion.chauffeur + ' · ' : ''}KM actuel : ${currentKm !== null ? `${fmt(currentKm)} km` : '—'}</div>
      </div>
      ${kpiRow(summary)}
    </div>

    <div class="sec-title">Historique consommation</div>
    <table>
      <colgroup>
        <col style="width:13%"><col style="width:14%"><col style="width:13%">
        <col style="width:11%"><col style="width:12%"><col style="width:37%">
      </colgroup>
      <thead><tr>
        <th>Date</th><th class="r">KM Compteur</th><th class="r">KM Parcourus</th>
        <th class="r">Gasoil</th><th class="r">L/100 KM</th><th>Statut</th>
      </tr></thead>
      <tbody>${rows.length ? rows.map(bonRow).join('') : '<tr class="empty-row"><td colspan="6">Aucun bon sur la période sélectionnée</td></tr>'}</tbody>
    </table>
    ${hasMerged ? '<div class="footnote">* Ce Bon inclut les litres d\'un ou plusieurs Bons avec KM manquant, mesurés ensemble sur la même période.</div>' : ''}
  </div>`
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
${printBaseCss(INK)}
@page {
  size: A4;
  margin: 15mm 14mm 18mm 14mm;
  @bottom-left  { content: "${periode} · Généré le ${printDate}"; font-family: Arial, sans-serif; font-size: 8px; color: #9ca3af; }
  @bottom-right { content: "Page " counter(page) " / " counter(pages); font-family: Arial, sans-serif; font-size: 8px; color: #9ca3af; }
}
body{color:${INK};font-size:12.5px}
.report-title{margin:14px 18px 0;text-align:center}
.rt-main{font-size:19px;font-weight:800;letter-spacing:0.01em;color:${INK}}
.rt-sub{font-size:11.5px;font-weight:700;color:${MUTED};margin-top:1px}
.report-meta{display:flex;justify-content:center;gap:20px;flex-wrap:wrap;margin:9px 18px 0;padding-bottom:9px;border-bottom:1px solid ${LINE};font-size:11px;color:${MUTED}}
.report-meta b{color:${INK};font-weight:700}

.truck-section{margin:16px 18px 0}
.truck-section:last-of-type{margin-bottom:16px}
.truck-head{page-break-inside:avoid}
.truck-titlebar{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:6px;border-bottom:2px solid ${INK};padding-bottom:6px}
.truck-title{font-size:17px;font-weight:800;color:${INK};letter-spacing:0.01em}
.truck-meta{font-size:10.5px;color:${MUTED};font-weight:600}

.kpi-row{display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:${BG_SOFT};border:1px solid ${LINE_SOFT};border-radius:5px;padding:10px 14px;margin-top:8px}
.kpi-main-block{padding-right:16px;border-right:1px solid ${LINE};min-width:150px}
.kpi-main-val{font-size:27px;font-weight:800;color:${ACCENT};font-family:'Courier New',monospace;line-height:1}
.kpi-main-unit{font-size:11px;font-weight:700;color:${ACCENT};margin-left:6px}
.kpi-main-lbl{font-size:9.5px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.03em;margin-top:2px}
.kpi-grid{display:flex;gap:22px;flex-wrap:wrap;flex:1}
.kpi-val{font-size:13.5px;font-weight:800;color:${INK};font-family:'Courier New',monospace}
.kpi-lbl{font-size:9.5px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.03em;margin-top:2px}

.sec-title{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.03em;color:${MUTED};padding:11px 2px 5px}
.truck-section table{width:100%;table-layout:fixed}
.truck-section thead th{background:${INK} !important;color:#fff !important;font-size:10.5px;font-weight:700;padding:8px 8px}
.truck-section tbody td{font-size:11.5px;font-weight:600;color:${INK};padding:7px 8px}
.truck-section tbody td.r{font-weight:700;font-family:'Courier New',monospace}
.truck-section td.statut-cell{font-size:10.5px;font-weight:600;color:${INK};white-space:normal;padding:7px 8px}
.truck-section tbody tr:nth-child(even) td{background:${BG_SOFT}}
.truck-section tr.band td{background:#fdf3e7 !important}

.status{font-weight:700}
.st-ok{color:${OK_COLOR}}
.st-pending{color:${MUTED};font-weight:600;font-style:italic}
.st-missing{color:${WARN_COLOR}}
.st-invalid{color:${BAD_COLOR}}

.footnote{font-size:9.5px;color:${MUTED};padding:5px 2px 2px;font-style:italic}
.empty-row td{text-align:center;color:${MUTED};padding:14px;font-style:italic}

.global-summary{margin:22px 18px 14px;border:1px solid ${INK};border-radius:5px;overflow:hidden;page-break-inside:avoid}
.gs-title{background:${INK};color:#fff;padding:9px 16px;font-size:12px;font-weight:800;letter-spacing:0.02em;text-transform:uppercase}
.gs-body{padding:14px 16px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;background:${BG_SOFT}}
.gs-main-block{padding-right:18px;border-right:1px solid ${LINE}}
.gs-main-val{font-size:30px;font-weight:800;color:${ACCENT};font-family:'Courier New',monospace;line-height:1}
.gs-main-unit{font-size:12px;font-weight:700;color:${ACCENT};margin-left:6px}
.gs-grid{display:flex;gap:22px;flex-wrap:wrap;flex:1}
.gs-val{font-size:14px;font-weight:800;color:${INK};font-family:'Courier New',monospace}
.gs-lbl{font-size:9.5px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.03em;margin-top:2px}
</style></head><body>
${printHeader({ date: printDate })}
<div class="report-title">
  <div class="rt-main">CONTRÔLE KM &amp; CARBURANT</div>
  <div class="rt-sub">Rapport de consommation</div>
</div>
<div class="report-meta">
  <span>Période : <b>${periode}</b></span>
  <span>Camion(s) : <b>${camionLabel}</b></span>
  <span>Généré le : <b>${printDate}</b></span>
</div>
${trucks.map(truckSection).join('')}
${isMulti ? `
<div class="global-summary">
  <div class="gs-title">Résumé global de consommation</div>
  <div class="gs-body">
    <div class="gs-main-block"><span class="gs-main-val">${consoStr(fleetTotals.consoL100)}</span><span class="gs-main-unit">L / 100 KM</span></div>
    <div class="gs-grid">
      <div><div class="gs-val">${fmt(fleetTotals.distanceTotal)} KM</div><div class="gs-lbl">Total KM</div></div>
      <div><div class="gs-val">${fmt(fleetTotals.litresTotal)} L</div><div class="gs-lbl">Total Litres</div></div>
      <div><div class="gs-val">${fmtMoney(fleetTotals.coutTotal)} DH</div><div class="gs-lbl">Coût total</div></div>
      <div><div class="gs-val">${fleetTotals.coutKm !== null ? fmtMoney(fleetTotals.coutKm) : '—'} DH/KM</div><div class="gs-lbl">DH/KM</div></div>
    </div>
  </div>
</div>` : ''}
${printFooter(printDate)}
</body></html>`

  openPrintWindow(html)
}
