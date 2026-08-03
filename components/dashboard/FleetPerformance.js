import { useMemo, useState } from 'react'
import { fmt, fmtMoney } from '../../lib/utils'
import { aggregateVoyageProfits } from '../../lib/services/profitability'
import MarginBadge from '../profitability/MarginBadge'
import EntityDrillDrawer from '../profitability/EntityDrillDrawer'
import Section from './Section'

// One card per truck — same grouping components/profitability/ByTruckSection.js
// uses (group `results` by camion_id, reduce with aggregateVoyageProfits), just
// rendered as KPI cards instead of a table row, per the cockpit spec.
export default function FleetPerformance({ results, camions, periodLabel, onOpenVoyage }) {
  const [selected, setSelected] = useState(null) // camion id

  const trucks = useMemo(() => {
    return camions.map(cam => {
      const myResults = results.filter(r => r.camion_id === cam.id)
      if (!myResults.length) return null
      const agg = aggregateVoyageProfits(myResults)
      return { ...cam, ...agg, nbVoyages: myResults.length }
    }).filter(Boolean).sort((a, b) => b.profit - a.profit)
  }, [results, camions])

  const selectedTruck = trucks.find(t => t.id === selected)

  return (
    <Section title="Performance flotte" subtitle={periodLabel}>
      {trucks.length === 0 ? (
        <div className="py-14 text-center text-slate-400 text-sm">Aucun voyage sur cette période</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
          {trucks.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className="text-left bg-slate-50/60 hover:bg-slate-50 border border-slate-100 hover:border-slate-200 rounded-xl p-4 transition"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-black text-slate-800 text-sm">{t.plaque}</div>
                  {t.type_camion === 'loue' && (
                    <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">LOUÉ</span>
                  )}
                </div>
                <MarginBadge marge={t.marge} />
              </div>
              <div className={`text-xl font-black leading-none mb-3 ${t.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {t.profit >= 0 ? '+' : ''}{fmtMoney(t.profit)} <span className="text-xs font-semibold text-slate-400">DHS</span>
              </div>
              <div className="grid grid-cols-2 gap-y-1.5 text-[11px]">
                <span className="text-slate-400">Revenu</span>
                <span className="text-right font-semibold text-slate-600">{fmtMoney(t.revenue.total)}</span>
                <span className="text-slate-400">Coût</span>
                <span className="text-right font-semibold text-slate-600">{fmtMoney(t.cost.total)}</span>
                <span className="text-slate-400">Carburant</span>
                <span className="text-right font-semibold text-slate-600">{fmtMoney(t.cost.fuel)}</span>
                <span className="text-slate-400">Voyages</span>
                <span className="text-right font-semibold text-slate-600">{t.nbVoyages}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      {selectedTruck && (
        <EntityDrillDrawer
          title={`🚛 ${selectedTruck.plaque}`}
          subtitle={`${selectedTruck.nbVoyages} voyage(s) — ${periodLabel}`}
          voyages={results.filter(r => r.camion_id === selected)}
          onOpenVoyage={onOpenVoyage}
          onClose={() => setSelected(null)}
        />
      )}
    </Section>
  )
}
