import { fmtDate, fmtMoney } from '../../lib/utils'
import DataTable from './DataTable'
import MarginBadge, { marginRowClass } from './MarginBadge'

// One row = one voyage — "the heart of the ERP". All figures come straight
// off the merged {...voyage, ...computeVoyageProfit(...)} rows built once in
// pages/rentabilite/index.js; this component only defines columns/sorting.
//
// Cost is shown as three lines, each reading its own bucket straight off the
// engine's `cost` object — no bucket is derived by subtracting another:
//   Purchases = cost.achatTotal (brique + grignon achats — same value as the
//               Voyage page's "Total achats" under Achats Briques & Grignon)
//   Fuel      = cost.fuel (Fuel Allocation Engine output, unchanged)
//   Charges   = cost.chargesOperationnelles (charges NOT billed to client —
//               same value as the Voyage page's "Total charges fixes")
// Total Cost stays cost.total, which the engine already computes as
// achatTotal + fuel + rental + chargesOperationnelles — so it still equals
// Purchases + Fuel + Charges, plus truck rental folded in silently when the
// voyage has a location row (rental has no column of its own here).
// Single source for the "Total" row's own math — used by both the on-screen
// tfoot (JSX, via footer() below) and the PDF/print export's TOTAL row (plain
// text, via each column's `total`) so they can never diverge. Every figure is
// a plain reduce over the already-computed r.revenue/r.cost/r.profit fields —
// no recalculation of revenue, cost, fuel, or margin happens here.
function computeTotals(rows) {
  const revenue = rows.reduce((s, r) => s + r.revenue.total, 0)
  const purchases = rows.reduce((s, r) => s + r.cost.achatTotal, 0)
  const gasoil = rows.reduce((s, r) => s + r.cost.fuel, 0)
  const charges = rows.reduce((s, r) => s + r.cost.chargesOperationnelles, 0)
  const totalCost = rows.reduce((s, r) => s + r.cost.total, 0)
  const profit = rows.reduce((s, r) => s + r.profit, 0)
  const marge = revenue > 0 ? Math.round(profit / revenue * 100) : 0
  return { revenue, purchases, gasoil, charges, totalCost, profit, marge }
}

// Chronological (oldest → newest) tie-broken by id — matches
// lib/printRentabilite.js's own voyage ordering so the dedicated report and
// this tab's "🖨️ PDF" export never disagree on order.
function chronoSort(a, b) {
  const da = a.date_depart || '', db = b.date_depart || ''
  if (da !== db) return da < db ? -1 : 1
  return (a.id || 0) - (b.id || 0)
}

export default function ByVoyageSection({ results, onOpenVoyage }) {
  const columns = [
    { key: 'date', label: 'Date', sortValue: r => r.date_depart, printValue: r => fmtDate(r.date_depart), render: r => fmtDate(r.date_depart) },
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
    { key: 'revenue', label: 'Revenu', right: true, sortValue: r => r.revenue.total, exportValue: r => Math.round(r.revenue.total), printValue: r => fmtMoney(r.revenue.total) + ' DHS', render: r => <span className="font-bold text-emerald-600">{fmtMoney(r.revenue.total)}</span>,
      total: rows => fmtMoney(computeTotals(rows).revenue) + ' DHS' },
    { key: 'purchases', label: 'Achats', right: true, sortValue: r => r.cost.achatTotal, exportValue: r => Math.round(r.cost.achatTotal), printValue: r => '− ' + fmtMoney(r.cost.achatTotal) + ' DHS', render: r => <span className="text-red-400">−{fmtMoney(r.cost.achatTotal)}</span>,
      total: rows => '− ' + fmtMoney(computeTotals(rows).purchases) + ' DHS' },
    { key: 'gasoil', label: 'Gasoil', right: true, sortValue: r => r.cost.fuel, exportValue: r => Math.round(r.cost.fuel), printValue: r => '− ' + fmtMoney(r.cost.fuel) + ' DHS', render: r => <span className="text-red-400">−{fmtMoney(r.cost.fuel)}</span>,
      total: rows => '− ' + fmtMoney(computeTotals(rows).gasoil) + ' DHS' },
    { key: 'charges', label: 'Charges', right: true, sortValue: r => r.cost.chargesOperationnelles, exportValue: r => Math.round(r.cost.chargesOperationnelles), printValue: r => '− ' + fmtMoney(r.cost.chargesOperationnelles) + ' DHS', render: r => <span className="text-red-400">−{fmtMoney(r.cost.chargesOperationnelles)}</span>,
      total: rows => '− ' + fmtMoney(computeTotals(rows).charges) + ' DHS' },
    { key: 'totalCost', label: '= Coût total', right: true, sortValue: r => r.cost.total, exportValue: r => Math.round(r.cost.total), printValue: r => '− ' + fmtMoney(r.cost.total) + ' DHS', render: r => <span className="font-bold text-red-700">−{fmtMoney(r.cost.total)}</span>,
      total: rows => '− ' + fmtMoney(computeTotals(rows).totalCost) + ' DHS' },
    { key: 'profit', label: '= Profit', right: true, sortValue: r => r.profit, exportValue: r => Math.round(r.profit), printValue: r => (r.profit >= 0 ? '+' : '') + fmtMoney(r.profit) + ' DHS', render: r => (
      <span className={`font-black ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{r.profit >= 0 ? '+' : ''}{fmtMoney(r.profit)}</span>
    ), total: rows => { const p = computeTotals(rows).profit; return (p >= 0 ? '+' : '') + fmtMoney(p) + ' DHS' } },
    { key: 'marge', label: 'Marge', right: true, sortValue: r => r.marge, exportValue: r => r.marge, printValue: r => r.marge + '%', render: r => (
      <div className="flex items-center justify-end gap-1">
        {r.warnings?.length > 0 && <span className="text-amber-500" title={`${r.warnings.length} avertissement(s)`}>⚠</span>}
        <MarginBadge marge={r.marge} />
      </div>
    ), total: rows => computeTotals(rows).marge + '%' },
  ]

  function footer(rows) {
    const { revenue: rev, purchases, gasoil, charges, totalCost, profit, marge } = computeTotals(rows)
    return (
      <tfoot>
        <tr className="border-t-2 border-slate-300 bg-gradient-to-r from-slate-800 to-slate-900 text-white">
          <td colSpan={4} className="py-3 px-3 font-black text-sm uppercase tracking-wide">Total ({rows.length})</td>
          <td className="py-3 px-3 text-right font-black text-emerald-400">{fmtMoney(rev)}</td>
          <td className="py-3 px-3 text-right font-bold text-red-300">−{fmtMoney(purchases)}</td>
          <td className="py-3 px-3 text-right font-bold text-red-300">−{fmtMoney(gasoil)}</td>
          <td className="py-3 px-3 text-right font-bold text-red-300">−{fmtMoney(charges)}</td>
          <td className="py-3 px-3 text-right font-black text-red-200">−{fmtMoney(totalCost)}</td>
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
      printSort={chronoSort}
      exportFilename="Voyages"
    />
  )
}
