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
// breakdown() below only picks between two ALREADY-COMPUTED shapes coming out
// of computeVoyageProfit (voyage-level cost.* vs per-client cost.*Allocated)
// — it performs no arithmetic of its own beyond reading fields, so every
// number shown here is exactly what the engine produced.
export default function EntityDrillDrawer({ title, subtitle, voyages, clientKey, onOpenVoyage, onClose }) {
  function slice(v) {
    if (!clientKey) return v
    return v.clients.find(c => c.key === clientKey) || {
      revenue: { total: 0 },
      cost: { achatWAC: 0, fuelAllocated: 0, rentalAllocated: 0, workersAllocated: 0, transportAllocated: 0, otherAllocated: 0, total: 0 },
      profit: 0, marge: 0,
    }
  }

  function breakdown(v) {
    const d = slice(v)
    return clientKey ? {
      revenue: d.revenue.total, achat: d.cost.achatWAC, transport: d.cost.transportAllocated,
      fuel: d.cost.fuelAllocated, workers: d.cost.workersAllocated, rental: d.cost.rentalAllocated,
      other: d.cost.otherAllocated, total: d.cost.total, profit: d.profit, marge: d.marge,
    } : {
      revenue: d.revenue.total, achat: d.cost.achatTotal, transport: d.cost.chargesTransport,
      fuel: d.cost.fuel, workers: d.cost.chargesWorkers, rental: d.cost.rental,
      other: d.cost.chargesOther, total: d.cost.total, profit: d.profit, marge: d.marge,
    }
  }

  const totals = useMemo(() => {
    const acc = { revenue: 0, achat: 0, transport: 0, fuel: 0, workers: 0, rental: 0, other: 0, total: 0, profit: 0 }
    voyages.forEach(v => {
      const b = breakdown(v)
      acc.revenue += b.revenue; acc.achat += b.achat; acc.transport += b.transport
      acc.fuel += b.fuel; acc.workers += b.workers; acc.rental += b.rental
      acc.other += b.other; acc.total += b.total; acc.profit += b.profit
    })
    acc.marge = acc.revenue > 0 ? Math.round(acc.profit / acc.revenue * 100) : 0
    return acc
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyages, clientKey])

  const columns = [
    { key: 'date', label: 'Date', sortValue: r => r.date_depart, render: r => fmtDate(r.date_depart) },
    { key: 'ref', label: 'Voyage', sortValue: r => r.reference || String(r.id), render: r => r.reference || `#${r.id}` },
    { key: 'camion', label: 'Camion', sortValue: r => r.camion_plaque, render: r => r.camion_plaque },
    { key: 'revenue', label: 'Revenu', right: true, sortValue: r => breakdown(r).revenue, exportValue: r => Math.round(breakdown(r).revenue), render: r => <span className="font-bold text-emerald-600">{fmtMoney(breakdown(r).revenue)}</span> },
    { key: 'achat', label: 'Achats', right: true, sortValue: r => breakdown(r).achat, exportValue: r => Math.round(breakdown(r).achat), render: r => breakdown(r).achat > 0 ? <span className="text-red-400">−{fmtMoney(breakdown(r).achat)}</span> : '—' },
    { key: 'transport', label: 'Transport', right: true, sortValue: r => breakdown(r).transport, exportValue: r => Math.round(breakdown(r).transport), render: r => breakdown(r).transport > 0 ? <span className="text-red-400">−{fmtMoney(breakdown(r).transport)}</span> : '—' },
    { key: 'fuel', label: 'Carburant', right: true, sortValue: r => breakdown(r).fuel, exportValue: r => Math.round(breakdown(r).fuel), render: r => breakdown(r).fuel > 0 ? <span className="text-red-400">−{fmtMoney(breakdown(r).fuel)}</span> : '—' },
    { key: 'workers', label: 'Ouvriers', right: true, sortValue: r => breakdown(r).workers, exportValue: r => Math.round(breakdown(r).workers), render: r => breakdown(r).workers > 0 ? <span className="text-red-400">−{fmtMoney(breakdown(r).workers)}</span> : '—' },
    { key: 'rental', label: 'Location', right: true, sortValue: r => breakdown(r).rental, exportValue: r => Math.round(breakdown(r).rental), render: r => breakdown(r).rental > 0 ? <span className="text-red-400">−{fmtMoney(breakdown(r).rental)}</span> : '—' },
    { key: 'other', label: 'Autres charges', right: true, sortValue: r => breakdown(r).other, exportValue: r => Math.round(breakdown(r).other), render: r => breakdown(r).other > 0 ? <span className="text-red-400">−{fmtMoney(breakdown(r).other)}</span> : '—' },
    { key: 'totalCost', label: '= Coût total', right: true, sortValue: r => breakdown(r).total, exportValue: r => Math.round(breakdown(r).total), render: r => <span className="font-bold text-red-700">−{fmtMoney(breakdown(r).total)}</span> },
    { key: 'profit', label: '= Profit', right: true, sortValue: r => breakdown(r).profit, exportValue: r => Math.round(breakdown(r).profit), render: r => (
      <span className={`font-black ${breakdown(r).profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{breakdown(r).profit >= 0 ? '+' : ''}{fmtMoney(breakdown(r).profit)}</span>
    ) },
    { key: 'marge', label: 'Marge', right: true, sortValue: r => breakdown(r).marge, exportValue: r => breakdown(r).marge, render: r => <MarginBadge marge={breakdown(r).marge} /> },
  ]

  function footer(rows) {
    const t = rows.reduce((acc, r) => {
      const b = breakdown(r)
      acc.revenue += b.revenue; acc.achat += b.achat; acc.transport += b.transport
      acc.fuel += b.fuel; acc.workers += b.workers; acc.rental += b.rental
      acc.other += b.other; acc.total += b.total; acc.profit += b.profit
      return acc
    }, { revenue: 0, achat: 0, transport: 0, fuel: 0, workers: 0, rental: 0, other: 0, total: 0, profit: 0 })
    const marge = t.revenue > 0 ? Math.round(t.profit / t.revenue * 100) : 0
    return (
      <tfoot>
        <tr className="border-t-2 border-slate-300 bg-gradient-to-r from-slate-800 to-slate-900 text-white">
          <td colSpan={3} className="py-3 px-3 font-black text-sm uppercase">Total ({rows.length} voyages)</td>
          <td className="py-3 px-3 text-right font-black text-emerald-400">{fmtMoney(t.revenue)}</td>
          <td className="py-3 px-3 text-right font-bold text-red-300">−{fmtMoney(t.achat)}</td>
          <td className="py-3 px-3 text-right font-bold text-red-300">−{fmtMoney(t.transport)}</td>
          <td className="py-3 px-3 text-right font-bold text-red-300">−{fmtMoney(t.fuel)}</td>
          <td className="py-3 px-3 text-right font-bold text-red-300">−{fmtMoney(t.workers)}</td>
          <td className="py-3 px-3 text-right font-bold text-red-300">−{fmtMoney(t.rental)}</td>
          <td className="py-3 px-3 text-right font-bold text-red-300">−{fmtMoney(t.other)}</td>
          <td className="py-3 px-3 text-right font-black text-red-200">−{fmtMoney(t.total)}</td>
          <td className={`py-3 px-3 text-right font-black ${t.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{t.profit >= 0 ? '+' : ''}{fmtMoney(t.profit)}</td>
          <td className="py-3 px-3 text-right font-black text-blue-300">{marge}%</td>
        </tr>
      </tfoot>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-black text-slate-800 text-sm">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1">×</button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {/* Summary cards — instant overview before the detailed table */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Revenu" icon="💰" color="green" large value={fmtMoney(totals.revenue) + ' DHS'} />
            {totals.achat > 0 && <KpiCard label="Achats" icon="📦" color="red" value={fmtMoney(totals.achat) + ' DHS'} />}
            <KpiCard label="Transport"       icon="🚌" color="red" value={fmtMoney(totals.transport) + ' DHS'} />
            <KpiCard label="Carburant"       icon="⛽" color="red" value={fmtMoney(totals.fuel) + ' DHS'} />
            <KpiCard label="Ouvriers"        icon="👷" color="red" value={fmtMoney(totals.workers) + ' DHS'} />
            <KpiCard label="Location camion" icon="🔑" color="red" value={fmtMoney(totals.rental) + ' DHS'} />
            <KpiCard label="Autres charges"  icon="💸" color="red" value={fmtMoney(totals.other) + ' DHS'} />
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
