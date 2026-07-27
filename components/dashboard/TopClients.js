import { useMemo } from 'react'
import { fmt } from '../../lib/utils'
import { aggregateClientProfits } from '../../lib/services/profitability'
import MarginBadge from '../profitability/MarginBadge'
import Section from './Section'

function ClientRow({ c, tone }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-slate-50 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-700 truncate">
          {c.client_nom || '—'}
          {c.type_produit === 'grignon' && <span className="ml-1.5 text-[9px] bg-lime-100 text-lime-700 px-1.5 py-0.5 rounded font-semibold align-middle">GRIGNON</span>}
        </div>
        <div className="text-[10px] text-slate-400">{c.nbVoyages} voyage{c.nbVoyages !== 1 ? 's' : ''}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`font-black text-sm ${tone === 'bad' ? 'text-red-500' : 'text-emerald-600'}`}>
          {c.profit >= 0 ? '+' : ''}{fmt(c.profit)}
        </span>
        <MarginBadge marge={c.marge} />
      </div>
    </div>
  )
}

// Section 3 — Top 10 clients by profit, and clients currently losing money /
// lowest margin. Both views come from aggregateClientProfits(results), the
// same per-client rollup the Profitability Center's "Par Client" tab uses —
// this is a fresh slice/sort of that output, not a new aggregation rule.
export default function TopClients({ results, periodLabel }) {
  const clientAgg = useMemo(() => {
    const withCounts = aggregateClientProfits(results)
    return withCounts.map(c => ({
      ...c,
      nbVoyages: new Set(results.filter(r => r.clients.some(rc => rc.key === c.key)).map(r => r.id)).size,
    }))
  }, [results])

  const top = clientAgg.slice(0, 10)
  const worst = [...clientAgg].filter(c => c.profit < 0).sort((a, b) => a.profit - b.profit).slice(0, 10)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Section title="Top clients — profit" subtitle={periodLabel}>
        {top.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">Aucune donnée</div>
        ) : top.map(c => <ClientRow key={c.key} c={c} tone="good" />)}
      </Section>
      <Section title="Clients à surveiller" subtitle="Profit négatif ou marge faible">
        {worst.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm flex flex-col items-center gap-1.5">
            <span className="text-xl">✅</span>Aucun client à perte
          </div>
        ) : worst.map(c => <ClientRow key={c.key} c={c} tone="bad" />)}
      </Section>
    </div>
  )
}
