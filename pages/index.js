import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from './_app'
import Link from 'next/link'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const today = () => new Date().toISOString().split('T')[0]
const startOfWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().split('T')[0] }
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

// ── DESIGN TOKENS ──────────────────────────────────────────────
const T = {
  bg:       '#0a0a0a',
  surface:  '#111111',
  surface2: '#161616',
  border:   '#1e1e1e',
  border2:  '#252525',
  text:     '#e0e0e0',
  muted:    '#555555',
  faint:    '#2a2a2a',
  green:    '#4ade80',
  red:      '#f87171',
  amber:    '#fbbf24',
  blue:     '#60a5fa',
}

function KPICard({ label, value, sub, accent, dot }) {
  return (
    <div style={{
      background: T.surface, border:`1px solid ${T.border}`,
      borderRadius:12, padding:'18px 20px', display:'flex', flexDirection:'column', gap:8,
      position:'relative', overflow:'hidden'
    }}>
      {dot && (
        <div style={{
          position:'absolute', top:14, right:14, width:6, height:6,
          borderRadius:'50%', background: accent || T.muted
        }}/>
      )}
      <div style={{fontSize:9, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:T.muted}}>
        {label}
      </div>
      <div style={{fontSize:22, fontWeight:800, letterSpacing:'-0.02em', color: accent || T.text, lineHeight:1}}>
        {value}
      </div>
      {sub && <div style={{fontSize:10, color:T.faint, letterSpacing:'0.05em'}}>{sub}</div>}
    </div>
  )
}

function Bar({ label, value, max, color, rank }) {
  const pct = max > 0 ? Math.round(value / max * 100) : 0
  return (
    <div style={{display:'flex', alignItems:'center', gap:12}}>
      {rank !== undefined && (
        <span style={{fontSize:10, fontWeight:700, color:T.faint, width:16, flexShrink:0}}>#{rank+1}</span>
      )}
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5}}>
          <span style={{fontSize:11, fontWeight:600, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{label}</span>
          <span style={{fontSize:11, fontWeight:700, marginLeft:8, fontVariantNumeric:'tabular-nums', color}}>{fmt(value)} DHS</span>
        </div>
        <div style={{width:'100%', background:T.border2, borderRadius:99, height:2}}>
          <div style={{height:2, borderRadius:99, width:pct+'%', background:color, transition:'width 0.6s ease'}} />
        </div>
      </div>
    </div>
  )
}

