import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import Link from 'next/link'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtDate = d => { if (!d) return '—'; const [y,m,j] = d.split('-'); return `${j}/${m}/${y}` }
const today = () => new Date().toISOString().split('T')[0]
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

function StatusBadge({ statut }) {
  const map = {
    en_cours: { label: 'En cours', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
    termine:  { label: 'Terminé',  cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    annule:   { label: 'Annulé',   cls: 'bg-red-50 text-red-500 border-red-200' },
  }
  const s = map[statut] || map.en_cours
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
}

function ProfitBadge({ profit }) {
  if (profit === null || profit === undefined) return <span className="text-slate-300 text-xs">—</span>
  const pos = profit >= 0
  return (
    <span className={`font-bold text-sm ${pos ? 'text-emerald-600' : 'text-red-500'}`}>
      {pos ? '+' : ''}{fmt(profit)} DHS
    </span>
  )
}

export default function Voyages() {
  const { user } = useAuth()
  const [voyages, setVoyages] = useState([])
  const [camions, setCamions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg] = useState('')
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo, setFilterTo] = useState(today())
  const [filterCamion, setFilterCamion] = useState('')
  const [filterStatut, setFilterStatut] = useState('')
  const [profitsMap, setProfitsMap] = useState({})

  const [form, setForm] = useState({
    date_depart: today(),
    camion_id: '',
    destination: '',
    note: '',
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: v }, { data: ca }] = await Promise.all([
      supabase.from('voyages').select('*').order('date_depart', { ascending: false }),
      supabase.from('camions').select('*').order('plaque'),
    ])
    setVoyages(v || [])
    setCamions(ca || [])
    // Load profits for all voyages
    if (v && v.length > 0) {
      await loadProfits(v.map(x => x.id))
    }
    setLoading(false)
  }

  async function loadProfits(ids) {
    if (!ids.length) return
    const [
      { data: livs },
      { data: rets },
      { data: gas },
      { data: chgs },
      { data: acs },
    ] = await Promise.all([
      supabase.from('voyage_livraisons').select('voyage_id,total_vente,client_id').in('voyage_id', ids),
      supabase.from('voyage_retours').select('voyage_id,montant_paye').in('voyage_id', ids),
      supabase.from('voyage_gasoil').select('voyage_id,total').in('voyage_id', ids),
      supabase.from('voyage_charges').select('voyage_id,montant,facture_client').in('voyage_id', ids),
      supabase.from('voyage_achats').select('voyage_id,total_achat,qte,prix_achat').in('voyage_id', ids),
    ])

    const map = {}
    ids.forEach(id => {
      const myLivs = (livs || []).filter(l => l.voyage_id === id)
      const myRets = (rets || []).filter(r => r.voyage_id === id)
      const myGas  = (gas  || []).filter(g => g.voyage_id === id)
      const myChgs = (chgs || []).filter(c => c.voyage_id === id)
      const myAcs  = (acs  || []).filter(a => a.voyage_id === id)

      const revenuLivraisons = myLivs.reduce((s, l) => s + (l.total_vente || 0), 0)
      const revenuRetours    = myRets.reduce((s, r) => s + (r.montant_paye || 0), 0)
      const chargesClient    = myChgs.filter(c => c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)
      const revenuBrut       = revenuLivraisons + revenuRetours + chargesClient

      const coutAchat   = myAcs.reduce((s, a) => s + (a.total_achat || (a.qte||0)*(a.prix_achat||0)), 0)
      const coutGasoil  = myGas.reduce((s, g) => s + (g.total || 0), 0)
      const coutCharges = myChgs.filter(c => !c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)
      const coutTotal   = coutAchat + coutGasoil + coutCharges

      map[id] = {
        revenu: revenuBrut,
        cout: coutTotal,
        profit: revenuBrut - coutTotal,
        nbClients: new Set(myLivs.map(l => l.client_id)).size,
      }
    })
    setProfitsMap(map)
  }

  async function createVoyage(e) {
    e.preventDefault()
    if (!form.camion_id) { setMsg('❌ Sélectionner un camion'); return }
    setSaving(true)
    const camion = camions.find(c => c.id === parseInt(form.camion_id))
    const { data, error } = await supabase.from('voyages').insert({
      date_depart: form.date_depart,
      camion_id: parseInt(form.camion_id),
      camion_plaque: camion?.plaque || '',
      chauffeur: camion?.chauffeur || '',
      destination: form.destination || null,
      note: form.note || null,
      statut: 'en_cours',
    }).select().single()

    setSaving(false)
    if (error) { setMsg('❌ ' + error.message); return }
    setShowForm(false)
    setForm({ date_depart: today(), camion_id: '', destination: '', note: '' })
    // Redirect to voyage detail
    window.location.href = `/voyages/${data.id}`
  }

  const filtered = voyages.filter(v => {
    if (filterFrom && v.date_depart < filterFrom) return false
    if (filterTo   && v.date_depart > filterTo)   return false
    if (filterCamion && v.camion_id !== parseInt(filterCamion)) return false
    if (filterStatut && v.statut !== filterStatut) return false
    return true
  })

  const totalRevenu = filtered.reduce((s, v) => s + (profitsMap[v.id]?.revenu || 0), 0)
  const totalProfit = filtered.reduce((s, v) => s + (profitsMap[v.id]?.profit || 0), 0)
  const totalCout   = filtered.reduce((s, v) => s + (profitsMap[v.id]?.cout   || 0), 0)

  return (
    <Layout title="Voyages" subtitle="Gestion des trajets & rentabilité">
      <div className="space-y-4 max-w-5xl mx-auto">

        {/* KPI Bar */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Revenus</div>
            <div className="text-xl font-black text-slate-800">{fmt(totalRevenu)} <span className="text-xs font-normal text-slate-400">DHS</span></div>
            <div className="text-[10px] text-slate-300">{filtered.length} voyages</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Coûts</div>
            <div className="text-xl font-black text-red-500">{fmt(totalCout)} <span className="text-xs font-normal text-slate-400">DHS</span></div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Profit net</div>
            <div className={`text-xl font-black ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(totalProfit)} <span className="text-xs font-normal text-slate-400">DHS</span></div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2 flex-wrap">
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
              className="input text-sm px-3 py-1.5 rounded-xl border border-slate-200 bg-white" />
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
              className="input text-sm px-3 py-1.5 rounded-xl border border-slate-200 bg-white" />
            <select value={filterCamion} onChange={e => setFilterCamion(e.target.value)}
              className="input text-sm px-3 py-1.5 rounded-xl border border-slate-200 bg-white">
              <option value="">Tous camions</option>
              {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}</option>)}
            </select>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}
              className="input text-sm px-3 py-1.5 rounded-xl border border-slate-200 bg-white">
              <option value="">Tous statuts</option>
              <option value="en_cours">En cours</option>
              <option value="termine">Terminé</option>
            </select>
          </div>
          <button onClick={() => setShowForm(true)}
            className="btn bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 transition flex items-center gap-2 whitespace-nowrap">
            <span className="text-base">🚛</span> Nouveau voyage
          </button>
        </div>

        {/* New Voyage Form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-blue-100 shadow-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">🚛 Nouveau Voyage</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <form onSubmit={createVoyage} className="grid grid-cols-2 gap-4">
              <div>
                <label className="label text-xs text-slate-500 font-semibold mb-1 block">Date départ</label>
                <input type="date" value={form.date_depart} onChange={e => setForm({...form, date_depart: e.target.value})}
                  className="input w-full" required />
              </div>
              <div>
                <label className="label text-xs text-slate-500 font-semibold mb-1 block">Camion *</label>
                <select value={form.camion_id} onChange={e => setForm({...form, camion_id: e.target.value})}
                  className="input w-full" required>
                  <option value="">— Sélectionner —</option>
                  {camions.map(c => <option key={c.id} value={c.id}>{c.plaque} {c.chauffeur ? `— ${c.chauffeur}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs text-slate-500 font-semibold mb-1 block">Destination</label>
                <input type="text" value={form.destination} onChange={e => setForm({...form, destination: e.target.value})}
                  className="input w-full" placeholder="Ex: Oujda, Nador..." />
              </div>
              <div>
                <label className="label text-xs text-slate-500 font-semibold mb-1 block">Note</label>
                <input type="text" value={form.note} onChange={e => setForm({...form, note: e.target.value})}
                  className="input w-full" placeholder="Optionnel..." />
              </div>
              {msg && <div className="col-span-2 text-sm text-red-500 font-semibold">{msg}</div>}
              <div className="col-span-2 flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  className="btn bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 transition">
                  {saving ? '...' : '✅ Créer le voyage'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Voyages List */}
        {loading ? (
          <div className="text-center py-16 text-slate-400">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <div className="text-4xl mb-3">🚛</div>
            <div className="font-semibold">Aucun voyage trouvé</div>
            <div className="text-sm mt-1">Créez votre premier voyage</div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(v => {
              const p = profitsMap[v.id]
              return (
                <Link key={v.id} href={`/voyages/${v.id}`}>
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:border-blue-200 hover:shadow-md transition cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-xl">🚛</div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 text-sm">{v.reference || `Voyage #${v.id}`}</span>
                            <StatusBadge statut={v.statut} />
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {fmtDate(v.date_depart)} • <span className="font-semibold text-slate-700">{v.camion_plaque}</span>
                            {v.chauffeur && <span> • {v.chauffeur}</span>}
                            {v.destination && <span> → {v.destination}</span>}
                          </div>
                          {p && <div className="text-[10px] text-slate-400 mt-0.5">{p.nbClients} client{p.nbClients !== 1 ? 's' : ''}</div>}
                        </div>
                      </div>
                      <div className="text-right">
                        {p ? (
                          <>
                            <ProfitBadge profit={p.profit} />
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Rev: {fmt(p.revenu)} • Coût: {fmt(p.cout)}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-slate-300">Aucune donnée</span>
                        )}
                        <div className="text-blue-400 text-xs mt-1">Voir détails →</div>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
