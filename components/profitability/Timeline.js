import { useMemo } from 'react'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { fmt } from '../../lib/utils'
import { aggregateVoyageProfits } from '../../lib/services/profitability'

function isoWeekKey(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-S${String(week).padStart(2, '0')}`
}

function TooltipBox({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <div className="font-bold text-slate-700 mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-1.5" style={{ color: p.color }}>
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-bold">{p.dataKey === 'marge' ? p.value + '%' : fmt(p.value) + ' DHS'}</span>
        </div>
      ))}
    </div>
  )
}

// Bigger trend view over the selected filter range, bucketed by day/week/
// month depending on the range's length — same aggregateVoyageProfits
// reducer as everywhere else, just grouped at a different granularity.
export default function Timeline({ results, from, to }) {
  const bucketed = useMemo(() => {
    const diffDays = (new Date(to) - new Date(from)) / 86400000
    const granularity = diffDays <= 31 ? 'day' : diffDays <= 180 ? 'week' : 'month'

    const groups = {}
    results.forEach(r => {
      if (!r.date_depart) return
      const d = new Date(r.date_depart)
      let key, label
      if (granularity === 'day') { key = r.date_depart; label = r.date_depart.slice(5) }
      else if (granularity === 'week') { key = isoWeekKey(d); label = key }
      else { key = r.date_depart.slice(0, 7); label = key }
      if (!groups[key]) groups[key] = { key, label, rows: [] }
      groups[key].rows.push(r)
    })
    return { granularity, data: Object.values(groups).sort((a, b) => a.key.localeCompare(b.key)).map(g => {
      const agg = aggregateVoyageProfits(g.rows)
      return { label: g.label, revenue: Math.round(agg.revenue.total), profit: Math.round(agg.profit), marge: agg.marge, nbV: g.rows.length }
    }) }
  }, [results, from, to])

  const granLabel = { day: 'jour', week: 'semaine', month: 'mois' }[bucketed.granularity]

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="font-bold text-slate-700 text-sm mb-1">Tendance — Revenu &amp; Profit par {granLabel}</h3>
        <p className="text-[11px] text-slate-400 mb-4">{bucketed.data.length} {granLabel}(s) sur la période sélectionnée</p>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={bucketed.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={70} tickFormatter={fmt} />
            <Tooltip content={<TooltipBox />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="revenue" name="Revenu" fill="#bfdbfe" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Line dataKey="profit" name="Profit net" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="font-bold text-slate-700 text-sm mb-4">Tendance — Marge %</h3>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={bucketed.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} tickFormatter={v => v + '%'} />
            <Tooltip content={<TooltipBox />} />
            <Line dataKey="marge" name="Marge" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
