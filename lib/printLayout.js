// ── Shared printable-statement layout ────────────────────────────────────────
// Extracted from the Client Statement print layout (pages/clients/index.js,
// printClient()) which is the visual reference for every printable statement
// in the app. These helpers only build presentational HTML/CSS fragments —
// they never compute, filter, sort, or total data. Each page still owns its
// own calculations and simply passes already-computed values in.
//
// Structure every standardized statement follows:
//   1. printHeader()   — DAR SADIK company header (logo, contacts, print button)
//   2. entityCard()     — client/supplier/entity info block
//   3. summaryCards()   — optional KPI tiles (e.g. Achats / Paiements / Solde)
//   4. <table>...        — the page's own chronological table (untouched)
//   5. totalsRow() / soldeFinal() — total section at the bottom
//   6. printFooter()
//
// `accent` is a hex color driving the header/entity-card/table-header tint so
// each module keeps its own color identity (fuel=orange, brique=navy, etc.);
// nothing else about a page's colors, badges, icons or terminology changes.

export const COMPANY = {
  name: 'DAR SADIK',
  tagline: 'Matériaux de Construction',
  address: 'Selouane, Nador',
}

// Base CSS shared by every standardized print document. Append page-specific
// extra rules (badge colors, extra tables, etc.) after this string.
export function printBaseCss(accent) {
  return `
  @page{margin:0mm}
  @media print{.btn-p{display:none!important}}
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:13.5px;color:#1e293b;background:#fff;border-top:4px solid ${accent}}
  .hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:12px 24px 10px;border-bottom:1px solid #e2e8f0}
  .co-n{font-size:20px;font-weight:900;color:${accent};text-transform:uppercase;letter-spacing:0.5px;line-height:1}
  .co-tag{font-size:11px;color:#2563eb;font-weight:700;margin-top:2px}
  .co-addr{font-size:11px;color:#475569;margin-top:5px}
  .co-r{text-align:right;flex-shrink:0}
  .btn-p{padding:4px 10px;border:none;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;background:#475569;color:#fff}
  .ent-section{padding:12px 24px 14px;border-bottom:2px solid #e2e8f0}
  .ent-card{display:flex;align-items:center;gap:18px;background:#f0f7ff;border:1.5px solid #bfdbfe;border-left:5px solid ${accent};border-radius:10px;padding:14px 22px}
  .ent-avatar{width:58px;height:58px;border-radius:50%;background:${accent};color:#fff;font-size:26px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0;letter-spacing:-1px}
  .ent-name{font-size:26px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;line-height:1}
  .ent-meta{font-size:12px;color:#374151;margin-top:7px;line-height:1.8}
  .kpi-row{display:flex;gap:14px;padding:14px 24px 0}
  .kpi{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-top:3px solid ${accent};border-radius:8px;padding:12px 16px}
  .kpi-lbl{font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em}
  .kpi-val{font-size:20px;font-weight:900;color:#0f172a;margin-top:4px;font-family:'Courier New',monospace}
  .bdy{padding:10px 24px}
  .sec-title{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;color:${accent};border-bottom:1.5px solid ${accent};padding-bottom:4px;margin:20px 0 8px}
  table{width:100%;border-collapse:collapse}
  thead th{background:${accent} !important;color:#ffffff !important;padding:10px 12px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;text-align:left;white-space:nowrap}
  thead th.r{text-align:right}
  tbody tr{page-break-inside:avoid}
  tbody td{padding:9.5px 12px;font-size:13.5px;color:#1e293b;border-bottom:1px solid #edf1f5;vertical-align:middle;line-height:1.45}
  tbody td.r{text-align:right;font-family:'Courier New',monospace;white-space:nowrap}
  tbody td.m{color:#374151;font-size:12.5px;font-weight:500;white-space:nowrap}
  tbody tr.band td{background:#f6f8fb !important}
  tbody tr.grp-end td{border-bottom:1.5px solid #c3ccd6 !important}
  tfoot td{padding:10px 12px;font-weight:800;border-top:2px solid #c3ccd6}
  .tag{display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;letter-spacing:0.03em;white-space:nowrap}
  .totals-row{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;margin-top:10px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;font-weight:800;font-size:14px;color:#5b21b6}
  .totals-amt{font-size:16px;font-weight:600;font-family:'Courier New',monospace}
  .solde-final{border-radius:10px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-top:12px}
  .solde-final.pos{background:#f0fdf4;border:2px solid #86efac}
  .solde-final.neg{background:#fef2f2;border:2px solid #fca5a5}
  .sf-lbl{font-size:12px;font-weight:700;letter-spacing:0.01em}
  .solde-final.pos .sf-lbl{color:#166534}
  .solde-final.neg .sf-lbl{color:#991b1b}
  .sf-amt{font-size:34px;font-weight:900;line-height:1;letter-spacing:-0.5px}
  .solde-final.pos .sf-amt{color:#15803d}
  .solde-final.neg .sf-amt{color:#dc2626}
  .sf-unit{font-size:12px;font-weight:600;margin-left:4px}
  .solde-final.pos .sf-unit{color:#4ade80}
  .solde-final.neg .sf-unit{color:#f87171}
  .sf-sub{font-size:10px;margin-top:2px}
  .solde-final.pos .sf-sub{color:#86efac}
  .solde-final.neg .sf-sub{color:#fca5a5}
  .foot{display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0}
  `
}

