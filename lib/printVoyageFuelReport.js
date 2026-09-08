// ── Voyage Fuel Report — print/PDF ───────────────────────────────────────────
// Presentation only: every number here is read straight off
// lib/services/voyageFuelReport.js's own output (itself a thin filter/group/
// total over lib/services/voyageKmFuel.js's buildVoyageKmFuelTimeline — the
// SAME authoritative fuel-allocation engine result the Truck Control Center's
// Chronologie/Allocation tabs already show). Nothing here recomputes a
// voyage's distance, litres, or cost. Same restrained corporate palette as
// lib/printControleKmCarburant.js / lib/printFuelConsumptionReport.js (navy +
// one muted accent), kept consistent across every fuel/gasoil PDF report —
// A4 PORTRAIT here specifically (management document, not a wide data table).
import { fmt, fmtMoney, fmtDate, openPrintWindow } from './utils'
import { printBaseCss, printHeader, printGeneratedDate, printFooter } from './printLayout'
import { voyageReportStatus, hasRealLiters } from './services/voyageFuelReport'

const NAVY = '#1e3a5f'
const ACCENT = '#2563eb'
const HERO_BG = '#eff6ff'
const HERO_LINE = '#bfdbfe'
const MUTED = '#64748b'
const LINE = '#dbe2ea'
const BG_SOFT = '#f7f8fa'
const WARN_COLOR = '#b45309'
const BAD_COLOR = '#b91c1c'

function fmtDateDash(d) {
  const s = fmtDate(d)
  return s === '—' ? '' : s.replace(/\//g, '-')
}

function consoStr(v) {
  return v !== null && v !== undefined ? fmtMoney(v) : '—'
}

function voyageRow(row) {
  const st = voyageReportStatus(row)
  const km = row.distance !== null && row.distance !== undefined ? `${fmt(row.distance)}` : '—'
  const hasLiters = hasRealLiters(row)
  const gasoil = hasLiters ? `${fmtMoney(row.litersLinked)} L` : '—'
  const conso = hasLiters && row.distance > 0 ? consoStr((row.litersLinked / row.distance) * 100) : '—'
  const cout = row.fuelCost !== null && row.fuelCost !== undefined && row.fuelCost > 0 ? `${fmtMoney(row.fuelCost)} DH` : '—'
  const noteCls = st.tone === 'date' ? 'note-date' : st.tone === 'missing' ? 'note-missing' : st.tone === 'pending' ? 'note-pending' : ''
  return `<tr class="${st.tone !== 'ok' ? 'band' : ''}">
    <td class="m">${fmtDate(row.date)}</td>
    <td class="m">${row.reference}</td>
    <td class="dest">${row.destination || '—'}${row.clientNames && row.clientNames.length ? `<div class="sub">${row.clientNames.join(', ')}</div>` : ''}</td>
    <td class="r">${km}</td>
    <td class="r">${gasoil}</td>
    <td class="r">${conso}</td>
    <td class="r">${cout}${st.tone !== 'ok' ? `<div class="note ${noteCls}">${st.text}</div>` : ''}</td>
  </tr>`
}

// One clearly separated block per truck: titlebar + hero (L/100km, the
// report's main purpose — §6/§18) + a compact KPI band, then the
// chronological voyage table, then a strong-but-clean truck total (§9).
function truckSection({ camion, rows, from, to, voyagesCount, measuredCount, kmTotal, litersTotal, coutTotal, consoL100, coutKm }) {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.voyageId - b.voyageId))
  return `
  <div class="truck-section">
    <div class="truck-card">
      <div class="truck-titlebar">
        <div class="truck-title">CAMION ${camion.plaque}</div>
        <div class="truck-meta">Période : ${fmtDate(from)} → ${fmtDate(to)}</div>
      </div>
      <div class="hero">
        <div class="hero-lbl">CONSOMMATION</div>
        <div class="hero-val">${consoStr(consoL100)}<span class="hero-unit">L / 100 KM</span></div>
      </div>
      <div class="mini-grid">
        <div class="mini-item"><div class="mini-lbl">Voyages</div><div class="mini-val">${voyagesCount}</div></div>
        <div class="mini-item"><div class="mini-lbl">KM total</div><div class="mini-val">${fmt(kmTotal)} KM</div></div>
        <div class="mini-item"><div class="mini-lbl">Gasoil total</div><div class="mini-val">${fmtMoney(litersTotal)} L</div></div>
        <div class="mini-item"><div class="mini-lbl">Coût Gasoil</div><div class="mini-val">${fmtMoney(coutTotal)} DH</div></div>
        <div class="mini-item"><div class="mini-lbl">DH / KM</div><div class="mini-val">${coutKm !== null ? fmtMoney(coutKm) : '—'}</div></div>
      </div>
    </div>

    <table>
      <thead><tr>
        <th>Date</th><th>Voyage</th><th>Destination</th>
        <th class="r">KM</th><th class="r">Gasoil</th><th class="r">L/100 KM</th><th class="r">Coût</th>
      </tr></thead>
      <tbody>${sorted.length ? sorted.map(voyageRow).join('') : '<tr class="empty-row"><td colspan="7">Aucun voyage sur la période sélectionnée</td></tr>'}</tbody>
    </table>

    <div class="truck-total">
      <div class="tt-title">TOTAL CAMION ${camion.plaque}</div>
      <div class="tt-grid">
        <div class="tt-item"><div class="tt-lbl">Voyages</div><div class="tt-val">${voyagesCount}</div></div>
        <div class="tt-item"><div class="tt-lbl">Total KM</div><div class="tt-val">${fmt(kmTotal)}</div></div>
        <div class="tt-item"><div class="tt-lbl">Total Gasoil</div><div class="tt-val">${fmtMoney(litersTotal)} L</div></div>
        <div class="tt-item main"><div class="tt-lbl">L/100 KM</div><div class="tt-val">${consoStr(consoL100)}</div></div>
        <div class="tt-item"><div class="tt-lbl">Coût total</div><div class="tt-val">${fmtMoney(coutTotal)}</div></div>
        <div class="tt-item"><div class="tt-lbl">DH / KM</div><div class="tt-val">${coutKm !== null ? fmtMoney(coutKm) : '—'}</div></div>
      </div>
    </div>
  </div>`
}

