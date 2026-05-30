import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from './_app'
import Link from 'next/link'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtDate = d => { if (!d) return '—'; const [y,m,j] = d.split('-'); return `${j}/${m}/${y}` }
const today = () => new Date().toISOString().split('T')[0]
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

export default function Dashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)

  // Data
  const [voyages,    setVoyages]    = useState([])
  const [livraisons, setLivraisons] = useState([])
  const [achatsVoy,  setAchatsVoy]  = useState([])
  const [gasoilVoy,  setGasoilVoy]  = useState([])
  const [chargesVoy, setChargesVoy] = useState([])
  const [retoursVoy, setRetoursVoy] = useState([])
  const [clients,    setClients]    = useState([])
  const [grignonCl,  setGrignonCl]  = useState([])
  const [gasoilAll,  setGasoilAll]  = useState([])

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const month = startOfMonth()
    const [
      { data: v },
      { data: li },
      { data: av },
      { data: gv },
      { data: cv },
      { data: rv },
      { data: cl },
      { data: gc },
      { data: ga },
    ] = await Promise.all([
      supabase.from('voyages').select('*').order('date_depart', { ascending: false }).limit(20),
      supabase.from('voyage_livraisons').select('voyage_id,total_vente,type_produit,client_id'),
      supabase.from('voyage_achats').select('voyage_id,total_achat,qte,prix_achat'),
      supabase.from('voyage_gasoil').select('voyage_id,total'),
      supabase.from('voyage_charges').select('voyage_id,montant,facture_client'),
      supabase.from('voyage_retours').select('voyage_id,montant,montant_paye,restant'),
      supabase.from('clients').select('id,nom,solde').order('solde', { ascending: false }),
      supabase.from('grignon_clients').select('id,nom,solde').order('solde', { ascending: false }),
      supabase.from('gasoil').select('total,date').gte('date', month).then(r => r).catch(() => ({ data: [] })),
    ])
    setVoyages(v || [])
    setLivraisons(li || [])
    setAchatsVoy(av || [])
    setGasoilVoy(gv || [])
    setChargesVoy(cv || [])
    setRetoursVoy(rv || [])
    setClients(cl || [])
    setGrignonCl(gc || [])
    setGasoilAll(ga || [])
    setLoading(false)
  }

  // ── Compute profit for a voyage ─────────────────────────────────────────────
  function voyageProfit(vid) {
    const li = livraisons.filter(l => l.voyage_id === vid)
    const ac = achatsVoy.filter(a => a.voyage_id === vid)
    const ga = gasoilVoy.filter(g => g.voyage_id === vid)
    const ch = chargesVoy.filter(c => c.voyage_id === vid)
    const re = retoursVoy.filter(r => r.voyage_id === vid)
    const revenu = li.reduce((s,l)=>s+(l.total_vente||0),0)
      + re.reduce((s,r)=>s+(r.montant||0),0)
      + ch.filter(c=>c.facture_client).reduce((s,c)=>s+(c.montant||0),0)
    const cout = ac.reduce((s,a)=>s+(a.total_achat||(a.qte||0)*(a.prix_achat||0)),0)
      + ga.reduce((s,g)=>s+(g.total||0),0)
      + ch.filter(c=>!c.facture_client).reduce((s,c)=>s+(c.montant||0),0)
    return { revenu, cout, profit: revenu - cout }
  }

  // ── Global KPIs (all voyages loaded = last 20) ──────────────────────────────
  const allIds   = voyages.map(v => v.id)
  const totRev   = allIds.reduce((s,id) => s + voyageProfit(id).revenu, 0)
  const totCout  = allIds.reduce((s,id) => s + voyageProfit(id).cout, 0)
  const totProfit = totRev - totCout
  const totGasoil = gasoilAll.reduce((s,g) => s+(g.total||0), 0)

  // ── Derived KPIs ────────────────────────────────────────────────────────────
  const voyagesEnCours = voyages.filter(v => v.statut === 'en_cours')
  const margePercent   = totRev > 0 ? Math.round(totProfit / totRev * 100) : 0

  // ── Client debts ────────────────────────────────────────────────────────────
  const totalDebt     = clients.reduce((s,c)=>s+(c.solde||0),0)
  const totalDebtGr   = grignonCl.reduce((s,c)=>s+(c.solde||0),0)
  const totalDebtAll  = totalDebt + totalDebtGr
  const nbDebtors     = clients.filter(c => (c.solde||0) > 0).length + grignonCl.filter(c => (c.solde||0) > 0).length
  const debtClients   = clients.filter(c => (c.solde||0) > 0).slice(0,5)
  const debtGrignon   = grignonCl.filter(c => (c.solde||0) > 0).slice(0,3)
  const urgentClients = clients.filter(c => (c.solde||0) >= 100000)

  // ── Recent voyages (last 5) ─────────────────────────────────────────────────
  const recentVoyages = voyages.slice(0, 5)

  return (
    <Layout title="Dashboard" subtitle="Vue d'ensemble">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* ── URGENT ALERT ── */}
        {urgentClients.length > 0 && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <span className="text-xl">🔴</span>
            <div>
              <div className="font-bold text-red-600 text-sm">{urgentClients.length} client(s) avec solde ≥ 100 000 DHS</div>
              <div className="text-red-400 text-xs mt-0.5">{urgentClients.map(c=>c.nom).join(' · ')}</div>
            </div>
            <Link href="/clients" className="ml-auto text-xs text-red-500 font-bold hover:underline">Voir →</Link>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-pulse">
            {[...Array(4)].map((_,i) => <div key={i} className="h-28 bg-slate-100 rounded-2xl"/>)}
          </div>
        ) : (
          <>
            {/* ── KPI ROW ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

              {/* Profit net */}
              <div className={`bg-white rounded-2xl border shadow-sm p-4 ${totProfit>=0?'border-emerald-100':'border-red-100'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Profit net</span>
                  <span className="text-lg">{totProfit>=0?'📈':'📉'}</span>
                </div>
                <div className={`text-xl font-black ${totProfit>=0?'text-emerald-600':'text-red-500'}`}>{fmt(totProfit)} DHS</div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${margePercent>=0?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-600'}`}>
                    {margePercent}% marge
                  </span>
                  <span className="text-[10px] text-slate-400">{voyages.length} voyages</span>
                </div>
              </div>

              {/* Créances totales */}
              <div className={`bg-white rounded-2xl border shadow-sm p-4 ${totalDebtAll>0?'border-red-100':'border-emerald-100'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Créances totales</span>
                  <span className="text-lg">💸</span>
                </div>
                <div className={`text-xl font-black ${totalDebtAll>0?'text-red-500':'text-emerald-600'}`}>{fmt(totalDebtAll)} DHS</div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {totalDebt > 0 && <span className="text-[10px] text-slate-400">🧱 {fmt(totalDebt)}</span>}
                  {totalDebtGr > 0 && <span className="text-[10px] text-slate-400">🫒 {fmt(totalDebtGr)}</span>}
                  {totalDebtAll === 0 && <span className="text-[10px] text-emerald-500 font-semibold">✓ Aucune créance</span>}
                  {nbDebtors > 0 && <span className="text-[10px] text-slate-400">· {nbDebtors} clients</span>}
                </div>
              </div>

              {/* Voyages actifs */}
              <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Voyages actifs</span>
                  <span className="text-lg">🚛</span>
                </div>
                <div className={`text-xl font-black ${voyagesEnCours.length>0?'text-amber-600':'text-slate-400'}`}>
                  {voyagesEnCours.length}
                  <span className="text-sm font-medium text-slate-400 ml-1">en cours</span>
                </div>
                <div className="mt-1.5">
                  <span className="text-[10px] text-slate-400">{voyages.length} chargés · {voyages.filter(v=>v.statut==='termine').length} terminés</span>
                </div>
              </div>

              {/* Gasoil ce mois */}
              <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Gasoil ce mois</span>
                  <span className="text-lg">⛽</span>
                </div>
                <div className="text-xl font-black text-orange-500">{fmt(totGasoil)} DHS</div>
                <div className="mt-1.5">
                  <span className="text-[10px] text-slate-400">
                    {gasoilAll.length} plein{gasoilAll.length!==1?'s':''} · {new Date().toLocaleDateString('fr-MA',{month:'long'})}
                  </span>
                </div>
              </div>

            </div>

            {/* ── SECONDARY STATS ── */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Revenu brut</div>
                <div className="text-base font-black text-slate-700">{fmt(totRev)} <span className="text-xs font-medium text-slate-400">DHS</span></div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Coût total</div>
                <div className="text-base font-black text-slate-500">{fmt(totCout)} <span className="text-xs font-medium text-slate-400">DHS</span></div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Clients débiteurs</div>
                <div className="text-base font-black text-slate-700">{nbDebtors} <span className="text-xs font-medium text-slate-400">client{nbDebtors!==1?'s':''}</span></div>
              </div>
            </div>

            {/* ── MAIN ROW: Voyages + Debts ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Recent voyages */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
                  <span className="font-bold text-slate-700 text-sm">🚛 Voyages récents</span>
                  <Link href="/voyages" className="text-xs text-blue-500 font-semibold hover:underline">Voir tous →</Link>
                </div>
                <div className="divide-y divide-slate-50">
                  {recentVoyages.length === 0 ? (
                    <div className="text-center py-8 text-slate-300 text-sm">
                      <Link href="/voyages" className="text-blue-500 font-semibold">Créer un voyage →</Link>
                    </div>
                  ) : recentVoyages.map(v => {
                    const { revenu, profit } = voyageProfit(v.id)
                    return (
                      <Link key={v.id} href={`/voyages/${v.id}`}>
                        <div className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition cursor-pointer">
                          <div>
                            <div className="font-bold text-slate-800 text-sm">{v.reference || `#${v.id}`}</div>
                            <div className="text-[10px] text-slate-400">{fmtDate(v.date_depart)} · {v.camion_plaque}{v.destination ? ' → '+v.destination : ''}</div>
                          </div>
                          <div className="text-right">
                            {revenu > 0 ? (
                              <>
                                <div className={`font-black text-sm ${profit>=0?'text-emerald-600':'text-red-500'}`}>
                                  {profit>=0?'+':''}{fmt(profit)} DHS
                                </div>
                                <div className="text-[10px] text-slate-400">Rev: {fmt(revenu)}</div>
                              </>
                            ) : (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                v.statut === 'termine' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-500 border-amber-200'
                              }`}>{v.statut === 'termine' ? 'Terminé' : 'En cours'}</span>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>

              {/* Client debts */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
                  <span className="font-bold text-slate-700 text-sm">💸 Créances clients</span>
                  <Link href="/clients" className="text-xs text-blue-500 font-semibold hover:underline">Gérer →</Link>
                </div>
                <div className="divide-y divide-slate-50">
                  {debtClients.length === 0 ? (
                    <div className="flex flex-col items-center py-8 text-slate-300">
                      <span className="text-3xl mb-1">✅</span>
                      <span className="text-sm">Aucune créance</span>
                    </div>
                  ) : debtClients.map(c => (
                    <div key={c.id} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm font-semibold text-slate-700">{c.nom}</span>
                      <span className={`font-black text-sm ${(c.solde||0)>=100000?'text-red-500':(c.solde||0)>=50000?'text-amber-500':'text-slate-600'}`}>
                        {fmt(c.solde)} DHS
                      </span>
                    </div>
                  ))}
                  {debtClients.length > 0 && (
                    <div className="flex justify-between px-4 py-2 bg-slate-50">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Total créances briques</span>
                      <span className="font-black text-sm text-red-500">{fmt(totalDebt)} DHS</span>
                    </div>
                  )}
                </div>

                {/* Grignon debts */}
                {debtGrignon.length > 0 && (
                  <>
                    <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">🫒 Créances grignon</span>
                      <span className="font-black text-sm text-orange-500">{fmt(totalDebtGr)} DHS</span>
                    </div>
                    {debtGrignon.map(c => (
                      <div key={c.id} className="flex items-center justify-between px-4 py-2 border-t border-slate-50">
                        <span className="text-xs font-semibold text-slate-600">{c.nom}</span>
                        <span className="font-bold text-xs text-orange-500">{fmt(c.solde)} DHS</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* ── QUICK LINKS ── */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {[
                { href: '/voyages',     icon: '🚛', label: 'Voyages' },
                { href: '/clients',     icon: '👥', label: 'Clients' },
                { href: '/paiements',   icon: '💰', label: 'Paiements' },
                { href: '/grignon',     icon: '🫒', label: 'Grignon' },
                { href: '/gasoil',      icon: '⛽', label: 'Gasoil' },
                { href: '/rentabilite', icon: '📈', label: 'Rentabilité' },
              ].map(l => (
                <Link key={l.href} href={l.href}>
                  <div className="bg-white border border-slate-100 rounded-2xl p-3 text-center hover:border-blue-200 hover:shadow-sm transition cursor-pointer">
                    <div className="text-2xl mb-1">{l.icon}</div>
                    <div className="text-[10px] font-bold text-slate-600">{l.label}</div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
