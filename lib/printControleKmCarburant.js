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
// app itself shows. Layout only: A4 landscape, a prominent per-truck hero
// KPI card (brand navy + one blue accent instead of the old bright orange),
// truck-by-truck order with the fleet summary moved to the very end, and
// page breaks that keep a truck's header+KPIs together without forcing its
// whole history onto a single page.
import { fmt, fmtD, fmtDate, fmtMoney, openPrintWindow } from './utils'
import { printBaseCss, printHeader, printGeneratedDate, printFooter } from './printLayout'

const NAVY   = '#1e3a5f' // brand navy (same as the DAR SADIK logo) — truck headers, table headers
const ACCENT = '#2563eb' // brand blue — the ONE accent, main consumption KPI only
const HERO_BG = '#eff6ff' // very light blue-tinted background behind the hero KPI
const HERO_LINE = '#bfdbfe'
const MUTED  = '#64748b' // secondary labels
const LINE   = '#dbe2ea' // borders
const BG_SOFT = '#f7f8fa' // light neutral — row alternation
const OK_COLOR = '#15803d'      // muted green — mesuré
const WARN_COLOR = '#b45309'    // muted amber — KM manquant
const BAD_COLOR = '#b91c1c'     // muted red — KM invalide

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
  // A 'pending' row's litres are null (no closing Bon yet to measure the
  // period it opens) — fmtD(null) would print "0.00 L", which reads like a
  // real zero-litre refuel instead of "not yet known". Never summed into any
  // total either way (buildPeriodSummary only sums 'measured' rows); this is
  // purely how that already-null value is displayed.
  const litersCell = row.status === 'pending' ? '—' : `${fmtD(row.liters)} L${footnoteMark}`
  return `<tr class="${row.status === 'missing_km' ? 'band' : ''}">
    <td class="m">${fmtDate(row.date)}</td>
    <td class="r">${row.km !== null ? fmt(row.km) : '—'}</td>
    <td class="r">${row.distance !== null ? `${fmt(row.distance)} km` : '—'}</td>
    <td class="r">${litersCell}</td>
    <td class="r">${row.consoL100 !== null ? consoStr(row.consoL100) : '—'}</td>
    <td class="m"><span class="status ${st.cls}">${st.text}</span></td>
  </tr>`
}

