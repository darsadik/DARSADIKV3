import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from './_app'
import Link from 'next/link'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const today = () => new Date().toISOString().split('T')[0]
const startOfWeek = () => {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay() + 1)
  return d.toISOString().split('T')[0]
}
const startOfMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function ProfitValue({ value }) {
  const n = Math.round(value || 0)
  const cls = n < 0 ? 'text-red-600' : n > 0 ? 'text-green-600' : 'text-gray-700'
  return <span className={cls}>{fmt(n)} DHS</span>
}

function StatCard({ label, value, sub, color = 'blue', icon, isProfit = false, rawValue }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-100', green: 'bg-green-50 border-green-100',
    red: 'bg-red-50 border-red-100', amber: 'bg-amber-50 border-amber-100',
    purple: 'bg-purple-50 border-purple-100',
  }
  const iconBg = {
    blue: 'bg-blue-100 text-blue-600', green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600', amber: 'bg-amber-100 text-amber-600',
    purple: 'bg-purple-100 text-purple-600',
  }
  const valColors = {
    blue: 'text-blue-700', green: 'text-green-700', red: 'text-red-700',
    amber: 'text-amber-700', purple: 'text-purple-700',
  }
  return (
    <div className={`stat-card border ${colors[color]} flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <div className="stat-label text-gray-500">{label}</div>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-base ${iconBg[color]}`}>{icon}</span>
      </div>
      <div className="stat-value">
        {isProfit
          ? <ProfitValue value={rawValue} />
          : <span className={valColors[color]}>{value}</span>
        }
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function SalesChart({ data }) {
  if (!data || data.length === 0) return (
    <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Aucune donnée disponible</div>
  )
  const maxVal = Math.max(...data.map(d => Math.abs(d.value)), 1)
  const total = data.length
  const barW = Math.max(10, Math.min(36, Math.floor(540 / total) - 3))
  const svgW = total * (barW + 3)
  return (
    <div className="overflow-x-auto pb-1">
      <svg width={Math.max(svgW, 280)} height={155} style={{ minWidth: '100%', display: 'block' }}>
        {[0, 0.5, 1].map(pct => (
          <line key={pct} x1={0} x2="100%" y1={10 + (1 - pct) * 110} y2={10 + (1 - pct) * 110}
            stroke="#f0f0f0" strokeWidth={1} />
        ))}
        {data.map((d, i) => {
          const h = Math.max(3, Math.round((Math.abs(d.value) / maxVal) * 100))
          const x = i * (barW + 3) + 1
          const isNeg = d.value < 0
          const y = isNeg ? 120 : 120 - h
          return (
            <g key={d.label + i}>
              <rect x={x} y={y} width={barW} height={h} rx={2}
                fill={isNeg ? '#ef4444' : '#3b82f6'} opacity={0.82} />
              <text x={x + barW / 2} y={148} textAnchor="middle" fontSize={8} fill="#aaa">
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(4)].map((_, i) => <div key={i} className="h-52 bg-gray-200 rounded-xl" />)}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [allVentes, setAllVentes] = useState([])
  const [allGasoil, setAllGasoil] = useState([])
  const [allClients, setAllClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo, setFilterTo] = useState(today())
  const [quickFilter, setQuickFilter] = useState('month')
  const [chartMode, setChartMode] = useState('day')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ventes }, { data: gasoil }, { data: clients }] = await Promise.all([
      supabase.from('ventes').select('*').order('date', { ascending: true }),
      supabase.from('gasoil').select('*').order('date', { ascending: true }),
      supabase.from('clients').select('*'),
    ])
    setAllVentes(ventes || [])
    setAllGasoil(gasoil || [])
    setAllClients(clients || [])
    setLoading(false)
  }

  function applyQuick(q) {
    setQuickFilter(q)
    const t = today()
    if (q === 'today') { setFilterFrom(t); setFilterTo(t) }
    else if (q === 'week') { setFilterFrom(startOfWeek()); setFilterTo(t) }
    else if (q === 'month') { setFilterFrom(startOfMonth()); setFilterTo(t) }
    else if (q === 'all') { setFilterFrom('2020-01-01'); setFilterTo(t) }
  }

  const filteredVentes = allVentes.filter(v =>
    (!filterFrom || v.date >= filterFrom) && (!filterTo || v.date <= filterTo)
  )
  const filteredGasoil = allGasoil.filter(g =>
    (!filterFrom || g.date >= filterFrom) && (!filterTo || g.date <= filterTo)
  )

  // Fixed profit periods
  const t = today(), sw = startOfWeek(), sm = startOfMonth()
  const profitToday = allVentes.filter(v => v.date === t).reduce((s, v) => s + (v.marge || 0), 0)
    - allGasoil.filter(g => g.date === t).reduce((s, g) => s + (g.total || 0), 0)
  const profitWeek = allVentes.filter(v => v.date >= sw).reduce((s, v) => s + (v.marge || 0), 0)
    - allGasoil.filter(g => g.date >= sw).reduce((s, g) => s + (g.total || 0), 0)
  const profitMonth = allVentes.filter(v => v.date >= sm).reduce((s, v) => s + (v.marge || 0), 0)
    - allGasoil.filter(g => g.date >= sm).reduce((s, g) => s + (g.total || 0), 0)

  // Period KPIs
  const totalVentes = filteredVentes.reduce((s, v) => s + (v.total_vente || 0), 0)
  const totalMarge = filteredVentes.reduce((s, v) => s + (v.marge || 0), 0)
  const totalGasoilCost = filteredGasoil.reduce((s, g) => s + (g.total || 0), 0)
  const profitNet = totalMarge - totalGasoilCost
  const totalQte = filteredVentes.reduce((s, v) => s + (v.qte || 0), 0)
  const totalCreances = allClients.reduce((s, c) => s + (c.solde || 0), 0)

  // Client insights
  const clientPurchases = {}
  allVentes.forEach(v => {
    if (!v.client_id) return
    if (!clientPurchases[v.client_id]) clientPurchases[v.client_id] = { nom: v.client_nom, total: 0 }
    clientPurchases[v.client_id].total += v.total_vente || 0
  })
  const top3Clients = Object.values(clientPurchases).sort((a, b) => b.total - a.total).slice(0, 3)
  const highDebtClients = [...allClients].filter(c => (c.solde || 0) > 0).sort((a, b) => (b.solde || 0) - (a.solde || 0)).slice(0, 5)
  const overdueClients = allClients.filter(c => (c.solde || 0) >= 50000)

  // Product analysis
  const byType = {}
  filteredVentes.forEach(v => {
    const t2 = v.type_brique || 'N/A'
    byType[t2] = (byType[t2] || 0) + (v.qte || 0)
  })
  const byTypeSorted = Object.entries(byType).sort((a, b) => b[1] - a[1])
  const mostSold = byTypeSorted[0]

  // Chart data
  const chartData = (() => {
    if (chartMode === 'day') {
      const byDay = {}
      filteredVentes.forEach(v => { byDay[v.date] = (byDay[v.date] || 0) + (v.marge || 0) })
      return Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).slice(-30).map(([d, val]) => ({ label: d.slice(5), value: val }))
    } else {
      const byMonth = {}
      filteredVentes.forEach(v => { const m = v.date ? v.date.slice(0, 7) : '?'; byMonth[m] = (byMonth[m] || 0) + (v.marge || 0) })
      return Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([m, val]) => ({ label: m.slice(2), value: val }))
    }
  })()

  // Alerts
  const highDebtAlert = allClients.filter(c => (c.solde || 0) >= 100000)
  const negativeProfitAlert = profitMonth < 0

  return (
    <Layout title="Dashboard" subtitle="Vue d'ensemble de votre activité">

      {/* ALERTS */}
      {(highDebtAlert.length > 0 || negativeProfitAlert) && (
        <div className="space-y-3 mb-6">
          {highDebtAlert.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <span className="text-red-500 text-xl flex-shrink-0">⚠️</span>
              <div>
                <div className="font-semibold text-red-700 text-sm">Soldes urgents — {highDebtAlert.length} client(s) ≥ 100 000 DHS</div>
                <div className="text-red-600 text-xs mt-1">{highDebtAlert.map(c => c.nom).join(' • ')}</div>
              </div>
            </div>
          )}
          {negativeProfitAlert && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
              <span className="text-orange-500 text-xl flex-shrink-0">📉</span>
              <div>
                <div className="font-semibold text-orange-700 text-sm">Profit négatif ce mois — Vérifier les charges gasoil</div>
                <div className="text-orange-600 text-xs mt-1">La marge brute ne couvre pas le gasoil ce mois-ci</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DATE FILTER */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-gray-600 flex-shrink-0">📅 Période :</span>
          <div className="flex gap-1.5 flex-wrap">
            {[
              { key: 'today', label: "Aujourd'hui" },
              { key: 'week', label: 'Semaine' },
              { key: 'month', label: 'Ce mois' },
              { key: 'all', label: 'Tout' },
            ].map(q => (
              <button key={q.key} onClick={() => applyQuick(q.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  quickFilter === q.key ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {q.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 font-medium">De</label>
              <input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setQuickFilter('custom') }}
                className="input text-xs py-1.5 w-36" />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 font-medium">À</label>
              <input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setQuickFilter('custom') }}
                className="input text-xs py-1.5 w-36" />
            </div>
          </div>
        </div>
      </div>

      {loading ? <Skeleton /> : (
        <>
          {/* PROFIT SECTION */}
          <div className="mb-6">
            <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wide mb-3">💰 Profit — Périodes fixes</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard label="Profit aujourd'hui" icon="📅" color={profitToday >= 0 ? 'green' : 'red'} isProfit rawValue={profitToday} sub="Marge brute − Gasoil" />
              <StatCard label="Profit cette semaine" icon="📆" color={profitWeek >= 0 ? 'green' : 'red'} isProfit rawValue={profitWeek} sub="Marge brute − Gasoil" />
              <StatCard label="Profit ce mois" icon="🗓️" color={profitMonth >= 0 ? 'green' : 'red'} isProfit rawValue={profitMonth} sub="Marge brute − Gasoil" />
            </div>
          </div>

          {/* PERIOD KPIs */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wide">📊 Résumé de la période sélectionnée</h2>
              <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                {filterFrom} → {filterTo}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard label="Total ventes" value={fmt(totalVentes) + ' DHS'} icon="📦" color="blue" sub={fmt(totalQte) + ' briques'} />
              <StatCard label="Marge brute" value={fmt(totalMarge) + ' DHS'} icon="📈" color="green"
                sub={totalVentes > 0 ? Math.round(totalMarge / totalVentes * 100) + '% du CA' : '0%'} />
              <StatCard label="Gasoil période" value={fmt(totalGasoilCost) + ' DHS'} icon="⛽" color="amber" sub="Dépense carburant" />
              <StatCard label="Marge nette" icon="💎" color={profitNet >= 0 ? 'purple' : 'red'} isProfit rawValue={profitNet} sub="Marge − Gasoil" />
              <StatCard label="Créances totales" value={fmt(totalCreances) + ' DHS'} icon="📋" color="red" sub="Soldes clients" />
            </div>
          </div>

          {/* CHART + TOP CLIENTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">📉 Marge — Evolution</h2>
                <div className="flex gap-1">
                  {[['day', 'Par jour'], ['month', 'Par mois']].map(([m, l]) => (
                    <button key={m} onClick={() => setChartMode(m)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        chartMode === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>{l}</button>
                  ))}
                </div>
              </div>
              <SalesChart data={chartData} />
              <p className="text-xs text-gray-400 mt-2 text-center">
                {chartMode === 'day' ? '30 derniers jours de la période' : 'Marge mensuelle'} — Rouge = négatif
              </p>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">🏆 Top 3 clients</h2>
                <Link href="/clients" className="text-xs text-blue-500 hover:underline">Voir tout →</Link>
              </div>
              <div className="space-y-3">
                {top3Clients.map((c, i) => (
                  <div key={c.nom} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${
                      i === 0 ? 'bg-yellow-100' : i === 1 ? 'bg-gray-200' : 'bg-orange-100'}`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-sm truncate">{c.nom}</div>
                      <div className="text-xs text-gray-400">Total achats (tous temps)</div>
                    </div>
                    <div className="font-bold text-green-600 text-sm whitespace-nowrap">{fmt(c.total)} DHS</div>
                  </div>
                ))}
                {top3Clients.length === 0 && (
                  <div className="text-center text-gray-400 text-sm py-6">Aucune donnée clients</div>
                )}
              </div>
            </div>
          </div>

          {/* HIGH DEBT + PRODUCT */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">💸 Clients — Dettes élevées</h2>
                <Link href="/clients" className="text-xs text-blue-500 hover:underline">Voir tout →</Link>
              </div>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Client</th>
                    <th className="th">Dépôt</th>
                    <th className="th text-right">Solde DHS</th>
                    <th className="th">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {highDebtClients.map(c => {
                    const s = c.solde || 0
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="td font-semibold text-gray-900">{c.nom}</td>
                        <td className="td text-gray-400 text-xs">{c.depot}</td>
                        <td className="td text-right font-bold text-red-600">{fmt(s)}</td>
                        <td className="td">
                          <span className={s >= 100000 ? 'badge-red' : s >= 50000 ? 'badge-amber' : 'badge-blue'}>
                            {s >= 100000 ? '🔴 Urgent' : s >= 50000 ? '🟡 Élevé' : '🔵 Normal'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {highDebtClients.length === 0 && (
                    <tr><td colSpan={4} className="td text-center text-gray-400 py-6">✅ Aucun solde en attente</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">🧱 Analyse — Types de briques</h2>
                {mostSold && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">⭐ {mostSold[0]}</span>
                )}
              </div>
              {byTypeSorted.length > 0 ? (
                <div className="space-y-3">
                  {byTypeSorted.map(([type, qte], i) => {
                    const maxQte = byTypeSorted[0][1] || 1
                    const pct = Math.round(qte / maxQte * 100)
                    return (
                      <div key={type}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-800">{type}</span>
                            {i === 0 && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-semibold">TOP</span>}
                          </div>
                          <span className="text-sm font-bold text-blue-700">{fmt(qte)} briques</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="h-2 rounded-full" style={{
                            width: pct + '%',
                            background: i === 0 ? '#2563eb' : i === 1 ? '#60a5fa' : '#bfdbfe'
                          }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center text-gray-400 text-sm py-6">Aucune donnée pour cette période</div>
              )}
            </div>
          </div>

          {/* OVERDUE + GASOIL */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">⏰ Clients en retard (solde ≥ 50 000 DHS)</h2>
              {overdueClients.length > 0 ? (
                <div className="space-y-2">
                  {overdueClients.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-xl">
                      <div>
                        <div className="font-semibold text-gray-900 text-sm">{c.nom}</div>
                        <div className="text-xs text-gray-400">{c.depot || '—'}{c.tel ? ` • ${c.tel}` : ''}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-red-600 text-sm">{fmt(c.solde)} DHS</div>
                        <span className={`text-xs font-semibold ${(c.solde || 0) >= 100000 ? 'text-red-700' : 'text-orange-600'}`}>
                          {(c.solde || 0) >= 100000 ? '🔴 Urgent' : '🟠 Retard'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                  <span className="text-3xl mb-2">✅</span>
                  <div className="text-sm">Aucun client en retard</div>
                </div>
              )}
            </div>

            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">⛽ Gasoil — Résumé période</h2>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <div className="text-xs text-amber-600 font-semibold uppercase tracking-wide mb-1">Coût total</div>
                  <div className="text-xl font-bold text-amber-700">{fmt(totalGasoilCost)} DHS</div>
                </div>
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
                  <div className="text-xs text-orange-600 font-semibold uppercase tracking-wide mb-1">Nb. pleins</div>
                  <div className="text-xl font-bold text-orange-700">{filteredGasoil.length}</div>
                </div>
              </div>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Camion</th>
                    <th className="th text-right">Litres</th>
                    <th className="th text-right">Coût DHS</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const byCamion = {}
                    filteredGasoil.forEach(g => {
                      const k = g.camion_plaque || '—'
                      if (!byCamion[k]) byCamion[k] = { litres: 0, total: 0 }
                      byCamion[k].litres += g.qte || 0
                      byCamion[k].total += g.total || 0
                    })
                    const rows = Object.entries(byCamion).sort((a, b) => b[1].total - a[1].total)
                    if (rows.length === 0) return (
                      <tr><td colSpan={3} className="td text-center text-gray-400 py-4">Aucune entrée gasoil</td></tr>
                    )
                    return rows.map(([plaque, d]) => (
                      <tr key={plaque} className="hover:bg-gray-50">
                        <td className="td font-semibold text-gray-900">{plaque}</td>
                        <td className="td text-right text-gray-600">{Math.round(d.litres)} L</td>
                        <td className="td text-right font-bold text-amber-600">{fmt(d.total)}</td>
                      </tr>
                    ))
                  })()}
                </tbody>
              </table>
              <div className="mt-3 text-right">
                <Link href="/gasoil" className="text-xs text-blue-500 hover:underline">Voir tout le gasoil →</Link>
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}
