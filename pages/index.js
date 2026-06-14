import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from './_app'
import Link from 'next/link'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtDate = d => { if (!d) return '—'; const [y, m, j] = d.split('-'); return `${j}/${m}/${y}` }
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }

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
      supabase.from('voyages').select('*').order('date_depart', { ascending: false }).limit(100),
      supabase.from('voyage_livraisons').select('voyage_id,total_vente,client_id,client_nom,type_produit'),
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
    const revenu = li.reduce((s, l) => s + (l.total_vente || 0), 0)
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

  const monthName = new Date().toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' })
  const month = startOfMonth()
  const monthVoyages = voyages.filter(v => v.date_depart >= month)

  // KPI computations
  const profitMois    = monthVoyages.reduce((s, v) => s + voyageProfit(v.id).profit, 0)
  const voyagesActifs = voyages.filter(v => v.statut === 'en_cours').length
  const totalCreances = clients.reduce((s, c) => s + (c.solde || 0), 0)
  const profitMoyen   = monthVoyages.length > 0 ? profitMois / monthVoyages.length : 0

  // Propres vs Loués split
  const propresVoyages = monthVoyages.filter(v => camionsData.find(c => c.id === v.camion_id)?.type_camion !== 'loue')
  const louesVoyages   = monthVoyages.filter(v => camionsData.find(c => c.id === v.camion_id)?.type_camion === 'loue')
  const profitPropres  = propresVoyages.reduce((s, v) => s + voyageProfit(v.id).profit, 0)
  const profitLoues    = louesVoyages.reduce((s, v) => s + voyageProfit(v.id).profit, 0)

  // Derniers voyages (last 8 overall)
  const recentVoyages = voyages.slice(0, 8)

  // Top voyages this month
  const topVoyages = monthVoyages
    .map(v => ({ ...v, ...voyageProfit(v.id) }))
    .filter(v => v.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5)

  // Loss voyages this month
  const lossVoyages = monthVoyages
    .map(v => ({ ...v, ...voyageProfit(v.id) }))
    .filter(v => v.profit < 0)
    .sort((a, b) => a.profit - b.profit)

  // Client alerts (brique only, sorted by debt)
  const debtors      = clients.filter(c => (c.solde || 0) > 0).sort((a, b) => b.solde - a.solde)
  const urgentClients = debtors.filter(c => (c.solde || 0) >= 100000)

  // Camion performance this month
  const camionMap = {}
  monthVoyages.forEach(v => {
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

              {/* Profit du mois */}
              <div className={`rounded-2xl border shadow-sm p-4 ${profitMois >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${profitMois >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  Profit du mois
                </div>
                <div className={`text-2xl font-black leading-none ${profitMois >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {profitMois >= 0 ? '+' : ''}{fmt(profitMois)}
                </div>
                <div className={`text-xs mt-1.5 ${profitMois >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  DHS · {monthName}
                </div>
              </div>

              {/* Voyages actifs */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Voyages actifs</div>
                <div className="text-2xl font-black leading-none text-amber-600">{voyagesActifs}</div>
                <div className="text-xs text-slate-400 mt-1.5">
                  {monthVoyages.length} ce mois · {voyages.filter(v => v.statut === 'termine').length} terminés
                </div>
              </div>

              {/* Clients à recevoir */}
              <div className={`bg-white rounded-2xl border shadow-sm p-4 ${totalCreances > 0 ? 'border-red-200' : 'border-emerald-200'}`}>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Clients à recevoir</div>
                <div className={`text-2xl font-black leading-none ${totalCreances > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {fmt(totalCreances)}
                </div>
                <div className="text-xs text-slate-400 mt-1.5">DHS · {debtors.length} débiteur{debtors.length !== 1 ? 's' : ''}</div>
              </div>

              {/* Profit moyen / voyage */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Profit moyen / voyage</div>
                <div className={`text-2xl font-black leading-none ${profitMoyen >= 0 ? 'text-slate-800' : 'text-red-500'}`}>
                  {profitMoyen >= 0 ? '+' : ''}{fmt(profitMoyen)}
                </div>
                <div className="text-xs text-slate-400 mt-1.5">DHS · {monthVoyages.length} voyage{monthVoyages.length !== 1 ? 's' : ''}</div>
              </div>
            </div>

            {/* ── PROPRES VS LOUÉS ── */}
            {louesVoyages.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-2xl border shadow-sm p-4 ${profitPropres >= 0 ? 'bg-slate-50 border-slate-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Camions propres</div>
                  <div className={`text-2xl font-black leading-none ${profitPropres >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
                    {profitPropres >= 0 ? '+' : ''}{fmt(profitPropres)}
                  </div>
                  <div className="text-xs text-slate-400 mt-1.5">DHS · {propresVoyages.length} voyage{propresVoyages.length !== 1 ? 's' : ''}</div>
                </div>
                <div className={`rounded-2xl border shadow-sm p-4 ${profitLoues >= 0 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">🔑 Camions loués</div>
                  <div className={`text-2xl font-black leading-none ${profitLoues >= 0 ? 'text-amber-700' : 'text-red-600'}`}>
                    {profitLoues >= 0 ? '+' : ''}{fmt(profitLoues)}
                  </div>
                  <div className="text-xs text-amber-500 mt-1.5">DHS · {louesVoyages.length} voyage{louesVoyages.length !== 1 ? 's' : ''}</div>
                </div>
              </div>
            )}

            {/* ── DERNIERS VOYAGES ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                <span className="font-bold text-slate-700 text-sm">Derniers voyages</span>
                <Link href="/voyages" className="text-xs text-blue-500 font-semibold hover:underline">Tous les voyages →</Link>
              </div>
              {recentVoyages.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  <Link href="/voyages" className="text-blue-500 font-semibold">Créer un premier voyage →</Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-5 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Voyage</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden md:table-cell">Client</th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Revenu</th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden md:table-cell">Coût</th>
                        <th className="text-right px-5 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {recentVoyages.map(v => {
                        const { revenu, cout, profit } = voyageProfit(v.id)
                        const hasData = revenu > 0 || cout > 0
                        return (
                          <tr
                            key={v.id}
                            onClick={() => router.push(`/voyages/${v.id}`)}
                            className="hover:bg-slate-50 cursor-pointer transition"
                          >
                            <td className="px-5 py-3">
                              <div className="font-bold text-slate-800">{v.reference || `#${v.id}`}</div>
                              <div className="text-[10px] text-slate-400">{fmtDate(v.date_depart)} · {v.camion_plaque}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-600 text-sm hidden md:table-cell">{voyageClient(v.id)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-700">
                              {revenu > 0 ? fmt(revenu) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-500 hidden md:table-cell">
                              {cout > 0 ? fmt(cout) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-5 py-3 text-right">
                              {hasData ? (
                                <span className={`font-black ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {profit >= 0 ? '+' : ''}{fmt(profit)}
                                </span>
                              ) : (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  v.statut === 'termine'
                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                    : 'bg-amber-50 text-amber-500 border-amber-200'
                                }`}>
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

            {/* ── TOP VOYAGES + CLIENT ALERTS ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Top voyages du mois */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                  <span className="font-bold text-slate-700 text-sm">Top voyages — {monthName}</span>
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    {topVoyages.length} rentable{topVoyages.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {topVoyages.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-sm">
                    Aucun voyage rentable ce mois
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {topVoyages.map((v, i) => (
                      <div
                        key={v.id}
                        onClick={() => router.push(`/voyages/${v.id}`)}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition cursor-pointer"
                      >
                        <span className={`text-sm font-black w-5 text-center flex-shrink-0 ${i === 0 ? 'text-amber-500' : 'text-slate-300'}`}>
                          #{i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-slate-800 text-sm truncate">{v.reference || `Voyage #${v.id}`}</div>
                          <div className="text-[10px] text-slate-400">{fmtDate(v.date_depart)} · {voyageClient(v.id)}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-black text-emerald-600 text-sm">+{fmt(v.profit)}</div>
                          <div className="text-[10px] text-slate-400">DHS</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Alertes clients */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                  <span className="font-bold text-slate-700 text-sm">Alertes clients</span>
                  <Link href="/clients" className="text-xs text-blue-500 font-semibold hover:underline">Gérer →</Link>
                </div>
                {debtors.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                    <span className="text-2xl">✅</span>
                    <span>Aucune créance en cours</span>
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-slate-50">
                      {debtors.slice(0, 6).map(c => {
                        const isUrgent = (c.solde || 0) >= 100000
                        const isHigh   = (c.solde || 0) >= 50000
                        return (
                          <div
                            key={c.id}
                            className={`flex items-center justify-between px-5 py-3 ${isUrgent ? 'bg-red-50' : ''}`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                isUrgent ? 'bg-red-500' : isHigh ? 'bg-amber-400' : 'bg-slate-200'
                              }`} />
                              <span className={`text-sm font-semibold truncate ${isUrgent ? 'text-red-700' : 'text-slate-700'}`}>
                                {c.nom}
                              </span>
                            </div>
                            <span className={`font-black text-sm flex-shrink-0 ml-3 ${
                              isUrgent ? 'text-red-600' : isHigh ? 'text-amber-500' : 'text-slate-600'
                            }`}>
                              {fmt(c.solde)} DHS
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    {debtors.length > 6 && (
                      <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-center">
                        <Link href="/clients" className="text-xs text-slate-500 hover:text-blue-500 font-semibold transition">
                          +{debtors.length - 6} autres clients →
                        </Link>
                      </div>
                    )}
                    <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total créances</span>
                      <span className="font-black text-sm text-red-500">{fmt(totalCreances)} DHS</span>
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
                  <span className="font-bold text-red-700 text-sm">Voyages à perte — {monthName}</span>
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
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                  <span className="font-bold text-slate-700 text-sm">Performance camions — {monthName}</span>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    {camions.length} camion{camions.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-5 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Camion</th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Voyages</th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden md:table-cell">Revenu total</th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Profit total</th>
                        <th className="text-right px-5 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Moy. / voyage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {camions.map(c => (
                        <tr key={c.plaque} className="hover:bg-slate-50 transition">
                          <td className="px-5 py-3">
                            <span className="font-bold text-slate-800">{c.plaque}</span>
                            {c.type_camion === 'loue' && <span className="ml-1.5 text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">LOUÉ</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600 font-semibold">{c.voyages}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-600 hidden md:table-cell">{fmt(c.revenu)}</td>
                          <td className={`px-4 py-3 text-right font-bold ${c.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {c.profit >= 0 ? '+' : ''}{fmt(c.profit)}
                          </td>
                          <td className={`px-5 py-3 text-right font-black ${c.avg >= 0 ? 'text-slate-800' : 'text-red-500'}`}>
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
