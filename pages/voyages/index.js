import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import Link from 'next/link'

// ── FORMATTERS ───────────────────────────────────────────────────────────────
const fmt     = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtDate = d => { if (!d) return '—'; const [y,m,j] = d.split('-'); return `${j}/${m}/${y}` }
const today        = () => new Date().toISOString().split('T')[0]
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }
const startOfWeek  = () => {
  const d = new Date()
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
  return `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}-${String(m.getDate()).padStart(2,'0')}`
}
const startOfYear = () => `${new Date().getFullYear()}-01-01`

// ── MINI COMPONENTS ──────────────────────────────────────────────────────────

function StatusBadge({ statut }) {
  const map = {
    en_cours: { label: 'En cours', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
    termine:  { label: 'Terminé',  cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    annule:   { label: 'Annulé',   cls: 'bg-red-50 text-red-500 border-red-200' },
  }
  const s = map[statut] || map.en_cours
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
}

function ProfitCell({ v }) {
  return (
    <span className={`font-black text-sm ${v >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
      {v >= 0 ? '+' : ''}{fmt(v)}
    </span>
  )
}

function MargeBadge({ m }) {
  const cls = m > 15 ? 'bg-emerald-50 text-emerald-700' : m > 0 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
  return <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${cls}`}>{m}%</span>
}

function ColH({ label, right, center }) {
  return (
    <th className={`py-2.5 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap
      ${right ? 'text-right' : center ? 'text-center' : 'text-left'}`}>
      {label}
    </th>
  )
}

function TotalRow({ cols }) {
  return (
    <tr className="bg-gradient-to-r from-slate-800 to-slate-900 text-white">
      {cols.map((c, i) => (
        <td key={i} className={`py-3 px-3 font-black text-sm ${c.right ? 'text-right' : c.center ? 'text-center' : ''} ${c.cls || ''}`}>
          {c.value}
        </td>
      ))}
    </tr>
  )
}

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function Voyages() {
  const { user } = useAuth()

  // ── DATA ──
  const [voyages,    setVoyages]    = useState([])
  const [achats,     setAchats]     = useState([])
  const [livraisons, setLivraisons] = useState([])
  const [retours,    setRetours]    = useState([])
  const [gasoilData, setGasoilData] = useState([])
  const [charges,    setCharges]    = useState([])
  const [camions,    setCamions]    = useState([])
  const [clients,    setClients]    = useState([])

  // ── UI ──
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [showForm,  setShowForm]  = useState(false)
  const [msg,       setMsg]       = useState('')
  const [tab,       setTab]       = useState('voyages')
  const [sortKey,   setSortKey]   = useState('date_depart')
  const [sortAsc,   setSortAsc]   = useState(false)

  // ── EDIT/DELETE VOYAGE ──
  const [editingVoyage, setEditingVoyage] = useState(null)
  const [editVoyageForm, setEditVoyageForm] = useState({})
  const [savingEditVoyage, setSavingEditVoyage] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  // ── FILTERS ──
  const [filterFrom,   setFilterFrom]   = useState(startOfMonth())
  const [filterTo,     setFilterTo]     = useState(today())
  const [filterCamion, setFilterCamion] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterStatut, setFilterStatut] = useState('')

  // ── FORM ──
  const [form, setForm] = useState({
    date_depart: today(), camion_id: '', destination: '', note: '',
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [
      { data: v },
      { data: ac },
      { data: li },
      { data: re },
      { data: ga },
      { data: ch },
      { data: ca },
      { data: cl },
    ] = await Promise.all([
      supabase.from('voyages').select('*').order('date_depart', { ascending: false }),
      supabase.from('voyage_achats').select('voyage_id,total_achat,qte,prix_achat'),
      supabase.from('voyage_livraisons').select('voyage_id,type_produit,client_id,client_nom,qte,total_vente,total_achat,prix_achat'),
      supabase.from('voyage_retours').select('voyage_id,montant_paye'),
      supabase.from('voyage_gasoil').select('voyage_id,total'),
      supabase.from('voyage_charges').select('voyage_id,montant,facture_client,client_id,client_nom'),
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('clients').select('id,nom').order('nom'),
    ])
    setVoyages(v || [])
    setAchats(ac || [])
    setLivraisons(li || [])
    setRetours(re || [])
    setGasoilData(ga || [])
    setCharges(ch || [])
    setCamions(ca || [])
    setClients(cl || [])
    setLoading(false)
  }

  // ── PROFIT FORMULA ────────────────────────────────────────────────────────
  function calc(vIds) {
    const myAcs  = achats.filter(a => vIds.includes(a.voyage_id))
    const myLivs = livraisons.filter(l => vIds.includes(l.voyage_id))
    const myGas  = gasoilData.filter(g => vIds.includes(g.voyage_id))
    const myChgs = charges.filter(c => vIds.includes(c.voyage_id))
    const myRets = retours.filter(r => vIds.includes(r.voyage_id))

    const revenuLivs  = myLivs.reduce((s, l) => s + (l.total_vente || 0), 0)
    const revenuRets  = myRets.reduce((s, r) => s + (r.montant_paye || 0), 0)
    const chgCli      = myChgs.filter(c => c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)
    const revenuBrut  = revenuLivs + revenuRets + chgCli

    const coutAchat   = myAcs.reduce((s, a) => s + (a.total_achat || (a.qte||0)*(a.prix_achat||0)), 0)
    const coutGasoil  = myGas.reduce((s, g) => s + (g.total || 0), 0)
    const coutCharges = myChgs.filter(c => !c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)
    const coutTotal   = coutAchat + coutGasoil + coutCharges
    const profit      = revenuBrut - coutTotal
    const marge       = revenuBrut > 0 ? Math.round(profit / revenuBrut * 100) : 0

    return { revenuBrut, coutAchat, coutGasoil, coutCharges, coutTotal, profit, marge }
  }

  // ── UPDATE VOYAGE ─────────────────────────────────────────────────────────
  async function updateVoyage() {
    setSavingEditVoyage(true)
    const camion = camions.find(c => c.id === parseInt(editVoyageForm.camion_id))
    await supabase.from('voyages').update({
      date_depart:   editVoyageForm.date_depart,
      camion_id:     parseInt(editVoyageForm.camion_id),
      camion_plaque: camion?.plaque || editVoyageForm.camion_plaque || '',
      chauffeur:     camion?.chauffeur || editVoyageForm.chauffeur || '',
      destination:   editVoyageForm.destination || null,
      note:          editVoyageForm.note || null,
      statut:        editVoyageForm.statut,
    }).eq('id', editingVoyage.id)
    setSavingEditVoyage(false)
    setEditingVoyage(null)
    loadAll()
  }

  // ── DELETE VOYAGE (CASCADE) ────────────────────────────────────────────────
  async function deleteVoyage(v) {
    if (!confirm(`Supprimer le voyage ${v.reference || '#'+v.id} et toutes ses données ?`)) return
    setDeletingId(v.id)
    await Promise.all([
      supabase.from('voyage_achats').delete().eq('voyage_id', v.id),
      supabase.from('voyage_livraisons').delete().eq('voyage_id', v.id),
      supabase.from('voyage_retours').delete().eq('voyage_id', v.id),
      supabase.from('voyage_gasoil').delete().eq('voyage_id', v.id),
      supabase.from('voyage_charges').delete().eq('voyage_id', v.id),
    ])
    await supabase.from('voyages').delete().eq('id', v.id)
    setDeletingId(null)
    loadAll()
  }

  // ── CREATE VOYAGE ─────────────────────────────────────────────────────────
  async function createVoyage(e) {
    e.preventDefault()
    if (!form.camion_id) { setMsg('❌ Sélectionner un camion'); return }
    setSaving(true)
    const camion = camions.find(c => c.id === parseInt(form.camion_id))
    const { data, error } = await supabase.from('voyages').insert({
      date_depart:   form.date_depart,
      camion_id:     parseInt(form.camion_id),
      camion_plaque: camion?.plaque || '',
      chauffeur:     camion?.chauffeur || '',
      destination:   form.destination || null,
      note:          form.note || null,
      statut:        'en_cours',
    }).select().single()
    setSaving(false)
    if (error) { setMsg('❌ ' + error.message); return }
    setShowForm(false)
    setForm({ date_depart: today(), camion_id: '', destination: '', note: '' })
    window.location.href = `/voyages/${data.id}`
  }

  // ── FILTERED VOYAGES ─────────────────────────────────────────────────────
  const filteredVoyages = voyages.filter(v => {
    if (filterFrom  && v.date_depart < filterFrom) return false
    if (filterTo    && v.date_depart > filterTo)   return false
    if (filterCamion && v.camion_id !== parseInt(filterCamion)) return false
    if (filterStatut && v.statut !== filterStatut) return false
    if (filterClient) {
      const has = livraisons.some(l => l.voyage_id === v.id && l.client_id === parseInt(filterClient))
      if (!has) return false
    }
    return true
  })
  const filteredIds = filteredVoyages.map(v => v.id)

  // ── GLOBAL KPIs ───────────────────────────────────────────────────────────
  const global = calc(filteredIds)

  // ── PER VOYAGE ────────────────────────────────────────────────────────────
  const voyageStats = filteredVoyages.map(v => {
    const p      = calc([v.id])
    const myLivs = livraisons.filter(l => l.voyage_id === v.id)
    return {
      ...v, ...p,
      nbLivs: myLivs.length,
      nbCli:  new Set(myLivs.map(l => l.client_id).filter(Boolean)).size,
    }
  })

  function toggleSort(k) { setSortKey(k); setSortAsc(s => sortKey === k ? !s : false) }
  const sortedVoyages = [...voyageStats].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey]
    if (typeof av === 'string') return sortAsc ? av.localeCompare(bv||'') : (bv||'').localeCompare(av)
    return sortAsc ? (av||0)-(bv||0) : (bv||0)-(av||0)
  })

  const SortTh = ({ k, label, right, center }) => (
    <th onClick={() => toggleSort(k)}
      className={`py-2.5 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider cursor-pointer
        hover:text-slate-600 select-none whitespace-nowrap
        ${right ? 'text-right' : center ? 'text-center' : 'text-left'}`}>
      {label}{sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : ''}
    </th>
  )

  // ── PER DAY ───────────────────────────────────────────────────────────────
  const dayMap = {}
  filteredVoyages.forEach(v => {
    if (!v.date_depart) return
    if (!dayMap[v.date_depart]) dayMap[v.date_depart] = []
    dayMap[v.date_depart].push(v.id)
  })
  const dayData = Object.keys(dayMap).sort().reverse().map(k => ({
    date: k, nbV: dayMap[k].length, ...calc(dayMap[k]),
  }))

  // ── PER CAMION ────────────────────────────────────────────────────────────
  const camionStats = camions.map(ca => {
    const myVoys = voyageStats.filter(v => v.camion_id === ca.id)
    if (!myVoys.length) return null
    const myIds = myVoys.map(v => v.id)
    const p = calc(myIds)
    const totalBriques = livraisons
      .filter(l => myIds.includes(l.voyage_id) && l.type_produit === 'brique')
      .reduce((s, l) => s + (l.qte || 0), 0)
    const bestVoyage = [...myVoys].sort((a, b) => b.profit - a.profit)[0]
    return { ...ca, nbV: myVoys.length, totalBriques, ...p, bestVoyage }
  }).filter(Boolean).sort((a, b) => b.profit - a.profit)

  // ── PER CLIENT ────────────────────────────────────────────────────────────
  const cliMap = {}
  filteredVoyages.forEach(v => {
    const myLivs = livraisons.filter(l => l.voyage_id === v.id)
    const cids   = [...new Set(myLivs.map(l => l.client_id).filter(Boolean))]
    const nb     = cids.length || 1
    const totalGas  = gasoilData.filter(g => g.voyage_id === v.id).reduce((s, g) => s + (g.total||0), 0)
    const totalChgC = charges.filter(c => c.voyage_id === v.id && !c.facture_client).reduce((s, c) => s + (c.montant||0), 0)
    cids.forEach(cid => {
      const myCliLivs  = myLivs.filter(l => l.client_id === cid)
      const rev        = myCliLivs.reduce((s, l) => s + (l.total_vente||0), 0)
      const coutAchat  = myCliLivs.reduce((s, l) => s + (l.total_achat||(l.qte||0)*(l.prix_achat||0)), 0)
      const gasShare   = totalGas / nb
      const chgShare   = totalChgC / nb
      const chgDirect  = charges
        .filter(c => c.voyage_id === v.id && c.facture_client && c.client_id === cid)
        .reduce((s, c) => s + (c.montant||0), 0)
      const qte        = myCliLivs.reduce((s, l) => s + (l.qte||0), 0)
      const nom        = myCliLivs[0]?.client_nom || ''
      if (!cliMap[cid]) cliMap[cid] = { id: cid, nom, nbLivs: 0, qte: 0, rev: 0, coutAchat: 0, gasShare: 0, chgShare: 0, chgDirect: 0 }
      cliMap[cid].nbLivs   += myCliLivs.length
      cliMap[cid].qte      += qte
      cliMap[cid].rev      += rev
      cliMap[cid].coutAchat+= coutAchat
      cliMap[cid].gasShare += gasShare
      cliMap[cid].chgShare += chgShare
      cliMap[cid].chgDirect+= chgDirect
    })
  })
  const clientStats = Object.values(cliMap).map(c => ({
    ...c,
    profit: c.rev - c.coutAchat - c.gasShare - c.chgShare - c.chgDirect,
    marge:  c.rev > 0 ? Math.round((c.rev - c.coutAchat - c.gasShare - c.chgShare - c.chgDirect) / c.rev * 100) : 0,
  })).sort((a, b) => b.profit - a.profit)

  // ── QUICK DATE BUTTONS ────────────────────────────────────────────────────
  const quickDates = [
    { label: "Aujourd'hui",  fn: () => { setFilterFrom(today());        setFilterTo(today()) } },
    { label: 'Cette semaine', fn: () => { setFilterFrom(startOfWeek()); setFilterTo(today()) } },
    { label: 'Ce mois',       fn: () => { setFilterFrom(startOfMonth()); setFilterTo(today()) } },
    { label: 'Cette année',   fn: () => { setFilterFrom(startOfYear()); setFilterTo(today()) } },
  ]

  const TABS = [
    { key: 'voyages', label: '🚛 Par Voyage' },
    { key: 'jours',   label: '📅 Par Jour' },
    { key: 'camions', label: '🚚 Par Camion' },
    { key: 'clients', label: '👤 Par Client' },
  ]

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <Layout title="Voyages" subtitle="Gestion & Analytiques des trajets">
      {/* ── EDIT VOYAGE MODAL ── */}
      {editingVoyage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={e => { if (e.target===e.currentTarget) setEditingVoyage(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 text-sm">✏️ Modifier le voyage</h3>
              <button onClick={() => setEditingVoyage(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-semibold text-slate-500 block mb-1">Date départ</label>
                <input type="date" value={editVoyageForm.date_depart||''} onChange={e=>setEditVoyageForm({...editVoyageForm,date_depart:e.target.value})} className="input w-full"/></div>
              <div><label className="text-xs font-semibold text-slate-500 block mb-1">Camion</label>
                <select value={editVoyageForm.camion_id||''} onChange={e=>setEditVoyageForm({...editVoyageForm,camion_id:e.target.value})} className="input w-full">
                  <option value="">— Sélectionner —</option>
                  {camions.map(c=><option key={c.id} value={c.id}>{c.plaque}{c.chauffeur?` — ${c.chauffeur}`:''}</option>)}
                </select></div>
              <div><label className="text-xs font-semibold text-slate-500 block mb-1">Destination</label>
                <input type="text" value={editVoyageForm.destination||''} onChange={e=>setEditVoyageForm({...editVoyageForm,destination:e.target.value})} className="input w-full" placeholder="Ex: Oujda..."/></div>
              <div><label className="text-xs font-semibold text-slate-500 block mb-1">Statut</label>
                <select value={editVoyageForm.statut||'en_cours'} onChange={e=>setEditVoyageForm({...editVoyageForm,statut:e.target.value})} className="input w-full">
                  <option value="en_cours">En cours</option>
                  <option value="termine">Terminé</option>
                  <option value="annule">Annulé</option>
                </select></div>
              <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">Note</label>
                <input type="text" value={editVoyageForm.note||''} onChange={e=>setEditVoyageForm({...editVoyageForm,note:e.target.value})} className="input w-full" placeholder="Optionnel..."/></div>
            </div>
            <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-slate-100">
              <button onClick={() => setEditingVoyage(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">Annuler</button>
              <button onClick={updateVoyage} disabled={savingEditVoyage} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 transition disabled:opacity-60">
                {savingEditVoyage ? '⌛ Sauvegarde...' : '✅ Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto space-y-4">

        {/* ── TOP BAR ── */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500 font-medium">
            {loading ? 'Chargement...' : `${filteredVoyages.length} voyage${filteredVoyages.length !== 1 ? 's' : ''} sur la période`}
          </div>
          <button onClick={() => setShowForm(v => !v)}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 transition flex items-center gap-2 shadow-sm">
            <span className="text-base">🚛</span> Nouveau voyage
          </button>
        </div>

        {/* ── NEW VOYAGE FORM ── */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-blue-100 shadow-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">🚛 Nouveau Voyage</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={createVoyage} className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-500 font-semibold mb-1 block">Date départ</label>
                <input type="date" value={form.date_depart} onChange={e => setForm({...form, date_depart: e.target.value})}
                  className="input w-full" required />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-semibold mb-1 block">Camion *</label>
                <select value={form.camion_id} onChange={e => setForm({...form, camion_id: e.target.value})}
                  className="input w-full" required>
                  <option value="">— Sélectionner —</option>
                  {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}{c.chauffeur ? ` — ${c.chauffeur}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-semibold mb-1 block">Destination</label>
                <input type="text" value={form.destination} onChange={e => setForm({...form, destination: e.target.value})}
                  className="input w-full" placeholder="Ex: Oujda, Nador..." />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-semibold mb-1 block">Note</label>
                <input type="text" value={form.note} onChange={e => setForm({...form, note: e.target.value})}
                  className="input w-full" placeholder="Optionnel..." />
              </div>
              {msg && <div className="col-span-2 text-sm text-red-500 font-semibold">{msg}</div>}
              <div className="col-span-2 flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 transition">
                  {saving ? '...' : '✅ Créer le voyage'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── FILTERS ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          {/* Date range + dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Du</label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                className="input text-sm px-3 py-1.5 rounded-xl border border-slate-200 bg-white" />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Au</label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                className="input text-sm px-3 py-1.5 rounded-xl border border-slate-200 bg-white" />
            </div>
            <select value={filterCamion} onChange={e => setFilterCamion(e.target.value)}
              className="input text-sm px-3 py-1.5 rounded-xl border border-slate-200 bg-white">
              <option value="">Tous camions</option>
              {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}</option>)}
            </select>
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
              className="input text-sm px-3 py-1.5 rounded-xl border border-slate-200 bg-white">
              <option value="">Tous clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}
              className="input text-sm px-3 py-1.5 rounded-xl border border-slate-200 bg-white">
              <option value="">Tous statuts</option>
              <option value="en_cours">En cours</option>
              <option value="termine">Terminé</option>
            </select>
            <button
              onClick={() => { setFilterFrom(startOfMonth()); setFilterTo(today()); setFilterCamion(''); setFilterClient(''); setFilterStatut('') }}
              className="text-xs px-3 py-1.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 font-semibold transition">
              ✕ Réinitialiser
            </button>
          </div>
          {/* Quick date buttons */}
          <div className="flex flex-wrap gap-2">
            {quickDates.map(q => (
              <button key={q.label} onClick={q.fn}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold transition">
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── KPI CARDS ── */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-pulse">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Revenu brut</div>
              <div className="text-2xl font-black text-slate-800">{fmt(global.revenuBrut)}</div>
              <div className="text-[10px] text-slate-400 mt-1">DHS · {filteredVoyages.length} voyages</div>
            </div>
            <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-4">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Coût total</div>
              <div className="text-2xl font-black text-red-500">{fmt(global.coutTotal)}</div>
              <div className="text-[10px] text-slate-400 mt-1">DHS</div>
            </div>
            <div className={`bg-white rounded-2xl border shadow-sm p-4 ${global.profit >= 0 ? 'border-emerald-100' : 'border-red-100'}`}>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Profit net</div>
              <div className={`text-2xl font-black ${global.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {global.profit >= 0 ? '+' : ''}{fmt(global.profit)}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">DHS</div>
            </div>
            <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-4">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Marge moyenne</div>
              <div className={`text-2xl font-black ${global.marge >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{global.marge}%</div>
              <div className="text-[10px] text-slate-400 mt-1">Profit / Revenu</div>
            </div>
          </div>
        )}

        {/* ── TABS ── */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition flex-shrink-0
                ${tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-16 text-slate-400 animate-pulse">Chargement des données...</div>
        )}

        {/* ══════════════════════════════════════════════
            TAB: PAR VOYAGE
        ══════════════════════════════════════════════ */}
        {!loading && tab === 'voyages' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-bold text-slate-700 text-sm">Résultat par voyage — {sortedVoyages.length} voyage{sortedVoyages.length !== 1 ? 's' : ''}</h3>
              <span className="text-[10px] text-slate-400">Cliquez sur un en-tête pour trier</span>
            </div>
            {sortedVoyages.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <div className="text-5xl mb-3">🚛</div>
                <div className="font-semibold">Aucun voyage sur cette période</div>
                <div className="text-sm mt-1">Créez votre premier voyage ou modifiez les filtres</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <SortTh k="date_depart"   label="Date" />
                      <SortTh k="camion_plaque" label="Camion" />
                      <ColH label="Statut" center />
                      <SortTh k="nbLivs"     label="Livr." center />
                      <SortTh k="revenuBrut" label="Revenu DHS" right />
                      <SortTh k="coutTotal"  label="Coût" right />
                      <SortTh k="profit"     label="= Profit" right />
                      <SortTh k="marge"      label="Marge" right />
                      <th className="py-2.5 px-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedVoyages.map(v => (
                      <tr key={v.id} className="border-b border-slate-50 hover:bg-blue-50/20 transition">
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{fmtDate(v.date_depart)}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-800">{v.camion_plaque}</div>
                          {v.chauffeur   && <div className="text-[10px] text-slate-400">{v.chauffeur}</div>}
                          {v.destination && <div className="text-[10px] text-slate-400">→ {v.destination}</div>}
                        </td>
                        <td className="py-2.5 px-3 text-center"><StatusBadge statut={v.statut} /></td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{v.nbLivs}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600 whitespace-nowrap">{fmt(v.revenuBrut)}</td>
                        <td className="py-2.5 px-3 text-right text-red-400 whitespace-nowrap">−{fmt(v.coutTotal)}</td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap"><ProfitCell v={v.profit} /></td>
                        <td className="py-2.5 px-3 text-right"><MargeBadge m={v.marge} /></td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1 whitespace-nowrap">
                            <Link href={`/voyages/${v.id}`}
                              className="text-blue-500 hover:text-blue-700 font-semibold text-[10px]">
                              Voir →
                            </Link>
                            <button onClick={() => { setEditingVoyage(v); setEditVoyageForm({ date_depart: v.date_depart, camion_id: v.camion_id, camion_plaque: v.camion_plaque, chauffeur: v.chauffeur, destination: v.destination, note: v.note, statut: v.statut }) }}
                              className="text-slate-300 hover:text-blue-500 transition text-xs px-0.5" title="Modifier">✏️</button>
                            <button onClick={() => deleteVoyage(v)} disabled={deletingId===v.id}
                              className="text-slate-300 hover:text-red-500 transition text-xs px-0.5 disabled:opacity-40" title="Supprimer">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <TotalRow cols={[
                      { value: `Total (${sortedVoyages.length})`, cls: 'text-sm' },
                      { value: '' }, { value: '' },
                      { value: sortedVoyages.reduce((s,v)=>s+v.nbLivs,0), center: true, cls: 'text-blue-300' },
                      { value: fmt(global.revenuBrut), right: true, cls: 'text-emerald-400' },
                      { value: '−'+fmt(global.coutTotal), right: true, cls: 'text-red-300' },
                      { value: (global.profit>=0?'+':'')+fmt(global.profit), right: true, cls: global.profit>=0?'text-emerald-400 text-base':'text-red-400 text-base' },
                      { value: global.marge+'%', right: true, cls: 'text-blue-300' },
                      { value: '' },
                    ]} />
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            TAB: PAR JOUR
        ══════════════════════════════════════════════ */}
        {!loading && tab === 'jours' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-700 text-sm">Résultat par jour — {dayData.length} jour{dayData.length !== 1 ? 's' : ''} d'activité</h3>
            </div>
            {dayData.length === 0 ? (
              <div className="text-center py-16 text-slate-400">Aucune donnée sur cette période</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <ColH label="Date" />
                      <ColH label="Voyages" center />
                      <ColH label="Revenu DHS" right />
                      <ColH label="Coût DHS" right />
                      <ColH label="= Profit" right />
                      <ColH label="Marge" right />
                    </tr>
                  </thead>
                  <tbody>
                    {dayData.map(d => (
                      <tr key={d.date} className="border-b border-slate-50 hover:bg-slate-50 transition">
                        <td className="py-3 px-3 font-bold text-slate-800">{fmtDate(d.date)}</td>
                        <td className="py-3 px-3 text-center">
                          <span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{d.nbV}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-600">{fmt(d.revenuBrut)}</td>
                        <td className="py-3 px-3 text-right text-red-400">−{fmt(d.coutTotal)}</td>
                        <td className="py-3 px-3 text-right"><ProfitCell v={d.profit} /></td>
                        <td className="py-3 px-3 text-right"><MargeBadge m={d.marge} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <TotalRow cols={[
                      { value: 'TOTAL' },
                      { value: filteredVoyages.length, center: true, cls: 'text-blue-300' },
                      { value: fmt(global.revenuBrut), right: true, cls: 'text-emerald-400' },
                      { value: '−'+fmt(global.coutTotal), right: true, cls: 'text-red-300' },
                      { value: (global.profit>=0?'+':'')+fmt(global.profit), right: true, cls: global.profit>=0?'text-emerald-400 text-base':'text-red-400 text-base' },
                      { value: global.marge+'%', right: true, cls: 'text-blue-300' },
                    ]} />
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            TAB: PAR CAMION
        ══════════════════════════════════════════════ */}
        {!loading && tab === 'camions' && (
          <div className="space-y-3">
            {camionStats.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <div className="text-5xl mb-3">🚛</div>
                <div className="font-semibold">Aucun camion avec voyages sur cette période</div>
              </div>
            ) : camionStats.map(ca => (
              <div key={ca.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🚛</span>
                      <span className="font-black text-slate-800 text-lg">{ca.plaque}</span>
                      {ca.chauffeur && <span className="text-sm text-slate-500">· {ca.chauffeur}</span>}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 ml-8">
                      {ca.nbV} voyage{ca.nbV !== 1 ? 's' : ''} · {fmt(ca.totalBriques)} briques
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-black ${ca.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {ca.profit >= 0 ? '+' : ''}{fmt(ca.profit)} <span className="text-xs font-normal text-slate-400">DHS</span>
                    </div>
                    <div className="mt-0.5"><MargeBadge m={ca.marge} /></div>
                  </div>
                </div>
                {/* Stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-emerald-50 rounded-xl p-3">
                    <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide">Revenu brut</div>
                    <div className="font-black text-emerald-700 mt-0.5 text-sm">{fmt(ca.revenuBrut)} DHS</div>
                  </div>
                  <div className="bg-red-50 rounded-xl p-3">
                    <div className="text-[10px] text-red-500 font-semibold uppercase tracking-wide">Coût total</div>
                    <div className="font-black text-red-600 mt-0.5 text-sm">{fmt(ca.coutTotal)} DHS</div>
                  </div>
                  <div className="bg-orange-50 rounded-xl p-3">
                    <div className="text-[10px] text-orange-500 font-semibold uppercase tracking-wide">Gasoil</div>
                    <div className="font-black text-orange-600 mt-0.5 text-sm">{fmt(ca.coutGasoil)} DHS</div>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3">
                    <div className="text-[10px] text-blue-500 font-semibold uppercase tracking-wide">Briques transp.</div>
                    <div className="font-black text-blue-700 mt-0.5 text-sm">{fmt(ca.totalBriques)} u.</div>
                  </div>
                </div>
                {/* Best voyage */}
                {ca.bestVoyage && (
                  <div className="mt-3 border-t border-slate-100 pt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    <span className="text-amber-500 text-sm">🏆</span>
                    <span className="font-semibold">Meilleur voyage :</span>
                    <Link href={`/voyages/${ca.bestVoyage.id}`}
                      className="font-bold text-blue-600 hover:underline">
                      {ca.bestVoyage.reference || `Voyage #${ca.bestVoyage.id}`}
                    </Link>
                    <span className="text-slate-400">— {fmtDate(ca.bestVoyage.date_depart)}</span>
                    {ca.bestVoyage.destination && <span className="text-slate-400">→ {ca.bestVoyage.destination}</span>}
                    <span className={`font-black ${ca.bestVoyage.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {ca.bestVoyage.profit >= 0 ? '+' : ''}{fmt(ca.bestVoyage.profit)} DHS
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            TAB: PAR CLIENT
        ══════════════════════════════════════════════ */}
        {!loading && tab === 'clients' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-700 text-sm">
                Résultat par client
                <span className="font-normal text-slate-400 text-xs ml-2">
                  — gasoil et charges fixes divisés équitablement entre clients du voyage
                </span>
              </h3>
            </div>
            {clientStats.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <div className="text-5xl mb-3">👤</div>
                <div className="font-semibold">Aucun client sur cette période</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <ColH label="#" />
                      <ColH label="Client" />
                      <ColH label="Livr." center />
                      <ColH label="Qté" right />
                      <ColH label="Revenu DHS" right />
                      <ColH label="Achat" right />
                      <ColH label="Gasoil ÷" right />
                      <ColH label="Charges ÷" right />
                      <ColH label="= Profit" right />
                      <ColH label="Marge" right />
                    </tr>
                  </thead>
                  <tbody>
                    {clientStats.map((c, i) => (
                      <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3 text-slate-400 font-semibold">{i + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-800">{c.nom}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{c.nbLivs}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500">{fmt(c.qte)}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600">{fmt(c.rev)}</td>
                        <td className="py-2.5 px-3 text-right text-red-400">−{fmt(c.coutAchat)}</td>
                        <td className="py-2.5 px-3 text-right text-orange-400">−{fmt(c.gasShare)}</td>
                        <td className="py-2.5 px-3 text-right text-red-400">−{fmt(c.chgShare + c.chgDirect)}</td>
                        <td className="py-2.5 px-3 text-right"><ProfitCell v={c.profit} /></td>
                        <td className="py-2.5 px-3 text-right"><MargeBadge m={c.marge} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <TotalRow cols={[
                      { value: 'TOTAL', cls: 'text-sm' },
                      { value: '' },
                      { value: clientStats.reduce((s,c)=>s+c.nbLivs,0), center: true, cls: 'text-blue-300' },
                      { value: fmt(clientStats.reduce((s,c)=>s+c.qte,0)), right: true, cls: 'text-slate-300' },
                      { value: fmt(clientStats.reduce((s,c)=>s+c.rev,0)), right: true, cls: 'text-emerald-400' },
                      { value: '−'+fmt(clientStats.reduce((s,c)=>s+c.coutAchat,0)), right: true, cls: 'text-red-300' },
                      { value: '−'+fmt(clientStats.reduce((s,c)=>s+c.gasShare,0)), right: true, cls: 'text-orange-300' },
                      { value: '−'+fmt(clientStats.reduce((s,c)=>s+c.chgShare+c.chgDirect,0)), right: true, cls: 'text-red-300' },
                      { value: (global.profit>=0?'+':'')+fmt(global.profit), right: true, cls: global.profit>=0?'text-emerald-400 text-base':'text-red-400 text-base' },
                      { value: global.marge+'%', right: true, cls: 'text-blue-300' },
                    ]} />
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </Layout>
  )
}