function summaryRow(t) {
  return `<tr>
    <td class="m"><b>${t.camion.plaque}</b></td>
    <td class="r">${t.voyagesCount}</td>
    <td class="r">${fmt(t.kmTotal)}</td>
    <td class="r">${fmtMoney(t.litersTotal)} L</td>
    <td class="r"><b>${consoStr(t.consoL100)}</b></td>
    <td class="r">${fmtMoney(t.coutTotal)}</td>
    <td class="r">${t.coutKm !== null ? fmtMoney(t.coutKm) : '—'}</td>
  </tr>`
}

// `byTruck`/`fleetTotals`/`from`/`to`: buildVoyageFuelReport()'s own output —
// the exact same data the on-screen report panel shows. `truckLabel`: display
// string for the selected truck(s) header line.
export function printVoyageFuelReport({ byTruck, fleetTotals, from, to, truckLabel }) {
  if (!byTruck || byTruck.length === 0) return
  const printDate = printGeneratedDate()
  const periode = `${fmtDate(from)} → ${fmtDate(to)}`
  const isMulti = byTruck.length > 1
  const filenameTruckPart = byTruck.length === 1 ? byTruck[0].camion.plaque : 'Multi-Camions'
  const filename = `Rapport_Voyages_Carburant_${filenameTruckPart}_${fmtDateDash(from)}_${fmtDateDash(to)}`

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>${filename}</title>
<style>
${printBaseCss(NAVY)}
@page {
  size: A4 portrait;
  margin: 14mm 12mm 16mm 12mm;
  @bottom-left  { content: "${periode} · Généré le ${printDate}"; font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; }
  @bottom-right { content: "Page " counter(page) " / " counter(pages); font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; }
}
body{color:${NAVY};font-size:10.5px}
.report-title{margin:12px 18px 0;text-align:center}
.rt-main{font-size:17px;font-weight:800;letter-spacing:0.01em;color:${NAVY}}
.rt-sub{font-size:10px;font-weight:700;color:${MUTED};margin-top:1px}
.report-meta{display:flex;justify-content:center;gap:18px;flex-wrap:wrap;margin:8px 18px 0;padding-bottom:8px;border-bottom:1px solid ${LINE};font-size:10px;color:${MUTED}}
.report-meta b{color:${NAVY};font-weight:700}

.truck-section{margin:14px 18px 0}
.truck-section:last-of-type{margin-bottom:14px}
.truck-card{border:1px solid ${LINE};border-radius:7px;overflow:hidden;page-break-inside:avoid}
.truck-titlebar{background:${NAVY};color:#fff;padding:7px 14px;display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:6px}
.truck-title{font-size:13px;font-weight:800;letter-spacing:0.02em}
.truck-meta{font-size:10px;color:#cbd5e1;font-weight:600}

.hero{background:${HERO_BG};border-bottom:1px solid ${HERO_LINE};padding:10px 14px;text-align:center}
.hero-lbl{font-size:9.5px;font-weight:800;letter-spacing:0.04em;color:${ACCENT}}
.hero-val{font-size:28px;font-weight:800;color:${ACCENT};line-height:1.1;margin-top:1px;font-family:'Courier New',monospace}
.hero-unit{font-size:12px;font-weight:700;color:${ACCENT};margin-left:7px;font-family:Arial,sans-serif}

.mini-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:${LINE}}
.mini-item{background:#fff;padding:7px 8px}
.mini-lbl{font-size:8px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.03em}
.mini-val{font-size:12px;font-weight:800;color:${NAVY};margin-top:2px;font-family:'Courier New',monospace}

.truck-section table{width:100%;table-layout:fixed;margin-top:8px}
.truck-section thead th{background:${NAVY} !important;color:#fff !important;font-size:9px;font-weight:700;padding:6px 7px}
.truck-section col-date{width:11%}
.truck-section tbody td{font-size:9.5px;font-weight:600;color:${NAVY};padding:5.5px 7px;overflow-wrap:break-word}
.truck-section td.dest{font-weight:600}
.truck-section td.dest .sub{font-size:8px;font-weight:500;color:${MUTED};margin-top:1px}
.truck-section tbody td.r{font-weight:700;font-family:'Courier New',monospace;white-space:nowrap}
.truck-section tbody tr:nth-child(even) td{background:${BG_SOFT}}
.truck-section tr.band td{background:#fdf6ec !important}
.note{font-family:Arial,sans-serif;font-weight:700;font-size:7.5px;margin-top:1px;white-space:normal}
.note-date{color:${WARN_COLOR}}
.note-missing{color:${BAD_COLOR}}
.note-pending{color:${MUTED};font-style:italic}
.empty-row td{text-align:center;color:${MUTED};padding:12px;font-style:italic}

.truck-total{border:1.5px solid ${NAVY};border-top:none;border-radius:0 0 7px 7px;overflow:hidden;page-break-inside:avoid}
.tt-title{background:${NAVY};color:#fff;padding:6px 14px;font-size:9.5px;font-weight:800;letter-spacing:0.04em}
.tt-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:${LINE}}
.tt-item{background:#fff;padding:8px 8px}
.tt-item.main{background:${HERO_BG}}
.tt-lbl{font-size:8px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.03em}
.tt-val{font-size:12px;font-weight:800;color:${NAVY};margin-top:2px;font-family:'Courier New',monospace}
.tt-item.main .tt-val{color:${ACCENT}}

.global-summary{margin:18px 18px 14px;border:2px solid ${NAVY};border-radius:7px;overflow:hidden;page-break-inside:avoid}
.gs-title{background:${NAVY};color:#fff;padding:8px 14px;font-size:11px;font-weight:800;letter-spacing:0.03em;text-transform:uppercase}
.global-summary table{width:100%}
.global-summary thead th{background:${BG_SOFT} !important;color:${NAVY} !important;font-size:9px;font-weight:800;padding:6px 8px;border-bottom:1.5px solid ${LINE}}
.global-summary tbody td{font-size:10px;font-weight:600;color:${NAVY};padding:6px 8px}
.global-summary tbody td.r{font-weight:700;font-family:'Courier New',monospace}
.global-summary tbody tr:nth-child(even) td{background:${BG_SOFT}}
</style></head><body>
${printHeader({ date: printDate })}
<div class="report-title">
  <div class="rt-main">TRUCK CONTROL CENTER</div>
  <div class="rt-sub">RAPPORT DES VOYAGES &amp; CONSOMMATION CARBURANT</div>
</div>
<div class="report-meta">
  <span>Période : <b>${periode}</b></span>
  <span>Camion(s) : <b>${truckLabel}</b></span>
  <span>Généré le : <b>${printDate}</b></span>
</div>
${byTruck.map(t => truckSection({ ...t, from, to })).join('')}
${isMulti ? `
<div class="global-summary">
  <div class="gs-title">Résumé global de consommation</div>
  <table>
    <thead><tr>
      <th>Camion</th><th class="r">Voyages</th><th class="r">KM total</th>
      <th class="r">Gasoil</th><th class="r">L/100 KM</th><th class="r">Coût Gasoil</th><th class="r">DH/KM</th>
    </tr></thead>
    <tbody>
      ${byTruck.map(summaryRow).join('')}
      <tr style="border-top:2px solid ${NAVY}">
        <td class="m"><b>TOTAL FLOTTE</b></td>
        <td class="r"><b>${fleetTotals.voyagesCount}</b></td>
        <td class="r"><b>${fmt(fleetTotals.kmTotal)}</b></td>
        <td class="r"><b>${fmtMoney(fleetTotals.litersTotal)} L</b></td>
        <td class="r"><b>${consoStr(fleetTotals.consoL100)}</b></td>
        <td class="r"><b>${fmtMoney(fleetTotals.coutTotal)}</b></td>
        <td class="r"><b>${fleetTotals.coutKm !== null ? fmtMoney(fleetTotals.coutKm) : '—'}</b></td>
      </tr>
    </tbody>
  </table>
</div>` : ''}
${printFooter(printDate)}
</body></html>`

  openPrintWindow(html)
}