function MiniChart({ data }) {
  if (!data || data.length === 0) return (
    <div style={{display:'flex', alignItems:'center', justifyContent:'center', height:120, color:T.faint, fontSize:11}}>
      Aucune donnée
    </div>
  )
  const max = Math.max(...data.map(d => Math.abs(d.value)), 1)
  const bw  = Math.max(8, Math.min(28, Math.floor(500 / data.length) - 2))
  const sw  = data.length * (bw + 2)
  return (
    <div style={{overflowX:'auto'}}>
      <svg width={Math.max(sw, 260)} height={120} style={{minWidth:'100%', display:'block'}}>
        {[0, 0.5, 1].map(p => (
          <line key={p} x1={0} x2="100%" y1={6+(1-p)*85} y2={6+(1-p)*85} stroke={T.border2} strokeWidth={1}/>
        ))}
        {data.map((d, i) => {
          const h  = Math.max(3, Math.round(Math.abs(d.value)/max*80))
          const x  = i*(bw+2)+1
          const ng = d.value < 0
          return (
            <g key={i}>
              <rect x={x} y={ng?91:91-h} width={bw} height={h} rx={2}
                fill={ng ? T.red : T.green} opacity={0.8}/>
              <text x={x+bw/2} y={112} textAnchor="middle" fontSize={6.5} fill={T.faint}>{d.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Panel({ title, action, children, noPad }) {
  return (
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'14px 20px', borderBottom:`1px solid ${T.border}`
      }}>
        <h2 style={{fontSize:11, fontWeight:700, letterSpacing:'0.15em', textTransform:'uppercase', color:T.muted}}>
          {title}
        </h2>
        {action}
      </div>
      <div style={noPad ? {} : {padding:20}}>{children}</div>
    </div>
  )
}

function Divider() {
  return <div style={{height:1, background:T.border, margin:'8px 0'}} />
}

function Skeleton() {
  const box = (h) => (
    <div style={{height:h, background:T.surface, borderRadius:12, animation:'pulse 1.5s ease-in-out infinite'}}/>
  )
  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>{[...Array(4)].map((_,i)=><div key={i}>{box(96)}</div>)}</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>{[...Array(2)].map((_,i)=><div key={i}>{box(220)}</div>)}</div>
      {box(280)}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>{[...Array(2)].map((_,i)=><div key={i}>{box(200)}</div>)}</div>
    </div>
  )
}

function QBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding:'5px 14px', borderRadius:8, fontSize:10, fontWeight:700,
      letterSpacing:'0.12em', textTransform:'uppercase', transition:'all 0.15s', cursor:'pointer',
      background: active ? '#ffffff' : T.surface2,
      color: active ? '#000000' : T.muted,
      border: `1px solid ${active ? '#fff' : T.border}`,
    }}>{children}</button>
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

  const fv = allVentes.filter(v => (!filterFrom || v.date >= filterFrom) && (!filterTo || v.date <= filterTo))
  const fg = allGasoil.filter(g => (!filterFrom || g.date >= filterFrom) && (!filterTo || g.date <= filterTo))

  const totalVentes    = fv.reduce((s,v) => s+(v.total_vente||0), 0)
  const totalQte       = fv.reduce((s,v) => s+(v.qte||0), 0)
  const totalMarge     = fv.reduce((s,v) => s+(v.marge||0), 0)
  const totalCreances  = allClients.reduce((s,c) => s+(c.solde||0), 0)
  const totalGasoilDHS = fg.reduce((s,g) => s+(g.total||0), 0)
  const totalLitres    = fg.reduce((s,g) => s+(g.qte||0), 0)

  const clientOrders = {}
  fv.forEach(v => {
    if (!v.client_id) return
    if (!clientOrders[v.client_id]) clientOrders[v.client_id] = { nom: v.client_nom, qte: 0, total: 0 }
    clientOrders[v.client_id].qte   += v.qte || 0
    clientOrders[v.client_id].total += v.total_vente || 0
  })
  const clientRows   = Object.values(clientOrders).sort((a,b) => b.total-a.total)
  const maxClientTot = clientRows[0]?.total || 1

  const allTimePurchases = {}
  allVentes.forEach(v => {
    if (!v.client_id) return
    if (!allTimePurchases[v.client_id]) allTimePurchases[v.client_id] = { nom: v.client_nom, total: 0 }
    allTimePurchases[v.client_id].total += v.total_vente || 0
  })
  const top3    = Object.values(allTimePurchases).sort((a,b) => b.total-a.total).slice(0,3)
  const maxTop3 = top3[0]?.total || 1

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

  const byType = {}
  fv.forEach(v => { const k = v.type_brique||'N/A'; byType[k]=(byType[k]||0)+(v.qte||0) })
  const byTypeSorted = Object.entries(byType).sort((a,b) => b[1]-a[1])
  const maxTypeQte   = byTypeSorted[0]?.[1] || 1

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

  const highDebt   = [...allClients].filter(c=>(c.solde||0)>0).sort((a,b)=>(b.solde||0)-(a.solde||0)).slice(0,7)
  const urgentDebt = allClients.filter(c=>(c.solde||0)>=100000)

  const inputStyle = {
    background: T.surface2, border:`1px solid ${T.border}`, borderRadius:8,
    color: T.text, fontSize:11, padding:'5px 10px', outline:'none',
  }

  const thStyle = {
    textAlign:'left', padding:'10px 14px', fontSize:9, fontWeight:700,
    letterSpacing:'0.15em', textTransform:'uppercase', color:T.faint,
    borderBottom:`1px solid ${T.border}`, background:T.surface
  }
  const tdStyle = {
    padding:'10px 14px', fontSize:11, color:T.text, borderBottom:`1px solid ${T.border}`
  }
  const tfStyle = {
    padding:'10px 14px', fontSize:11, fontWeight:800, color:T.text,
    background:T.surface2, borderTop:`2px solid ${T.border2}`
  }

  return (
    <Layout title="Dashboard" subtitle="Vue d'ensemble">

      {/* ALERTS */}
      {urgentDebt.length > 0 && (
        <div style={{
          display:'flex', alignItems:'flex-start', gap:12,
          background:'rgba(248,113,113,0.06)', border:`1px solid rgba(248,113,113,0.15)`,
          borderRadius:10, padding:'12px 16px', marginBottom:20
        }}>
          <div style={{width:6, height:6, borderRadius:'50%', background:T.red, marginTop:5, flexShrink:0}}/>
          <div>
            <div style={{color:T.red, fontWeight:700, fontSize:12, letterSpacing:'0.05em'}}>
              {urgentDebt.length} client(s) avec solde ≥ 100 000 DHS
            </div>
            <div style={{color:'rgba(248,113,113,0.4)', fontSize:10, marginTop:3, letterSpacing:'0.03em'}}>
              {urgentDebt.map(c=>c.nom).join(' · ')}
            </div>
          </div>
        </div>
      )}

      {/* DATE FILTER */}
      <div style={{
        background:T.surface, border:`1px solid ${T.border}`,
        borderRadius:12, padding:'12px 20px', marginBottom:20
      }}>
        <div style={{display:'flex', flexWrap:'wrap', alignItems:'center', gap:12}}>
          <span style={{fontSize:9, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:T.faint}}>
            Période
          </span>
          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
            {[['today','Auj.'],['week','Semaine'],['month','Mois'],['all','Tout']].map(([k,l])=>(
              <QBtn key={k} active={quick===k} onClick={()=>applyQuick(k)}>{l}</QBtn>
            ))}
          </div>
          <div style={{display:'flex', alignItems:'center', gap:12, marginLeft:'auto', flexWrap:'wrap'}}>
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              <span style={{fontSize:10, color:T.faint}}>De</span>
              <input type="date" value={filterFrom} style={inputStyle}
                onChange={e=>{setFilterFrom(e.target.value);setQuick('custom')}}/>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              <span style={{fontSize:10, color:T.faint}}>À</span>
              <input type="date" value={filterTo} style={inputStyle}
                onChange={e=>{setFilterTo(e.target.value);setQuick('custom')}}/>
            </div>
          </div>
        </div>
      </div>

      {loading ? <Skeleton /> : (
        <div style={{display:'flex', flexDirection:'column', gap:16}}>

          {/* ── KPIs ─────────────────────────────────────────── */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12}}
            className="md:grid-cols-4">
            <KPICard label="Ventes" value={`${fmt(totalVentes)} DHS`}
              sub={`${fmt(totalQte)} briques`} accent={T.green} dot />
            <KPICard label="Marge brute" value={`${fmt(totalMarge)} DHS`}
              sub={totalVentes>0?`${Math.round(totalMarge/totalVentes*100)}% du CA`:''}
              accent={totalMarge<0 ? T.red : T.green} dot />
            <KPICard label="Gasoil — charge" value={`${fmt(totalGasoilDHS)} DHS`}
              sub={`${Math.round(totalLitres)} L consommés`} accent={T.amber} dot />
            <KPICard label="Créances clients" value={`${fmt(totalCreances)} DHS`}
              sub="Total soldes non payés" accent={totalCreances>0 ? T.red : T.muted} dot />
          </div>

          {/* ── COMMANDES CLIENTS ─────────────────────────────── */}
          <Panel
            title={`Commandes clients — ${clientRows.length} client(s)`}
            action={<Link href="/clients" style={{fontSize:10, color:T.muted, letterSpacing:'0.1em', textDecoration:'none'}}>Voir tout →</Link>}
          >
            {clientRows.length === 0 ? (
              <div style={{textAlign:'center', color:T.faint, padding:'32px 0', fontSize:12}}>
                Aucune commande sur cette période
              </div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Client</th>
                      <th style={{...thStyle, textAlign:'right'}}>Briques</th>
                      <th style={{...thStyle, textAlign:'right'}}>Total DHS</th>
                      <th style={thStyle}>Répartition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientRows.map((c,i) => (
                      <tr key={c.nom} style={{transition:'background 0.15s'}}
                        onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <td style={{...tdStyle, color:T.faint}}>{i+1}</td>
                        <td style={{...tdStyle, fontWeight:600, color:T.text}}>{c.nom}</td>
                        <td style={{...tdStyle, textAlign:'right', color:T.muted}}>{fmt(c.qte)}</td>
                        <td style={{...tdStyle, textAlign:'right', fontWeight:700, color:T.green}}>{fmt(c.total)} DHS</td>
                        <td style={{...tdStyle, width:120}}>
                          <div style={{background:T.border2, borderRadius:99, height:2}}>
                            <div style={{height:2, borderRadius:99, background:T.green,
                              width:Math.round(c.total/maxClientTot*100)+'%'}}/>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={tfStyle} colSpan={2}>TOTAL ({clientRows.length})</td>
                      <td style={{...tfStyle, textAlign:'right'}}>{fmt(totalQte)}</td>
                      <td style={{...tfStyle, textAlign:'right', color:T.green}}>{fmt(totalVentes)} DHS</td>
                      <td style={tfStyle}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Panel>

          {/* ── FOURNISSEURS ──────────────────────────────────── */}
          <Panel
            title="Fournisseurs — briques par produit"
            action={
              <select value={fournFilter} onChange={e=>setFournFilter(e.target.value)}
                style={{...inputStyle, width:140}}>
                <option value="">Tous</option>
                {uniqueFourns.map(f=><option key={f}>{f}</option>)}
              </select>
            }
          >
            {Object.keys(byFournProd).length === 0 ? (
              <div style={{textAlign:'center', color:T.faint, padding:'32px 0', fontSize:12}}>Aucune donnée fournisseur</div>
            ) : (
              <div style={{display:'flex', flexDirection:'column', gap:32}}>
                {Object.entries(byFournProd).map(([fourn, prods]) => {
                  const grandQte   = Object.values(prods).reduce((s,d)=>s+d.qte,0)
                  const grandAchat = Object.values(prods).reduce((s,d)=>s+d.achat,0)
                  const maxQ       = Math.max(...Object.values(prods).map(d=>d.qte), 1)
                  const prodsSorted = Object.entries(prods).sort((a,b)=>b[1].qte-a[1].qte)
                  return (
                    <div key={fourn}>
                      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
                        <span style={{fontWeight:700, color:T.text, fontSize:12, letterSpacing:'0.08em'}}>{fourn}</span>
                        <div style={{display:'flex', gap:20, fontSize:10, color:T.muted}}>
                          <span>Total : <b style={{color:T.text}}>{fmt(grandQte)} briques</b></span>
                          <span>Achat : <b style={{color:T.amber}}>{fmt(grandAchat)} DHS</b></span>
                        </div>
                      </div>
                      <div style={{overflowX:'auto'}}>
                        <table style={{width:'100%', borderCollapse:'collapse'}}>
                          <thead>
                            <tr>
                              <th style={thStyle}>Produit</th>
                              <th style={{...thStyle, textAlign:'right'}}>Qté briques</th>
                              <th style={{...thStyle, textAlign:'right'}}>Total achat DHS</th>
                              <th style={thStyle}>Part</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prodsSorted.map(([prod, d]) => (
                              <tr key={prod}
                                onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                <td style={tdStyle}>
                                  <span style={{
                                    display:'inline-flex', alignItems:'center',
                                    padding:'2px 10px', borderRadius:6, fontSize:10, fontWeight:600,
                                    background:T.border, color:T.text, letterSpacing:'0.06em'
                                  }}>{prod}</span>
                                </td>
                                <td style={{...tdStyle, textAlign:'right', fontWeight:700, color:T.text}}>{fmt(d.qte)}</td>
                                <td style={{...tdStyle, textAlign:'right', fontWeight:700, color:T.amber}}>{fmt(d.achat)} DHS</td>
                                <td style={{...tdStyle, width:120}}>
                                  <div style={{background:T.border2, borderRadius:99, height:2}}>
                                    <div style={{height:2, borderRadius:99, background:T.amber,
                                      width:Math.round(d.qte/maxQ*100)+'%'}}/>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td style={tfStyle}>TOTAL {fourn}</td>
                              <td style={{...tfStyle, textAlign:'right'}}>{fmt(grandQte)}</td>
                              <td style={{...tfStyle, textAlign:'right', color:T.amber}}>{fmt(grandAchat)} DHS</td>
                              <td style={tfStyle}></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>

          {/* ── CHART + TOP 3 ─────────────────────────────────── */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}
            className="lg:grid-cols-2 grid-cols-1">
            <Panel
              title="Ventes — évolution"
              action={
                <div style={{display:'flex', gap:6}}>
                  {[['day','Jour'],['month','Mois']].map(([m,l])=>(
                    <QBtn key={m} active={chartMode===m} onClick={()=>setChartMode(m)}>{l}</QBtn>
                  ))}
                </div>
              }
            >
              <MiniChart data={chartData} />
              <p style={{fontSize:9, color:T.faint, textAlign:'center', marginTop:8, letterSpacing:'0.1em'}}>
                VERT = VENTES · ROUGE = 0
              </p>
            </Panel>

            <Panel title="Top 3 clients — tous temps">
              <div style={{display:'flex', flexDirection:'column', gap:20}}>
                {top3.map((c,i) => (
                  <div key={c.nom} style={{display:'flex', alignItems:'center', gap:12}}>
                    <span style={{fontSize:11, fontWeight:800, color:i===0?T.amber:T.faint, width:20, flexShrink:0}}>
                      {i===0?'#1':i===1?'#2':'#3'}
                    </span>
                    <div style={{flex:1, minWidth:0}}>
                      <Bar label={c.nom} value={c.total} max={maxTop3}
                        color={i===0?T.amber:i===1?T.muted:'#7a6030'} />
                    </div>
                  </div>
                ))}
                {top3.length===0 && (
                  <div style={{textAlign:'center', color:T.faint, padding:'24px 0', fontSize:12}}>Aucune donnée</div>
                )}
              </div>
            </Panel>
          </div>

          {/* ── PRODUITS + DETTES ─────────────────────────────── */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}
            className="lg:grid-cols-2 grid-cols-1">
            <Panel
              title="Types de briques — période"
              action={byTypeSorted[0] && (
                <span style={{
                  fontSize:9, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase',
                  background:'rgba(251,191,36,0.08)', color:T.amber,
                  border:`1px solid rgba(251,191,36,0.2)`, borderRadius:6, padding:'3px 10px'
                }}>★ {byTypeSorted[0][0]}</span>
              )}
            >
              {byTypeSorted.length === 0 ? (
                <div style={{textAlign:'center', color:T.faint, padding:'24px 0', fontSize:12}}>Aucune donnée</div>
              ) : (
                <div style={{display:'flex', flexDirection:'column', gap:16}}>
                  {byTypeSorted.map(([type, qte], i) => (
                    <Bar key={type} rank={i} label={type} value={qte} max={maxTypeQte}
                      color={i===0?T.blue:i===1?'rgba(96,165,250,0.5)':'rgba(96,165,250,0.25)'} />
                  ))}
                  <Divider />
                  <div style={{display:'flex', justifyContent:'space-between', fontSize:10}}>
                    <span style={{color:T.faint}}>Total période</span>
                    <span style={{fontWeight:700, color:T.text}}>{fmt(totalQte)} briques</span>
                  </div>
                </div>
              )}
            </Panel>

            <Panel
              title="Dettes clients"
              action={<Link href="/clients" style={{fontSize:10, color:T.muted, letterSpacing:'0.1em', textDecoration:'none'}}>Voir tout →</Link>}
            >
              {highDebt.length === 0 ? (
                <div style={{display:'flex', flexDirection:'column', alignItems:'center', padding:'32px 0', color:T.faint}}>
                  <div style={{fontSize:28, marginBottom:8}}>✓</div>
                  <span style={{fontSize:12, letterSpacing:'0.05em'}}>Aucun solde en attente</span>
                </div>
              ) : (
                <div style={{display:'flex', flexDirection:'column', gap:0}}>
                  {highDebt.map(c => {
                    const s = c.solde || 0
                    const accent = s>=100000?T.red:s>=50000?T.amber:T.muted
                    return (
                      <div key={c.id} style={{
                        display:'flex', alignItems:'center', justifyContent:'space-between',
                        padding:'10px 0', borderBottom:`1px solid ${T.border}`
                      }}>
                        <div>
                          <div style={{fontSize:12, fontWeight:600, color:T.text}}>{c.nom}</div>
                          <div style={{fontSize:10, color:T.faint, marginTop:2}}>{c.depot||'—'}</div>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontSize:12, fontWeight:700, color:accent}}>{fmt(s)} DHS</div>
                          <div style={{fontSize:9, fontWeight:700, color:accent, marginTop:2, letterSpacing:'0.08em', textTransform:'uppercase'}}>
                            {s>=100000?'Urgent':s>=50000?'Élevé':'Normal'}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>
          </div>

          {/* ── GASOIL ─────────────────────────────────────────── */}
          <Panel
            title="Gasoil — charge transport (période)"
            action={<Link href="/gasoil" style={{fontSize:10, color:T.muted, letterSpacing:'0.1em', textDecoration:'none'}}>Détails →</Link>}
          >
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20}}>
              <div style={{
                background:T.surface2, border:`1px solid ${T.border}`,
                borderRadius:10, padding:'16px 18px'
              }}>
                <div style={{fontSize:9, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:T.faint, marginBottom:8}}>
                  Coût total
                </div>
                <div style={{fontSize:22, fontWeight:800, color:T.amber, letterSpacing:'-0.02em'}}>{fmt(totalGasoilDHS)} DHS</div>
              </div>
              <div style={{
                background:T.surface2, border:`1px solid ${T.border}`,
                borderRadius:10, padding:'16px 18px'
              }}>
                <div style={{fontSize:9, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:T.faint, marginBottom:8}}>
                  Total litres
                </div>
                <div style={{fontSize:22, fontWeight:800, color:T.text, letterSpacing:'-0.02em'}}>{Math.round(totalLitres)} L</div>
              </div>
            </div>
            <div>
              {(()=>{
                const byCamion = {}
                fg.forEach(g => {
                  const k = g.camion_plaque||'—'
                  if (!byCamion[k]) byCamion[k]={litres:0,total:0}
                  byCamion[k].litres += g.qte||0
                  byCamion[k].total  += g.total||0
                })
                const rows = Object.entries(byCamion).sort((a,b)=>b[1].total-a[1].total)
                if (rows.length===0) return (
                  <div style={{textAlign:'center', color:T.faint, padding:'16px 0', fontSize:12}}>
                    Aucune entrée gasoil
                  </div>
                )
                return rows.map(([plaque,d])=>(
                  <div key={plaque} style={{
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'10px 0', borderBottom:`1px solid ${T.border}`
                  }}>
                    <div style={{fontSize:12, fontWeight:600, color:T.text, letterSpacing:'0.06em'}}>{plaque}</div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:10, color:T.muted}}>{Math.round(d.litres)} L</div>
                      <div style={{fontSize:12, fontWeight:700, color:T.amber}}>{fmt(d.total)} DHS</div>
                    </div>
                  </div>
                ))
              })()}
            </div>
          </Panel>

        </div>
      )}
    </Layout>
  )
}
