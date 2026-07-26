import { fmt, fmtDate } from '../../lib/utils'
import DataTable from './DataTable'
import MarginBadge, { marginRowClass } from './MarginBadge'

// Level 2 of the drill-down: entity row (truck/client) → this modal, listing
// every voyage that entity appears on within the current filters. Clicking a
// row opens the shared VoyageDrawer (level 3) via onOpenVoyage, same as the
// By Voyage tab.
//
// For a truck, the whole voyage's numbers ARE the truck's numbers (no split
// needed). For a client, `clientKey` selects that client's own slice
// (voyage.clients[].find by key) instead of the voyage-wide totals — a
// client's "profit on Voyage A" is their share, not everyone's combined.
export default function EntityDrillDrawer({ title, subtitle, voyages, clientKey, onOpenVoyage, onClose }) {
  function slice(v) {
    if (!clientKey) return v
    return v.clients.find(c => c.key === clientKey) || { revenue: { total: 0 }, cost: { total: 0 }, profit: 0, marge: 0 }
  }

  const columns = [
    { key: 'date', label: 'Date', sortValue: r => r.date_depart, render: r => fmtDate(r.date_depart) },
    { key: 'ref', label: 'Voyage', sortValue: r => r.reference || String(r.id), render: r => r.reference || `#${r.id}` },
    { key: 'camion', label: 'Camion', sortValue: r => r.camion_plaque, render: r => r.camion_plaque },
    { key: 'revenue', label: 'Revenu', right: true, sortValue: r => slice(r).revenue.total, exportValue: r => Math.round(slice(r).revenue.total), render: r => <span className="font-bold text-emerald-600">{fmt(slice(r).revenue.total)}</span> },
    { key: 'cost', label: 'Coût', right: true, sortValue: r => slice(r).cost.total, exportValue: r => Math.round(slice(r).cost.total), render: r => <span className="text-red-400">−{fmt(slice(r).cost.total)}</span> },
    { key: 'profit', label: '= Profit', right: true, sortValue: r => slice(r).profit, exportValue: r => Math.round(slice(r).profit), render: r => (
      <span className={`font-black ${slice(r).profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{slice(r).profit >= 0 ? '+' : ''}{fmt(slice(r).profit)}</span>
    ) },
    { key: 'marge', label: 'Marge', right: true, sortValue: r => slice(r).marge, exportValue: r => slice(r).marge, render: r => <MarginBadge marge={slice(r).marge} /> },
  ]

  function footer(rows) {
    const rev = rows.reduce((s, r) => s + slice(r).revenue.total, 0)
    const cost = rows.reduce((s, r) => s + slice(r).cost.total, 0)
    const profit = rows.reduce((s, r) => s + slice(r).profit, 0)
    const marge = rev > 0 ? Math.round(profit / rev * 100) : 0
    return (
      <tfoot>
        <tr className="border-t-2 border-slate-300 bg-gradient-to-r from-slate-800 to-slate-900 text-white">
          <td colSpan={3} className="py-3 px-3 font-black text-sm uppercase">Total ({rows.length} voyages)</td>
          <td className="py-3 px-3 text-right font-black text-emerald-400">{fmt(rev)}</td>
          <td className="py-3 px-3 text-right font-bold text-red-300">−{fmt(cost)}</td>
          <td className={`py-3 px-3 text-right font-black ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{profit >= 0 ? '+' : ''}{fmt(profit)}</td>
          <td className="py-3 px-3 text-right font-black text-blue-300">{marge}%</td>
        </tr>
      </tfoot>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-black text-slate-800 text-sm">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1">×</button>
        </div>
        <div className="overflow-y-auto p-4">
          <DataTable
            columns={columns} rows={voyages} rowKey={r => r.id}
            onRowClick={r => onOpenVoyage(r.id)}
            rowClassName={r => marginRowClass(slice(r).marge)}
            defaultSortKey="date" footer={footer} exportFilename={title}
          />
        </div>
      </div>
    </div>
  )
}
