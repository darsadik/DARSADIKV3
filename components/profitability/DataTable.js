import { useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { openPrintWindow } from '../../lib/utils'
import { printBaseCss, printHeader, printGeneratedDate, printFooter } from '../../lib/printLayout'

// ── Generic sortable / searchable / exportable table shell ──────────────────
// Used by every tabular section of the Profitability Center (By Voyage, By
// Truck, By Client, By Supplier) so sorting/search/export logic exists once.
// Columns: { key, label, right, center, sortValue(row), render(row),
//            exportValue(row) }  — sortValue/exportValue default to render's
// return value when omitted; a column with neither is excluded from export
// (e.g. an actions/icon-only column).

function cellAlign(col) {
  return col.right ? 'text-right' : col.center ? 'text-center' : 'text-left'
}

export function exportExcel(rows, columns, filename) {
  const exportCols = columns.filter(c => c.exportValue || c.sortValue)
  const data = rows.map(row => {
    const obj = {}
    exportCols.forEach(c => { obj[c.label] = (c.exportValue || c.sortValue)(row) })
    return obj
  })
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, filename.slice(0, 31))
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// `rows` must already be exactly the set the report should cover (filtered
// and, for date-bearing tables, pre-sorted chronologically by the caller —
// see the `printSort` prop below) — this function never re-filters, re-sorts,
// or recomputes a total; it only renders. Per column:
//   printValue(row)  — pre-formatted print/PDF cell text (falls back to
//                       exportValue, then sortValue, so existing columns keep
//                       working unformatted until a section opts in)
//   total(rows)       — pre-formatted TOTAL-row cell text, reducing the exact
//                       `rows` being printed; columns without a `total` are
//                       either blank or merged into the leading "TOTAL (n)"
//                       label cell (every column before the first one that
//                       defines `total`)
export function exportPrint(rows, columns, title, subtitle) {
  const accent = '#2563eb'
  const printDate = printGeneratedDate()
  const printCols = columns.filter(c => c.exportValue || c.sortValue)
  const orientation = printCols.length <= 5 ? 'portrait' : 'landscape'
  const th = printCols.map(c => `<th class="${c.right ? 'r' : ''}">${c.label}</th>`).join('')
  const tr = rows.map(row => `<tr>${printCols.map(c => {
    const v = (c.printValue || c.exportValue || c.sortValue)(row)
    return `<td class="${c.right ? 'r' : c.center ? 'm' : ''}" style="${c.center ? 'text-align:center' : ''}">${v ?? ''}</td>`
  }).join('')}</tr>`).join('')

  const firstTotalIdx = printCols.findIndex(c => c.total)
  const totalRow = firstTotalIdx === -1 ? '' : `<tfoot><tr>
    <td colspan="${firstTotalIdx}" style="text-transform:uppercase">TOTAL (${rows.length})</td>
    ${printCols.slice(firstTotalIdx).map(c => `<td class="${c.right ? 'r' : ''}">${c.total ? c.total(rows) : ''}</td>`).join('')}
  </tr></tfoot>`

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>${title} — DAR SADIK</title>
<style>
${printBaseCss(accent)}
@page{size:${orientation};margin:12mm}
</style></head><body>
${printHeader({ date: printDate })}
<div class="periode-bar" style="padding:13px 24px;border-bottom:2px solid #e2e8f0;font-size:13px;color:#1e293b;font-weight:600">
  ${title}${subtitle ? ` &nbsp;·&nbsp; <strong style="color:${accent};font-weight:800">${subtitle}</strong>` : ''}
</div>
<div class="bdy">
<table>
  <thead><tr>${th}</tr></thead>
  <tbody>${tr}</tbody>
  ${totalRow}
</table>
${printFooter(printDate)}
</div></body></html>`
  openPrintWindow(html)
}

export default function DataTable({
  columns, rows, rowKey, onRowClick, rowClassName,
  searchable, searchFn, placeholder = 'Rechercher...',
  defaultSortKey, defaultSortAsc = false,
  footer, emptyText = 'Aucune donnée',
  title, subtitle, exportFilename = 'export',
  // Comparator forcing chronological (oldest → newest) order in the PDF/print
  // export regardless of whatever column the user has interactively sorted
  // on-screen — used by date-bearing voyage/operation lists per the
  // Rentabilité print spec. Applied to the search-filtered rows, not `sorted`,
  // so it always wins over the live UI sort state for this one export.
  printSort,
}) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState(defaultSortKey || columns[0]?.key)
  const [sortAsc, setSortAsc] = useState(defaultSortAsc)

  const filtered = useMemo(() => {
    if (!searchable || !search.trim()) return rows
    return rows.filter(r => searchFn(r, search.trim().toLowerCase()))
  }, [rows, search, searchable, searchFn])

  const sorted = useMemo(() => {
    const col = columns.find(c => c.key === sortKey)
    if (!col || !col.sortValue) return filtered
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = col.sortValue(a), bv = col.sortValue(b)
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv || '') : (bv || '').localeCompare(av)
      return sortAsc ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0)
    })
    return arr
  }, [filtered, sortKey, sortAsc, columns])

  function toggleSort(key) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {(title || searchable || exportFilename) && (
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            {title && <h3 className="font-bold text-slate-700 text-sm">{title}</h3>}
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {searchable && (
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder={placeholder}
                className="input text-xs px-3 py-1.5 rounded-lg w-48"
              />
            )}
            <button onClick={() => exportExcel(sorted, columns, exportFilename)}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
              📊 Excel
            </button>
            <button onClick={() => exportPrint(printSort ? [...filtered].sort(printSort) : sorted, columns, title || exportFilename, subtitle)}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
              🖨️ PDF
            </button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b border-slate-200">
              {columns.map(col => (
                <th key={col.key}
                  onClick={() => col.sortValue && toggleSort(col.key)}
                  className={`py-2.5 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap bg-slate-50 ${cellAlign(col)} ${col.sortValue ? 'cursor-pointer select-none hover:text-slate-600' : ''}`}>
                  {col.label}{col.sortValue && sortKey === col.key ? (sortAsc ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={columns.length} className="py-16 text-center text-slate-400">{emptyText}</td></tr>
            ) : sorted.map((row, i) => (
              <tr key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-slate-50 transition ${onRowClick ? 'cursor-pointer' : ''} ${i % 2 === 1 ? 'bg-slate-50/50' : ''} ${rowClassName ? rowClassName(row) : 'hover:bg-slate-50'}`}>
                {columns.map(col => (
                  <td key={col.key} className={`py-2.5 px-3 whitespace-nowrap ${cellAlign(col)}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && sorted.length > 0 && footer(sorted)}
        </table>
      </div>
    </div>
  )
}
