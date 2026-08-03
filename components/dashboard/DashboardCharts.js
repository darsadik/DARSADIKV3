import { useMemo } from 'react'
import { ResponsiveContainer, ComposedChart, Bar, Line, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts'
import { fmt, fmtMoney } from '../../lib/utils'
import { aggregateVoyageProfits } from '../../lib/services/profitability'
import Section from './Section'

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

// Same tooltip/card look as components/profitability/Overview.js (not
// exported from there, so mirrored here) — kept to exactly 2 charts per spec.
function TooltipBox({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <div className="font-bold text-slate-700 mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-1.5" style={{ color: p.color }}>
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-bold">{fmtMoney(p.value)} DHS</span>
        </div>
      ))}
    </div>
  )
}

export default function DashboardCharts({ results, camions }) {
  const monthly = useMemo(() => {
    const byMonth = {}
    results.forEach(r => {
      const k = r.date_depart?.slice(0, 7)
      if (!k) return
      if (!byMonth[k]) byMonth[k] = []
      byMonth[k].push(r)
    })
    return Object.keys(byMonth).sort().map(k => {
      const [y, m] = k.split('-')
      const agg = aggregateVoyageProfits(byMonth[k])
      return { key: k, label: `${MONTHS[parseInt(m) - 1]} ${y}`, revenue: Math.round(agg.revenue.total), profit: Math.round(agg.profit) }
    })
  }, [results])

  const truckRanking = useMemo(() => {
    return camions.map(cam => {
      const myResults = results.filter(r => r.camion_id === cam.id)
      if (!myResults.length) return null
      const agg = aggregateVoyageProfits(myResults)
      return { label: cam.plaque, profit: Math.round(agg.profit) }
    }).filter(Boolean).sort((a, b) => b.profit - a.profit).slice(0, 8)
  }, [results, camions])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Section title="Profit dans le temps">
        <div className="p-4">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={60} tickFormatter={fmtMoney} />
              <Tooltip content={<TooltipBox />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="revenue" name="Revenu" fill="#bfdbfe" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Line dataKey="profit" name="Profit net" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Profit par camion">
        <div className="p-4">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={truckRanking} layout="vertical" margin={{ left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtMoney} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} width={70} />
              <Tooltip content={<TooltipBox />} />
              <Bar dataKey="profit" name="Profit" radius={[0, 4, 4, 0]} maxBarSize={20}>
                {truckRanking.map((r, i) => <Cell key={i} fill={r.profit >= 0 ? '#10b981' : '#ef4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
    </div>
  )
}
