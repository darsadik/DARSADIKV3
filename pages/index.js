import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from './_app'
import Link from 'next/link'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtDate = d => { if (!d) return '—'; const [y, m, j] = d.split('-'); return `${j}/${m}/${y}` }
const today = () => new Date().toISOString().split('T')[0]
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const startOfWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().split('T')[0] }

// Purple Présentation palette
const BLUE = '#7c3aed'
const BLUE_BG = '#ede9fe'
const BLUE_BORDER = '#ddd6fe'
const BLUE_TEXT = '#5b21b6'
const BLUE_DARK = '#4c1d95'

const secHeader = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '10px 20px', borderBottom: `2px solid ${BLUE_BORDER}`,
  background: BLUE_BG,
}
const secTitle = { fontWeight: 700, fontSize: 13, color: BLUE_DARK }
const thStyle = {
  background: BLUE_BG, color: BLUE_TEXT, borderBottom: `2px solid ${BLUE_BORDER}`,
  whiteSpace: 'nowrap', padding: '8px 12px', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.07em',
}

export default function Dashboard() {
  const { user } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  const [voyages,      setVoyages]      = useState([])
  const [livraisons,   setLivraisons]   = useState([])
  const [achatsVoy,    setAchatsVoy]    = useState([])
  const [gasoilVoy,    setGasoilVoy]    = useState([])
  const [chargesVoy,   setChargesVoy]   = useState([])
  const [retoursVoy,   setRetoursVoy]   = useState([])
  const [clients,      setClients]      = useState([])
  const [camionsData,  setCamionsData]  = useState([])
  const [locationsVoy, setLocationsVoy] = useState([])

  // ── DATE FILTER ──
  const [filterType, setFilterType] = useState('month') // 'month' | 'week' | 'custom'
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo,   setFilterTo]   = useState(today())

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [
      { data: v },
      { data: li },
      { data: av },
      { data: gv },
      { data: cv },
      { data: rv },
      { data: cl },
      { data: ca },
      { data: lv },
    ] = await Promise.all([
      supabase.from('voyages').select('*').order('date_depart', { ascending: false }).limit(300),
      supabase.from('voyage_livraisons').select('id,voyage_id,date_livraison,total_vente,frais_total,client_id,client_nom,type_produit,note'),
      supabase.from('voyage_achats').select('voyage_id,total_achat,qte,prix_achat'),
      supabase.from('voyage_gasoil').select('voyage_id,total'),
      supabase.from('voyage_charges').select('voyage_id,montant,facture_client'),
      supabase.from('voyage_retours').select('voyage_id,montant'),
      supabase.from('clients').select('id,nom,solde').order('solde', { ascending: false }),
      supabase.from('camions').select('id,plaque,type_camion').order('plaque'),
      supabase.from('voyage_locations').select('voyage_id,montant_location'),
    ])
    setVoyages(v || [])
    setLivraisons(li || [])
    setAchatsVoy(av || [])
    setGasoilVoy(gv || [])
    setChargesVoy(cv || [])
    setRetoursVoy(rv || [])
    setClients(cl || [])
    setCamionsData(ca || [])
    setLocationsVoy(lv || [])
    setLoading(false)
  }

  function voyageProfit(vid) {
    const li = livraisons.filter(l => l.voyage_id === vid)
    const ac = achatsVoy.filter(a => a.voyage_id === vid)
    const ga = gasoilVoy.filter(g => g.voyage_id === vid)
    const ch = chargesVoy.filter(c => c.voyage_id === vid)
    const re = retoursVoy.filter(r => r.voyage_id === vid)
    const lo = locationsVoy.filter(l => l.voyage_id === vid)
    const revenu = li.reduce((s, l) => s + (l.total_vente || 0) + (l.frais_total || 0), 0)
      + re.reduce((s, r) => s + (r.montant || 0), 0)
      + ch.filter(c => c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)
    const cout = ac.reduce((s, a) => s + (a.total_achat || (a.qte || 0) * (a.prix_achat || 0)), 0)
      + ga.reduce((s, g) => s + (g.total || 0), 0)
      + ch.filter(c => !c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)
      + lo.reduce((s, l) => s + (l.montant_location || 0), 0)
    return { revenu, cout, profit: revenu - cout }
  }

  function voyageClient(vid) {
    const li = livraisons.filter(l => l.voyage_id === vid)
    const names = [...new Set(li.map(l => {
      if (l.client_nom) return l.client_nom
      const cl = clients.find(c => c.id === l.client_id)
      return cl ? cl.nom : null
    }).filter(Boolean))]
    if (names.length === 0) return '—'
    if (names.length === 1) return names[0]
    return names[0] + ' +' + (names.length - 1)
  }

  // ── COMPUTED FILTER RANGE ──
  const rangeFrom = filterType === 'month' ? startOfMonth()
    : filterType === 'week' ? startOfWeek()
    : filterFrom
  const rangeTo = filterType === 'custom' ? filterTo : today()

  const periodLabel = filterType === 'month'
    ? new Date().toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' })
    : filterType === 'week'
    ? 'cette semaine'
    : `${fmtDate(rangeFrom)} – ${fmtDate(rangeTo)}`

  const filteredVoyages = voyages.filter(v => v.date_depart >= rangeFrom && v.date_depart <= rangeTo)

  // KPI computations
  const profitPeriode  = filteredVoyages.reduce((s, v) => s + voyageProfit(v.id).profit, 0)
  const voyagesActifs  = voyages.filter(v => v.statut === 'en_cours').length
  const totalCreances  = clients.reduce((s, c) => s + (c.solde || 0), 0)
  const profitMoyen    = filteredVoyages.length > 0 ? profitPeriode / filteredVoyages.length : 0

  // Propres vs Loués split
  const propresVoyages = filteredVoyages.filter(v => camionsData.find(c => c.id === v.camion_id)?.type_camion !== 'loue')
  const louesVoyages   = filteredVoyages.filter(v => camionsData.find(c => c.id === v.camion_id)?.type_camion === 'loue')
  const profitPropres  = propresVoyages.reduce((s, v) => s + voyageProfit(v.id).profit, 0)
  const profitLoues    = louesVoyages.reduce((s, v) => s + voyageProfit(v.id).profit, 0)

  // Derniers voyages (last 8 overall)
  const recentVoyages = voyages.slice(0, 8)

  // Top + loss within filtered period
  const topVoyages = filteredVoyages
    .map(v => ({ ...v, ...voyageProfit(v.id) }))
    .filter(v => v.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5)

  const lossVoyages = filteredVoyages
    .map(v => ({ ...v, ...voyageProfit(v.id) }))
    .filter(v => v.profit < 0)
    .sort((a, b) => a.profit - b.profit)

  // Client alerts
  const debtors       = clients.filter(c => (c.solde || 0) > 0).sort((a, b) => b.solde - a.solde)
  const urgentClients = debtors.filter(c => (c.solde || 0) >= 100000)

  // Camion performance within filtered period
  const camionMap = {}
  filteredVoyages.forEach(v => {
    const plaque = v.camion_plaque || 'Inconnu'
    const camRec = camionsData.find(c => c.id === v.camion_id)
    if (!camionMap[plaque]) camionMap[plaque] = { voyages: 0, revenu: 0, profit: 0, type_camion: camRec?.type_camion || 'propre' }
    const { revenu, profit } = voyageProfit(v.id)
    camionMap[plaque].voyages++
    camionMap[plaque].revenu  += revenu
    camionMap[plaque].profit  += profit
  })
  const camions = Object.entries(camionMap)
    .map(([plaque, d]) => ({ plaque, ...d, avg: d.voyages > 0 ? d.profit / d.voyages : 0 }))
    .sort((a, b) => b.profit - a.profit)

  const recentLivraisons = [...livraisons]
    .filter(l => l.date_livraison && l.date_livraison >= rangeFrom && l.date_livraison <= rangeTo)
    .sort((a, b) => b.date_livraison.localeCompare(a.date_livraison))
    .slice(0, 8)

  return (
    <Layout title="Dashboard" subtitle="Cockpit opérationnel">
      <div className="max-w-6xl mx-auto space-y-4">

        {/* ── URGENT ALERT BANNER ── */}
        {!loading && urgentClients.length > 0 && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-bold text-red-600 text-sm">
                {urgentClients.length} client{urgentClients.length > 1 ? 's' : ''} dépassent 100 000 DHS —{' '}
              </span>
              <span className="text-red-400 text-sm">{urgentClients.map(c => c.nom).join(', ')}</span>
            </div>
            <Link href="/clients" className="flex-shrink-0 text-xs text-red-600 font-bold border border-red-300 rounded-lg px-2.5 py-1 hover:bg-red-100 transition">
              Voir →
            </Link>
          </div>
        )}

        {/* ── DATE FILTER BAR ── */}
        <div style={{background: BLUE_BG, border: `1px solid ${BLUE_BORDER}`, borderRadius: 12, padding: '10px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10}}>
          <span style={{fontSize: 10, fontWeight: 700, color: BLUE_TEXT, textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0}}>
            Période
          </span>
          {/* Toggle buttons */}
          <div style={{display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${BLUE_BORDER}`, flexShrink: 0}}>
            {[
              { key: 'month', label: 'Ce mois' },
              { key: 'week',  label: 'Cette semaine' },
              { key: 'custom', label: 'Personnalisé' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setFilterType(opt.key)}
                style={{
                  padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: 'none', outline: 'none',
                  background: filterType === opt.key ? BLUE : BLUE_BG,
                  color: filterType === opt.key ? '#fff' : BLUE_TEXT,
                  transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Custom date pickers */}
          {filterType === 'custom' && (
            <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
              <input
                type="date" value={filterFrom}
                onChange={e => setFilterFrom(e.target.value)}
                style={{border: `1px solid ${BLUE_BORDER}`, borderRadius: 6, padding: '4px 8px', fontSize: 12, color: BLUE_DARK, background: '#fff', outline: 'none'}}
              />
              <span style={{color: BLUE_TEXT, fontWeight: 700, fontSize: 12}}>→</span>
              <input
                type="date" value={filterTo}
                onChange={e => setFilterTo(e.target.value)}
                style={{border: `1px solid ${BLUE_BORDER}`, borderRadius: 6, padding: '4px 8px', fontSize: 12, color: BLUE_DARK, background: '#fff', outline: 'none'}}
              />
            </div>
          )}
          {/* Period summary */}
          <span style={{fontSize: 11, color: BLUE_TEXT, fontWeight: 600, marginLeft: 4}}>
            {filterType !== 'custom' && periodLabel}
            {filterType === 'custom' && filterFrom && filterTo && `${fmtDate(filterFrom)} – ${fmtDate(filterTo)}`}
          </span>
          <span style={{marginLeft: 'auto', fontSize: 11, color: '#64748b'}}>
            {filteredVoyages.length} voyage{filteredVoyages.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-slate-100 rounded-2xl" />)}
            </div>
            <div className="h-64 bg-slate-100 rounded-2xl" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-56 bg-slate-100 rounded-2xl" />
              <div className="h-56 bg-slate-100 rounded-2xl" />
            </div>
          </div>
        ) : (
          <>
            {/* ── KPI CARDS ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

              {/* Profit de la période */}
              <div className={`rounded-2xl border shadow-sm p-4 ${profitPeriode >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${profitPeriode >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  Profit · {filterType === 'month' ? 'Mois' : filterType === 'week' ? 'Semaine' : 'Période'}
                </div>
                <div className={`text-2xl font-black leading-none ${profitPeriode >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {profitPeriode >= 0 ? '+' : ''}{fmt(profitPeriode)}
                </div>
                <div className={`text-xs mt-1.5 ${profitPeriode >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  DHS · {periodLabel}
                </div>
              </div>

              {/* Voyages actifs */}
              <div style={{background:'#fff', border:`1px solid ${BLUE_BORDER}`, borderRadius:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)', padding:16}}>
                <div style={{fontSize:10, fontWeight:700, color: BLUE_TEXT, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8}}>Voyages actifs</div>
                <div style={{fontSize:28, fontWeight:900, color:'#d97706', lineHeight:1}}>{voyagesActifs}</div>
                <div style={{fontSize:12, color:'#94a3b8', marginTop:6}}>
                  {filteredVoyages.length} période · {voyages.filter(v => v.statut === 'termine').length} terminés
                </div>
              </div>

              {/* Clients à recevoir */}
              <div className={`rounded-2xl border shadow-sm p-4 ${totalCreances > 0 ? 'border-red-200 bg-white' : 'border-emerald-200 bg-white'}`}>
                <div style={{fontSize:10, fontWeight:700, color: BLUE_TEXT, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8}}>Clients à recevoir</div>
                <div className={`text-2xl font-black leading-none ${totalCreances > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {fmt(totalCreances)}
                </div>
                <div style={{fontSize:12, color:'#94a3b8', marginTop:6}}>DHS · {debtors.length} débiteur{debtors.length !== 1 ? 's' : ''}</div>
              </div>

              {/* Profit moyen / voyage */}
              <div style={{background:'#fff', border:`1px solid ${BLUE_BORDER}`, borderRadius:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)', padding:16}}>
                <div style={{fontSize:10, fontWeight:700, color: BLUE_TEXT, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8}}>Profit moyen / voyage</div>
                <div style={{fontSize:28, fontWeight:900, lineHeight:1, color: profitMoyen >= 0 ? '#1e293b' : '#ef4444'}}>
                  {profitMoyen >= 0 ? '+' : ''}{fmt(profitMoyen)}
                </div>
                <div style={{fontSize:12, color:'#94a3b8', marginTop:6}}>DHS · {filteredVoyages.length} voyage{filteredVoyages.length !== 1 ? 's' : ''}</div>
              </div>
            </div>

            {/* ── PROPRES VS LOUÉS ── */}
            {louesVoyages.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-2xl border shadow-sm p-4 ${profitPropres >= 0 ? 'bg-slate-50 border-slate-200' : 'bg-red-50 border-red-200'}`}>
                  <div style={{fontSize:10, fontWeight:700, color: BLUE_TEXT, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8}}>Camions propres</div>
                  <div className={`text-2xl font-black leading-none ${profitPropres >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
                    {profitPropres >= 0 ? '+' : ''}{fmt(profitPropres)}
                  </div>
                  <div className="text-xs text-slate-400 mt-1.5">DHS · {propresVoyages.length} voyage{propresVoyages.length !== 1 ? 's' : ''}</div>
                </div>
                <div className={`rounded-2xl border shadow-sm p-4 ${profitLoues >= 0 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                  <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${profitLoues >= 0 ? 'text-amber-600' : 'text-red-500'}`}>Camions loués</div>
                  <div className={`text-2xl font-black leading-none ${profitLoues >= 0 ? 'text-amber-700' : 'text-red-600'}`}>
                    {profitLoues >= 0 ? '+' : ''}{fmt(profitLoues)}
                  </div>
                  <div className="text-xs text-amber-500 mt-1.5">DHS · {louesVoyages.length} voyage{louesVoyages.length !== 1 ? 's' : ''}</div>
                </div>
              </div>
            )}

            {/* ── DERNIERS VOYAGES ── */}
            <div style={{background:'#fff', border:`1px solid ${BLUE_BORDER}`, borderRadius:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)', overflow:'hidden'}}>
              <div style={secHeader}>
                <span style={secTitle}>Derniers voyages</span>
                <Link href="/voyages" style={{fontSize:12, color: BLUE, fontWeight:700}}>Tous les voyages →</Link>
              </div>
              {recentVoyages.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  <Link href="/voyages" className="font-semibold" style={{color: BLUE}}>Créer un premier voyage →</Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th style={{...thStyle, textAlign:'left'}}>Voyage</th>
                        <th style={{...thStyle, textAlign:'left'}} className="hidden md:table-cell">Client</th>
                        <th style={{...thStyle, textAlign:'right'}}>Revenu</th>
                        <th style={{...thStyle, textAlign:'right'}} className="hidden md:table-cell">Coût</th>
                        <th style={{...thStyle, textAlign:'right'}}>Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentVoyages.map((v, i) => {
                        const { revenu, cout, profit } = voyageProfit(v.id)
                        const hasData = revenu > 0 || cout > 0
                        return (
                          <tr
                            key={v.id}
                            onClick={() => router.push(`/voyages/${v.id}`)}
                            style={{borderBottom:'1px solid #f1f5f9', cursor:'pointer', background: i % 2 === 1 ? '#f8fafc' : '#fff'}}
                            onMouseEnter={e => e.currentTarget.style.background = BLUE_BG}
                            onMouseLeave={e => e.currentTarget.style.background = i % 2 === 1 ? '#f8fafc' : '#fff'}
                          >
                            <td style={{padding:'10px 20px'}}>
                              <div style={{fontWeight:700, color:'#1e293b', fontSize:13}}>{v.reference || `#${v.id}`}</div>
                              <div style={{fontSize:10, color:'#94a3b8'}}>{fmtDate(v.date_depart)} · {v.camion_plaque}</div>
                            </td>
                            <td style={{padding:'10px 16px', color:'#64748b', fontSize:13}} className="hidden md:table-cell">{voyageClient(v.id)}</td>
                            <td style={{padding:'10px 16px', textAlign:'right', fontWeight:600, color:'#374151'}}>
                              {revenu > 0 ? fmt(revenu) : <span style={{color:'#cbd5e1'}}>—</span>}
                            </td>
                            <td style={{padding:'10px 16px', textAlign:'right', color:'#64748b'}} className="hidden md:table-cell">
                              {cout > 0 ? fmt(cout) : <span style={{color:'#cbd5e1'}}>—</span>}
                            </td>
                            <td style={{padding:'10px 20px', textAlign:'right'}}>
                              {hasData ? (
                                <span style={{fontWeight:900, color: profit >= 0 ? '#16a34a' : '#ef4444'}}>
                                  {profit >= 0 ? '+' : ''}{fmt(profit)}
                                </span>
                              ) : (
                                <span style={{
                                  fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99,
                                  background: v.statut === 'termine' ? '#f0fdf4' : '#fffbeb',
                                  color:      v.statut === 'termine' ? '#16a34a' : '#d97706',
                                  border:     `1px solid ${v.statut === 'termine' ? '#bbf7d0' : '#fde68a'}`,
                                }}>
                                  {v.statut === 'termine' ? 'Terminé' : 'En cours'}
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── LIVRAISONS RÉCENTES ── */}
            {recentLivraisons.length > 0 && (
              <div style={{background:'#fff', border:`1px solid ${BLUE_BORDER}`, borderRadius:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)', overflow:'hidden'}}>
                <div style={secHeader}>
                  <span style={secTitle}>Livraisons récentes — {periodLabel}</span>
                  <Link href="/ventes" style={{fontSize:12, color: BLUE, fontWeight:700}}>Toutes les ventes →</Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th style={{...thStyle, textAlign:'left'}}>Date</th>
                        <th style={{...thStyle, textAlign:'left'}}>Client</th>
                        <th style={{...thStyle, textAlign:'left'}} className="hidden md:table-cell">Note</th>
                        <th style={{...thStyle, textAlign:'right'}}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentLivraisons.map((l, i) => {
                        const deliveryTotal = (l.total_vente || 0) + (l.frais_total || 0)
                        const voyage = voyages.find(v => v.id === l.voyage_id)
                        return (
                          <tr
                            key={l.id || `${l.voyage_id}-${l.date_livraison}-${l.client_id}`}
                            onClick={() => voyage && router.push(`/voyages/${l.voyage_id}`)}
                            style={{borderBottom:'1px solid #f1f5f9', cursor: voyage ? 'pointer' : 'default', background: i % 2 === 1 ? '#f8fafc' : '#fff'}}
                            onMouseEnter={e => { if (voyage) e.currentTarget.style.background = BLUE_BG }}
                            onMouseLeave={e => e.currentTarget.style.background = i % 2 === 1 ? '#f8fafc' : '#fff'}
                          >
                            <td style={{padding:'8px 20px', color:'#64748b', fontSize:12, whiteSpace:'nowrap'}}>{fmtDate(l.date_livraison)}</td>
                            <td style={{padding:'8px 16px', fontWeight:600, color:'#1e293b', fontSize:13}}>{l.client_nom || '—'}</td>
                            <td style={{padding:'8px 16px'}} className="hidden md:table-cell">
                              {l.note
                                ? <span style={{fontSize:11, fontWeight:600, color:'#374151', background:'#f1f5f9', borderRadius:4, padding:'1px 7px'}}>{l.note}</span>
                                : <span style={{fontSize:11, color:'#cbd5e1', fontStyle:'italic'}}>—</span>
                              }
                            </td>
                            <td style={{padding:'8px 20px', textAlign:'right', fontWeight:700, color:'#16a34a', fontSize:13, whiteSpace:'nowrap'}}>
                              {deliveryTotal > 0 ? `${fmt(deliveryTotal)} DHS` : <span style={{color:'#cbd5e1'}}>—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TOP VOYAGES + CLIENT ALERTS ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Top voyages */}
              <div style={{background:'#fff', border:`1px solid ${BLUE_BORDER}`, borderRadius:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)', overflow:'hidden'}}>
                <div style={secHeader}>
                  <span style={secTitle}>Top voyages — {periodLabel}</span>
                  <span style={{fontSize:10, color:'#16a34a', fontWeight:700, background:'#f0fdf4', border:'1px solid #bbf7d0', padding:'2px 8px', borderRadius:99}}>
                    {topVoyages.length} rentable{topVoyages.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {topVoyages.length === 0 ? (
                  <div style={{padding:'40px 0', textAlign:'center', color:'#94a3b8', fontSize:13}}>
                    Aucun voyage rentable sur cette période
                  </div>
                ) : (
                  <div>
                    {topVoyages.map((v, i) => (
                      <div
                        key={v.id}
                        onClick={() => router.push(`/voyages/${v.id}`)}
                        style={{display:'flex', alignItems:'center', gap:12, padding:'10px 20px', borderBottom:'1px solid #f1f5f9', cursor:'pointer'}}
                        onMouseEnter={e => e.currentTarget.style.background = BLUE_BG}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        <span style={{fontSize:13, fontWeight:900, width:20, textAlign:'center', flexShrink:0, color: i === 0 ? '#d97706' : '#cbd5e1'}}>
                          #{i + 1}
                        </span>
                        <div style={{flex:1, minWidth:0}}>
                          <div style={{fontWeight:700, color:'#1e293b', fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{v.reference || `Voyage #${v.id}`}</div>
                          <div style={{fontSize:10, color:'#94a3b8'}}>{fmtDate(v.date_depart)} · {voyageClient(v.id)}</div>
                        </div>
                        <div style={{textAlign:'right', flexShrink:0}}>
                          <div style={{fontWeight:900, color:'#16a34a', fontSize:13}}>+{fmt(v.profit)}</div>
                          <div style={{fontSize:10, color:'#94a3b8'}}>DHS</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Alertes clients */}
              <div style={{background:'#fff', border:`1px solid ${BLUE_BORDER}`, borderRadius:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)', overflow:'hidden'}}>
                <div style={secHeader}>
                  <span style={secTitle}>Alertes clients</span>
                  <Link href="/clients" style={{fontSize:12, color: BLUE, fontWeight:700}}>Gérer →</Link>
                </div>
                {debtors.length === 0 ? (
                  <div style={{padding:'40px 0', textAlign:'center', color:'#94a3b8', fontSize:13, display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
                    <span style={{fontSize:28}}>✅</span>
                    <span>Aucune créance en cours</span>
                  </div>
                ) : (
                  <>
                    <div>
                      {debtors.slice(0, 6).map(c => {
                        const isUrgent = (c.solde || 0) >= 100000
                        const isHigh   = (c.solde || 0) >= 50000
                        return (
                          <div
                            key={c.id}
                            style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 20px', borderBottom:'1px solid #f1f5f9', background: isUrgent ? '#fff5f5' : ''}}
                          >
                            <div style={{display:'flex', alignItems:'center', gap:10, minWidth:0}}>
                              <div style={{width:8, height:8, borderRadius:'50%', flexShrink:0, background: isUrgent ? '#ef4444' : isHigh ? '#f59e0b' : '#e2e8f0'}} />
                              <span style={{fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: isUrgent ? '#b91c1c' : '#374151'}}>
                                {c.nom}
                              </span>
                            </div>
                            <span style={{fontWeight:900, fontSize:13, flexShrink:0, marginLeft:12, color: isUrgent ? '#dc2626' : isHigh ? '#d97706' : '#374151'}}>
                              {fmt(c.solde)} DHS
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    {debtors.length > 6 && (
                      <div style={{padding:'8px 20px', background: BLUE_BG, borderTop:`1px solid ${BLUE_BORDER}`, textAlign:'center'}}>
                        <Link href="/clients" style={{fontSize:12, color: BLUE_TEXT, fontWeight:600}}>
                          +{debtors.length - 6} autres clients →
                        </Link>
                      </div>
                    )}
                    <div style={{padding:'8px 20px', background: BLUE_BG, borderTop:`1px solid ${BLUE_BORDER}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                      <span style={{fontSize:10, fontWeight:700, color: BLUE_TEXT, textTransform:'uppercase', letterSpacing:'0.07em'}}>Total créances</span>
                      <span style={{fontWeight:900, fontSize:13, color:'#dc2626'}}>{fmt(totalCreances)} DHS</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── VOYAGES À PERTE ── */}
            {lossVoyages.length > 0 && (
              <div className="bg-red-50 border-2 border-red-300 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b-2 border-red-200 bg-red-100">
                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                  <span className="font-bold text-red-700 text-sm">Voyages à perte — {periodLabel}</span>
                  <span className="ml-auto text-xs font-black text-red-700 bg-red-200 border border-red-300 px-2.5 py-0.5 rounded-full">
                    {lossVoyages.length} voyage{lossVoyages.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-red-200">
                        <th className="text-left px-5 py-2.5 text-[10px] font-bold text-red-400 uppercase tracking-wider">Voyage</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-red-400 uppercase tracking-wider hidden md:table-cell">Client</th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold text-red-400 uppercase tracking-wider">Revenu</th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold text-red-400 uppercase tracking-wider hidden md:table-cell">Coût</th>
                        <th className="text-right px-5 py-2.5 text-[10px] font-bold text-red-400 uppercase tracking-wider">Perte</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-100">
                      {lossVoyages.map(v => (
                        <tr
                          key={v.id}
                          onClick={() => router.push(`/voyages/${v.id}`)}
                          className="hover:bg-red-100 cursor-pointer transition"
                        >
                          <td className="px-5 py-3">
                            <div className="font-bold text-red-800">{v.reference || `#${v.id}`}</div>
                            <div className="text-[10px] text-red-400">{fmtDate(v.date_depart)} · {v.camion_plaque}</div>
                          </td>
                          <td className="px-4 py-3 text-red-700 text-sm hidden md:table-cell">{voyageClient(v.id)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-red-700">{fmt(v.revenu)}</td>
                          <td className="px-4 py-3 text-right text-red-600 hidden md:table-cell">{fmt(v.cout)}</td>
                          <td className="px-5 py-3 text-right font-black text-red-600">{fmt(v.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── PERFORMANCE CAMIONS ── */}
            {camions.length > 0 && (
              <div style={{background:'#fff', border:`1px solid ${BLUE_BORDER}`, borderRadius:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)', overflow:'hidden'}}>
                <div style={secHeader}>
                  <span style={secTitle}>Performance camions — {periodLabel}</span>
                  <span style={{fontSize:11, color:'#94a3b8', fontWeight:600}}>
                    {camions.length} camion{camions.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th style={{...thStyle, textAlign:'left'}}>Camion</th>
                        <th style={{...thStyle, textAlign:'right'}}>Voyages</th>
                        <th style={{...thStyle, textAlign:'right'}} className="hidden md:table-cell">Revenu total</th>
                        <th style={{...thStyle, textAlign:'right'}}>Profit total</th>
                        <th style={{...thStyle, textAlign:'right'}}>Moy. / voyage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {camions.map((c, i) => (
                        <tr
                          key={c.plaque}
                          style={{borderBottom:'1px solid #f1f5f9', background: i % 2 === 1 ? '#f8fafc' : '#fff'}}
                          onMouseEnter={e => e.currentTarget.style.background = BLUE_BG}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 === 1 ? '#f8fafc' : '#fff'}
                        >
                          <td style={{padding:'10px 20px'}}>
                            <span style={{fontWeight:700, color:'#1e293b'}}>{c.plaque}</span>
                            {c.type_camion === 'loue' && (
                              <span style={{marginLeft:6, fontSize:9, background:'#fef3c7', color:'#92400e', padding:'1px 5px', borderRadius:3, fontWeight:700}}>LOUÉ</span>
                            )}
                          </td>
                          <td style={{padding:'10px 16px', textAlign:'right', color:'#374151', fontWeight:600}}>{c.voyages}</td>
                          <td style={{padding:'10px 16px', textAlign:'right', fontWeight:600, color:'#374151'}} className="hidden md:table-cell">{fmt(c.revenu)}</td>
                          <td style={{padding:'10px 16px', textAlign:'right', fontWeight:700, color: c.profit >= 0 ? '#16a34a' : '#ef4444'}}>
                            {c.profit >= 0 ? '+' : ''}{fmt(c.profit)}
                          </td>
                          <td style={{padding:'10px 20px', textAlign:'right', fontWeight:900, color: c.avg >= 0 ? '#1e293b' : '#ef4444'}}>
                            {c.avg >= 0 ? '+' : ''}{fmt(c.avg)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
