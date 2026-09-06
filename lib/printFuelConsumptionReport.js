// ── Truck Fuel Consumption Report — print/PDF ────────────────────────────────
// Presentation only: every number here is read straight off
// lib/services/fuelConsumptionReport.js's own output (itself a thin reuse of
// lib/services/fleetFuelMonitoring.js — nothing here recomputes distance,
// litres, or consumption). `byTruck`/`fleetTotals` are exactly what the
// on-screen report table renders, already scoped to the user's selected
// truck(s) and date range.
import { fmt, fmtD, fmtDate, openPrintWindow } from './utils'
import { printBaseCss, printHeader, printGeneratedDate, entityCard, printFooter } from './printLayout'

const ACCENT = '#f97316' // same orange used by every other fuel/gasoil report

function periodRow(camionPlaque, p) {
  const invalid = p.status === 'invalid'
  return `<tr class="${invalid ? 'band' : ''}">
    <td class="m">${camionPlaque}</td>
    <td class="m">${fmtDate(p.previousDate)}</td>
    <td class="r">${fmt(p.previousKm)}</td>
    <td class="m">${fmtDate(p.date)}</td>
    <td class="r">${fmt(p.km)}</td>
    <td class="r">${fmt(p.distance)} km</td>
    <td class="r">${fmtD(p.liters)} L</td>
    <td class="r">${p.consoL100 !== null ? p.consoL100.toFixed(2) : (invalid ? 'N/A — KM invalide' : 'N/A')}</td>
  </tr>`
}

function truckGroupRows({ camionPlaque, periods, summary }) {
  if (periods.length === 0) {
    return `<tr><td class="m"><b>${camionPlaque}</b></td><td class="m" colspan="7" style="color:#94a3b8;font-style:italic">Aucune période mesurable sur la sélection</td></tr>`
  }
  const rows = periods.map(p => periodRow(camionPlaque, p)).join('')
  const subtotal = `<tr class="grp-end" style="background:#f8fafc">
    <td class="m"><b>${camionPlaque} — sous-total</b></td>
    <td class="m" colspan="3"></td>
    <td class="r"><b>${fmt(summary.distanceTotal)} km</b></td>
    <td class="r"><b>${fmtD(summary.litresTotal)} L</b></td>
    <td class="r"><b>${summary.consoL100 !== null ? summary.consoL100.toFixed(2) : '—'}</b></td>
  </tr>`
  return rows + subtotal
}

// `byTruck`/`fleetTotals`: buildConsumptionReport()'s own output.
// `truckLabel`: display string for the selected truck(s) (e.g. "AZ-1234" or
// "3 camions sélectionnés" or "Tous les camions").
export function printFuelConsumptionReport({ byTruck, fleetTotals, from, to, truckLabel }) {
  if (!byTruck || byTruck.length === 0) return
  const printDate = printGeneratedDate()
  const periode = `${fmtDate(from)} → ${fmtDate(to)}`
  const isMulti = byTruck.length > 1

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Truck Fuel Consumption Report — DAR SADIK</title>
<style>
${printBaseCss(ACCENT)}
@page {
  size: A4 landscape;
  margin: 15mm 12mm 16mm 12mm;
  @bottom-left  { content: "Généré par DAR SADIK ERP · ${printDate}"; font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; }
  @bottom-right { content: "Page " counter(page) " / " counter(pages); font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; }
}
.report-title{margin:16px 24px 0;font-size:20px;font-weight:900;letter-spacing:0.06em;color:#0f172a;text-transform:uppercase}
.report-sub{margin:2px 24px 0;font-size:11px;color:#64748b}
tr.band td{background:#fffbeb !important}
.footnote{font-size:10px;color:#64748b;padding:8px 24px 4px;font-style:italic}
.grand-totals{margin:22px 24px 8px;border:2px solid ${ACCENT};border-radius:12px;overflow:hidden;page-break-inside:avoid}
.gt-title{background:${ACCENT};color:#fff;padding:10px 18px;font-size:13px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase}
.gt-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#e2e8f0}
.gt-item{background:#fff;padding:14px 18px}
.gt-lbl{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em}
.gt-val{font-size:19px;font-weight:900;color:#0f172a;margin-top:4px;font-family:'Courier New',monospace}
</style></head><body>
${printHeader({ date: printDate })}
<div class="report-title">Truck Fuel Consumption Report</div>
<div class="report-sub">Camion(s): <b>${truckLabel}</b> &nbsp;·&nbsp; Période: <b>${periode}</b> &nbsp;·&nbsp; Généré le ${printDate}</div>
${entityCard({
  avatarText: '⛽',
  name: 'Rapport de consommation carburant',
  metaHtml: `Consommation mesurée par période Plein complet → Plein complet, chronologique et continue sur l'historique de chaque camion.`,
})}
<div class="bdy">
<table>
  <thead><tr>
    <th>Camion</th><th>Plein précédent</th><th class="r">KM précédent</th>
    <th>Plein clôture</th><th class="r">KM clôture</th>
    <th class="r">Distance</th><th class="r">Litres consommés</th><th class="r">Consommation (L/100km)</th>
  </tr></thead>
  <tbody>
    ${byTruck.map(truckGroupRows).join('')}
  </tbody>
</table>
<div class="footnote">Chaque ligne correspond à une période mesurée entre deux pleins avec KM connu. Une consommation "N/A" signifie une donnée insuffisante ou un KM invalide — jamais une valeur inventée.</div>
</div>
${isMulti ? `
<div class="grand-totals">
  <div class="gt-title">Total ${truckLabel}</div>
  <div class="gt-grid">
    <div class="gt-item"><div class="gt-lbl">Distance totale</div><div class="gt-val">${fmt(fleetTotals.distanceTotal)} km</div></div>
    <div class="gt-item"><div class="gt-lbl">Litres consommés</div><div class="gt-val">${fmt(fleetTotals.litresTotal)} L</div></div>
    <div class="gt-item"><div class="gt-lbl">Consommation moyenne pondérée</div><div class="gt-val">${fleetTotals.consoL100 !== null ? fleetTotals.consoL100.toFixed(2) + ' L/100km' : '—'}</div></div>
  </div>
</div>` : ''}
${printFooter(printDate)}
</body></html>`

  openPrintWindow(html)
}
