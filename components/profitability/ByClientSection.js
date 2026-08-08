import { useState, useMemo } from 'react'
import { fmtMoney } from '../../lib/utils'
import { aggregateClientProfits } from '../../lib/services/profitability'
import DataTable from './DataTable'
import MarginBadge, { marginRowClass } from './MarginBadge'
import EntityDrillDrawer from './EntityDrillDrawer'

// aggregateClientProfits(results) already groups by (type_produit, client_id)
// — no extra grouping step needed here, unlike By Truck.
export default function ByClientSection({ results, onOpenVoyage }) {
  const [selected, setSelected] = useState(null) // client key

  const rows = useMemo(() => {
    return aggregateClientProfits(results).map(c => ({ ...c, nbVoyages: results.filter(r => r.clients.some(rc => rc.key === c.key)).length }))
  }, [results])

  // PDF TOTAL row: plain reduce over the already-computed `rows` (one row per
  // client, from aggregateClientProfits) — never re-touches the profit engine.
  function totals(rows) {
    const revenue = rows.reduce((s, r) => s + r.revenue.total, 0)
    const profit = rows.reduce((s, r) => s + r.profit, 0)
    const nbVoyages = rows.reduce((s, r) => s + r.nbVoyages, 0)
    const marge = revenue > 0 ? Math.round(profit / revenue * 100) : 0
    const avgProfit = nbVoyages > 0 ? profit / nbVoyages : 0
    return { revenue, profit, nbVoyages, marge, avgProfit }
  }

  const columns = [
    { key: 'client', label: 'Client', sortValue: r => r.client_nom || '', render: r => (
      <div>
        <span className="font-bold text-slate-800">{r.client_nom}</span>
        {r.type_produit === 'grignon' && <span className="ml-1.5 text-[9px] bg-lime-100 text-lime-700 px-1.5 py-0.5 rounded font-semibold">GRIGNON</span>}
        {r.hasUndeterminedCost && <span className="text-amber-500 ml-1" title="Coût d'achat indéterminé sur au moins une livraison">⚠</span>}
      </div>
    ) },
    { key: 'nbVoyages', label: 'Voyages', center: true, sortValue: r => r.nbVoyages, render: r => (
      <span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{r.nbVoyages}</span>
    ), total: rows => String(totals(rows).nbVoyages) },
    { key: 'revenue', label: 'Revenu', right: true, sortValue: r => r.revenue.total, exportValue: r => Math.round(r.revenue.total), printValue: r => fmtMoney(r.revenue.total) + ' DHS', render: r => <span className="font-bold text-emerald-600">{fmtMoney(r.revenue.total)}</span>,
      total: rows => fmtMoney(totals(rows).revenue) + ' DHS' },
    { key: 'profit', label: '= Profit', right: true, sortValue: r => r.profit, exportValue: r => Math.round(r.profit), printValue: r => (r.profit >= 0 ? '+' : '') + fmtMoney(r.profit) + ' DHS', render: r => (
      <span className={`font-black ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{r.profit >= 0 ? '+' : ''}{fmtMoney(r.profit)}</span>
    ), total: rows => { const p = totals(rows).profit; return (p >= 0 ? '+' : '') + fmtMoney(p) + ' DHS' } },
    { key: 'marge', label: 'Marge', right: true, sortValue: r => r.marge, exportValue: r => r.marge, printValue: r => r.marge + '%', render: r => <MarginBadge marge={r.marge} />,
      total: rows => totals(rows).marge + '%' },
    { key: 'avgProfit', label: 'Moy. / voyage', right: true, sortValue: r => r.profit / (r.nbVoyages || 1), exportValue: r => Math.round(r.profit / (r.nbVoyages || 1)), printValue: r => fmtMoney(r.profit / (r.nbVoyages || 1)) + ' DHS', render: r => (
      <span className={r.profit >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>{fmtMoney(r.profit / (r.nbVoyages || 1))}</span>
    ), total: rows => fmtMoney(totals(rows).avgProfit) + ' DHS' },
  ]

  const selectedClient = rows.find(r => r.key === selected)

  return (
    <>
      <DataTable
        title="Performance par client" subtitle="Cliquez un client pour voir son profit voyage par voyage"
        columns={columns} rows={rows} rowKey={r => r.key}
        onRowClick={r => setSelected(r.key)}
        rowClassName={r => marginRowClass(r.marge)}
        searchable searchFn={(r, q) => (r.client_nom || '').toLowerCase().includes(q)}
        placeholder="Rechercher un client..."
        defaultSortKey="profit" exportFilename="Clients"
        printIcon="👤"
        printSummary={rows => {
          const t = totals(rows)
          return [
            { label: 'Revenu Total', value: `${fmtMoney(t.revenue)} DHS`, color: '#16a34a' },
            { label: 'Profit Total', value: `${t.profit >= 0 ? '+' : ''}${fmtMoney(t.profit)} DHS`, color: t.profit >= 0 ? '#059669' : '#dc2626' },
            { label: 'Marge Moyenne', value: `${t.marge}%`, color: '#2563eb' },
            { label: 'Nb. Voyages', value: `${t.nbVoyages}`, color: '#64748b' },
          ]
        }}
        printBanner={rows => {
          const t = totals(rows)
          return { label: 'Profit Net Total', amountFormatted: fmtMoney(t.profit), amount: t.profit, sub: `${rows.length} client(s) — ${t.nbVoyages} voyage(s)` }
        }}
      />
      {selectedClient && (
        <EntityDrillDrawer
          title={`👤 ${selectedClient.client_nom}`}
          subtitle={`${selectedClient.nbVoyages} voyage(s) — profit affiché = part de ce client sur chaque voyage`}
          voyages={results.filter(r => r.clients.some(c => c.key === selected))}
          clientKey={selected}
          onOpenVoyage={onOpenVoyage}
          onClose={() => setSelected(null)}
          icon="👤"
        />
      )}
    </>
  )
}