// One clearly separated block per truck: a colored hero card (navy header +
// light-blue KPI band) makes the truck and its consumption unmistakable at a
// glance, followed by the chronological table. No recap line under the
// table — the same L/100km figure is already prominent in the hero card
// above, repeating it there would just be a duplicate.
function truckSection({ camion, summary, displayRows }) {
  // The hero card stays sourced from `summary` (closing-anchored aggregate,
  // unaffected by the opening-Plein re-attachment below) — the per-Bon table
  // uses `displayRows` (buildOpeningAnchoredPeriodRows) so a period's
  // distance/litres/consumption print on the Bon that opens it, matching the
  // on-screen TruckControlCard exactly.
  const rows = [...displayRows].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
  const hasMerged = rows.some(r => r.mergedFrom && r.mergedFrom.length > 0)

  return `
  <div class="truck-section">
    <div class="truck-card">
      <div class="truck-titlebar">
        <div class="truck-title">CAMION : ${camion.plaque}</div>
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
    </div>

    <div class="sec-title">Historique consommation</div>
    <table>
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
${printBaseCss(NAVY)}
@page {
  size: A4 landscape;
  margin: 14mm 12mm 16mm 12mm;
  @bottom-left  { content: "${periode} · Généré le ${printDate}"; font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; }
  @bottom-right { content: "Page " counter(page) " / " counter(pages); font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; }
}
body{color:${NAVY};font-size:12.5px}
.report-title{margin:14px 22px 0;text-align:center}
.rt-main{font-size:20px;font-weight:800;letter-spacing:0.01em;color:${NAVY}}
.rt-sub{font-size:11.5px;font-weight:700;color:${MUTED};margin-top:1px}
.report-meta{display:flex;justify-content:center;gap:26px;flex-wrap:wrap;margin:9px 22px 0;padding-bottom:10px;border-bottom:1px solid ${LINE};font-size:11.5px;color:${MUTED}}
.report-meta b{color:${NAVY};font-weight:700}

.truck-section{margin:18px 22px 0}
.truck-section:last-of-type{margin-bottom:18px}
.truck-card{border:1px solid ${LINE};border-radius:8px;overflow:hidden;page-break-inside:avoid}
.truck-titlebar{background:${NAVY};color:#fff;padding:9px 18px}
.truck-title{font-size:15px;font-weight:800;letter-spacing:0.02em}

.hero{background:${HERO_BG};border-bottom:1px solid ${HERO_LINE};padding:14px 18px;text-align:center}
.hero-lbl{font-size:11px;font-weight:800;letter-spacing:0.04em;color:${ACCENT}}
.hero-val{font-size:36px;font-weight:800;color:${ACCENT};line-height:1.1;margin-top:2px;font-family:'Courier New',monospace}
.hero-unit{font-size:14px;font-weight:700;color:${ACCENT};margin-left:8px;font-family:Arial,sans-serif}

.mini-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:${LINE}}
.mini-item{background:#fff;padding:10px 14px}
.mini-lbl{font-size:9.5px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.04em}
.mini-val{font-size:15px;font-weight:800;color:${NAVY};margin-top:3px;font-family:'Courier New',monospace}

.sec-title{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.03em;color:${MUTED};padding:11px 2px 5px}
.truck-section table{width:100%}
.truck-section thead th{background:${NAVY} !important;color:#fff !important;font-size:10.5px;font-weight:700;padding:8px 10px}
.truck-section tbody td{font-size:12px;font-weight:600;color:${NAVY};padding:7px 10px}
.truck-section tbody td.r{font-weight:700;font-family:'Courier New',monospace}
.truck-section tbody tr:nth-child(even) td{background:${BG_SOFT}}
.truck-section tr.band td{background:#fdf3e7 !important}

.status{font-weight:700}
.st-ok{color:${OK_COLOR}}
.st-pending{color:${MUTED};font-weight:600;font-style:italic}
.st-missing{color:${WARN_COLOR}}
.st-invalid{color:${BAD_COLOR}}

.footnote{font-size:9.5px;color:${MUTED};padding:6px 2px 2px;font-style:italic}
.empty-row td{text-align:center;color:${MUTED};padding:14px;font-style:italic}

.global-summary{margin:22px 22px 16px;border:2px solid ${NAVY};border-radius:8px;overflow:hidden;page-break-inside:avoid}
.gs-title{background:${NAVY};color:#fff;padding:10px 18px;font-size:13px;font-weight:800;letter-spacing:0.03em;text-transform:uppercase}
.gs-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:${LINE}}
.gs-item{background:#fff;padding:14px 16px}
.gs-item.main{background:${HERO_BG}}
.gs-lbl{font-size:10px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.04em}
.gs-val{font-size:19px;font-weight:800;color:${NAVY};margin-top:4px;font-family:'Courier New',monospace}
.gs-item.main .gs-val{color:${ACCENT}}
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
  <div class="gs-title">Résumé global de consommation — ${camionLabel}</div>
  <div class="gs-grid">
    <div class="gs-item"><div class="gs-lbl">Total KM</div><div class="gs-val">${fmt(fleetTotals.distanceTotal)}</div></div>
    <div class="gs-item"><div class="gs-lbl">Total Litres</div><div class="gs-val">${fmt(fleetTotals.litresTotal)} L</div></div>
    <div class="gs-item main"><div class="gs-lbl">L/100 KM</div><div class="gs-val">${consoStr(fleetTotals.consoL100)}</div></div>
    <div class="gs-item"><div class="gs-lbl">Coût total</div><div class="gs-val">${fmtMoney(fleetTotals.coutTotal)}</div></div>
    <div class="gs-item"><div class="gs-lbl">DH / km</div><div class="gs-val">${fleetTotals.coutKm !== null ? fmtMoney(fleetTotals.coutKm) : '—'}</div></div>
  </div>
</div>` : ''}
${printFooter(printDate)}
</body></html>`

  openPrintWindow(html)
}