export function printLogoSvg() {
  return `<svg width="44" height="44" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="90" fill="#1e3a5f"/><polygon points="40,170 256,50 472,170" fill="#e8b84b"/><rect x="60" y="175" width="115" height="70" rx="12" fill="#fff" opacity=".95"/><rect x="195" y="175" width="122" height="70" rx="12" fill="#fff" opacity=".95"/><rect x="337" y="175" width="115" height="70" rx="12" fill="#fff" opacity=".95"/><rect x="60" y="260" width="85" height="70" rx="12" fill="#e8b84b" opacity=".95"/><rect x="165" y="260" width="122" height="70" rx="12" fill="#e8b84b" opacity=".95"/><rect x="307" y="260" width="145" height="70" rx="12" fill="#e8b84b" opacity=".95"/></svg>`
}

// "DD/MM/YYYY à HH:MM" — same format used across every print function today.
export function printGeneratedDate() {
  const d = new Date()
  return d.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' à ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

// Company header: logo + name/tagline/address on the left, contacts + "Généré
// le" + Imprimer/PDF button on the right. `extraRight` can prepend extra
// controls (e.g. an extra badge) before the print button.
export function printHeader({ date, extraRight = '' }) {
  return `<div class="hdr">
  <div>
    <div style="display:flex;align-items:center;gap:12px">
      ${printLogoSvg()}
      <div><div class="co-n">${COMPANY.name}</div><div class="co-tag">${COMPANY.tagline}</div></div>
    </div>
    <div class="co-addr">${COMPANY.address}</div>
  </div>
  <div class="co-r">
    <div style="font-size:11px;color:#1e3a5f;line-height:1.85">
      <strong>Mohamed</strong> 06 61 32 56 65 &nbsp;·&nbsp; <strong>Sadik</strong> 06 61 97 87 47<br>
      <strong>Bureau</strong> 06 62 82 88 20<br>
      <span style="color:#2563eb">Dar.sadik@hotmail.com</span>
    </div>
    <div style="font-size:9.5px;color:#94a3b8;margin-top:3px">Généré le ${date}</div>
    <div style="margin-top:4px">${extraRight}<button class="btn-p" onclick="window.print()">Imprimer / PDF</button></div>
  </div>
</div>`
}

// Entity info block (client / supplier / truck / etc.). `avatarText` is
// typically the entity's initial letter. `metaHtml` is caller-built inline
// HTML for the meta line (e.g. "Dépôt: ... · Tél: ... · Période: ...").
export function entityCard({ avatarText, name, metaHtml }) {
  return `<div class="ent-section">
  <div class="ent-card">
    <div class="ent-avatar">${avatarText}</div>
    <div>
      <div class="ent-name">${name}</div>
      <div class="ent-meta">${metaHtml}</div>
    </div>
  </div>
</div>`
}

// Optional KPI tiles row, e.g. summaryCards([{label:'Achats période', value:'12 000 DHS'}, ...])
export function summaryCards(items) {
  if (!items || !items.length) return ''
  return `<div class="kpi-row">${items.map(it =>
    `<div class="kpi"><div class="kpi-lbl">${it.label}</div><div class="kpi-val"${it.color ? ` style="color:${it.color}"` : ''}>${it.value}</div></div>`
  ).join('')}</div>`
}

// Subtotal pill above the final balance card (purple, matches reference).
export function totalsRow(label, amountHtml) {
  return `<div class="totals-row"><span>${label}</span><span class="totals-amt">${amountHtml}</span></div>`
}

// Final balance card — green when the amount is >= 0, red otherwise
// (universal accounting convention, independent of module accent color).
export function soldeFinal({ label, amountFormatted, amount, sub = '' }) {
  const isPos = amount >= 0
  return `<div class="solde-final ${isPos ? 'pos' : 'neg'}">
  <div><div class="sf-lbl">${label}</div>${sub ? `<div class="sf-sub">${sub}</div>` : ''}</div>
  <div style="text-align:right"><div style="line-height:1"><span class="sf-amt">${amountFormatted}</span><span class="sf-unit">DHS</span></div></div>
</div>`
}

export function printFooter(date) {
  return `<div class="foot"><span>${COMPANY.name} — ${COMPANY.tagline} — ${COMPANY.address}</span><span>Généré le ${date}</span></div>`
}
