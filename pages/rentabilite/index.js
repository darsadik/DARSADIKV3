import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const fmt     = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtDate = d => { if (!d) return '—'; const [y,m,j] = d.split('-'); return `${j}/${m}/${y}` }
const today   = () => new Date().toISOString().split('T')[0]
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

function KPI({ label, value, sub, color = 'slate', icon }) {
  const colors = {
    green:  'text-emerald-600',
    red:    'text-red-500',
    blue:   'text-blue-600',
    orange: 'text-orange-500',
    slate:  'text-slate-800',
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <div className={`text-2xl font-black ${colors[color]}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-1">{sub}</div>}
    </div>
  )
}

function BarChart({ rows, colorKey }) {
  const max = Math.max(...rows.map(r => Math.abs(r.value)), 1)
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const pct = Math.round(Math.abs(r.value) / max * 100)
        const pos = r.value >= 0
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-700 truncate max-w-[180px]">{r.label}</span>
              <span className={`text-xs font-bold ml-2 tabular-nums ${pos ? 'text-emerald-600' : 'text-red-500'}`}>
                {pos ? '+' : ''}{fmt(r.value)} DHS
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="h-2 rounded-full transition-all" style={{ width: pct + '%', background: pos ? '#10b981' : '#ef4444' }} />
            </div>
            {r.sub && <div className="text-[10px] text-slate-400 mt-0.5">{r.sub}</div>}
          </div>
        )
      })}
    </div>
  )
}

function MiniDonut({ parts }) {
  // Simple pie chart using SVG
  const total = parts.reduce((s, p) => s + p.value, 0)
  if (total === 0) return <div className="text-slate-300 text-xs text-center py-4">Aucune donnée</div>
  let cumAngle = -90
  const cx = 60, cy = 60, r = 45, ir = 25
  const paths = parts.map(p => {
    const angle = (p.value / total) * 360
    const startAngle = cumAngle * Math.PI / 180
    const endAngle   = (cumAngle + angle) * Math.PI / 180
    cumAngle += angle
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle),   y2 = cy + r * Math.sin(endAngle)
    const xi1 = cx + ir * Math.cos(startAngle), yi1 = cy + ir * Math.sin(startAngle)
    const xi2 = cx + ir * Math.cos(endAngle),   yi2 = cy + ir * Math.sin(endAngle)
    const large = angle > 180 ? 1 : 0
    return { d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${ir} ${ir} 0 ${large} 0 ${xi1} ${yi1} Z`, color: p.color }
  })
  return (
    <div className="flex items-center gap-4">
      <svg width="120" height="120" viewBox="0 0 120 120">
        {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} />)}
      </svg>
      <div className="space-y-1.5">
        {parts.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <div>
              <div className="text-[10px] font-semibold text-slate-700">{p.label}</div>
              <div className="text-[10px] text-slate-400">{fmt(p.value)} DHS ({total > 0 ? Math.round(p.value/total*100) : 0}%)</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MonthlyChart({ data }) {
  if (!data || data.length === 0) return <div className="text-slate-300 text-xs text-center py-8">Aucune donnée</div>
  const maxV = Math.max(...data.map(d => Math.abs(d.profit)), 1)
  const maxR = Math.max(...data.map(d => d.revenu), 1)
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: data.length * 60 + 'px' }} className="flex items-end gap-1 h-32 px-2">
        {data.map((d, i) => {
          const hR = Math.max(4, Math.round(d.revenu / maxR * 100))
          const hP = Math.max(4, Math.round(Math.abs(d.profit) / maxV * 100))
          const pos = d.profit >= 0
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
              <div className="absolute bottom-full mb-1 bg-slate-800 text-white text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10 pointer-events-none">
                {d.label}: Rev {fmt(d.revenu)} / Profit {fmt(d.profit)} DHS
              </div>
              <div className="w-full flex items-end gap-0.5 h-28">
                <div className="flex-1 rounded-t" style={{ height: hR + '%', background: '#bfdbfe' }} />
                <div className="flex-1 rounded-t" style={{ height: hP + '%', background: pos ? '#10b981' : '#ef4444' }} />
              </div>
              <div className="text-[8px] text-slate-400 text-center truncate w-full">{d.label}</div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-2 px-2">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-200" /><span className="text-[10px] text-slate-500">Revenu</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-500" /><span className="text-[10px] text-slate-500">Profit net</span></div>
      </div>
    </div>
  )
}

export default function Rentabilite() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo,   setFilterTo]   = useState(today())
  const [tab, setTab] = useState('global') // 'global' | 'camions' | 'clients'

  // raw data
  const [voyages,    setVoyages]    = useState([])
  const [livraisons, setLivraisons] = useState([])
  const [achats,     setAchats]     = useState([])
  const [gasoil,     setGasoil]     = useState([])
  const [charges,    setCharges]    = useState([])
  const [retours,    setRetours]    = useState([])
  const [camions,    setCamions]    = useState([])

  useEffect(() => { loadAll() }, [filterFrom, filterTo])

  async function loadAll() {
    setLoading(true)
    const [
      { data: v },
      { data: li },
      { data: ac },
      { data: ga },
      { data: ch },
      { data: re },
      { data: ca },
    ] = await Promise.all([
      supabase.from('voyages').select('*').gte('date_depart', filterFrom).lte('date_depart', filterTo),
      supabase.from('voyage_livraisons').select('voyage_id,type_produit,client_id,client_nom,qte,prix_vente,prix_achat,total_vente'),
      supabase.from('voyage_achats').select('*'),
      supabase.from('voyage_gasoil').select('*'),
      supabase.from('voyage_charges').select('*'),
      supabase.from('voyage_retours').select('*'),
      supabase.from('camions').select('*').order('plaque'),
    ])
    const vIds = (v || []).map(x => x.id)
    setVoyages(v || [])
    setLivraisons((li || []).filter(l => vIds.includes(l.voyage_id)))
    setAchats((ac || []).filter(a => vIds.includes(a.voyage_id)))
    setGasoil((ga || []).filter(g => vIds.includes(g.voyage_id)))
    setCharges((ch || []).filter(c => vIds.includes(c.voyage_id)))
    setRetours((re || []).filter(r => vIds.includes(r.voyage_id)))
    setCamions(ca || [])
    setLoading(false)
  }

  // ── COMPUTE PROFIT FOR A SET OF VOYAGE IDS ────────────────────────────────
  function computeProfit(vIds) {
    const myLivs = livraisons.filter(l => vIds.includes(l.voyage_id))
    const myGas  = gasoil.filter(g => vIds.includes(g.voyage_id))
    const myChgs = charges.filter(c => vIds.includes(c.voyage_id))
    const myRets = retours.filter(r => vIds.includes(r.voyage_id))

    const revenuLivs   = myLivs.reduce((s, l) => s + (l.total_vente || 0), 0)
    const revenuRets   = myRets.reduce((s, r) => s + (r.montant_paye || 0), 0)
    const chgClient    = myChgs.filter(c => c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)
    const revenuBrut   = revenuLivs + revenuRets + chgClient

    const coutAchat    = myLivs.reduce((s, l) => s + ((l.qte||0)*(l.prix_achat||0)), 0)
    const coutGasoil   = myGas.reduce((s, g) => s + (g.total || 0), 0)
    const coutCharges  = myChgs.filter(c => !c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)
    const coutTotal    = coutAchat + coutGasoil + coutCharges

    return { revenuBrut, coutAchat, coutGasoil, coutCharges, coutTotal, profit: revenuBrut - coutTotal }
  }

  // ── GLOBAL KPIs ───────────────────────────────────────────────────────────
  const allIds   = voyages.map(v => v.id)
  const global   = computeProfit(allIds)
  const marge    = global.revenuBrut > 0 ? Math.round(global.profit / global.revenuBrut * 100) : 0
  const nbVoyages = voyages.length
  const nbTermines = voyages.filter(v => v.statut === 'termine').length

  // ── PER CAMION ────────────────────────────────────────────────────────────
  const camionStats = camions.map(ca => {
    const myVoyages = voyages.filter(v => v.camion_id === ca.id)
    const myIds = myVoyages.map(v => v.id)
    const p = computeProfit(myIds)
    return { ...ca, ...p, nbVoyages: myVoyages.length }
  }).filter(c => c.nbVoyages > 0).sort((a, b) => b.profit - a.profit)

  // ── PER CLIENT ────────────────────────────────────────────────────────────
  const clientMap = {}
  livraisons.forEach(l => {
    if (!l.client_id) return
    if (!clientMap[l.client_id]) clientMap[l.client_id] = { id: l.client_id, nom: l.client_nom, revenu: 0, achat: 0, gasoilShare: 0, chargesShare: 0, qte: 0 }
    clientMap[l.client_id].revenu += (l.total_vente || 0)
    clientMap[l.client_id].achat  += ((l.qte||0)*(l.prix_achat||0))
    clientMap[l.client_id].qte    += (l.qte || 0)
  })
  // Add per-voyage gasoil/charges share equally
  voyages.forEach(v => {
    const myLivs = livraisons.filter(l => l.voyage_id === v.id)
    const myGas  = gasoil.filter(g => g.voyage_id === v.id)
    const myChgs = charges.filter(c => c.voyage_id === v.id && !c.facture_client)
    const clientsOnVoyage = [...new Set(myLivs.map(l => l.client_id).filter(Boolean))]
    const nb = clientsOnVoyage.length
    if (nb === 0) return
    const totalGas = myGas.reduce((s, g) => s + (g.total || 0), 0)
    const totalChg = myChgs.reduce((s, c) => s + (c.montant || 0), 0)
    clientsOnVoyage.forEach(cid => {
      if (!clientMap[cid]) return
      clientMap[cid].gasoilShare  += totalGas / nb
      clientMap[cid].chargesShare += totalChg / nb
    })
  })
  // Add billed charges per client
  charges.filter(c => c.facture_client && c.client_id).forEach(c => {
    if (!clientMap[c.client_id]) clientMap[c.client_id] = { id: c.client_id, nom: c.client_nom, revenu: 0, achat: 0, gasoilShare: 0, chargesShare: 0, qte: 0 }
    clientMap[c.client_id].revenu += (c.montant || 0)
  })
  const clientStats = Object.values(clientMap).map(c => ({
    ...c,
    cout: c.achat + c.gasoilShare + c.chargesShare,
    profit: c.revenu - c.achat - c.gasoilShare - c.chargesShare,
  })).sort((a, b) => b.profit - a.profit)

  // ── MONTHLY DATA ──────────────────────────────────────────────────────────
  const monthlyMap = {}
  voyages.forEach(v => {
    const key = v.date_depart?.slice(0, 7) // YYYY-MM
    if (!key) return
    if (!monthlyMap[key]) monthlyMap[key] = []
    monthlyMap[key].push(v.id)
  })
  const monthlyData = Object.keys(monthlyMap).sort().map(key => {
    const p = computeProfit(monthlyMap[key])
    const [y, m] = key.split('-')
    const mNames = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
    return { label: mNames[parseInt(m)-1] + ' ' + y.slice(2), ...p }
  })

  // ── TOP VOYAGES ───────────────────────────────────────────────────────────
  const topVoyages = voyages.map(v => {
    const p = computeProfit([v.id])
    return { ...v, ...p }
  }).sort((a, b) => b.profit - a.profit).slice(0, 5)

  return (
    <Layout title="Rentabilité" subtitle="Analyse de la performance financière">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">Du</label>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
              className="input text-sm px-3 py-1.5 rounded-xl border border-slate-200 bg-white" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">Au</label>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
              className="input text-sm px-3 py-1.5 rounded-xl border border-slate-200 bg-white" />
          </div>
          {loading && <span className="text-xs text-slate-400 animate-pulse">Chargement...</span>}
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {[
            { key: 'global',  label: '📊 Vue globale' },
            { key: 'camions', label: '🚛 Par camion' },
            { key: 'clients', label: '👤 Par client' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: GLOBAL ── */}
        {tab === 'global' && (
          <div className="space-y-5">
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPI label="Revenu brut"  value={fmt(global.revenuBrut) + ' DHS'} icon="💰" color="slate" sub={`${nbVoyages} voyages`} />
              <KPI label="Coût total"   value={fmt(global.coutTotal) + ' DHS'}  icon="📉" color="red"   sub="Achats + gasoil + charges" />
              <KPI label="Profit net"   value={fmt(global.profit) + ' DHS'}     icon={global.profit >= 0 ? '✅' : '❌'} color={global.profit >= 0 ? 'green' : 'red'} sub={`Marge ${marge}%`} />
              <KPI label="Voyages"      value={nbVoyages}                        icon="🚛" color="blue"  sub={`${nbTermines} terminés`} />
            </div>

            {/* Cost breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="font-bold text-slate-700 text-sm mb-4">Répartition des coûts</h3>
                <MiniDonut parts={[
                  { label: 'Achats briques/grignon', value: global.coutAchat,   color: '#6366f1' },
                  { label: 'Gasoil',                 value: global.coutGasoil,  color: '#f97316' },
                  { label: 'Charges voyage',          value: global.coutCharges, color: '#ef4444' },
                ]} />
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="font-bold text-slate-700 text-sm mb-4">Évolution mensuelle</h3>
                <MonthlyChart data={monthlyData} />
              </div>
            </div>

            {/* Detail table */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-bold text-slate-700 text-sm mb-4">Détail financier</h3>
              <div className="space-y-3">
                {[
                  { label: 'Revenu livraisons briques', value: livraisons.filter(l=>l.type_produit==='brique').reduce((s,l)=>s+(l.total_vente||0),0), color: 'text-emerald-600' },
                  { label: 'Revenu livraisons grignon',  value: livraisons.filter(l=>l.type_produit==='grignon').reduce((s,l)=>s+(l.total_vente||0),0), color: 'text-emerald-500' },
                  { label: 'Revenu retours transport',   value: retours.reduce((s,r)=>s+(r.montant_paye||0),0), color: 'text-purple-600' },
                  { label: 'Charges facturées clients',  value: charges.filter(c=>c.facture_client).reduce((s,c)=>s+(c.montant||0),0), color: 'text-blue-600' },
                ].map((row, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-sm text-slate-600">{row.label}</span>
                    <span className={`font-bold text-sm ${row.color}`}>{fmt(row.value)} DHS</span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <span className="text-sm font-bold text-slate-800">= Revenu brut total</span>
                  <span className="font-black text-slate-800">{fmt(global.revenuBrut)} DHS</span>
                </div>
                {[
                  { label: '− Achats (briques + grignon)', value: global.coutAchat,   color: 'text-red-500' },
                  { label: '− Gasoil total',               value: global.coutGasoil,  color: 'text-orange-500' },
                  { label: '− Charges voyage',             value: global.coutCharges, color: 'text-red-400' },
                ].map((row, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-sm text-slate-600">{row.label}</span>
                    <span className={`font-bold text-sm ${row.color}`}>−{fmt(row.value)} DHS</span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-3 bg-slate-50 rounded-xl px-3 mt-2">
                  <span className="font-black text-slate-800">= PROFIT NET</span>
                  <span className={`font-black text-xl ${global.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {global.profit >= 0 ? '+' : ''}{fmt(global.profit)} DHS
                  </span>
                </div>
              </div>
            </div>

            {/* Top voyages */}
            {topVoyages.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="font-bold text-slate-700 text-sm mb-4">🏆 Top 5 voyages les plus profitables</h3>
                <div className="space-y-2">
                  {topVoyages.map((v, i) => (
                    <a key={v.id} href={`/voyages/${v.id}`} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition">
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-black w-6 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-400' : 'text-slate-300'}`}>#{i+1}</span>
                        <div>
                          <div className="font-bold text-sm text-slate-800">{v.reference || `Voyage #${v.id}`}</div>
                          <div className="text-[10px] text-slate-400">{fmtDate(v.date_depart)} • {v.camion_plaque}{v.destination ? ' → ' + v.destination : ''}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-black text-sm ${v.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {v.profit >= 0 ? '+' : ''}{fmt(v.profit)} DHS
                        </div>
                        <div className="text-[10px] text-slate-400">Rev: {fmt(v.revenuBrut)}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: CAMIONS ── */}
        {tab === 'camions' && (
          <div className="space-y-4">
            {camionStats.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <div className="text-4xl mb-3">🚛</div>
                <div>Aucun camion avec des voyages sur cette période</div>
              </div>
            ) : (
              <>
                {/* Bar chart */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h3 className="font-bold text-slate-700 text-sm mb-4">Profit par camion</h3>
                  <BarChart rows={camionStats.map(c => ({
                    label: c.plaque + (c.chauffeur ? ` (${c.chauffeur})` : ''),
                    value: c.profit,
                    sub:   `Rev: ${fmt(c.revenuBrut)} DHS • ${c.nbVoyages} voyages`,
                  }))} />
                </div>

                {/* Cards per camion */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {camionStats.map(c => (
                    <div key={c.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="font-black text-slate-800">{c.plaque}</div>
                          {c.chauffeur && <div className="text-xs text-slate-500">{c.chauffeur}</div>}
                        </div>
                        <div className="text-right">
                          <div className={`text-xl font-black ${c.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {c.profit >= 0 ? '+' : ''}{fmt(c.profit)} DHS
                          </div>
                          <div className="text-[10px] text-slate-400">{c.nbVoyages} voyage{c.nbVoyages > 1 ? 's' : ''}</div>
                        </div>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Revenu brut</span>
                          <span className="font-bold text-emerald-600">{fmt(c.revenuBrut)} DHS</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Achats</span>
                          <span className="font-semibold text-red-400">−{fmt(c.coutAchat)} DHS</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Gasoil</span>
                          <span className="font-semibold text-orange-400">−{fmt(c.coutGasoil)} DHS</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Charges</span>
                          <span className="font-semibold text-red-400">−{fmt(c.coutCharges)} DHS</span>
                        </div>
                        <div className="border-t border-slate-100 pt-2 flex justify-between">
                          <span className="font-bold text-slate-700">Profit net</span>
                          <span className={`font-black ${c.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {c.profit >= 0 ? '+' : ''}{fmt(c.profit)} DHS
                          </span>
                        </div>
                        {c.revenuBrut > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Marge</span>
                            <span className="font-bold text-blue-600">{Math.round(c.profit / c.revenuBrut * 100)}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB: CLIENTS ── */}
        {tab === 'clients' && (
          <div className="space-y-4">
            {clientStats.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <div className="text-4xl mb-3">👤</div>
                <div>Aucun client avec des livraisons sur cette période</div>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h3 className="font-bold text-slate-700 text-sm mb-4">Profit par client (gasoil + charges divisés également)</h3>
                  <BarChart rows={clientStats.map(c => ({
                    label: c.nom,
                    value: c.profit,
                    sub:   `Rev: ${fmt(c.revenu)} • Qté: ${fmt(c.qte)} unités`,
                  }))} />
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left py-3 px-4 text-[10px] font-semibold text-slate-400 uppercase">Client</th>
                        <th className="text-right py-3 px-4 text-[10px] font-semibold text-slate-400 uppercase">Revenu</th>
                        <th className="text-right py-3 px-4 text-[10px] font-semibold text-slate-400 uppercase">Achats</th>
                        <th className="text-right py-3 px-4 text-[10px] font-semibold text-slate-400 uppercase">Gasoil</th>
                        <th className="text-right py-3 px-4 text-[10px] font-semibold text-slate-400 uppercase">Charges</th>
                        <th className="text-right py-3 px-4 text-[10px] font-semibold text-slate-400 uppercase">Profit</th>
                        <th className="text-right py-3 px-4 text-[10px] font-semibold text-slate-400 uppercase">Marge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientStats.map((c, i) => (
                        <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-3 px-4 font-semibold text-slate-800">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400">#{i+1}</span>
                              {c.nom}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right text-emerald-600 font-bold">{fmt(c.revenu)}</td>
                          <td className="py-3 px-4 text-right text-red-400">−{fmt(c.achat)}</td>
                          <td className="py-3 px-4 text-right text-orange-400">−{fmt(c.gasoilShare)}</td>
                          <td className="py-3 px-4 text-right text-red-400">−{fmt(c.chargesShare)}</td>
                          <td className={`py-3 px-4 text-right font-black ${c.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {c.profit >= 0 ? '+' : ''}{fmt(c.profit)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {c.revenu > 0 ? (
                              <span className={`font-bold ${c.profit/c.revenu > 0.1 ? 'text-emerald-600' : c.profit > 0 ? 'text-amber-500' : 'text-red-500'}`}>
                                {Math.round(c.profit / c.revenu * 100)}%
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t border-slate-200">
                        <td className="py-3 px-4 font-black text-slate-800">TOTAL</td>
                        <td className="py-3 px-4 text-right font-black text-emerald-600">{fmt(clientStats.reduce((s,c)=>s+c.revenu,0))}</td>
                        <td className="py-3 px-4 text-right font-bold text-red-400">−{fmt(clientStats.reduce((s,c)=>s+c.achat,0))}</td>
                        <td className="py-3 px-4 text-right font-bold text-orange-400">−{fmt(clientStats.reduce((s,c)=>s+c.gasoilShare,0))}</td>
                        <td className="py-3 px-4 text-right font-bold text-red-400">−{fmt(clientStats.reduce((s,c)=>s+c.chargesShare,0))}</td>
                        <td className={`py-3 px-4 text-right font-black text-lg ${global.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {global.profit >= 0 ? '+' : ''}{fmt(global.profit)}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-blue-600">{marge}%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </Layout>
  )
}
