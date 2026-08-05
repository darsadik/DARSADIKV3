import { useMemo } from 'react'
import { fmtDate, fmtMoney } from '../../lib/utils'
import DataTable from './DataTable'
import MarginBadge, { marginRowClass, marginTier } from './MarginBadge'
import KpiCard from './KpiCard'

// Level 2 of the drill-down: entity row (truck/client) → this modal, listing
// every voyage that entity appears on within the current filters. Clicking a
// row opens the shared VoyageDrawer (level 3) via onOpenVoyage, same as the
// By Voyage tab.
//
// For a truck, the whole voyage's numbers ARE the truck's numbers (no split
// needed). For a client, `clientKey` selects that client's own slice
// (voyage.clients[].find by key) instead of the voyage-wide totals — a
// client's "profit on Voyage A" is their share, not everyone's combined.
//
// Cost is shown as just two lines — Gasoil and Charges (everything else
// combined) — same simplified model as ByVoyageSection. breakdown() only
// reads fields already produced by computeVoyageProfit; Charges is derived
// as total − gasoil so it always reconciles to the engine's own Total Cost.
export default function EntityDrillDrawer({ title, subtitle, voyages, clientKey, onOpenVoyage, onClose }) {
  function slice(v) {
    if (!clientKey) return v
    return v.clients.find(c => c.key === clientKey) || {
      revenue: { total: 0 }, cost: { fuelAllocated: 0, total: 0 }, profit: 0, marge: 0,
    }
  }

  function breakdown(v) {
    const d = slice(v)
    const gasoil = clientKey ? (d.cost.fuelAllocated || 0) : d.cost.fuel
    return { revenue: d.revenue.total, gasoil, charges: d.cost.total - gasoil, total: d.cost.total, profit: d.profit, marge: d.marge }
  }

  const totals = useMemo(() => {
    const acc = { revenue: 0, gasoil: 0, total: 0, profit: 0 }
    voyages.forEach(v => {
      const b = breakdown(v)
      acc.revenue += b.revenue; acc.gasoil += b.gasoil; acc.total += b.total; acc.profit += b.profit
    })
    acc.charges = acc.total - acc.gasoil
    acc.marge = acc.revenue > 0 ? Math.round(acc.profit / acc.revenue * 100) : 0
    return acc
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyages, clientKey])

  const columns = [
    { key: 'date', label: 'Date', sortValue: r => r.date_depart, render: r => fmtDate(r.date_depart) },
    { key: 'ref', label: 'Voyage', sortValue: r => r.reference || String(r.id), render: r => r.reference || `#${r.id}` },
    { key: 'camion', label: 'Camion', sortValue: r => r.camion_plaque, render: r => r.camion_plaque },
    { key: 'revenue', label: 'Revenu', right: true, sortValue: r => breakdown(r).revenue, exportValue: r => Math.round(breakdown(r).revenue), render: r => <span className="font-bold text-emerald-600">{fmtMoney(breakdown(r).revenue)}</span> },
    { key: 'gasoil', label: 'Gasoil', right: true, sortValue: r => breakdown(r).gasoil, exportValue: r => Math.round(breakdown(r).gasoil), render: r => breakdown(r).gasoil > 0 ? <span className="text-red-400">−{fmtMoney(breakdown(r).gasoil)}</span> : '—' },
    { key: 'charges', label: 'Charges', right: true, sortValue: r => breakdown(r).charges, exportValue: r => Math.round(breakdown(r).charges), render: r => breakdown(r).charges > 0 ? <span className="text-red-400">−{fmtMoney(breakdown(r).charges)}</span> : '—' },
    { key: 'totalCost', label: '= Coût total', right: true, sortValue: r => breakdown(r).total, exportValue: r => Math.round(breakdown(r).total), render: r => <span className="font-bold text-red-700">−{fmtMoney(breakdown(r).total)}</span> },
    { key: 'profit', label: '= Profit', right: true, sortValue: r => breakdown(r).profit, exportValue: r => Math.round(breakdown(r).profit), render: r => (
      <span className={`font-black ${breakdown(r).profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{breakdown(r).profit >= 0 ? '+' : ''}{fmtMoney(breakdown(r).profit)}</span>
    ) },
    { key: 'marge', label: 'Marge', right: true, sortValue: r => breakdown(r).marge, exportValue: r => breakdown(r).marge, render: r => <MarginBadge marge={breakdown(r).marge} /> },
  ]

  function footer(rows) {
    const t = rows.reduce((acc, r) => {
      const b = breakdown(r)
      acc.revenue += b.revenue; acc.gasoil += b.gasoil; acc.total += b.total; acc.profit += b.profit
      return acc
    }, { revenue: 0, gasoil: 0, total: 0, profit: 0 })
    const charges = t.total - t.gasoil
    const marge = t.revenue > 0 ? Math.round(t.profit / t.revenue * 100) : 0
    return (
      <tfoot>
        <tr className="border-t-2 border-slate-300 bg-gradient-to-r from-slate-800 to-slate-900 text-white">
          <td colSpan={3} className="py-3 px-3 font-black text-sm uppercase">Total ({rows.length} voyages)</td>
          <td className="py-3 px-3 text-right font-black text-emerald-400">{fmtMoney(t.revenue)}</td>
          <td className="py-3 px-3 text-right font-bold text-red-300">−{fmtMoney(t.gasoil)}</td>
          <td className="py-3 px-3 text-right font-bold text-red-300">−{fmtMoney(charges)}</td>
          <td className="py-3 px-3 text-right font-black text-red-200">−{fmtMoney(t.total)}</td>
          <td className={`py-3 px-3 text-right font-black ${t.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{t.profit >= 0 ? '+' : ''}{fmtMoney(t.profit)}</td>
          <td className="py-3 px-3 text-right font-black text-blue-300">{marge}%</td>
        </tr>
      </tfoot>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-black text-slate-800 text-sm">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1">×</button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {/* Summary cards — instant overview before the detailed table */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Revenu" icon="💰" color="green" large value={fmtMoney(totals.revenue) + ' DHS'} />
            <KpiCard label="Gasoil" icon="⛽" color="red" value={fmtMoney(totals.gasoil) + ' DHS'} />
            <KpiCard label="Charges" icon="💸" color="red" value={fmtMoney(totals.charges) + ' DHS'} />
            <KpiCard label="Coût total" icon="🧾" color="darkred" large value={fmtMoney(totals.total) + ' DHS'} />
            <KpiCard label="Profit" icon={totals.profit >= 0 ? '✅' : '❌'} color={totals.profit >= 0 ? 'green' : 'red'} large
              value={(totals.profit >= 0 ? '+' : '') + fmtMoney(totals.profit) + ' DHS'} />
            <KpiCard label="Marge" icon="📈" color={{ high: 'green', medium: 'blue', low: 'orange', loss: 'red' }[marginTier(totals.marge).key]} large value={totals.marge + '%'} />
          </div>

          <DataTable
            columns={columns} rows={voyages} rowKey={r => r.id}
            onRowClick={r => onOpenVoyage(r.id)}
            rowClassName={r => marginRowClass(breakdown(r).marge)}
            defaultSortKey="date" footer={footer} exportFilename={title}
          />
        </div>
      </div>
    </div>
  )
}
