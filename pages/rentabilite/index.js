import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import Link from 'next/link'

const fmt     = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtDate = d => { if (!d) return '—'; const [y,m,j] = d.split('-'); return `${j}/${m}/${y}` }
const today   = () => new Date().toISOString().split('T')[0]
const startOfYear  = () => `${new Date().getFullYear()}-01-01`
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }
const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

// ── MINI COMPONENTS ────────────────────────────────────────────────────────────

function KPI({ label, value, sub, color = 'slate', icon, large }) {
  const colors = { green:'text-emerald-600', red:'text-red-500', blue:'text-blue-600', orange:'text-orange-500', slate:'text-slate-800', purple:'text-purple-600' }
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <div className={`font-black ${colors[color]} ${large ? 'text-3xl' : 'text-2xl'}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-1">{sub}</div>}
    </div>
  )
}

function MargeBadge({ marge }) {
  const cls = marge > 15 ? 'bg-emerald-50 text-emerald-700' : marge > 0 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
  return <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${cls}`}>{marge}%</span>
}

function ProfitCell({ v }) {
  return <span className={`font-black ${v >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{v >= 0 ? '+' : ''}{fmt(v)}</span>
}

function ColHeader({ label, right, center }) {
  return <th className={`py-2.5 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider ${right ? 'text-right' : center ? 'text-center' : 'text-left'}`}>{label}</th>
}

function MiniDonut({ parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  if (total === 0) return <div className="text-slate-300 text-xs text-center py-4">Aucune donnée</div>
  let cum = -90
  const cx = 60, cy = 60, r = 45, ir = 28
  const paths = parts.map(p => {
    const angle = (p.value / total) * 360
    const s = cum * Math.PI / 180, e = (cum + angle) * Math.PI / 180
    cum += angle
    const large = angle > 180 ? 1 : 0
    return {
      d: `M ${cx+r*Math.cos(s)} ${cy+r*Math.sin(s)} A ${r} ${r} 0 ${large} 1 ${cx+r*Math.cos(e)} ${cy+r*Math.sin(e)} L ${cx+ir*Math.cos(e)} ${cy+ir*Math.sin(e)} A ${ir} ${ir} 0 ${large} 0 ${cx+ir*Math.cos(s)} ${cy+ir*Math.sin(s)} Z`,
      color: p.color,
    }
  })
  return (
    <div className="flex items-center gap-5">
      <svg width="120" height="120" viewBox="0 0 120 120" className="flex-shrink-0">
        {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} />)}
      </svg>
      <div className="space-y-2">
        {parts.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: p.color }} />
            <div>
              <div className="text-[11px] font-semibold text-slate-700">{p.label}</div>
              <div className="text-[10px] text-slate-400">{fmt(p.value)} DHS · {total > 0 ? Math.round(p.value/total*100) : 0}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BarViz({ data }) {
  const max = Math.max(...data.map(d => d.revenu), 1)
  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const pct = Math.round(d.revenu / max * 100)
        const profitPct = d.revenu > 0 ? Math.round(d.profit / d.revenu * 100) : 0
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-700 truncate max-w-[200px]">{d.label}</span>
              <div className="flex items-center gap-3 ml-2">
                <span className="text-xs text-slate-400">{fmt(d.revenu)} DHS</span>
                <ProfitCell v={d.profit} />
              </div>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 relative">
              <div className="h-2.5 rounded-full" style={{ width: pct + '%', background: '#bfdbfe' }} />
              <div className="h-2.5 rounded-full absolute top-0 left-0" style={{ width: Math.max(0, profitPct) + '%', background: d.profit >= 0 ? '#10b981' : '#ef4444', opacity: 0.7 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MonthBars({ data }) {
  if (!data.length) return <div className="text-slate-300 text-xs text-center py-8">Aucune donnée</div>
  const maxR = Math.max(...data.map(d => d.revenuBrut), 1)
  const maxP = Math.max(...data.map(d => Math.abs(d.profit)), 1)
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: data.length * 72 + 'px' }} className="flex items-end gap-2 h-40 px-1">
        {data.map((d, i) => {
          const hR = Math.max(4, Math.round(d.revenuBrut / maxR * 100))
          const hP = Math.max(4, Math.round(Math.abs(d.profit) / maxP * 100))
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative min-w-[60px]">
              <div className="absolute bottom-full mb-1 bg-slate-800 text-white text-[9px] px-2 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10 pointer-events-none text-center">
                <div className="font-bold">{d.label}</div>
                <div>Rev: {fmt(d.revenuBrut)} DHS</div>
                <div className={d.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>Profit: {fmt(d.profit)} DHS</div>
              </div>
              <div className="w-full flex items-end gap-0.5 h-32">
                <div className="flex-1 rounded-t-sm transition-all" style={{ height: hR + '%', background: '#bfdbfe' }} />
                <div className="flex-1 rounded-t-sm transition-all" style={{ height: hP + '%', background: d.profit >= 0 ? '#10b981' : '#ef4444' }} />
              </div>
              <div className="text-[9px] text-slate-500 font-semibold text-center">{d.label}</div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-5 mt-3 px-2">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-200" /><span className="text-[10px] text-slate-500">Revenu brut</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500" /><span className="text-[10px] text-slate-500">Profit net</span></div>
      </div>
    </div>
  )
}

function TotalsFooter({ global, colSpanFirst = 3 }) {
  return (
    <tr className="border-t-2 border-slate-300 bg-gradient-to-r from-slate-800 to-slate-900 text-white">
      <td colSpan={colSpanFirst} className="py-3 px-3 font-black text-sm uppercase tracking-wide">Total période</td>
      <td className="py-3 px-3 text-right font-black text-emerald-400">{fmt(global.revenuBrut)}</td>
      <td className="py-3 px-3 text-right font-bold text-red-300">−{fmt(global.coutAchat)}</td>
      <td className="py-3 px-3 text-right font-bold text-orange-300">−{fmt(global.coutGasoil)}</td>
      <td className="py-3 px-3 text-right font-bold text-amber-300">−{fmt(global.coutLocation)}</td>
      <td className="py-3 px-3 text-right font-bold text-red-300">−{fmt(global.coutCharges)}</td>
      <td className={`py-3 px-3 text-right font-black text-lg ${global.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {global.profit >= 0 ? '+' : ''}{fmt(global.profit)}
      </td>
      <td className="py-3 px-3 text-right font-black text-blue-300">{global.marge}%</td>
    </tr>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

export default function Rentabilite() {
  useAuth()
  const [loading,    setLoading]    = useState(true)
  const [filterFrom, setFilterFrom] = useState(startOfYear())
  const [filterTo,   setFilterTo]   = useState(today())
  const [tab,        setTab]        = useState('global')
  const [sortKey,    setSortKey]    = useState('date_depart')
  const [sortAsc,    setSortAsc]    = useState(false)

  const [voyages,      setVoyages]      = useState([])
  const [livraisons,   setLivraisons]   = useState([])
  const [achats,       setAchats]       = useState([])
  const [gasoil,       setGasoil]       = useState([])
  const [allGasoil,    setAllGasoil]    = useState([])
  const [charges,      setCharges]      = useState([])
  const [retours,      setRetours]      = useState([])
  const [camions,      setCamions]      = useState([])
  const [locationsRnt, setLocationsRnt] = useState([])
  const [filterType,   setFilterType]   = useState('all') // 'all' | 'propre' | 'loue'

  useEffect(() => { loadAll() }, [filterFrom, filterTo])

  async function loadAll() {
    setLoading(true)
    const [{ data: v }, { data: li }, { data: ac }, { data: ga }, { data: ch }, { data: re }, { data: ca }, { data: ag }, { data: loc }] = await Promise.all([
      supabase.from('voyages').select('*').gte('date_depart', filterFrom).lte('date_depart', filterTo).order('date_depart', { ascending: false }),
      supabase.from('voyage_livraisons').select('voyage_id,type_produit,client_id,client_nom,qte,prix_achat,total_vente,total_achat'),
      supabase.from('voyage_achats').select('voyage_id,total_achat,qte,prix_achat'),
      supabase.from('voyage_gasoil').select('voyage_id,total,qte_litres'),
      supabase.from('voyage_charges').select('voyage_id,montant,facture_client,client_id,client_nom'),
      supabase.from('voyage_retours').select('voyage_id,montant,montant_paye,restant'),
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('gasoil').select('camion_id,km,total,date').not('km', 'is', null).order('km', { ascending: true }),
      supabase.from('voyage_locations').select('voyage_id,montant_location'),
    ])
    const vIds = (v || []).map(x => x.id)
    setVoyages(v || [])
    setLivraisons((li || []).filter(l => vIds.includes(l.voyage_id)))
    setAchats((ac || []).filter(a => vIds.includes(a.voyage_id)))
    setGasoil((ga || []).filter(g => vIds.includes(g.voyage_id)))
    setAllGasoil(ag || [])
    setCharges((ch || []).filter(c => vIds.includes(c.voyage_id)))
    setRetours((re || []).filter(r => vIds.includes(r.voyage_id)))
    setCamions(ca || [])
    setLocationsRnt((loc || []).filter(l => vIds.includes(l.voyage_id)))
    setLoading(false)
  }

  // ── PROFIT CALCULATOR ───────────────────────────────────────────────────────

  // Build map: camion_id → sorted gasoil refills with km (used for km-based fuel allocation)
  const gasoilByCamion = allGasoil.reduce((acc, g) => {
    if (!acc[g.camion_id]) acc[g.camion_id] = []
    acc[g.camion_id].push(g)
    return acc
  }, {})

  function kmFuelCost(voyage) {
    if (!voyage.km_depart || !voyage.km_arrivee) return null
    const vKm = parseFloat(voyage.km_arrivee) - parseFloat(voyage.km_depart)
    if (vKm <= 0) return null
    const refills = (gasoilByCamion[voyage.camion_id] || [])
    if (refills.length < 2) return null
    const vStart = parseFloat(voyage.km_depart)
    let fillIdx = -1
    for (let i = 0; i < refills.length; i++) {
      if (parseFloat(refills[i].km) <= vStart) fillIdx = i
    }
    if (fillIdx < 0 || fillIdx >= refills.length - 1) return null
    const g1 = refills[fillIdx], g2 = refills[fillIdx + 1]
    const cycleKm = parseFloat(g2.km) - parseFloat(g1.km)
    if (cycleKm <= 0) return null
    return Math.round(vKm * (g1.total || 0) / cycleKm * 100) / 100
  }

  function calc(vIds) {
    const myVoyages = voyages.filter(v => vIds.includes(v.id))
    const myAcs     = achats.filter(a => vIds.includes(a.voyage_id))
    const myLivs    = livraisons.filter(l => vIds.includes(l.voyage_id))
    const myGas     = gasoil.filter(g => vIds.includes(g.voyage_id))
    const myChgs    = charges.filter(c => vIds.includes(c.voyage_id))
    const myRets    = retours.filter(r => vIds.includes(r.voyage_id))
    const myLocs    = locationsRnt.filter(l => vIds.includes(l.voyage_id))

    const revenuLivs  = myLivs.reduce((s, l) => s + (l.total_vente || 0), 0)
    const revenuRets  = myRets.reduce((s, r) => s + (r.montant || 0), 0)
    const chgCli      = myChgs.filter(c => c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)
    const revenuBrut  = revenuLivs + revenuRets + chgCli

    const coutAchat    = myAcs.reduce((s, a) => s + (a.total_achat || (a.qte||0)*(a.prix_achat||0)), 0)
    const coutCharges  = myChgs.filter(c => !c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)
    const coutLocation = myLocs.reduce((s, l) => s + (l.montant_location || 0), 0)
    // Fuel: km-based per voyage, fallback to historical voyage_gasoil entry
    const coutGasoil  = myVoyages.reduce((s, v) => {
      const km = kmFuelCost(v)
      if (km !== null) return s + km
      return s + myGas.filter(g => g.voyage_id === v.id).reduce((ss, g) => ss + (g.total||0), 0)
    }, 0)

    const coutTotal   = coutAchat + coutGasoil + coutLocation + coutCharges
    const profit      = revenuBrut - coutTotal
    const marge       = revenuBrut > 0 ? Math.round(profit / revenuBrut * 100) : 0

    return { revenuBrut, coutAchat, coutGasoil, coutLocation, coutCharges, coutTotal, profit, marge }
  }

  // ── AGGREGATIONS ────────────────────────────────────────────────────────────
  // Apply truck type filter
  const filteredVoyages = filterType === 'all' ? voyages
    : voyages.filter(v => {
        const cam = camions.find(c => c.id === v.camion_id)
        return filterType === 'loue' ? cam?.type_camion === 'loue' : cam?.type_camion !== 'loue'
      })
  const allIds    = filteredVoyages.map(v => v.id)
  const global    = calc(allIds)
  const nbTermin  = filteredVoyages.filter(v => v.statut === 'termine').length

  // Per voyage
  const voyageStats = filteredVoyages.map(v => {
    const p = calc([v.id])
    const nbCli = new Set(livraisons.filter(l => l.voyage_id === v.id).map(l => l.client_id).filter(Boolean)).size
    return { ...v, ...p, nbCli }
  })
  const sortedVoyages = [...voyageStats].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey]
    if (typeof av === 'string') return sortAsc ? av.localeCompare(bv||'') : (bv||'').localeCompare(av)
    return sortAsc ? (av||0)-(bv||0) : (bv||0)-(av||0)
  })
  function toggleSort(k) { setSortKey(k); setSortAsc(s => sortKey === k ? !s : false) }
  const Th = ({ k, label, right, center }) => (
    <th onClick={() => toggleSort(k)}
      className={`py-2.5 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 select-none ${right?'text-right':center?'text-center':'text-left'}`}>
      {label}{sortKey===k ? (sortAsc?' ↑':' ↓') : ''}
    </th>
  )

  // Per camion
  const camionStats = camions.map(ca => {
    const myVoyages = filteredVoyages.filter(v => v.camion_id === ca.id)
    const p = calc(myVoyages.map(v => v.id))
    return { ...ca, ...p, nbV: myVoyages.length }
  }).filter(c => c.nbV > 0).sort((a, b) => b.profit - a.profit)

  // Per client
  const cliMap = {}
  livraisons.forEach(l => {
    if (!l.client_id) return
    if (!cliMap[l.client_id]) cliMap[l.client_id] = { id: l.client_id, nom: l.client_nom, revenu: 0, achat: 0, gas: 0, chg: 0, qte: 0 }
    cliMap[l.client_id].revenu += (l.total_vente || 0)
    cliMap[l.client_id].achat  += (l.total_achat || (l.qte||0)*(l.prix_achat||0))
    cliMap[l.client_id].qte    += (l.qte || 0)
  })
  voyages.forEach(v => {
    const myLivs     = livraisons.filter(l => l.voyage_id === v.id)
    const cids       = [...new Set(myLivs.map(l => l.client_id).filter(Boolean))]
    const totalQteV  = myLivs.reduce((s, l) => s + (l.qte||0), 0)
    const vFuelCost  = kmFuelCost(v) ?? gasoil.filter(g => g.voyage_id === v.id).reduce((s, g) => s + (g.total||0), 0)
    const totalC     = charges.filter(c => c.voyage_id === v.id && !c.facture_client).reduce((s, c) => s + (c.montant||0), 0)
    cids.forEach(cid => {
      if (!cliMap[cid]) return
      const cQte     = myLivs.filter(l => l.client_id === cid).reduce((s, l) => s + (l.qte||0), 0)
      const share    = totalQteV > 0 ? cQte / totalQteV : 1 / (cids.length || 1)
      cliMap[cid].gas += vFuelCost * share
      cliMap[cid].chg += totalC * share
    })
  })
  charges.filter(c => c.facture_client && c.client_id).forEach(c => {
    if (!cliMap[c.client_id]) cliMap[c.client_id] = { id: c.client_id, nom: c.client_nom, revenu: 0, achat: 0, gas: 0, chg: 0, qte: 0 }
    cliMap[c.client_id].revenu += (c.montant || 0)
  })
  const clientStats = Object.values(cliMap).map(c => ({
    ...c, profit: c.revenu - c.achat - c.gas - c.chg,
    marge: c.revenu > 0 ? Math.round((c.revenu-c.achat-c.gas-c.chg)/c.revenu*100) : 0,
  })).sort((a, b) => b.profit - a.profit)

  // Per month
  const mMap = {}
  voyages.forEach(v => {
    const k = v.date_depart?.slice(0, 7)
    if (!k) return
    if (!mMap[k]) mMap[k] = []
    mMap[k].push(v.id)
  })
  const monthlyData = Object.keys(mMap).sort().map(k => {
    const p = calc(mMap[k])
    const [y, m] = k.split('-')
    return { key: k, label: MONTHS[parseInt(m)-1] + ' ' + y, nbV: mMap[k].length, ...p }
  })

  const TABS = [
    { key: 'global',  label: '📊 Global' },
    { key: 'voyages', label: '🚛 Par voyage' },
    { key: 'mois',    label: '📅 Par mois' },
    { key: 'camions', label: '🚚 Par camion' },
    { key: 'clients', label: '👤 Par client' },
  ]

  return (
    <Layout title="Rentabilité" subtitle="Revenus − Achats − Gasoil − Charges = Profit net">
      <div className="max-w-7xl mx-auto space-y-4">

        {/* ── FILTERS ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">Du</label>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="input text-sm px-3 py-1.5 rounded-xl" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">Au</label>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="input text-sm px-3 py-1.5 rounded-xl" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setFilterFrom(startOfMonth()); setFilterTo(today()) }}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold transition">Ce mois</button>
            <button onClick={() => { setFilterFrom(startOfYear()); setFilterTo(today()) }}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold transition">Cette année</button>
          </div>
          <div className="flex gap-1 ml-2 border-l border-slate-200 pl-3">
            {[['all','Tous 🚚'],['propre','Propres'],['loue','Loués 🔑']].map(([val, lbl]) => (
              <button key={val} onClick={() => setFilterType(val)}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition ${filterType === val ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {lbl}
              </button>
            ))}
          </div>
          {loading && <span className="text-xs text-blue-500 animate-pulse ml-auto">Chargement...</span>}
        </div>

        {/* ── KPI BAR ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <KPI label="Revenu brut"  icon="💰" color="slate"
            value={fmt(global.revenuBrut) + ' DHS'}
            sub={`${filteredVoyages.length} voyages · ${nbTermin} terminés`} />
          <KPI label="Achats"       icon="📦" color="red"    value={fmt(global.coutAchat)   + ' DHS'} sub="Briques + grignon" />
          <KPI label="Gasoil"       icon="⛽" color="orange" value={fmt(global.coutGasoil)  + ' DHS'} />
          <KPI label="Location"     icon="🔑" color="orange" value={fmt(global.coutLocation) + ' DHS'} sub="Camions loués" />
          <KPI label="Charges"      icon="💸" color="red"    value={fmt(global.coutCharges) + ' DHS'} sub="Fixes entreprise" />
          <KPI label="Profit net"   icon={global.profit >= 0 ? '✅' : '❌'}
            color={global.profit >= 0 ? 'green' : 'red'} large
            value={fmt(global.profit) + ' DHS'}
            sub={`Marge ${global.marge}%`} />
        </div>

        {/* ── TABS ── */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition flex-shrink-0 ${
                tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════
            TAB: GLOBAL
        ══════════════════════════════════════════════════ */}
        {tab === 'global' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Donut */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="font-bold text-slate-700 text-sm mb-4">Répartition des coûts</h3>
                <MiniDonut parts={[
                  { label: 'Achats briques/grignon', value: global.coutAchat,   color: '#6366f1' },
                  { label: 'Gasoil',                 value: global.coutGasoil,  color: '#f97316' },
                  { label: 'Charges voyage',          value: global.coutCharges, color: '#ef4444' },
                ]} />
              </div>

              {/* Voyage statuses */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="font-bold text-slate-700 text-sm mb-4">État des voyages</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-3 bg-amber-50 rounded-xl">
                    <span className="font-semibold text-amber-700 text-sm">🔄 En cours</span>
                    <span className="font-black text-amber-700 text-2xl">{voyages.length - nbTermin}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-xl">
                    <span className="font-semibold text-emerald-700 text-sm">✅ Terminés</span>
                    <span className="font-black text-emerald-700 text-2xl">{nbTermin}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* P&L */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-700 text-sm">Compte de résultat</h3>
                <span className="text-xs text-slate-400">{fmtDate(filterFrom)} → {fmtDate(filterTo)}</span>
              </div>
              <div className="p-5 space-y-1.5">
                {/* Revenue lines */}
                {[
                  { label: 'Ventes briques',           value: livraisons.filter(l=>l.type_produit==='brique').reduce((s,l)=>s+(l.total_vente||0),0), color:'text-emerald-600' },
                  { label: 'Ventes grignon',            value: livraisons.filter(l=>l.type_produit==='grignon').reduce((s,l)=>s+(l.total_vente||0),0), color:'text-emerald-500' },
                  { label: 'Retours transport (montant)', value: retours.reduce((s,r)=>s+(r.montant||0),0), color:'text-purple-600' },
                  { label: 'Charges facturées clients', value: charges.filter(c=>c.facture_client).reduce((s,c)=>s+(c.montant||0),0), color:'text-blue-600' },
                ].map((r, i) => (
                  <div key={i} className="flex justify-between py-2 border-b border-slate-50 text-sm">
                    <span className="text-slate-500">{r.label}</span>
                    <span className={`font-bold ${r.color}`}>+ {fmt(r.value)} DHS</span>
                  </div>
                ))}
                <div className="flex justify-between py-2.5 bg-slate-50 rounded-xl px-3 text-sm">
                  <span className="font-black text-slate-800">= REVENU BRUT</span>
                  <span className="font-black text-slate-800">{fmt(global.revenuBrut)} DHS</span>
                </div>
                {/* Cost lines */}
                {[
                  { label: '− Achats (briques + grignon)', value: global.coutAchat,    color:'text-red-500' },
                  { label: '− Gasoil',                     value: global.coutGasoil,   color:'text-orange-500' },
                  { label: '− Location camions loués',     value: global.coutLocation, color:'text-amber-500' },
                  { label: '− Charges voyage',             value: global.coutCharges,  color:'text-red-400' },
                ].map((r, i) => (
                  <div key={i} className="flex justify-between py-2 border-b border-slate-50 text-sm">
                    <span className="text-slate-500">{r.label}</span>
                    <span className={`font-bold ${r.color}`}>− {fmt(r.value)} DHS</span>
                  </div>
                ))}
                {/* Net profit */}
                <div className="flex justify-between py-4 bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl px-4 mt-2">
                  <span className="font-black text-white">= PROFIT NET</span>
                  <span className={`font-black text-2xl ${global.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {global.profit >= 0 ? '+' : ''}{fmt(global.profit)} DHS
                    <span className="text-xs font-normal text-slate-400 ml-2">({global.marge}%)</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Top 5 voyages */}
            {voyageStats.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="font-bold text-slate-700 text-sm mb-4">🏆 Top voyages</h3>
                <div className="space-y-2">
                  {[...voyageStats].sort((a,b) => b.profit - a.profit).slice(0, 5).map((v, i) => (
                    <Link key={v.id} href={`/voyages/${v.id}`}
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition">
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-black w-6 flex-shrink-0 ${i===0?'text-amber-500':i===1?'text-slate-400':i===2?'text-orange-400':'text-slate-300'}`}>#{i+1}</span>
                        <div>
                          <div className="font-bold text-sm text-slate-800">{v.reference || `Voyage #${v.id}`}</div>
                          <div className="text-[10px] text-slate-400">{fmtDate(v.date_depart)} · {v.camion_plaque}{v.destination ? ' → '+v.destination : ''}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <ProfitCell v={v.profit} />
                        <div className="text-[10px] text-slate-400">Rev: {fmt(v.revenuBrut)} DHS</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            TAB: PAR VOYAGE
        ══════════════════════════════════════════════════ */}
        {tab === 'voyages' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-bold text-slate-700 text-sm">Résultat par voyage — {voyageStats.length} voyages</h3>
              <span className="text-[10px] text-slate-400">Cliquez sur un en-tête de colonne pour trier</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <Th k="date_depart"   label="Date" />
                    <Th k="camion_plaque" label="Camion" />
                    <ColHeader label="Destination" />
                    <Th k="nbCli"         label="Clients" center />
                    <Th k="revenuBrut"    label="Revenu DHS" right />
                    <Th k="coutAchat"     label="Achats" right />
                    <Th k="coutGasoil"    label="Gasoil" right />
                    <Th k="coutLocation"  label="Location" right />
                    <Th k="coutCharges"   label="Charges" right />
                    <Th k="profit"        label="= Profit" right />
                    <Th k="marge"         label="Marge" right />
                    <ColHeader label="Statut" />
                    <th className="py-2.5 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedVoyages.length === 0 ? (
                    <tr><td colSpan={12} className="py-16 text-center text-slate-400">Aucun voyage sur cette période</td></tr>
                  ) : sortedVoyages.map(v => (
                    <tr key={v.id} className="border-b border-slate-50 hover:bg-blue-50/20 transition">
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{fmtDate(v.date_depart)}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-800 whitespace-nowrap">{v.camion_plaque}</td>
                      <td className="py-2.5 px-3 text-slate-500 max-w-[120px] truncate">{v.destination || '—'}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{v.nbCli || 0}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600 whitespace-nowrap">{fmt(v.revenuBrut)}</td>
                      <td className="py-2.5 px-3 text-right text-red-400 whitespace-nowrap">−{fmt(v.coutAchat)}</td>
                      <td className="py-2.5 px-3 text-right text-orange-400 whitespace-nowrap">−{fmt(v.coutGasoil)}</td>
                      <td className="py-2.5 px-3 text-right text-amber-500 whitespace-nowrap">{v.coutLocation > 0 ? `−${fmt(v.coutLocation)}` : '—'}</td>
                      <td className="py-2.5 px-3 text-right text-red-400 whitespace-nowrap">−{fmt(v.coutCharges)}</td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap"><ProfitCell v={v.profit} /></td>
                      <td className="py-2.5 px-3 text-right"><MargeBadge marge={v.marge} /></td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${v.statut==='termine'?'bg-emerald-50 text-emerald-600 border-emerald-200':'bg-amber-50 text-amber-600 border-amber-200'}`}>
                          {v.statut==='termine'?'Terminé':'En cours'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <Link href={`/voyages/${v.id}`} className="text-blue-500 hover:text-blue-700 font-semibold text-[10px] whitespace-nowrap">Détails →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {sortedVoyages.length > 0 && (
                  <tfoot><TotalsFooter global={global} /></tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            TAB: PAR MOIS
        ══════════════════════════════════════════════════ */}
        {tab === 'mois' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-bold text-slate-700 text-sm mb-4">Évolution mensuelle</h3>
              <MonthBars data={monthlyData} />
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-700 text-sm">Détail par mois — Revenus − Achats − Gasoil − Charges = Profit</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <ColHeader label="Mois" />
                      <ColHeader label="Voyages" center />
                      <ColHeader label="Revenu DHS" right />
                      <ColHeader label="Achats" right />
                      <ColHeader label="Gasoil" right />
                      <ColHeader label="Charges" right />
                      <ColHeader label="= Profit" right />
                      <ColHeader label="Marge" right />
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.length === 0 ? (
                      <tr><td colSpan={8} className="py-16 text-center text-slate-400">Aucune donnée sur cette période</td></tr>
                    ) : monthlyData.map(d => (
                      <tr key={d.key} className="border-b border-slate-50 hover:bg-slate-50 transition">
                        <td className="py-3 px-3 font-bold text-slate-800">{d.label}</td>
                        <td className="py-3 px-3 text-center"><span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{d.nbV}</span></td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-600">{fmt(d.revenuBrut)}</td>
                        <td className="py-3 px-3 text-right text-red-400">−{fmt(d.coutAchat)}</td>
                        <td className="py-3 px-3 text-right text-orange-400">−{fmt(d.coutGasoil)}</td>
                        <td className="py-3 px-3 text-right text-red-400">−{fmt(d.coutCharges)}</td>
                        <td className="py-3 px-3 text-right"><ProfitCell v={d.profit} /></td>
                        <td className="py-3 px-3 text-right"><MargeBadge marge={d.marge} /></td>
                      </tr>
                    ))}
                  </tbody>
                  {monthlyData.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-gradient-to-r from-slate-800 to-slate-900 text-white">
                        <td className="py-3 px-3 font-black text-sm">TOTAL</td>
                        <td className="py-3 px-3 text-center font-black">{voyages.length}</td>
                        <td className="py-3 px-3 text-right font-black text-emerald-400">{fmt(global.revenuBrut)}</td>
                        <td className="py-3 px-3 text-right font-bold text-red-300">−{fmt(global.coutAchat)}</td>
                        <td className="py-3 px-3 text-right font-bold text-orange-300">−{fmt(global.coutGasoil)}</td>
                        <td className="py-3 px-3 text-right font-bold text-red-300">−{fmt(global.coutCharges)}</td>
                        <td className={`py-3 px-3 text-right font-black text-lg ${global.profit>=0?'text-emerald-400':'text-red-400'}`}>
                          {global.profit>=0?'+':''}{fmt(global.profit)}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-blue-300">{global.marge}%</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            TAB: PAR CAMION
        ══════════════════════════════════════════════════ */}
        {tab === 'camions' && (
          <div className="space-y-4">
            {camionStats.length === 0 ? (
              <div className="text-center py-16 text-slate-400"><div className="text-5xl mb-3">🚛</div><div>Aucun camion avec voyages sur cette période</div></div>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h3 className="font-bold text-slate-700 text-sm mb-4">Performance par camion</h3>
                  <BarViz data={camionStats.map(c => ({
                    label: c.plaque + (c.type_camion === 'loue' ? ' 🔑' : '') + (c.chauffeur ? ` · ${c.chauffeur}` : ''),
                    revenu: c.revenuBrut, profit: c.profit,
                  }))} />
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <ColHeader label="Camion" />
                          <ColHeader label="Chauffeur" />
                          <ColHeader label="Voyages" center />
                          <ColHeader label="Revenu DHS" right />
                          <ColHeader label="Achats" right />
                          <ColHeader label="Gasoil" right />
                          <ColHeader label="Location" right />
                          <ColHeader label="Charges" right />
                          <ColHeader label="= Profit" right />
                          <ColHeader label="Marge" right />
                        </tr>
                      </thead>
                      <tbody>
                        {camionStats.map(c => (
                          <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                            <td className="py-3 px-3">
                              <div className="font-black text-slate-800">{c.plaque}</div>
                              {c.type_camion === 'loue' && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">LOUÉ</span>}
                            </td>
                            <td className="py-3 px-3 text-slate-500">{c.chauffeur || '—'}</td>
                            <td className="py-3 px-3 text-center"><span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{c.nbV}</span></td>
                            <td className="py-3 px-3 text-right font-bold text-emerald-600">{fmt(c.revenuBrut)}</td>
                            <td className="py-3 px-3 text-right text-red-400">−{fmt(c.coutAchat)}</td>
                            <td className="py-3 px-3 text-right text-orange-400">−{fmt(c.coutGasoil)}</td>
                            <td className="py-3 px-3 text-right text-amber-500">{c.coutLocation > 0 ? `−${fmt(c.coutLocation)}` : '—'}</td>
                            <td className="py-3 px-3 text-right text-red-400">−{fmt(c.coutCharges)}</td>
                            <td className="py-3 px-3 text-right"><ProfitCell v={c.profit} /></td>
                            <td className="py-3 px-3 text-right"><MargeBadge marge={c.marge} /></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot><TotalsFooter global={global} /></tfoot>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            TAB: PAR CLIENT
        ══════════════════════════════════════════════════ */}
        {tab === 'clients' && (
          <div className="space-y-4">
            {clientStats.length === 0 ? (
              <div className="text-center py-16 text-slate-400"><div className="text-5xl mb-3">👤</div><div>Aucun client avec livraisons sur cette période</div></div>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h3 className="font-bold text-slate-700 text-sm mb-4">Performance par client</h3>
                  <BarViz data={clientStats.map(c => ({ label: c.nom, revenu: c.revenu, profit: c.profit }))} />
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-700 text-sm">
                      Détail par client
                      <span className="font-normal text-slate-400 ml-2 text-xs">— gasoil et charges fixes divisés équitablement entre clients du voyage</span>
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <ColHeader label="#" />
                          <ColHeader label="Client" />
                          <ColHeader label="Qté" right />
                          <ColHeader label="Revenu DHS" right />
                          <ColHeader label="Achats" right />
                          <ColHeader label="Gasoil ÷" right />
                          <ColHeader label="Charges ÷" right />
                          <ColHeader label="= Profit" right />
                          <ColHeader label="Marge" right />
                        </tr>
                      </thead>
                      <tbody>
                        {clientStats.map((c, i) => (
                          <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                            <td className="py-2.5 px-3 text-slate-400 font-semibold">{i+1}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-800">{c.nom}</td>
                            <td className="py-2.5 px-3 text-right text-slate-500">{fmt(c.qte)}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-600">{fmt(c.revenu)}</td>
                            <td className="py-2.5 px-3 text-right text-red-400">−{fmt(c.achat)}</td>
                            <td className="py-2.5 px-3 text-right text-orange-400">−{fmt(c.gas)}</td>
                            <td className="py-2.5 px-3 text-right text-red-400">−{fmt(c.chg)}</td>
                            <td className="py-2.5 px-3 text-right"><ProfitCell v={c.profit} /></td>
                            <td className="py-2.5 px-3 text-right"><MargeBadge marge={c.marge} /></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 bg-gradient-to-r from-slate-800 to-slate-900 text-white">
                          <td colSpan={3} className="py-3 px-3 font-black text-sm">TOTAL</td>
                          <td className="py-3 px-3 text-right font-black text-emerald-400">{fmt(clientStats.reduce((s,c)=>s+c.revenu,0))}</td>
                          <td className="py-3 px-3 text-right font-bold text-red-300">−{fmt(clientStats.reduce((s,c)=>s+c.achat,0))}</td>
                          <td className="py-3 px-3 text-right font-bold text-orange-300">−{fmt(clientStats.reduce((s,c)=>s+c.gas,0))}</td>
                          <td className="py-3 px-3 text-right font-bold text-red-300">−{fmt(clientStats.reduce((s,c)=>s+c.chg,0))}</td>
                          <td className={`py-3 px-3 text-right font-black text-lg ${global.profit>=0?'text-emerald-400':'text-red-400'}`}>
                            {global.profit>=0?'+':''}{fmt(global.profit)}
                          </td>
                          <td className="py-3 px-3 text-right font-black text-blue-300">{global.marge}%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </Layout>
  )
}
