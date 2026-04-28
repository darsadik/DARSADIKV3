import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from './_app'
import Link from 'next/link'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtD = n => parseFloat(n || 0).toFixed(2)
const today = () => new Date().toISOString().split('T')[0]
const startOfWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().split('T')[0] }
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

// ── UI Components ─────────────────────────────────────────────

function KPICard({ label, value, sub, icon, positive, negative, neutral }) {
  const valColor = negative ? 'text-red-600' : positive ? 'text-green-600' : 'text-gray-900'
  const bg = negative ? 'bg-red-50 border-red-100' : positive ? 'bg-green-50 border-green-100' : 'bg-white border-gray-100'
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-1 shadow-sm ${bg}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className={`text-2xl font-black leading-tight ${valColor}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

function MiniBar({ label, value, max, color = '#3b82f6', rank }) {
  const pct = max > 0 ? Math.round(value / max * 100) : 0
  return (
    <div className="flex items-center gap-3">
      {rank !== undefined && (
        <span className="text-xs font-bold text-gray-300 w-4 flex-shrink-0">#{rank+1}</span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-gray-700 truncate">{label}</span>
          <span className="text-xs font-bold ml-2" style={{color}}>{fmt(value)}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div className="h-1.5 rounded-full transition-all" style={{width: pct+'%', background: color}} />
        </div>
      </div>
    </div>
  )
}

function SalesChart({ data }) {
  if (!data || data.length === 0) return (
    <div className="flex items-center justify-center h-36 text-gray-300 text-sm">Aucune donnée</div>
  )
  const maxVal = Math.max(...data.map(d => Math.abs(d.value)), 1)
  const barW = Math.max(8, Math.min(32, Math.floor(520 / data.length) - 2))
  const svgW = data.length * (barW + 2)
  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(svgW, 260)} height={140} style={{minWidth:'100%',display:'block'}}>
        {[0,0.5,1].map(p => (
          <line key={p} x1={0} x2="100%" y1={8+(1-p)*100} y2={8+(1-p)*100} stroke="#f3f4f6" strokeWidth={1}/>
        ))}
        {data.map((d,i) => {
          const h = Math.max(3, Math.round(Math.abs(d.value)/maxVal*95))
          const x = i*(barW+2)+1
          const isNeg = d.value < 0
          return (
            <g key={i}>
              <rect x={x} y={isNeg?108:108-h} width={barW} height={h} rx={2}
                fill={isNeg?'#ef4444':'#3b82f6'} opacity={0.85}/>
              <text x={x+barW/2} y={132} textAnchor="middle" fontSize={7} fill="#9ca3af">{d.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_,i)=><div key={i} className="h-24 bg-gray-100 rounded-2xl"/>)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_,i)=><div key={i} className="h-48 bg-gray-100 rounded-2xl"/>)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(2)].map((_,i)=><div key={i} className="h-64 bg-gray-100 rounded-2xl"/>)}
      </div>
    </div>
  )
}

function Section({ title, action, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <h2 className="font-bold text-gray-800 text-sm">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth()
  const [allVentes, setAllVentes]     = useState([])
  const [allGasoil, setAllGasoil]     = useState([])
  const [allClients, setAllClients]   = useState([])
  const [allFourns, setAllFourns]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [filterFrom, setFilterFrom]   = useState(startOfMonth())
  const [filterTo, setFilterTo]       = useState(today())
  const [quickFilter, setQuickFilter] = useState('month')
  const [chartMode, setChartMode]     = useState('day')
  const [fournFilter, setFournFilter] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: v }, { data: g }, { data: c }, { data: f }] = await Promise.all([
      supabase.from('ventes').select('*').order('date', { ascending: true }),
      supabase.from('gasoil').select('*').order('date', { ascending: true }),
      supabase.from('clients').select('*'),
      supabase.from('fournisseurs').select('*').order('nom'),
    ])
    setAllVentes(v || []); setAllGasoil(g || [])
    setAllClients(c || []); setAllFourns(f || [])
    setLoading(false)
  }

  function applyQuick(q) {
    setQuickFilter(q)
    const t = today()
    if (q==='today')  { setFilterFrom(t); setFilterTo(t) }
    if (q==='week')   { setFilterFrom(startOfWeek()); setFilterTo(t) }
    if (q==='month')  { setFilterFrom(startOfMonth()); setFilterTo(t) }
    if (q==='all')    { setFilterFrom('2020-01-01'); setFilterTo(t) }
  }

  // ── Filtered data ──────────────────────────────────────────
  const fv = allVentes.filter(v => (!filterFrom || v.date >= filterFrom) && (!filterTo || v.date <= filterTo))
  const fg = allGasoil.filter(g => (!filterFrom || g.date >= filterFrom) && (!filterTo || g.date <= filterTo))

  // ── Fixed profit periods ───────────────────────────────────
  const t = today(), sw = startOfWeek(), sm = startOfMonth()
  const profitToday = allVentes.filter(v=>v.date===t).reduce((s,v)=>s+(v.marge||0),0)
                    - allGasoil.filter(g=>g.date===t).reduce((s,g)=>s+(g.total||0),0)
  const profitWeek  = allVentes.filter(v=>v.date>=sw).reduce((s,v)=>s+(v.marge||0),0)
                    - allGasoil.filter(g=>g.date>=sw).reduce((s,g)=>s+(g.total||0),0)
  const profitMonth = allVentes.filter(v=>v.date>=sm).reduce((s,v)=>s+(v.marge||0),0)
                    - allGasoil.filter(g=>g.date>=sm).reduce((s,g)=>s+(g.total||0),0)

  // ── Period KPIs ────────────────────────────────────────────
  const totalVentes    = fv.reduce((s,v)=>s+(v.total_vente||0),0)
  const totalMarge     = fv.reduce((s,v)=>s+(v.marge||0),0)
  const totalGasoil    = fg.reduce((s,g)=>s+(g.total||0),0)
  const totalLitres    = fg.reduce((s,g)=>s+(g.qte||0),0)
  const profitNet      = totalMarge - totalGasoil
  const totalQte       = fv.reduce((s,v)=>s+(v.qte||0),0)
  const totalCreances  = allClients.reduce((s,c)=>s+(c.solde||0),0)

  // ── Clients ────────────────────────────────────────────────
  const clientPurchases = {}
  allVentes.forEach(v => {
    if (!v.client_id) return
    if (!clientPurchases[v.client_id]) clientPurchases[v.client_id] = { nom: v.client_nom, total: 0 }
    clientPurchases[v.client_id].total += v.total_vente || 0
  })
  const top3       = Object.values(clientPurchases).sort((a,b)=>b.total-a.total).slice(0,3)
  const maxTop     = top3[0]?.total || 1
  const highDebt   = [...allClients].filter(c=>(c.solde||0)>0).sort((a,b)=>(b.solde||0)-(a.solde||0)).slice(0,6)
  const overdue    = allClients.filter(c=>(c.solde||0)>=50000)

  // ── All clients with orders (filtered period) ──────────────
  const clientOrders = {}
  fv.forEach(v => {
    if (!v.client_id) return
    if (!clientOrders[v.client_id]) clientOrders[v.client_id] = { nom: v.client_nom, qte: 0, total: 0 }
    clientOrders[v.client_id].qte   += v.qte || 0
    clientOrders[v.client_id].total += v.total_vente || 0
  })
  const allClientOrders = Object.values(clientOrders).sort((a,b)=>b.total-a.total)
  const maxClientTotal  = allClientOrders[0]?.total || 1

  // ── Products ───────────────────────────────────────────────
  const byType = {}
  fv.forEach(v => { const k = v.type_brique||'N/A'; byType[k]=(byType[k]||0)+(v.qte||0) })
  const byTypeSorted = Object.entries(byType).sort((a,b)=>b[1]-a[1])
  const mostSold = byTypeSorted[0]

  // ── Fournisseur section ────────────────────────────────────
  const fournVentes = fv.filter(v => !fournFilter || v.fournisseur === fournFilter)
  const byFournProd = {}
  fournVentes.forEach(v => {
    const f  = v.fournisseur || 'Sans fournisseur'
    const tb = v.type_brique || 'N/A'
    if (!byFournProd[f]) byFournProd[f] = {}
    if (!byFournProd[f][tb]) byFournProd[f][tb] = { qte: 0, achat: 0 }
    byFournProd[f][tb].qte   += v.qte || 0
    byFournProd[f][tb].achat += v.total_achat || 0
  })
  const uniqueFourns = [...new Set(allVentes.map(v=>v.fournisseur).filter(Boolean))]

  // ── Chart ──────────────────────────────────────────────────
  const chartData = (() => {
    if (chartMode === 'day') {
      const byDay = {}
      fv.forEach(v => { byDay[v.date]=(byDay[v.date]||0)+(v.marge||0) })
      return Object.entries(byDay).sort((a,b)=>a[0].localeCompare(b[0])).slice(-30).map(([d,val])=>({label:d.slice(5),value:val}))
    } else {
      const byMonth = {}
      fv.forEach(v => { const m=v.date?.slice(0,7)||'?'; byMonth[m]=(byMonth[m]||0)+(v.marge||0) })
      return Object.entries(byMonth).sort((a,b)=>a[0].localeCompare(b[0])).map(([m,val])=>({label:m.slice(2),value:val}))
    }
  })()

  // ── Alerts ─────────────────────────────────────────────────
  const urgentDebt = allClients.filter(c=>(c.solde||0)>=100000)
  const negProfit  = profitMonth < 0

  return (
    <Layout title="Dashboard" subtitle="Vue d'ensemble">

      {/* ── ALERTS ─────────────────────────────────────────── */}
      {(urgentDebt.length > 0 || negProfit) && (
        <div className="space-y-2 mb-5">
          {urgentDebt.length > 0 && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <span className="text-red-500 text-lg flex-shrink-0">⚠️</span>
              <div>
                <div className="text-red-700 font-bold text-sm">
                  {urgentDebt.length} client(s) avec solde ≥ 100 000 DHS
                </div>
                <div className="text-red-500 text-xs mt-0.5">{urgentDebt.map(c=>c.nom).join(' · ')}</div>
              </div>
            </div>
          )}
          {negProfit && (
            <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
              <span className="text-orange-500 text-lg flex-shrink-0">📉</span>
              <div className="text-orange-700 font-bold text-sm">Profit négatif ce mois — vérifier les charges gasoil</div>
            </div>
          )}
        </div>
      )}

      {/* ── DATE FILTER ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3 mb-5 flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Période</span>
        <div className="flex gap-1.5 flex-wrap">
          {[['today',"Auj."],['week','Semaine'],['month','Ce mois'],['all','Tout']].map(([k,l])=>(
            <button key={k} onClick={()=>applyQuick(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${quickFilter===k?'bg-gray-900 text-white':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">De</span>
            <input type="date" value={filterFrom} className="input text-xs py-1.5 w-36"
              onChange={e=>{setFilterFrom(e.target.value);setQuickFilter('custom')}} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">À</span>
            <input type="date" value={filterTo} className="input text-xs py-1.5 w-36"
              onChange={e=>{setFilterTo(e.target.value);setQuickFilter('custom')}} />
          </div>
        </div>
      </div>

      {loading ? <Skeleton /> : (
        <div className="space-y-5">

          {/* ── PROFIT FIXE ────────────────────────────────── */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">💰 Profit — périodes fixes</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <KPICard label="Aujourd'hui" value={`${fmt(profitToday)} DHS`} icon="📅"
                positive={profitToday>0} negative={profitToday<0} sub="Marge − Gasoil" />
              <KPICard label="Cette semaine" value={`${fmt(profitWeek)} DHS`} icon="📆"
                positive={profitWeek>0} negative={profitWeek<0} sub="Marge − Gasoil" />
              <KPICard label="Ce mois" value={`${fmt(profitMonth)} DHS`} icon="🗓️"
                positive={profitMonth>0} negative={profitMonth<0} sub="Marge − Gasoil" />
            </div>
          </div>

          {/* ── KPIs PÉRIODE ───────────────────────────────── */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
              📊 Période sélectionnée &nbsp;
              <span className="normal-case font-medium text-gray-300">{filterFrom} → {filterTo}</span>
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <KPICard label="Ventes" value={`${fmt(totalVentes)} DHS`} icon="📦"
                sub={`${fmt(totalQte)} briques`} />
              <KPICard label="Marge brute" value={`${fmt(totalMarge)} DHS`} icon="📈"
                positive={totalMarge>0} sub={totalVentes>0?`${Math.round(totalMarge/totalVentes*100)}% du CA`:''} />
              <KPICard label="Gasoil" value={`${fmt(totalGasoil)} DHS`} icon="⛽"
                sub={`${Math.round(totalLitres)} L`} />
              <KPICard label="Marge nette" value={`${fmt(profitNet)} DHS`} icon="💎"
                positive={profitNet>0} negative={profitNet<0} sub="Marge − Gasoil" />
              <KPICard label="Créances" value={`${fmt(totalCreances)} DHS`} icon="📋"
                negative={totalCreances>0} sub="Soldes clients" />
            </div>
          </div>

          {/* ── CHART + TOP CLIENTS ─────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section
              title="📉 Marge — Évolution"
              action={
                <div className="flex gap-1">
                  {[['day','Jour'],['month','Mois']].map(([m,l])=>(
                    <button key={m} onClick={()=>setChartMode(m)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${chartMode===m?'bg-gray-900 text-white':'bg-gray-100 text-gray-500'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              }
            >
              <SalesChart data={chartData} />
              <p className="text-xs text-gray-300 mt-2 text-center">Rouge = négatif · Bleu = positif</p>
            </Section>

            <Section
              title="🏆 Top 3 clients — tous temps"
              action={<Link href="/clients" className="text-xs text-blue-400 hover:underline">Voir tout →</Link>}
            >
              <div className="space-y-4">
                {top3.map((c,i)=>(
                  <div key={c.nom} className="flex items-center gap-3">
                    <span className="text-xl flex-shrink-0">{i===0?'🥇':i===1?'🥈':'🥉'}</span>
                    <div className="flex-1 min-w-0">
                      <MiniBar label={c.nom} value={c.total} max={maxTop} color={i===0?'#f59e0b':i===1?'#6b7280':'#d97706'} />
                    </div>
                  </div>
                ))}
                {top3.length===0&&<div className="text-center text-gray-300 py-6 text-sm">Aucune donnée</div>}
              </div>
            </Section>
          </div>

          {/* ── ALL CLIENT ORDERS (période) ─────────────────── */}
          <Section
            title={`👥 Commandes clients — période (${allClientOrders.length} clients)`}
            action={<Link href="/clients" className="text-xs text-blue-400 hover:underline">Voir tout →</Link>}
          >
            {allClientOrders.length === 0 ? (
              <div className="text-center text-gray-300 py-6 text-sm">Aucune commande sur cette période</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">#</th>
                      <th className="th">Client</th>
                      <th className="th text-right">Briques</th>
                      <th className="th text-right">Total DHS</th>
                      <th className="th">Répartition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allClientOrders.map((c,i)=>(
                      <tr key={c.nom} className="hover:bg-gray-50">
                        <td className="td text-gray-300 text-xs">{i+1}</td>
                        <td className="td font-semibold text-gray-900">{c.nom}</td>
                        <td className="td text-right text-gray-600">{fmt(c.qte)}</td>
                        <td className="td text-right font-bold text-blue-700">{fmt(c.total)} DHS</td>
                        <td className="td" style={{width:'160px'}}>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-blue-400"
                              style={{width:Math.round(c.total/maxClientTotal*100)+'%'}} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="tfoot-td" colSpan={2}>TOTAL</td>
                      <td className="tfoot-td text-right">{fmt(totalQte)}</td>
                      <td className="tfoot-td text-right">{fmt(totalVentes)} DHS</td>
                      <td className="tfoot-td"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Section>

          {/* ── PRODUCTS + DEBT ─────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section
              title="🧱 Produits — période"
              action={mostSold&&<span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-bold">⭐ {mostSold[0]}</span>}
            >
              {byTypeSorted.length===0?(
                <div className="text-center text-gray-300 py-6 text-sm">Aucune donnée</div>
              ):(
                <div className="space-y-4">
                  {byTypeSorted.map(([type,qte],i)=>(
                    <MiniBar key={type} rank={i} label={type} value={qte}
                      max={byTypeSorted[0][1]||1}
                      color={i===0?'#2563eb':i===1?'#60a5fa':'#bfdbfe'} />
                  ))}
                  <div className="pt-2 border-t border-gray-50 flex justify-between text-xs text-gray-400">
                    <span>Total période</span>
                    <span className="font-bold text-gray-700">{fmt(totalQte)} briques</span>
                  </div>
                </div>
              )}
            </Section>

            <Section
              title="💸 Dettes clients"
              action={<Link href="/clients" className="text-xs text-blue-400 hover:underline">Voir tout →</Link>}
            >
              {highDebt.length===0?(
                <div className="flex flex-col items-center py-8 text-gray-300">
                  <span className="text-3xl mb-2">✅</span>
                  <span className="text-sm">Aucun solde en attente</span>
                </div>
              ):(
                <div className="space-y-2">
                  {highDebt.map(c=>{
                    const s = c.solde||0
                    return (
                      <div key={c.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{c.nom}</div>
                          <div className="text-xs text-gray-400">{c.depot||'—'}</div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-bold ${s>=100000?'text-red-600':s>=50000?'text-amber-600':'text-gray-700'}`}>
                            {fmt(s)} DHS
                          </div>
                          <span className={`text-xs font-semibold ${s>=100000?'text-red-500':s>=50000?'text-amber-500':'text-blue-400'}`}>
                            {s>=100000?'🔴 Urgent':s>=50000?'🟡 Élevé':'🔵 Normal'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>
          </div>

          {/* ── FOURNISSEUR ─────────────────────────────────── */}
          <Section
            title="🏭 Fournisseurs — briques par produit"
            action={
              <select value={fournFilter} onChange={e=>setFournFilter(e.target.value)}
                className="input text-xs py-1 w-40">
                <option value="">Tous</option>
                {uniqueFourns.map(f=><option key={f}>{f}</option>)}
              </select>
            }
          >
            {Object.keys(byFournProd).length===0?(
              <div className="text-center text-gray-300 py-6 text-sm">Aucune donnée fournisseur</div>
            ):(
              <div className="space-y-6">
                {Object.entries(byFournProd).map(([fourn, prods])=>{
                  const grandQte   = Object.values(prods).reduce((s,d)=>s+d.qte,0)
                  const grandAchat = Object.values(prods).reduce((s,d)=>s+d.achat,0)
                  const maxQ = Math.max(...Object.values(prods).map(d=>d.qte),1)
                  return (
                    <div key={fourn}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-bold text-gray-800 text-sm">🏭 {fourn}</div>
                        <div className="flex gap-3 text-xs">
                          <span className="text-gray-400">Total : <b className="text-gray-700">{fmt(grandQte)} briques</b></span>
                          <span className="text-gray-400">Achat : <b className="text-amber-700">{fmt(grandAchat)} DHS</b></span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr>
                              <th className="th">Produit</th>
                              <th className="th text-right">Quantité briques</th>
                              <th className="th text-right">Total achat DHS</th>
                              <th className="th">Part</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(prods).sort((a,b)=>b[1].qte-a[1].qte).map(([prod,d])=>(
                              <tr key={prod} className="hover:bg-gray-50">
                                <td className="td font-semibold">
                                  <span className="badge-blue">{prod}</span>
                                </td>
                                <td className="td text-right font-bold text-gray-900">{fmt(d.qte)}</td>
                                <td className="td text-right font-bold text-amber-700">{fmt(d.achat)} DHS</td>
                                <td className="td" style={{width:'120px'}}>
                                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                                    <div className="h-1.5 rounded-full bg-amber-400"
                                      style={{width:Math.round(d.qte/maxQ*100)+'%'}} />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td className="tfoot-td">TOTAL {fourn}</td>
                              <td className="tfoot-td text-right">{fmt(grandQte)}</td>
                              <td className="tfoot-td text-right">{fmt(grandAchat)} DHS</td>
                              <td className="tfoot-td"></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          {/* ── GASOIL + OVERDUE ─────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section
              title="⛽ Gasoil — résumé période"
              action={<Link href="/gasoil" className="text-xs text-blue-400 hover:underline">Détails →</Link>}
            >
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <div className="text-xs text-amber-600 font-bold uppercase mb-1">Coût total</div>
                  <div className="text-xl font-black text-amber-700">{fmt(totalGasoil)} DHS</div>
                </div>
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
                  <div className="text-xs text-orange-600 font-bold uppercase mb-1">Total litres</div>
                  <div className="text-xl font-black text-orange-700">{Math.round(totalLitres)} L</div>
                </div>
              </div>
              <div className="space-y-2">
                {(()=>{
                  const byCamion = {}
                  fg.forEach(g=>{
                    const k = g.camion_plaque||'—'
                    if (!byCamion[k]) byCamion[k]={litres:0,total:0}
                    byCamion[k].litres += g.qte||0
                    byCamion[k].total  += g.total||0
                  })
                  const rows = Object.entries(byCamion).sort((a,b)=>b[1].total-a[1].total)
                  if (rows.length===0) return <div className="text-center text-gray-300 py-4 text-sm">Aucune entrée gasoil</div>
                  return rows.map(([plaque,d])=>(
                    <div key={plaque} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="font-semibold text-gray-800 text-sm">🚛 {plaque}</div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400">{Math.round(d.litres)} L</div>
                        <div className="font-bold text-amber-600 text-sm">{fmt(d.total)} DHS</div>
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </Section>

            <Section title="⏰ Clients en retard (solde ≥ 50 000 DHS)">
              {overdue.length===0?(
                <div className="flex flex-col items-center py-8 text-gray-300">
                  <span className="text-3xl mb-2">✅</span>
                  <span className="text-sm">Aucun client en retard</span>
                </div>
              ):(
                <div className="space-y-2">
                  {overdue.sort((a,b)=>(b.solde||0)-(a.solde||0)).map(c=>(
                    <div key={c.id} className={`flex items-center justify-between p-3 rounded-xl border ${(c.solde||0)>=100000?'bg-red-50 border-red-100':'bg-orange-50 border-orange-100'}`}>
                      <div>
                        <div className="font-semibold text-gray-900 text-sm">{c.nom}</div>
                        <div className="text-xs text-gray-400">{c.depot||'—'}{c.tel?` · ${c.tel}`:''}</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold text-sm ${(c.solde||0)>=100000?'text-red-600':'text-orange-600'}`}>
                          {fmt(c.solde)} DHS
                        </div>
                        <span className="text-xs font-bold">{(c.solde||0)>=100000?'🔴 Urgent':'🟠 Retard'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

        </div>
      )}
    </Layout>
  )
}
