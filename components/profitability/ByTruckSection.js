import { useState, useMemo } from 'react'
import { fmt } from '../../lib/utils'
import { aggregateVoyageProfits } from '../../lib/services/profitability'
import DataTable from './DataTable'
import MarginBadge, { marginRowClass } from './MarginBadge'
import EntityDrillDrawer from './EntityDrillDrawer'

// Groups the already-computed `results` by camion_id and reduces each group
// with aggregateVoyageProfits — the exact pattern the old Rentabilité page
// used for its "Par camion" tab. avgProfit is plain arithmetic on numbers the
// engine already produced (profit / voyage count), not a new business formula.
export default function ByTruckSection({ results, camions, onOpenVoyage }) {
  const [selected, setSelected] = useState(null) // camion id

  const rows = useMemo(() => {
    return camions.map(cam => {
      const myResults = results.filter(r => r.camion_id === cam.id)
      if (!myResults.length) return null
      const agg = aggregateVoyageProfits(myResults)
      return { ...cam, ...agg, nbVoyages: myResults.length, avgProfit: agg.profit / myResults.length }
    }).filter(Boolean)
  }, [results, camions])

  const columns = [
    { key: 'plaque', label: 'Camion', sortValue: r => r.plaque, render: r => (
      <div>
        <span className="font-black text-slate-800">{r.plaque}</span>
        {r.type_camion === 'loue' && <span className="ml-1.5 text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">LOUÉ</span>}
      </div>
    ) },
    { key: 'chauffeur', label: 'Chauffeur', sortValue: r => r.chauffeur || '', render: r => r.chauffeur || '—' },
    { key: 'nbVoyages', label: 'Voyages', center: true, sortValue: r => r.nbVoyages, render: r => (
      <span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{r.nbVoyages}</span>
    ) },
    { key: 'revenue', label: 'Revenu', right: true, sortValue: r => r.revenue.total, exportValue: r => Math.round(r.revenue.total), render: r => <span className="font-bold text-emerald-600">{fmt(r.revenue.total)}</span> },
    { key: 'profit', label: '= Profit', right: true, sortValue: r => r.profit, exportValue: r => Math.round(r.profit), render: r => (
      <span className={`font-black ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{r.profit >= 0 ? '+' : ''}{fmt(r.profit)}</span>
    ) },
    { key: 'marge', label: 'Marge', right: true, sortValue: r => r.marge, exportValue: r => r.marge, render: r => <MarginBadge marge={r.marge} /> },
    { key: 'avgProfit', label: 'Moy. / voyage', right: true, sortValue: r => r.avgProfit, exportValue: r => Math.round(r.avgProfit), render: r => (
      <span className={r.avgProfit >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>{fmt(r.avgProfit)}</span>
    ) },
  ]

  const selectedTruck = rows.find(r => r.id === selected)

  return (
    <>
      <DataTable
        title="Performance par camion" subtitle="Cliquez un camion pour voir tous ses voyages"
        columns={columns} rows={rows} rowKey={r => r.id}
        onRowClick={r => setSelected(r.id)}
        rowClassName={r => marginRowClass(r.marge)}
        defaultSortKey="profit" exportFilename="Camions"
      />
      {selectedTruck && (
        <EntityDrillDrawer
          title={`🚛 ${selectedTruck.plaque}${selectedTruck.chauffeur ? ' · ' + selectedTruck.chauffeur : ''}`}
          subtitle={`${selectedTruck.nbVoyages} voyage(s) sur la période sélectionnée`}
          voyages={results.filter(r => r.camion_id === selected)}
          onOpenVoyage={onOpenVoyage}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
