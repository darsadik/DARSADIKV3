import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import Link from 'next/link'
import { fmtMoney, fmtDate, today } from '../../lib/utils'

export default function Loueurs() {
  useAuth()
  const [loueurs,    setLoueurs]    = useState([])
  const [locations,  setLocations]  = useState([])  // all voyage_locations
  const [voyages,    setVoyages]    = useState([])
  const [camions,    setCamions]    = useState([])
  const [selected,   setSelected]   = useState(null) // loueur id
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')

  // Payment modal
  const [showPay,    setShowPay]    = useState(false)
  const [payForm,    setPayForm]    = useState({ location_id: '', montant: '', note: '' })
  const [savingPay,  setSavingPay]  = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: lo }, { data: loc }, { data: v }, { data: ca }] = await Promise.all([
      supabase.from('loueurs').select('*').order('nom'),
      supabase.from('voyage_locations').select('*, voyages(date_depart, camion_plaque, destination, reference)').order('created_at', { ascending: false }),
      supabase.from('voyages').select('id,date_depart,camion_plaque,camion_id,destination,reference'),
      supabase.from('camions').select('id,plaque,type_camion,loueur_id').eq('type_camion', 'loue'),
    ])
    setLoueurs(lo || [])
    setLocations(loc || [])
    setVoyages(v || [])
    setCamions(ca || [])
    setLoading(false)
    if (!selected && lo?.length > 0) setSelected(lo[0].id)
  }

  const filtered = search
    ? loueurs.filter(l => l.nom.toLowerCase().includes(search.toLowerCase()))
    : loueurs

  function loueurStats(lid) {
    const locs = locations.filter(l => l.loueur_id === lid)
    const totalLocation = locs.reduce((s, l) => s + (l.montant_location || 0), 0)
    const totalPaye     = locs.reduce((s, l) => s + (l.montant_paye || 0), 0)
    const totalReste    = totalLocation - totalPaye
    return { totalLocation, totalPaye, totalReste, nbVoyages: locs.length }
  }

  const sel      = loueurs.find(l => l.id === selected)
  const selLocs  = locations.filter(l => l.loueur_id === selected)
  const selCams  = camions.filter(c => c.loueur_id === selected)
  const stats    = selected ? loueurStats(selected) : null

  async function payLocation(loc) {
    setPayForm({ location_id: loc.id, montant: String(loc.reste || 0), note: '' })
    setShowPay(true)
  }

  async function savePayment(e) {
    e.preventDefault()
    setSavingPay(true)
    const loc = locations.find(l => l.id === parseInt(payForm.location_id))
    if (!loc) { setSavingPay(false); return }
    const montantAdd = parseFloat(payForm.montant) || 0
    const newPaye    = (loc.montant_paye || 0) + montantAdd
    const newReste   = Math.max(0, (loc.montant_location || 0) - newPaye)
    await supabase.from('voyage_locations').update({
      montant_paye: newPaye,
      reste: newReste,
    }).eq('id', loc.id)
    setSavingPay(false)
    setShowPay(false)
    loadAll()
  }

  return (
    <Layout title="Loueurs" subtitle="Gestion des propriétaires de camions loués et des locations">
      <div className="flex flex-col md:flex-row gap-4 h-full">

        {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
        <div className="w-full md:w-72 flex-shrink-0 space-y-2">
          <input
            className="input w-full text-sm"
            placeholder="🔍 Rechercher un loueur..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {loading && <div className="text-center py-6 text-slate-400 text-sm">Chargement...</div>}

          {filtered.map(l => {
            const { totalReste, nbVoyages } = loueurStats(l.id)
            const isSel = l.id === selected
            return (
              <button key={l.id} onClick={() => setSelected(l.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                  isSel ? 'bg-amber-600 border-amber-600 text-white shadow-md' : 'bg-white border-slate-100 hover:border-amber-300 hover:bg-amber-50'
                }`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className={`font-bold text-sm ${isSel ? 'text-white' : 'text-slate-800'}`}>{l.nom}</div>
                    <div className={`text-[11px] mt-0.5 ${isSel ? 'text-amber-200' : 'text-slate-400'}`}>
                      {nbVoyages} voyage{nbVoyages !== 1 ? 's' : ''}
                    </div>
                  </div>
                  {totalReste > 0 && (
                    <div className={`text-xs font-bold px-2 py-1 rounded-lg ${isSel ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700'}`}>
                      −{fmtMoney(totalReste)}
                    </div>
                  )}
                  {totalReste === 0 && nbVoyages > 0 && (
                    <div className={`text-xs font-bold px-2 py-1 rounded-lg ${isSel ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                      ✓ Soldé
                    </div>
                  )}
                </div>
              </button>
            )
          })}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <div className="text-3xl mb-2">🔑</div>
              <div className="text-sm">Aucun loueur trouvé</div>
              <Link href="/parametres" className="text-xs text-blue-500 hover:underline mt-1 block">
                Ajouter dans Paramètres →
              </Link>
            </div>
          )}
        </div>

        {/* ── RIGHT DETAIL ─────────────────────────────────────────────────── */}
        {sel ? (
          <div className="flex-1 min-w-0 space-y-4">

            {/* Header card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-2xl">🔑</span>
                    <h2 className="text-xl font-black text-slate-800">{sel.nom}</h2>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-500 mt-2">
                    {sel.telephone && <span>📞 {sel.telephone}</span>}
                    {sel.cin       && <span>🪪 {sel.cin}</span>}
                    {sel.rib       && <span>🏦 {sel.rib}</span>}
                  </div>
                  {sel.note && <div className="text-xs text-slate-400 mt-2">{sel.note}</div>}
                </div>
                <Link href="/parametres" className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1 transition">
                  ✏️ Modifier
                </Link>
              </div>

              {/* Camions of this loueur */}
              {selCams.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Camions loués</div>
                  <div className="flex flex-wrap gap-2">
                    {selCams.map(c => (
                      <span key={c.id} className="text-xs font-bold bg-amber-100 text-amber-700 px-3 py-1 rounded-full">
                        🚛 {c.plaque}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* KPI cards */}
            {stats && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Total locations</div>
                  <div className="text-xl font-black text-slate-800">{fmtMoney(stats.totalLocation)} <span className="text-xs font-normal text-slate-400">DHS</span></div>
                  <div className="text-[10px] text-slate-400 mt-1">{stats.nbVoyages} voyage{stats.nbVoyages !== 1 ? 's' : ''}</div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Montant payé</div>
                  <div className="text-xl font-black text-emerald-600">{fmtMoney(stats.totalPaye)} <span className="text-xs font-normal text-slate-400">DHS</span></div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Reste à payer</div>
                  <div className={`text-xl font-black ${stats.totalReste > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {stats.totalReste > 0 ? fmtMoney(stats.totalReste) : '✓ Soldé'}
                    {stats.totalReste > 0 && <span className="text-xs font-normal text-slate-400"> DHS</span>}
                  </div>
                </div>
              </div>
            )}

            {/* Location history table */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-700 text-sm">Historique des locations</h3>
                <span className="text-xs text-slate-400">{selLocs.length} entrée{selLocs.length !== 1 ? 's' : ''}</span>
              </div>

              {selLocs.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  <div className="text-2xl mb-2">📋</div>
                  Aucune location enregistrée pour ce loueur
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="py-2.5 px-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-left">Date</th>
                        <th className="py-2.5 px-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-left">Voyage</th>
                        <th className="py-2.5 px-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-left">Camion</th>
                        <th className="py-2.5 px-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Montant location</th>
                        <th className="py-2.5 px-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Payé</th>
                        <th className="py-2.5 px-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Reste</th>
                        <th className="py-2.5 px-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selLocs.map(loc => {
                        const v = loc.voyages
                        const reste = (loc.montant_location || 0) - (loc.montant_paye || 0)
                        return (
                          <tr key={loc.id} className="border-t border-slate-50 hover:bg-slate-50 transition">
                            <td className="py-3 px-4 text-sm text-slate-600">{fmtDate(v?.date_depart)}</td>
                            <td className="py-3 px-4">
                              <Link href={`/voyages/${loc.voyage_id}`}
                                className="text-blue-600 hover:underline text-sm font-semibold">
                                #{loc.voyage_id} {v?.destination ? `→ ${v.destination}` : ''}
                              </Link>
                              {v?.reference && <div className="text-xs text-slate-400">{v.reference}</div>}
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-600">{v?.camion_plaque || '—'}</td>
                            <td className="py-3 px-4 text-right font-bold text-slate-800">{fmtMoney(loc.montant_location)} DHS</td>
                            <td className="py-3 px-4 text-right font-semibold text-emerald-600">{fmtMoney(loc.montant_paye)} DHS</td>
                            <td className="py-3 px-4 text-right">
                              <span className={`font-bold text-sm ${reste > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                {reste > 0 ? `${fmtMoney(reste)} DHS` : '✓'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {reste > 0 && (
                                <button onClick={() => payLocation(loc)}
                                  className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-emerald-700 transition">
                                  💰 Payer
                                </button>
                              )}
                              {reste <= 0 && (
                                <span className="text-xs text-emerald-500 font-semibold">Soldé</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>

                    {/* Totals */}
                    <tfoot>
                      <tr className="bg-gradient-to-r from-slate-800 to-slate-900 text-white">
                        <td colSpan={3} className="py-3 px-4 font-black text-sm uppercase tracking-wide">Total</td>
                        <td className="py-3 px-4 text-right font-black text-amber-300">{fmtMoney(stats?.totalLocation || 0)} DHS</td>
                        <td className="py-3 px-4 text-right font-black text-emerald-400">{fmtMoney(stats?.totalPaye || 0)} DHS</td>
                        <td className={`py-3 px-4 text-right font-black text-lg ${(stats?.totalReste || 0) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {(stats?.totalReste || 0) > 0 ? `${fmtMoney(stats?.totalReste)} DHS` : '✓ Soldé'}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <div className="text-4xl mb-3">🔑</div>
              <div className="font-semibold">Sélectionnez un loueur</div>
              <div className="text-sm mt-1 text-slate-300">pour voir son historique de locations</div>
            </div>
          </div>
        )}
      </div>

      {/* ── PAYMENT MODAL ─────────────────────────────────────────────────── */}
      {showPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowPay(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">💰</span>
                <h3 className="font-black text-slate-800">Enregistrer un paiement</h3>
              </div>
              <p className="text-xs text-slate-400">Paiement pour {sel?.nom}</p>
            </div>
            <form onSubmit={savePayment} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Montant payé (DHS)</label>
                <input
                  type="number" step="0.01" min="0"
                  className="input w-full text-lg font-bold"
                  value={payForm.montant}
                  onChange={e => setPayForm({...payForm, montant: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Note (optionnel)</label>
                <input
                  className="input w-full"
                  placeholder="ex: chèque #123, espèces..."
                  value={payForm.note}
                  onChange={e => setPayForm({...payForm, note: e.target.value})}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowPay(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition">
                  Annuler
                </button>
                <button type="submit" disabled={savingPay}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition">
                  {savingPay ? '...' : '✓ Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
