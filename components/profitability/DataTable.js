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

export function exportPrint(rows, columns, title, subtitle) {
  const accent = '#2563eb'
  const printDate = printGeneratedDate()
  const printCols = columns.filter(c => c.exportValue || c.sortValue)
  const th = printCols.map(c => `<th class="${c.right ? 'r' : ''}">${c.label}</th>`).join('')
  const tr = rows.map(row => `<tr>${printCols.map(c => {
    const v = (c.exportValue || c.sortValue)(row)
    return `<td class="${c.right ? 'r' : c.center ? 'm' : ''}" style="${c.center ? 'text-align:center' : ''}">${v ?? ''}</td>`
  }).join('')}</tr>`).join('')

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>${title} — DAR SADIK</title>
<style>
${printBaseCss(accent)}
@page{size:landscape;margin:12mm}
</style></head><body>
${printHeader({ date: printDate })}
<div class="periode-bar" style="padding:13px 24px;border-bottom:2px solid #e2e8f0;font-size:13px;color:#1e293b;font-weight:600">
  ${title}${subtitle ? ` &nbsp;·&nbsp; <strong style="color:${accent};font-weight:800">${subtitle}</strong>` : ''}
</div>
<div class="bdy">
<table>
  <thead><tr>${th}</tr></thead>
  <tbody>${tr}</tbody>
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
            <button onClick={() => exportPrint(sorted, columns, title || exportFilename, subtitle)}
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
            ) : sorted.map(row => (
              <tr key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-slate-50 transition ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName ? rowClassName(row) : 'hover:bg-slate-50'}`}>
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
