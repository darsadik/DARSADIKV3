import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import Link from 'next/link'

const fmt     = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtDate = d => { if (!d) return '—'; const [y,m,j] = d.split('-'); return `${j}/${m}/${y}` }
const fmtTs   = ts => { if (!ts) return '—'; const d = new Date(ts); return d.toLocaleDateString('fr-MA') + ' ' + d.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' }) }

const SUPER_ADMIN = 'abdelhafidbaadi@gmail.com'

export default function VoyagesArchives() {
  const { user } = useAuth()

  const [voyages,    setVoyages]    = useState([])
  const [livraisons, setLivraisons] = useState([])
  const [achats,     setAchats]     = useState([])
  const [charges,    setCharges]    = useState([])
  const [gasoilData, setGasoilData] = useState([])
  const [retours,    setRetours]    = useState([])

  const [loading,     setLoading]     = useState(true)
  const [restoring,   setRestoring]   = useState(null)  // voyage id being restored
  const [deleting,    setDeleting]    = useState(null)   // voyage id being permanently deleted
  const [confirmDel,  setConfirmDel]  = useState(null)   // voyage object to confirm permanent delete

  const isAdmin = user?.email === SUPER_ADMIN

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    // Load all voyages that have been soft-deleted
    const [
      { data: v },
      { data: li },
      { data: ac },
      { data: ch },
      { data: ga },
      { data: re },
    ] = await Promise.all([
      supabase.from('voyages').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('voyage_livraisons').select('voyage_id,total_vente,qte,client_nom,type_produit'),
      supabase.from('voyage_achats').select('voyage_id,total_achat,qte,prix_achat'),
      supabase.from('voyage_charges').select('voyage_id,montant,facture_client'),
      supabase.from('voyage_gasoil').select('voyage_id,total'),
      supabase.from('voyage_retours').select('voyage_id,montant,montant_paye'),
    ])
    setVoyages(v || [])
    setLivraisons(li || [])
    setAchats(ac || [])
    setCharges(ch || [])
    setGasoilData(ga || [])
    setRetours(re || [])
    setLoading(false)
  }

  function voyageStats(vid) {
    const myLivs = livraisons.filter(l => l.voyage_id === vid)
    const myAcs  = achats.filter(a => a.voyage_id === vid)
    const myChgs = charges.filter(c => c.voyage_id === vid)
    const myGas  = gasoilData.filter(g => g.voyage_id === vid)
    const myRets = retours.filter(r => r.voyage_id === vid)

    const revenu  = myLivs.reduce((s,l) => s+(l.total_vente||0), 0)
      + myRets.reduce((s,r) => s+(r.montant||0), 0)
      + myChgs.filter(c=>c.facture_client).reduce((s,c) => s+(c.montant||0), 0)
    const cout    = myAcs.reduce((s,a) => s+(a.total_achat||(a.qte||0)*(a.prix_achat||0)), 0)
      + myGas.reduce((s,g) => s+(g.total||0), 0)
      + myChgs.filter(c=>!c.facture_client).reduce((s,c) => s+(c.montant||0), 0)

    return {
      nbLivs:    myLivs.length,
      nbAchats:  myAcs.length,
      nbCharges: myChgs.length,
      nbGasoil:  myGas.length,
      nbRetours: myRets.length,
      revenu, cout, profit: revenu - cout,
    }
  }

  async function restoreVoyage(v) {
    setRestoring(v.id)
    const { error } = await supabase
      .from('voyages')
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', v.id)
    setRestoring(null)
    if (error) { alert('Erreur restauration: ' + error.message); return }
    loadAll()
  }

  async function permanentDelete(v) {
    setDeleting(v.id)
    setConfirmDel(null)
    const { error } = await supabase.rpc('delete_voyage', { p_voyage_id: v.id })
    setDeleting(null)
    if (error) { alert('Erreur suppression: ' + error.message); return }
    loadAll()
  }

  if (!isAdmin) {
    return (
      <Layout title="Archives Voyages" subtitle="Accès restreint">
        <div className="max-w-lg mx-auto py-20 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="font-black text-slate-800 text-xl mb-2">Accès administrateur requis</h2>
          <p className="text-slate-500 text-sm mb-6">Cette page est réservée aux administrateurs.</p>
          <Link href="/voyages" className="text-blue-600 font-semibold text-sm hover:underline">← Retour aux voyages</Link>
        </div>
      </Layout>
    )
  }

  return (
    <Layout title="Archives Voyages" subtitle="Voyages archivés — restauration et suppression définitive">

      {/* Permanent delete confirmation modal */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setConfirmDel(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">⚠️</span>
              <div>
                <h3 className="font-black text-slate-800">Suppression définitive</h3>
                <p className="text-xs text-slate-500 mt-0.5">Cette action est irréversible</p>
              </div>
            </div>

            {(() => {
              const s = voyageStats(confirmDel.id)
              return (
                <>
                  <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-4 space-y-2">
                    <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <span>🚛</span>
                      {confirmDel.camion_plaque} — {fmtDate(confirmDel.date_depart)}
                      {confirmDel.destination && <span className="text-slate-500 font-normal">→ {confirmDel.destination}</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center">
                        <div className="font-black text-slate-700">{s.nbLivs + s.nbAchats + s.nbCharges + s.nbGasoil + s.nbRetours}</div>
                        <div className="text-slate-400">enreg. supprimés</div>
                      </div>
                      <div className="text-center">
                        <div className="font-black text-emerald-600">{fmt(s.revenu)}</div>
                        <div className="text-slate-400">DHS revenu</div>
                      </div>
                      <div className="text-center">
                        <div className={`font-black ${s.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {s.profit >= 0 ? '+' : ''}{fmt(s.profit)}
                        </div>
                        <div className="text-slate-400">DHS profit</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700 mb-5">
                    <span className="font-bold">Attention :</span> La suppression définitive efface toutes les données (livraisons, achats, gasoil, charges, retours) et corrige les soldes clients via la procédure <code>delete_voyage</code>.
                  </div>
                </>
              )
            })()}

            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDel(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">
                Annuler
              </button>
              <button onClick={() => permanentDelete(confirmDel)}
                className="bg-red-600 text-white px-5 py-2 rounded-xl font-bold text-sm hover:bg-red-700 transition">
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-4">

        {/* Header bar */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <Link href="/voyages" className="text-xs text-blue-500 hover:text-blue-700 font-semibold">
              ← Retour aux voyages
            </Link>
            {!loading && (
              <span className="ml-3 text-sm text-slate-500 font-medium">
                {voyages.length} voyage{voyages.length !== 1 ? 's' : ''} archivé{voyages.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
            <span>🔑</span>
            <span>Admin — {user?.email}</span>
          </div>
        </div>

        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3 text-xs text-blue-700 leading-relaxed">
          <span className="font-bold">Archives :</span> Ces voyages ont été archivés (soft delete). Leurs données (livraisons, achats, soldes) sont toujours intactes.
          Vous pouvez les <span className="font-bold">restaurer</span> pour les remettre dans la liste normale, ou les <span className="font-bold">supprimer définitivement</span> pour effacer toutes les données liées et corriger les soldes.
        </div>

        {loading && (
          <div className="text-center py-20 text-slate-400 animate-pulse">Chargement des archives...</div>
        )}

        {!loading && voyages.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm text-center py-20">
            <div className="text-5xl mb-3">🗄️</div>
            <div className="font-bold text-slate-600 text-base">Aucun voyage archivé</div>
            <p className="text-slate-400 text-sm mt-1">Les voyages que vous archivez depuis la liste apparaîtront ici.</p>
          </div>
        )}

        {!loading && voyages.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="py-2.5 px-4 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Voyage</th>
                    <th className="py-2.5 px-3 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Données</th>
                    <th className="py-2.5 px-3 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Revenu</th>
                    <th className="py-2.5 px-3 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Profit</th>
                    <th className="py-2.5 px-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Archivé par</th>
                    <th className="py-2.5 px-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Le</th>
                    <th className="py-2.5 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {voyages.map(v => {
                    const s = voyageStats(v.id)
                    const isRestoring = restoring === v.id
                    const isDeleting  = deleting  === v.id
                    return (
                      <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800">{v.camion_plaque || `#${v.id}`}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {fmtDate(v.date_depart)}
                            {v.chauffeur && ` · ${v.chauffeur}`}
                            {v.destination && ` → ${v.destination}`}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            {s.nbLivs > 0    && <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">{s.nbLivs}L</span>}
                            {s.nbAchats > 0  && <span className="bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-bold">{s.nbAchats}A</span>}
                            {s.nbCharges > 0 && <span className="bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-full font-bold">{s.nbCharges}C</span>}
                            {s.nbGasoil > 0  && <span className="bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full font-bold">{s.nbGasoil}G</span>}
                            {s.nbRetours > 0 && <span className="bg-teal-50 text-teal-600 px-1.5 py-0.5 rounded-full font-bold">{s.nbRetours}R</span>}
                            {(s.nbLivs + s.nbAchats + s.nbCharges + s.nbGasoil + s.nbRetours) === 0 && (
                              <span className="text-slate-300">—</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-600 whitespace-nowrap">
                          {fmt(s.revenu)} DHS
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <span className={`font-black ${s.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {s.profit >= 0 ? '+' : ''}{fmt(s.profit)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-500 max-w-[120px] truncate">
                          {v.deleted_by || '—'}
                        </td>
                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                          {fmtTs(v.deleted_at)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <button
                              onClick={() => restoreVoyage(v)}
                              disabled={isRestoring || isDeleting}
                              className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded-lg font-bold text-[10px] transition disabled:opacity-40 flex items-center gap-1">
                              {isRestoring ? <span className="animate-spin">⌛</span> : '↩️'}
                              {isRestoring ? 'Restauration...' : 'Restaurer'}
                            </button>
                            <button
                              onClick={() => setConfirmDel(v)}
                              disabled={isRestoring || isDeleting}
                              className="bg-red-50 text-red-500 hover:bg-red-100 px-3 py-1.5 rounded-lg font-bold text-[10px] transition disabled:opacity-40 flex items-center gap-1">
                              {isDeleting ? <span className="animate-spin">⌛</span> : '🗑️'}
                              {isDeleting ? 'Suppression...' : 'Supprimer'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
