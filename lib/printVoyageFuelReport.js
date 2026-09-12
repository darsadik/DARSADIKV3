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
//
// Deliberately truck-total-free and summary-free (by request): the voyage
// table is the sole content per truck — no hero/KPI card, no "TOTAL CAMION"
// block, no fleet-wide recap table. Every number a reader could want is
// already on each voyage's own row (distance, litres, L/100km, cost, Plein
// utilisé) — nothing here computes or displays an aggregate anywhere.
import { fmt, fmtMoney, fmtDate, openPrintWindow } from './utils'
import { printBaseCss, printHeader, printGeneratedDate, printFooter } from './printLayout'
import { voyageReportStatus, hasRealLiters } from './services/voyageFuelReport'

const NAVY = '#1e3a5f'
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

// One `<div class="plein-item">` per Plein this voyage drew from — read
// straight off `row.contributions` (buildCamionFuelAllocationTable's own
// per-voyage reverse index, threaded through unchanged by
// buildVoyageKmFuelTimeline). Reference is the real `gasoil.id` (`#<id>`,
// same convention already used for orphan links in GasoilSection.js) next to
// that Plein's own original quantity (`purchaseQte`) — never the voyage's
// own consumption, and never a fabricated reference. `resolvedBy === 'date'`
// (fuelAllocation.js's Priority 2 fallback) means that Plein had no KM of its
// own, so it's flagged inline rather than silently shown as a normal match.
function pleinLabel(c) {
  const flag = c.resolvedBy === 'date' ? ' <span class="plein-flag">(KM manquant)</span>' : ''
  return `<div class="plein-item"><b>#${c.gasoilId}</b> — ${fmtMoney(c.purchaseQte)} L${flag}</div>`
}

function pleinCell(row) {
  const contribs = row.contributions || []
  if (contribs.length === 0) return '—'
  return contribs.map(pleinLabel).join('')
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
    <td class="plein">${pleinCell(row)}</td>
  </tr>`
}

// One block per truck: a titlebar (plaque + period, so the reader always
// knows whose voyages follow) directly above that truck's voyage table — no
// KPI card, no truck total. `page-break-inside:avoid` stays on the titlebar
// only (never the table itself), so a truck with many voyages can still
// flow across pages instead of being forced onto one.
function truckSection({ camion, rows, from, to }) {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.voyageId - b.voyageId))
  return `
  <div class="truck-section">
    <div class="truck-titlebar">
      <div class="truck-title">CAMION ${camion.plaque}</div>
      <div class="truck-meta">Période : ${fmtDate(from)} → ${fmtDate(to)}</div>
    </div>

    <table>
      <thead><tr>
        <th class="col-date">Date</th><th class="col-voyage">Voyage</th><th class="col-dest">Destination</th>
        <th class="r col-km">KM</th><th class="r col-gasoil">Gasoil</th><th class="r col-l100">L/100 KM</th><th class="r col-cout">Coût</th>
        <th class="col-plein">Plein utilisé</th>
      </tr></thead>
      <tbody>${sorted.length ? sorted.map(voyageRow).join('') : '<tr class="empty-row"><td colspan="8">Aucun voyage sur la période sélectionnée</td></tr>'}</tbody>
    </table>
  </div>`
}

// `byTruck`/`from`/`to`: buildVoyageFuelReport()'s own output — the exact
// same data the on-screen report panel shows. `truckLabel`: display string
// for the selected truck(s) header line. `fleetTotals` is accepted for call-
// signature compatibility with the on-screen panel but intentionally unused
// here — this report is voyage-detail-only, by request (no fleet recap).
export function printVoyageFuelReport({ byTruck, fleetTotals, from, to, truckLabel }) {
  if (!byTruck || byTruck.length === 0) return
  const printDate = printGeneratedDate()
  const periode = `${fmtDate(from)} → ${fmtDate(to)}`
  const filenameTruckPart = byTruck.length === 1 ? byTruck[0].camion.plaque : 'Multi-Camions'
  const filename = `Rapport_Voyages_Carburant_${filenameTruckPart}_${fmtDateDash(from)}_${fmtDateDash(to)}`

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>${filename}</title>
<style>
${printBaseCss(NAVY)}
@page {
  size: A4 portrait;
  margin: 14mm 9mm 16mm 9mm;
  @bottom-left  { content: "${periode} · Généré le ${printDate}"; font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; }
  @bottom-right { content: "Page " counter(page) " / " counter(pages); font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; }
}
body{color:${NAVY};font-size:12.5px}
.report-title{margin:12px 10px 0;text-align:center}
.rt-main{font-size:19px;font-weight:800;letter-spacing:0.01em;color:${NAVY}}
.rt-sub{font-size:11px;font-weight:700;color:${MUTED};margin-top:1px}
.report-meta{display:flex;justify-content:center;gap:18px;flex-wrap:wrap;margin:8px 10px 0;padding-bottom:8px;border-bottom:1px solid ${LINE};font-size:11px;color:${MUTED}}
.report-meta b{color:${NAVY};font-weight:700}

.truck-section{margin:16px 10px 0}
.truck-section:last-of-type{margin-bottom:16px}
.truck-titlebar{background:${NAVY};color:#fff;padding:10px 16px;border-radius:7px 7px 0 0;display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:6px;page-break-inside:avoid}
.truck-title{font-size:16px;font-weight:800;letter-spacing:0.02em}
.truck-meta{font-size:11.5px;color:#cbd5e1;font-weight:700}

.truck-section table{width:100%;table-layout:fixed;border:1px solid ${LINE};border-top:none;border-radius:0 0 7px 7px}
.truck-section thead th{background:${NAVY} !important;color:#fff !important;font-size:11.5px;font-weight:800;padding:10px 10px}
.truck-section th.col-date{width:8%}
.truck-section th.col-voyage{width:10%}
.truck-section th.col-dest{width:20%}
.truck-section th.col-km{width:6%}
.truck-section th.col-gasoil{width:8%}
.truck-section th.col-l100{width:7%}
.truck-section th.col-cout{width:10%}
.truck-section th.col-plein{width:31%}
.truck-section tbody td{font-size:12.5px;font-weight:700;color:${NAVY};padding:10px 10px;overflow-wrap:break-word}
.truck-section td.dest{font-weight:700}
.truck-section td.dest .sub{font-size:9.5px;font-weight:600;color:${MUTED};margin-top:1px}
.truck-section tbody td.r{font-weight:800;font-family:'Courier New',monospace;white-space:nowrap}
.truck-section tbody tr:nth-child(even) td{background:${BG_SOFT}}
.truck-section tr.band td{background:#fdf6ec !important}
.note{font-family:Arial,sans-serif;font-weight:700;font-size:9px;margin-top:1px;white-space:normal}
.note-date{color:${WARN_COLOR}}
.note-missing{color:${BAD_COLOR}}
.note-pending{color:${MUTED};font-style:italic}
.truck-section td.plein{font-size:11.5px;font-weight:700}
.plein-item + .plein-item{margin-top:3px}
.plein-item b{font-weight:800}
.plein-flag{font-size:9px;font-weight:700;color:${WARN_COLOR};white-space:normal}
.empty-row td{text-align:center;color:${MUTED};padding:14px;font-style:italic}
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
${printFooter(printDate)}
</body></html>`

  openPrintWindow(html)
}
