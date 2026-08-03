import { useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, BarChart, Cell,
} from 'recharts'
import { fmtMoney } from '../../lib/utils'
import { aggregateVoyageProfits, aggregateClientProfits } from '../../lib/services/profitability'
import KpiCard from './KpiCard'

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

function ChartCard({ title, children, height = 280 }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h3 className="font-bold text-slate-700 text-sm mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
    </div>
  )
}

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

// Overview — every number here is a sum/group of computeVoyageProfit results
// (aggregateVoyageProfits / aggregateClientProfits), never recomputed.
export default function Overview({ results, camions }) {
  const global = useMemo(() => aggregateVoyageProfits(results), [results])

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

  const clientRanking = useMemo(() => {
    return aggregateClientProfits(results)
      .slice(0, 8)
      .map(c => ({ label: c.client_nom, profit: Math.round(c.profit) }))
  }, [results])

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard label="Revenu"    icon="💰" color="slate" large value={fmtMoney(global.revenue.total) + ' DHS'} />
        <KpiCard label="Achats"    icon="📦" color="red"    value={fmtMoney(global.cost.achatTotal) + ' DHS'} />
        <KpiCard label="Carburant" icon="⛽" color="orange" value={fmtMoney(global.cost.fuel) + ' DHS'} />
        <KpiCard label="Charges"   icon="💸" color="red"    value={fmtMoney(global.cost.chargesOperationnelles) + ' DHS'} />
        <KpiCard label="Location"  icon="🔑" color="amber"  value={fmtMoney(global.cost.rental) + ' DHS'} />
        <KpiCard label="Profit net" icon={global.profit >= 0 ? '✅' : '❌'} color={global.profit >= 0 ? 'green' : 'red'} large
          value={(global.profit >= 0 ? '+' : '') + fmtMoney(global.profit) + ' DHS'} />
        <KpiCard label="Marge" icon="📈" color="blue" large value={global.marge + '%'} sub={`${results.length} voyages`} />
      </div>

      {/* Evolution + comparison combined: same two series (revenue/profit by
          month), one shared DHS axis — avoids three near-identical charts */}
      <ChartCard title="Évolution mensuelle — Revenu vs Profit">
        <ComposedChart data={monthly}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={70} tickFormatter={fmtMoney} />
          <Tooltip content={<TooltipBox />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="revenue" name="Revenu" fill="#bfdbfe" radius={[4, 4, 0, 0]} maxBarSize={40} />
          <Line dataKey="profit" name="Profit net" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Classement camions (profit)">
          <BarChart data={truckRanking} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtMoney} />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} width={70} />
            <Tooltip content={<TooltipBox />} />
            <Bar dataKey="profit" name="Profit" radius={[0, 4, 4, 0]} maxBarSize={20}>
              {truckRanking.map((r, i) => <Cell key={i} fill={r.profit >= 0 ? '#10b981' : '#ef4444'} />)}
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard title="Classement clients (profit)">
          <BarChart data={clientRanking} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtMoney} />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} width={90} />
            <Tooltip content={<TooltipBox />} />
            <Bar dataKey="profit" name="Profit" radius={[0, 4, 4, 0]} maxBarSize={20}>
              {clientRanking.map((r, i) => <Cell key={i} fill={r.profit >= 0 ? '#10b981' : '#ef4444'} />)}
            </Bar>
          </BarChart>
        </ChartCard>
      </div>
    </div>
  )
}
