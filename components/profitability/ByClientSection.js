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
    ) },
    { key: 'revenue', label: 'Revenu', right: true, sortValue: r => r.revenue.total, exportValue: r => Math.round(r.revenue.total), render: r => <span className="font-bold text-emerald-600">{fmtMoney(r.revenue.total)}</span> },
    { key: 'profit', label: '= Profit', right: true, sortValue: r => r.profit, exportValue: r => Math.round(r.profit), render: r => (
      <span className={`font-black ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{r.profit >= 0 ? '+' : ''}{fmtMoney(r.profit)}</span>
    ) },
    { key: 'marge', label: 'Marge', right: true, sortValue: r => r.marge, exportValue: r => r.marge, render: r => <MarginBadge marge={r.marge} /> },
    { key: 'avgProfit', label: 'Moy. / voyage', right: true, sortValue: r => r.profit / (r.nbVoyages || 1), exportValue: r => Math.round(r.profit / (r.nbVoyages || 1)), render: r => (
      <span className={r.profit >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>{fmtMoney(r.profit / (r.nbVoyages || 1))}</span>
    ) },
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
      />
      {selectedClient && (
        <EntityDrillDrawer
          title={`👤 ${selectedClient.client_nom}`}
          subtitle={`${selectedClient.nbVoyages} voyage(s) — profit affiché = part de ce client sur chaque voyage`}
          voyages={results.filter(r => r.clients.some(c => c.key === selected))}
          clientKey={selected}
          onOpenVoyage={onOpenVoyage}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
