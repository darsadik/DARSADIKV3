import { fmtDate, fmtMoney } from '../../lib/utils'
import DataTable from './DataTable'
import MarginBadge, { marginRowClass } from './MarginBadge'

// One row = one voyage — "the heart of the ERP". All figures come straight
// off the merged {...voyage, ...computeVoyageProfit(...)} rows built once in
// pages/rentabilite/index.js; this component only defines columns/sorting.
export default function ByVoyageSection({ results, onOpenVoyage }) {
  const columns = [
    { key: 'date', label: 'Date', sortValue: r => r.date_depart, render: r => fmtDate(r.date_depart) },
    { key: 'ref', label: 'Voyage', sortValue: r => r.reference || String(r.id), render: r => r.reference || `#${r.id}` },
    { key: 'camion', label: 'Camion', sortValue: r => r.camion_plaque, render: r => (
      <div>
        <div className="font-semibold text-slate-700">{r.camion_plaque}</div>
        {r.destination && <div className="text-[10px] text-slate-400">→ {r.destination}</div>}
      </div>
    ) },
    { key: 'clients', label: 'Clients', center: true, sortValue: r => r.clients?.length || 0, render: r => (
      <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{r.clients?.length || 0}</span>
    ) },
    { key: 'revenue', label: 'Revenu', right: true, sortValue: r => r.revenue.total, exportValue: r => Math.round(r.revenue.total), render: r => <span className="font-bold text-emerald-600">{fmtMoney(r.revenue.total)}</span> },
    { key: 'achat', label: 'Achats', right: true, sortValue: r => r.cost.achatTotal, exportValue: r => Math.round(r.cost.achatTotal), render: r => <span className="text-red-400">−{fmtMoney(r.cost.achatTotal)}</span> },
    { key: 'fuel', label: 'Carburant', right: true, sortValue: r => r.cost.fuel, exportValue: r => Math.round(r.cost.fuel), render: r => <span className="text-orange-400">−{fmtMoney(r.cost.fuel)}</span> },
    { key: 'rental', label: 'Location', right: true, sortValue: r => r.cost.rental, exportValue: r => Math.round(r.cost.rental), render: r => r.cost.rental > 0 ? <span className="text-amber-500">−{fmtMoney(r.cost.rental)}</span> : '—' },
    { key: 'opex', label: 'Charges', right: true, sortValue: r => r.cost.chargesOperationnelles, exportValue: r => Math.round(r.cost.chargesOperationnelles), render: r => <span className="text-red-400">−{fmtMoney(r.cost.chargesOperationnelles)}</span> },
    { key: 'profit', label: '= Profit', right: true, sortValue: r => r.profit, exportValue: r => Math.round(r.profit), render: r => (
      <span className={`font-black ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{r.profit >= 0 ? '+' : ''}{fmtMoney(r.profit)}</span>
    ) },
    { key: 'marge', label: 'Marge', right: true, sortValue: r => r.marge, exportValue: r => r.marge, render: r => (
      <div className="flex items-center justify-end gap-1">
        {r.warnings?.length > 0 && <span className="text-amber-500" title={`${r.warnings.length} avertissement(s)`}>⚠</span>}
        <MarginBadge marge={r.marge} />
      </div>
    ) },
  ]

  function footer(rows) {
    const rev = rows.reduce((s, r) => s + r.revenue.total, 0)
    const ach = rows.reduce((s, r) => s + r.cost.achatTotal, 0)
    const fuel = rows.reduce((s, r) => s + r.cost.fuel, 0)
    const rent = rows.reduce((s, r) => s + r.cost.rental, 0)
    const opex = rows.reduce((s, r) => s + r.cost.chargesOperationnelles, 0)
    const profit = rows.reduce((s, r) => s + r.profit, 0)
    const marge = rev > 0 ? Math.round(profit / rev * 100) : 0
    return (
      <tfoot>
        <tr className="border-t-2 border-slate-300 bg-gradient-to-r from-slate-800 to-slate-900 text-white">
          <td colSpan={4} className="py-3 px-3 font-black text-sm uppercase tracking-wide">Total ({rows.length})</td>
          <td className="py-3 px-3 text-right font-black text-emerald-400">{fmtMoney(rev)}</td>
          <td className="py-3 px-3 text-right font-bold text-red-300">−{fmtMoney(ach)}</td>
          <td className="py-3 px-3 text-right font-bold text-orange-300">−{fmtMoney(fuel)}</td>
          <td className="py-3 px-3 text-right font-bold text-amber-300">−{fmtMoney(rent)}</td>
          <td className="py-3 px-3 text-right font-bold text-red-300">−{fmtMoney(opex)}</td>
          <td className={`py-3 px-3 text-right font-black text-lg ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{profit >= 0 ? '+' : ''}{fmtMoney(profit)}</td>
          <td className="py-3 px-3 text-right font-black text-blue-300">{marge}%</td>
        </tr>
      </tfoot>
    )
  }

  return (
    <DataTable
      title="Résultat par voyage"
      subtitle="Cliquez une ligne pour le détail complet"
      columns={columns}
      rows={results}
      rowKey={r => r.id}
      onRowClick={r => onOpenVoyage(r.id)}
      rowClassName={r => marginRowClass(r.marge)}
      searchable
      searchFn={(r, q) => (r.camion_plaque || '').toLowerCase().includes(q) || (r.destination || '').toLowerCase().includes(q) || (r.reference || '').toLowerCase().includes(q) || (r.clients || []).some(c => (c.client_nom || '').toLowerCase().includes(q))}
      placeholder="Camion, destination, client..."
      defaultSortKey="date"
      footer={footer}
      exportFilename="Voyages"
    />
  )
}
