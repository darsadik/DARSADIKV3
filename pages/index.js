import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from './_app'
import Link from 'next/link'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const today = () => new Date().toISOString().split('T')[0]
const startOfWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().split('T')[0] }
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

function KPICard({ label, value, sub, icon, red, green }) {
  const valColor = red ? 'text-red-500' : green ? 'text-emerald-500' : 'text-slate-800'
  const border   = red ? 'border-red-100' : green ? 'border-emerald-100' : 'border-slate-100'
  return (
    <div className={`bg-white rounded-2xl border ${border} p-4 shadow-sm flex flex-col gap-1`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
        <span className="text-base">{icon}</span>
      </div>
      <div className={`text-2xl font-black leading-tight ${valColor}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-300 mt-0.5">{sub}</div>}
    </div>
  )
}

function Bar({ label, value, max, color, rank }) {
  const pct = max > 0 ? Math.round(value / max * 100) : 0
  return (
    <div className="flex items-center gap-3">
      {rank !== undefined && <span className="text-[11px] font-bold text-slate-300 w-4 flex-shrink-0">#{rank+1}</span>}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-slate-700 truncate">{label}</span>
          <span className="text-xs font-bold ml-2 tabular-nums" style={{color}}>{fmt(value)} DHS</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-1.5">
          <div className="h-1.5 rounded-full" style={{width:pct+'%', background:color}} />
        </div>
      </div>
    </div>
  )
}

function MiniChart({ data }) {
  if (!data || data.length === 0) return (
    <div className="flex items-center justify-center h-32 text-slate-300 text-xs">Aucune donnée</div>
  )
  const max = Math.max(...data.map(d => Math.abs(d.value)), 1)
  const bw  = Math.max(8, Math.min(28, Math.floor(500 / data.length) - 2))
  const sw  = data.length * (bw + 2)
  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(sw, 260)} height={120} style={{minWidth:'100%', display:'block'}}>
        {[0, 0.5, 1].map(p => (
          <line key={p} x1={0} x2="100%" y1={6+(1-p)*85} y2={6+(1-p)*85} stroke="#f1f5f9" strokeWidth={1}/>
        ))}
        {data.map((d, i) => {
          const h  = Math.max(3, Math.round(Math.abs(d.value)/max*80))
          const x  = i*(bw+2)+1
          const ng = d.value < 0
          return (
            <g key={i}>
              <rect x={x} y={ng?91:91-h} width={bw} height={h} rx={2} fill={ng?'#f87171':'#34d399'} opacity={0.9}/>
              <text x={x+bw/2} y={112} textAnchor="middle" fontSize={6.5} fill="#cbd5e1">{d.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Card({ title, action, children, noPad }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50">
        <h2 className="font-bold text-slate-700 text-[13px] tracking-tight">{title}</h2>
        {action}
      </div>
      <div className={noPad ? '' : 'p-5'}>{children}</div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_,i)=><div key={i} className="h-24 bg-slate-100 rounded-2xl"/>)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(2)].map((_,i)=><div key={i} className="h-56 bg-slate-100 rounded-2xl"/>)}
      </div>
      <div className="h-72 bg-slate-100 rounded-2xl"/>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(2)].map((_,i)=><div key={i} className="h-52 bg-slate-100 rounded-2xl"/>)}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [allVentes,  setAllVentes]  = useState([])
  const [allGasoil,  setAllGasoil]  = useState([])
  const [allClients, setAllClients] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo,   setFilterTo]   = useState(today())
  const [quick,      setQuick]      = useState('month')
  const [chartMode,  setChartMode]  = useState('day')
  const [fournFilter,setFournFilter]= useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: v }, { data: g }, { data: c }] = await Promise.all([
      supabase.from('ventes').select('*').order('date', { ascending: true }),
      supabase.from('gasoil').select('*').order('date', { ascending: true }),
      supabase.from('clients').select('*'),
    ])
    setAllVentes(v || []); setAllGasoil(g || []); setAllClients(c || [])
    setLoading(false)
  }

  function applyQuick(q) {
    setQuick(q)
    const t = today()
    if (q==='today') { setFilterFrom(t); setFilterTo(t) }
    if (q==='week')  { setFilterFrom(startOfWeek()); setFilterTo(t) }
    if (q==='month') { setFilterFrom(startOfMonth()); setFilterTo(t) }
    if (q==='all')   { setFilterFrom('2020-01-01'); setFilterTo(t) }
  }

  // ── filtered ────────────────────────────────────────────────
  const fv = allVentes.filter(v => (!filterFrom || v.date >= filterFrom) && (!filterTo || v.date <= filterTo))
  const fg = allGasoil.filter(g => (!filterFrom || g.date >= filterFrom) && (!filterTo || g.date <= filterTo))

  // ── KPIs ────────────────────────────────────────────────────
  const totalVentes   = fv.reduce((s,v) => s+(v.total_vente||0), 0)
  const totalQte      = fv.reduce((s,v) => s+(v.qte||0), 0)
  const totalMarge    = fv.reduce((s,v) => s+(v.marge||0), 0)
  const totalCreances = allClients.reduce((s,c) => s+(c.solde||0), 0)
  const totalGasoilDHS = fg.reduce((s,g) => s+(g.total||0), 0)
  const totalLitres   = fg.reduce((s,g) => s+(g.qte||0), 0)

  // ── client orders (period) ───────────────────────────────────
  const clientOrders = {}
  fv.forEach(v => {
    if (!v.client_id) return
    if (!clientOrders[v.client_id]) clientOrders[v.client_id] = { nom: v.client_nom, qte: 0, total: 0 }
    clientOrders[v.client_id].qte   += v.qte || 0
    clientOrders[v.client_id].total += v.total_vente || 0
  })
  const clientRows   = Object.values(clientOrders).sort((a,b) => b.total-a.total)
  const maxClientTot = clientRows[0]?.total || 1

  // ── top 3 all time ──────────────────────────────────────────
  const allTimePurchases = {}
  allVentes.forEach(v => {
    if (!v.client_id) return
    if (!allTimePurchases[v.client_id]) allTimePurchases[v.client_id] = { nom: v.client_nom, total: 0 }
    allTimePurchases[v.client_id].total += v.total_vente || 0
  })
  const top3    = Object.values(allTimePurchases).sort((a,b) => b.total-a.total).slice(0,3)
  const maxTop3 = top3[0]?.total || 1

  // ── fournisseur ──────────────────────────────────────────────
  const uniqueFourns = [...new Set(allVentes.map(v=>v.fournisseur).filter(Boolean))]
  const fournVentes  = fv.filter(v => !fournFilter || v.fournisseur === fournFilter)
  const byFournProd  = {}
  fournVentes.forEach(v => {
    const f  = v.fournisseur || 'Sans fournisseur'
    const tb = v.type_brique || 'N/A'
    if (!byFournProd[f]) byFournProd[f] = {}
    if (!byFournProd[f][tb]) byFournProd[f][tb] = { qte: 0, achat: 0 }
    byFournProd[f][tb].qte   += v.qte || 0
    byFournProd[f][tb].achat += v.total_achat || 0
  })

  // ── products ─────────────────────────────────────────────────
  const byType = {}
  fv.forEach(v => { const k = v.type_brique||'N/A'; byType[k]=(byType[k]||0)+(v.qte||0) })
  const byTypeSorted = Object.entries(byType).sort((a,b) => b[1]-a[1])
  const maxTypeQte   = byTypeSorted[0]?.[1] || 1

  // ── chart ────────────────────────────────────────────────────
  const chartData = (() => {
    if (chartMode === 'day') {
      const m = {}
      fv.forEach(v => { m[v.date]=(m[v.date]||0)+(v.total_vente||0) })
      return Object.entries(m).sort((a,b)=>a[0].localeCompare(b[0])).slice(-30).map(([d,val])=>({label:d.slice(5),value:val}))
    }
    const m = {}
    fv.forEach(v => { const mo=v.date?.slice(0,7)||'?'; m[mo]=(m[mo]||0)+(v.total_vente||0) })
    return Object.entries(m).sort((a,b)=>a[0].localeCompare(b[0])).map(([mo,val])=>({label:mo.slice(2),value:val}))
  })()

  // ── debt / alerts ────────────────────────────────────────────
  const highDebt    = [...allClients].filter(c=>(c.solde||0)>0).sort((a,b)=>(b.solde||0)-(a.solde||0)).slice(0,7)
  const urgentDebt  = allClients.filter(c=>(c.solde||0)>=100000)

  return (
    <Layout title="Dashboard" subtitle="Vue d'ensemble">

      {/* ALERTS */}
      {urgentDebt.length > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-5">
          <span className="text-red-400 text-base flex-shrink-0 mt-0.5">⚠️</span>
          <div>
            <div className="text-red-600 font-bold text-sm">{urgentDebt.length} client(s) avec solde ≥ 100 000 DHS</div>
            <div className="text-red-400 text-xs mt-0.5">{urgentDebt.map(c=>c.nom).join(' · ')}</div>
          </div>
        </div>
      )}

      {/* DATE FILTER */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-3 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Période</span>
          <div className="flex gap-1.5 flex-wrap">
            {[['today',"Auj."],['week','Semaine'],['month','Mois'],['all','Tout']].map(([k,l])=>(
              <button key={k} onClick={()=>applyQuick(k)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${quick===k?'bg-slate-800 text-white':'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">De</span>
              <input type="date" value={filterFrom} className="input text-xs py-1.5 w-36"
                onChange={e=>{setFilterFrom(e.target.value);setQuick('custom')}}/>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">À</span>
              <input type="date" value={filterTo} className="input text-xs py-1.5 w-36"
                onChange={e=>{setFilterTo(e.target.value);setQuick('custom')}}/>
            </div>
          </div>
        </div>
      </div>

      {loading ? <Skeleton /> : (
        <div className="space-y-4">

          {/* ── KPIs ───────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard label="Ventes" value={`${fmt(totalVentes)} DHS`} icon="📦"
              sub={`${fmt(totalQte)} briques`} green />
            <KPICard label="Marge brute" value={`${fmt(totalMarge)} DHS`} icon="📈"
              sub={totalVentes>0?`${Math.round(totalMarge/totalVentes*100)}% du CA`:''} green={totalMarge>0} red={totalMarge<0} />
            <KPICard label="Gasoil — charge" value={`${fmt(totalGasoilDHS)} DHS`} icon="⛽"
              sub={`${Math.round(totalLitres)} L consommés`} />
            <KPICard label="Créances clients" value={`${fmt(totalCreances)} DHS`} icon="📋"
              sub="Total soldes non payés" red={totalCreances>0} />
          </div>

          {/* ── 1. COMMANDES CLIENTS (période) ─────────────── */}
          <Card
            title={`👥 Commandes clients — ${clientRows.length} client(s)`}
            action={<Link href="/clients" className="text-[11px] text-blue-400 hover:underline">Voir tout →</Link>}
          >
            {clientRows.length === 0 ? (
              <div className="text-center text-slate-300 py-8 text-sm">Aucune commande sur cette période</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th text-slate-400">#</th>
                      <th className="th text-slate-400">Client</th>
                      <th className="th text-slate-400 text-right">Briques</th>
                      <th className="th text-slate-400 text-right">Total DHS</th>
                      <th className="th text-slate-400">Répartition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientRows.map((c,i) => (
                      <tr key={c.nom} className="hover:bg-slate-50 transition-colors">
                        <td className="td text-slate-300 text-xs">{i+1}</td>
                        <td className="td font-semibold text-slate-800">{c.nom}</td>
                        <td className="td text-right text-slate-500">{fmt(c.qte)}</td>
                        <td className="td text-right font-bold text-emerald-600">{fmt(c.total)} DHS</td>
                        <td className="td" style={{width:140}}>
                          <div className="bg-slate-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-emerald-400"
                              style={{width:Math.round(c.total/maxClientTot*100)+'%'}}/>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="tfoot-td" colSpan={2}>TOTAL ({clientRows.length})</td>
                      <td className="tfoot-td text-right">{fmt(totalQte)}</td>
                      <td className="tfoot-td text-right">{fmt(totalVentes)} DHS</td>
                      <td className="tfoot-td"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          {/* ── 2. FOURNISSEURS ─────────────────────────────── */}
          <Card
            title="🏭 Fournisseurs — briques par produit"
            action={
              <select value={fournFilter} onChange={e=>setFournFilter(e.target.value)}
                className="input text-xs py-1 w-36">
                <option value="">Tous</option>
                {uniqueFourns.map(f=><option key={f}>{f}</option>)}
              </select>
            }
          >
            {Object.keys(byFournProd).length === 0 ? (
              <div className="text-center text-slate-300 py-8 text-sm">Aucune donnée fournisseur</div>
            ) : (
              <div className="space-y-8">
                {Object.entries(byFournProd).map(([fourn, prods]) => {
                  const grandQte   = Object.values(prods).reduce((s,d)=>s+d.qte,0)
                  const grandAchat = Object.values(prods).reduce((s,d)=>s+d.achat,0)
                  const maxQ       = Math.max(...Object.values(prods).map(d=>d.qte), 1)
                  const prodsSorted = Object.entries(prods).sort((a,b)=>b[1].qte-a[1].qte)
                  return (
                    <div key={fourn}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-bold text-slate-800 text-sm">🏭 {fourn}</span>
                        <div className="flex gap-4 text-xs text-slate-400">
                          <span>Total : <b className="text-slate-700">{fmt(grandQte)} briques</b></span>
                          <span>Achat : <b className="text-amber-600">{fmt(grandAchat)} DHS</b></span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr>
                              <th className="th text-slate-400">Produit</th>
                              <th className="th text-slate-400 text-right">Quantité briques</th>
                              <th className="th text-slate-400 text-right">Total achat DHS</th>
                              <th className="th text-slate-400">Part</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prodsSorted.map(([prod, d]) => (
                              <tr key={prod} className="hover:bg-slate-50">
                                <td className="td"><span className="badge-blue">{prod}</span></td>
                                <td className="td text-right font-bold text-slate-800">{fmt(d.qte)}</td>
                                <td className="td text-right font-bold text-amber-600">{fmt(d.achat)} DHS</td>
                                <td className="td" style={{width:120}}>
                                  <div className="bg-slate-100 rounded-full h-1.5">
                                    <div className="h-1.5 rounded-full bg-amber-400"
                                      style={{width:Math.round(d.qte/maxQ*100)+'%'}}/>
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
          </Card>

          {/* ── CHART + TOP 3 ───────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card
              title="📈 Ventes — évolution"
              action={
                <div className="flex gap-1">
                  {[['day','Jour'],['month','Mois']].map(([m,l])=>(
                    <button key={m} onClick={()=>setChartMode(m)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${chartMode===m?'bg-slate-800 text-white':'bg-slate-100 text-slate-500'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              }
            >
              <MiniChart data={chartData} />
              <p className="text-[11px] text-slate-300 mt-2 text-center">Vert = ventes · Rouge = 0</p>
            </Card>

            <Card title="🏆 Top 3 clients — tous temps">
              <div className="space-y-5">
                {top3.map((c,i) => (
                  <div key={c.nom} className="flex items-center gap-3">
                    <span className="text-lg flex-shrink-0">{i===0?'🥇':i===1?'🥈':'🥉'}</span>
                    <div className="flex-1 min-w-0">
                      <Bar label={c.nom} value={c.total} max={maxTop3}
                        color={i===0?'#f59e0b':i===1?'#94a3b8':'#d97706'} />
                    </div>
                  </div>
                ))}
                {top3.length===0 && <div className="text-center text-slate-300 py-6 text-sm">Aucune donnée</div>}
              </div>
            </Card>
          </div>

          {/* ── PRODUITS + DETTES ───────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card
              title="🧱 Types de briques — période"
              action={byTypeSorted[0] && (
                <span className="text-[11px] bg-yellow-50 text-yellow-600 border border-yellow-100 px-2 py-0.5 rounded-full font-bold">
                  ⭐ {byTypeSorted[0][0]}
                </span>
              )}
            >
              {byTypeSorted.length === 0 ? (
                <div className="text-center text-slate-300 py-6 text-sm">Aucune donnée</div>
              ) : (
                <div className="space-y-4">
                  {byTypeSorted.map(([type, qte], i) => (
                    <Bar key={type} rank={i} label={type} value={qte} max={maxTypeQte}
                      color={i===0?'#3b82f6':i===1?'#93c5fd':'#bfdbfe'} />
                  ))}
                  <div className="pt-3 border-t border-slate-50 flex justify-between text-xs text-slate-400">
                    <span>Total période</span>
                    <span className="font-bold text-slate-700">{fmt(totalQte)} briques</span>
                  </div>
                </div>
              )}
            </Card>

            <Card
              title="💸 Dettes clients"
              action={<Link href="/clients" className="text-[11px] text-blue-400 hover:underline">Voir tout →</Link>}
            >
              {highDebt.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-slate-300">
                  <span className="text-3xl mb-2">✅</span>
                  <span className="text-sm">Aucun solde en attente</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {highDebt.map(c => {
                    const s = c.solde || 0
                    return (
                      <div key={c.id} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{c.nom}</div>
                          <div className="text-[11px] text-slate-400">{c.depot||'—'}</div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-bold ${s>=100000?'text-red-500':s>=50000?'text-amber-500':'text-slate-600'}`}>
                            {fmt(s)} DHS
                          </div>
                          <span className={`text-[10px] font-bold ${s>=100000?'text-red-400':s>=50000?'text-amber-400':'text-blue-400'}`}>
                            {s>=100000?'🔴 Urgent':s>=50000?'🟡 Élevé':'🔵 Normal'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* ── GASOIL ──────────────────────────────────────── */}
          <Card
            title="⛽ Gasoil — charge transport (période)"
            action={<Link href="/gasoil" className="text-[11px] text-blue-400 hover:underline">Détails →</Link>}
          >
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <div className="text-[11px] text-amber-500 font-bold uppercase tracking-wide mb-1">Coût total</div>
                <div className="text-2xl font-black text-amber-700">{fmt(totalGasoilDHS)} DHS</div>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                <div className="text-[11px] text-orange-500 font-bold uppercase tracking-wide mb-1">Total litres</div>
                <div className="text-2xl font-black text-orange-700">{Math.round(totalLitres)} L</div>
              </div>
            </div>
            <div className="space-y-2">
              {(()=>{
                const byCamion = {}
                fg.forEach(g => {
                  const k = g.camion_plaque||'—'
                  if (!byCamion[k]) byCamion[k]={litres:0,total:0}
                  byCamion[k].litres += g.qte||0
                  byCamion[k].total  += g.total||0
                })
                const rows = Object.entries(byCamion).sort((a,b)=>b[1].total-a[1].total)
                if (rows.length===0) return <div className="text-center text-slate-300 py-4 text-sm">Aucune entrée gasoil</div>
                return rows.map(([plaque,d])=>(
                  <div key={plaque} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                    <div className="font-semibold text-slate-700 text-sm">🚛 {plaque}</div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400">{Math.round(d.litres)} L</div>
                      <div className="font-bold text-amber-600 text-sm">{fmt(d.total)} DHS</div>
                    </div>
                  </div>
                ))
              })()}
            </div>
          </Card>

        </div>
      )}
    </Layout>
  )
}
