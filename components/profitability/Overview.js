import { useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, BarChart, Cell,
} from 'recharts'
import { fmtMoney } from '../../lib/utils'
import { aggregateVoyageProfits, aggregateClientProfits } from '../../lib/services/profitability'
import KpiCard from './KpiCard'
import { marginTier } from './MarginBadge'

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

// PROPRE (owned) vs LOUÉ (rented) truck category — small local card, reusing
// aggregateVoyageProfits on a filtered subset of the SAME `results` array the
// rest of Overview already reads. Never recomputes revenue/cost/fuel: it only
// partitions rows by their truck's `type_camion` before summing.
function FleetTypeCard({ title, data, amber }) {
  const margeColor = { high: 'green', medium: 'blue', low: 'orange', loss: 'red' }[marginTier(data.marge).key]
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 ${amber ? 'border-amber-200' : 'border-slate-100'}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-700 text-sm">{title}</h3>
        <span className="text-[10px] font-semibold text-slate-400">{data.nbVoyages} voyage(s)</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Revenu" value={fmtMoney(data.revenue.total) + ' DHS'} color="green" />
        <KpiCard label="Coût total" value={fmtMoney(data.cost.total) + ' DHS'} color="darkred" />
        <KpiCard label="Profit net" value={(data.profit >= 0 ? '+' : '') + fmtMoney(data.profit) + ' DHS'} color={data.profit >= 0 ? 'green' : 'red'} />
        <KpiCard label="Marge" value={data.marge + '%'} color={margeColor} />
      </div>
    </div>
  )
}

// Overview — every number here is a sum/group of computeVoyageProfit results
// (aggregateVoyageProfits / aggregateClientProfits), never recomputed.
export default function Overview({ results, camions }) {
  const global = useMemo(() => aggregateVoyageProfits(results), [results])

  // Split the SAME already-filtered `results` by each voyage's truck category
  // — a voyage belongs to exactly one category (its camion's `type_camion`,
  // defaulting to 'propre' for legacy/unset rows, same convention already
  // used by ByTruckSection/FleetPerformance's LOUÉ badge). Fuel, achats,
  // charges, and profit for a voyage never leave its own camion's bucket
  // here since this is a plain array partition, not a recomputation.
  const fleetSplit = useMemo(() => {
    const typeById = new Map(camions.map(c => [c.id, c.type_camion === 'loue' ? 'loue' : 'propre']))
    const propreResults = results.filter(r => typeById.get(r.camion_id) !== 'loue')
    const loueResults   = results.filter(r => typeById.get(r.camion_id) === 'loue')
    return {
      propre: { ...aggregateVoyageProfits(propreResults), nbVoyages: propreResults.length },
      loue:   { ...aggregateVoyageProfits(loueResults),   nbVoyages: loueResults.length },
    }
  }, [results, camions])

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

  const margeTierColor = { high: 'green', medium: 'blue', low: 'orange', loss: 'red' }[marginTier(global.marge).key]

  return (
    <div className="space-y-4">
      {/* Never let a pending refueling period pass as a silently-complete,
          fully-reliable profit number (§10) — this reads global.pendingFuelCount,
          which aggregateVoyageProfits already computes from each voyage's own
          cost.fuelSource, never a new calculation. */}
      {global.pendingFuelCount > 0 && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-700 text-xs font-semibold rounded-xl px-4 py-2.5">
          <span>⏳</span>
          <span>{global.pendingFuelCount} voyage{global.pendingFuelCount > 1 ? 's' : ''} avec carburant en attente de mesure (période de plein pas encore clôturée) — le Gasoil et le Profit ci-dessous sont incomplets pour ces voyages.</span>
        </div>
      )}

      {/* Revenue → Gasoil / Charges → Total Cost → Profit → Margin, using
          professional accounting colors (green=revenue, red=cost lines,
          dark red=total cost, green/red=profit, tiered=margin). Charges is
          every non-fuel cost combined (achats + location + charges
          opérationnelles) — Gasoil + Charges always equals Coût total. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Revenu" icon="💰" color="green" large value={fmtMoney(global.revenue.total) + ' DHS'} />
        <KpiCard label="Gasoil"  icon="⛽" color="red" value={fmtMoney(global.cost.fuel) + ' DHS'}
          sub={global.pendingFuelCount > 0 ? `⏳ ${global.pendingFuelCount} en attente` : undefined} />
        <KpiCard label="Charges" icon="💸" color="red" value={fmtMoney(global.cost.total - global.cost.fuel) + ' DHS'} />
        <KpiCard label="Coût total" icon="🧾" color="darkred" large value={fmtMoney(global.cost.total) + ' DHS'} />
        <KpiCard label="Profit net" icon={global.profit >= 0 ? '✅' : '❌'} color={global.profit >= 0 ? 'green' : 'red'} large
          value={(global.profit >= 0 ? '+' : '') + fmtMoney(global.profit) + ' DHS'} />
        <KpiCard label="Marge" icon="📈" color={margeTierColor} large value={global.marge + '%'} sub={`${results.length} voyages`} />
      </div>

      {/* PROPRE and LOUÉ trucks are two separate business categories — never
          summed together into one number here. Each card below sums only its
          own category's voyages (see fleetSplit above); the "Revenu" KPI grid
          just above stays the pre-existing whole-fleet total. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FleetTypeCard title="🏢 Camions Propres" data={fleetSplit.propre} />
        <FleetTypeCard title="🔑 Camions Loués" data={fleetSplit.loue} amber />
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
