import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { fmt, fmtMoney, fmtDate, today, startOfMonth } from '../../lib/utils'
import { computeVoyageProfit, aggregateVoyageProfits, aggregateClientProfits, DEFAULT_REMISE_CARBURANT_RATE } from '../../lib/services/profitability'
import { fetchRemiseCarburantRate } from '../../lib/services/settings'
import { recalcOdometerChain } from '../../lib/services/voyage/updates'
import { StatusBadge, ProfitCell, MargeBadge } from '../../components/voyage/StatusBadges'

const startOfWeek  = () => {
  const d = new Date()
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
  return `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}-${String(m.getDate()).padStart(2,'0')}`
}
const startOfYear = () => `${new Date().getFullYear()}-01-01`

// ── MINI COMPONENTS ──────────────────────────────────────────────────────────

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

// ── DELETE PREVIEW MODAL ─────────────────────────────────────────────────────

function DeletePreviewModal({ voyages, livraisons, achats, charges, gasoilData, retours, onConfirm, onCancel, archiving }) {
  const ids = voyages.map(v => v.id)

  const myLivs = livraisons.filter(l => ids.includes(l.voyage_id))
  const myAcs  = achats.filter(a => ids.includes(a.voyage_id))
  const myChgs = charges.filter(c => ids.includes(c.voyage_id))
  const myGas  = gasoilData.filter(g => ids.includes(g.voyage_id))
  const myRets = retours.filter(r => ids.includes(r.voyage_id))

  const revenuLivs = myLivs.reduce((s, l) => s + (l.total_vente || 0), 0)
  const revenuRets = myRets.reduce((s, r) => s + (r.montant || 0), 0)
  const chgCli     = myChgs.filter(c => c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)
  const revenuBrut = revenuLivs + revenuRets + chgCli
  const coutAchat  = myAcs.reduce((s, a) => s + (a.total_achat || (a.qte || 0) * (a.prix_achat || 0)), 0)
  const coutGasoil = myGas.reduce((s, g) => s + (g.total || 0), 0)
  const coutCharges = myChgs.filter(c => !c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)
  const profit     = revenuBrut - coutAchat - coutGasoil - coutCharges

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget && !archiving) onCancel() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🗄️</span>
                <h3 className="font-black text-slate-800 text-base">
                  Archiver {voyages.length > 1 ? `${voyages.length} voyages` : 'le voyage'}
                </h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Le voyage sera masqué de la liste normale et accessible depuis la vue Archives pour une éventuelle restauration.
              </p>
            </div>
            {!archiving && (
              <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-2xl leading-none flex-shrink-0 mt-0.5">×</button>
            )}
          </div>
        </div>

        {/* Voyage list (max 5) */}
        {voyages.length <= 5 && (
          <div className="px-6 pt-4 space-y-1">
            {voyages.map(v => (
              <div key={v.id} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
                <span className="text-slate-400">🚛</span>
                <span className="font-bold text-slate-800">{v.camion_plaque || `#${v.id}`}</span>
                <span className="text-slate-400">{fmtDate(v.date_depart)}</span>
                {v.destination && <span className="text-slate-400">→ {v.destination}</span>}
              </div>
            ))}
          </div>
        )}
        {voyages.length > 5 && (
          <div className="px-6 pt-4">
            <div className="bg-slate-50 px-3 py-2 rounded-lg text-xs text-slate-500">
              {voyages.length} voyages sélectionnés — du {fmtDate(voyages[voyages.length-1]?.date_depart)} au {fmtDate(voyages[0]?.date_depart)}
            </div>
          </div>
        )}

        {/* Records count */}
        <div className="px-6 pt-4">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Enregistrements concernés</div>
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { label: 'Livraisons', count: myLivs.length, cls: 'bg-blue-50 text-blue-700' },
              { label: 'Achats',     count: myAcs.length,  cls: 'bg-purple-50 text-purple-700' },
              { label: 'Charges',    count: myChgs.length, cls: 'bg-orange-50 text-orange-700' },
              { label: 'Gasoil',     count: myGas.length,  cls: 'bg-amber-50 text-amber-700' },
              { label: 'Retours',    count: myRets.length, cls: 'bg-teal-50 text-teal-700' },
            ].map(item => (
              <div key={item.label} className={`${item.cls} rounded-xl p-2.5 text-center`}>
                <div className="text-xl font-black">{item.count}</div>
                <div className="text-[9px] font-semibold mt-0.5 uppercase tracking-wide leading-tight">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Financial impact */}
        <div className="px-6 pt-3">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Impact financier</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-emerald-50 rounded-xl p-3">
              <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide">Revenu total</div>
              <div className="font-black text-emerald-700 text-sm mt-0.5">{fmtMoney(revenuBrut)} DHS</div>
            </div>
            <div className="bg-red-50 rounded-xl p-3">
              <div className="text-[10px] text-red-500 font-semibold uppercase tracking-wide">Achats</div>
              <div className="font-black text-red-600 text-sm mt-0.5">{fmtMoney(coutAchat)} DHS</div>
            </div>
            <div className="bg-orange-50 rounded-xl p-3">
              <div className="text-[10px] text-orange-500 font-semibold uppercase tracking-wide">Charges + Gasoil</div>
              <div className="font-black text-orange-600 text-sm mt-0.5">{fmtMoney(coutCharges + coutGasoil)} DHS</div>
            </div>
            <div className={`rounded-xl p-3 ${profit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <div className={`text-[10px] font-semibold uppercase tracking-wide ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                Profit archivé
              </div>
              <div className={`font-black text-sm mt-0.5 ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {profit >= 0 ? '+' : ''}{fmtMoney(profit)} DHS
              </div>
            </div>
          </div>
        </div>

        {/* Info note */}
        <div className="px-6 pt-3">
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-700 leading-relaxed">
            <span className="font-bold">Info :</span> Les soldes clients restent inchangés lors de l'archivage. Pour supprimer définitivement et corriger les soldes, utilisez la suppression permanente depuis la vue Archives (admin).
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-5 flex justify-end gap-3">
          <button onClick={onCancel} disabled={archiving}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition disabled:opacity-40">
            Annuler
          </button>
          <button onClick={onConfirm} disabled={archiving}
            className="bg-amber-500 text-white px-5 py-2 rounded-xl font-bold text-sm hover:bg-amber-600 transition disabled:opacity-60 flex items-center gap-2">
            {archiving
              ? <><span className="inline-block animate-spin">⌛</span> Archivage...</>
              : <>🗄️ {voyages.length > 1 ? `Archiver ${voyages.length} voyages` : 'Archiver le voyage'}</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function Voyages() {
  const { user } = useAuth()
  const router = useRouter()

  // ── DATA ──
  const [voyages,    setVoyages]    = useState([])
  const [achats,     setAchats]     = useState([])
  const [livraisons, setLivraisons] = useState([])
  const [retours,    setRetours]    = useState([])
  const [gasoilData, setGasoilData] = useState([])
  const [allGasoil,  setAllGasoil]  = useState([])
  const [charges,          setCharges]          = useState([])
  const [camions,          setCamions]          = useState([])
  const [clients,    setClients]    = useState([])
  const [locationsData, setLocationsData] = useState([])
  const [remiseRate, setRemiseRate] = useState(DEFAULT_REMISE_CARBURANT_RATE)

  // ── UI ──
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [showForm,  setShowForm]  = useState(false)
  const [msg,       setMsg]       = useState('')
  const [tab,       setTab]       = useState('voyages')
  const [sortKey,   setSortKey]   = useState('date_depart')
  const [sortAsc,   setSortAsc]   = useState(false)

  // ── EDIT/DELETE VOYAGE ──
  const [editingVoyage,    setEditingVoyage]    = useState(null)
  const [editVoyageForm,   setEditVoyageForm]   = useState({})
  const [savingEditVoyage, setSavingEditVoyage] = useState(false)

  // ── MULTI-SELECT & DELETE PREVIEW ──
  const [selectedIds,      setSelectedIds]      = useState([])
  const [deletePreviewFor, setDeletePreviewFor] = useState(null) // array of voyage objects | null
  const [archiving,        setArchiving]        = useState(false)

  // ── FILTERS ──
  const [filterFrom,   setFilterFrom]   = useState(startOfMonth())
  const [filterTo,     setFilterTo]     = useState(today())
  const [filterCamion, setFilterCamion] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterStatut, setFilterStatut] = useState('')

  // ── FORM ──
  const [form, setForm] = useState({
    date_depart: today(), camion_id: '', destination: '', note: '', km_depart: '',
  })

  useEffect(() => { loadAll(); fetchRemiseCarburantRate().then(setRemiseRate) }, [])

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
      { data: ag },
      { data: loc },
    ] = await Promise.all([
      supabase.from('voyages').select('*').is('deleted_at', null).order('date_depart', { ascending: false }),
      supabase.from('voyage_achats').select('voyage_id,type_produit,type_brique,total_achat,qte,prix_achat'),
      supabase.from('voyage_livraisons').select('voyage_id,type_produit,type_brique,client_id,client_nom,qte,total_vente,total_achat,frais_total'),
      supabase.from('voyage_retours').select('voyage_id,montant,montant_paye,restant'),
      supabase.from('voyage_gasoil').select('voyage_id,gasoil_id'),
      supabase.from('voyage_charges').select('voyage_id,montant,facture_client,client_id,client_nom'),
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('clients').select('id,nom').order('nom'),
      // No km filter: a no-km purchase can still be manually linked, and must
      // stay visible to lib/services/fuelAllocation.js.
      supabase.from('gasoil').select('camion_id,km,total,date,adblue_total,qte').order('km', { ascending: true }),
      supabase.from('voyage_locations').select('voyage_id,montant_location'),
    ])
    setVoyages(v || [])
    setAchats(ac || [])
    setLivraisons(li || [])
    setRetours(re || [])
    setGasoilData(ga || [])
    setAllGasoil(ag || [])
    setCharges(ch || [])
    setCamions(ca || [])
    setClients(cl || [])
    setLocationsData(loc || [])
    setLoading(false)
  }

  // ── PROFIT FORMULA (shared engine — lib/services/profitability.js) ─────────

  const gasoilByCamion = allGasoil.reduce((acc, g) => {
    if (!acc[g.camion_id]) acc[g.camion_id] = []
    acc[g.camion_id].push(g)
    return acc
  }, {})

  function resultsFor(vIds) {
    return voyages.filter(v => vIds.includes(v.id)).map(v => computeVoyageProfit({
      voyage: v,
      achats: achats.filter(a => a.voyage_id === v.id),
      livraisons: livraisons.filter(l => l.voyage_id === v.id),
      charges: charges.filter(c => c.voyage_id === v.id),
      retours: retours.filter(r => r.voyage_id === v.id),
      locations: locationsData.filter(l => l.voyage_id === v.id),
      camionRefills: gasoilByCamion[v.camion_id] || [],
      camionVoyages: voyages.filter(vv => vv.camion_id === v.camion_id),
      voyageGasoilLinks: gasoilData,
      remiseRate,
    }))
  }
  function calc(vIds) { return aggregateVoyageProfits(resultsFor(vIds)) }

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
      km_depart:     editVoyageForm.km_depart  ? parseFloat(editVoyageForm.km_depart)  : null,
    }).eq('id', editingVoyage.id)
    setSavingEditVoyage(false)
    setEditingVoyage(null)
    try {
      await recalcOdometerChain(parseInt(editVoyageForm.camion_id))
      if (editingVoyage.camion_id && editingVoyage.camion_id !== parseInt(editVoyageForm.camion_id)) {
        await recalcOdometerChain(editingVoyage.camion_id)
      }
    } catch (err) {
      alert('Erreur recalcul chaîne kilométrique: ' + err.message)
    }
    loadAll()
  }

  // ── MULTI-SELECT ──────────────────────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  function toggleSelectAll(visibleVoyages) {
    const allSelected = visibleVoyages.every(v => selectedIds.includes(v.id))
    setSelectedIds(allSelected ? [] : visibleVoyages.map(v => v.id))
  }

  // ── DELETE / ARCHIVE ──────────────────────────────────────────────────────
  function openDeletePreview(voyageObjs) {
    setDeletePreviewFor(voyageObjs)
  }

  async function confirmSoftDelete() {
    if (!deletePreviewFor?.length) return
    setArchiving(true)
    const ids = deletePreviewFor.map(v => v.id)
    const { error } = await supabase
      .from('voyages')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user?.email || 'unknown',
      })
      .in('id', ids)
    setArchiving(false)
    if (error) {
      alert('Erreur archivage: ' + error.message)
      return
    }
    const camionIds = [...new Set(deletePreviewFor.map(v => v.camion_id).filter(Boolean))]
    try {
      await Promise.all(camionIds.map(recalcOdometerChain))
    } catch (err) {
      alert('Erreur recalcul chaîne kilométrique: ' + err.message)
    }
    setDeletePreviewFor(null)
    setSelectedIds([])
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
      km_depart:     form.km_depart  ? parseFloat(form.km_depart)  : null,
    }).select().single()
    setSaving(false)
    if (error) { setMsg('❌ ' + error.message); return }
    setShowForm(false)
    setForm({ date_depart: today(), camion_id: '', destination: '', note: '', km_depart: '' })
    try {
      await recalcOdometerChain(parseInt(form.camion_id))
    } catch (err) {
      alert('Erreur recalcul chaîne kilométrique: ' + err.message)
    }
    router.push(`/voyages/${data.id}`)
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
  const SORT_ACCESSORS = {
    revenuBrut: v => v.revenue.total,
    coutTotal:  v => v.cost.total,
  }
  const sortValue = (row, key) => SORT_ACCESSORS[key] ? SORT_ACCESSORS[key](row) : row[key]

  const voyageStats = filteredVoyages.map(v => {
    const p = computeVoyageProfit({
      voyage: v,
      achats: achats.filter(a => a.voyage_id === v.id),
      livraisons: livraisons.filter(l => l.voyage_id === v.id),
      charges: charges.filter(c => c.voyage_id === v.id),
      retours: retours.filter(r => r.voyage_id === v.id),
      locations: locationsData.filter(l => l.voyage_id === v.id),
      camionRefills: gasoilByCamion[v.camion_id] || [],
      camionVoyages: voyages.filter(vv => vv.camion_id === v.camion_id),
      voyageGasoilLinks: gasoilData,
      remiseRate,
    })
    const myLivs = livraisons.filter(l => l.voyage_id === v.id)
    return {
      ...v, ...p,
      nbLivs: myLivs.length,
      nbCli:  new Set(myLivs.map(l => l.client_id).filter(Boolean)).size,
    }
  })

  function toggleSort(k) { setSortKey(k); setSortAsc(s => sortKey === k ? !s : false) }
  const sortedVoyages = [...voyageStats].sort((a, b) => {
    const av = sortValue(a, sortKey), bv = sortValue(b, sortKey)
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
  const clientStats = aggregateClientProfits(resultsFor(filteredIds)).map(c => ({
    ...c,
    nbLivs: livraisons.filter(l => filteredIds.includes(l.voyage_id) && l.client_id === c.client_id && (l.type_produit || 'brique') === c.type_produit).length,
  }))

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

  // selected voyage objects (from sortedVoyages)
  const selectedVoyageObjs = sortedVoyages.filter(v => selectedIds.includes(v.id))
  const allVisibleSelected  = sortedVoyages.length > 0 && sortedVoyages.every(v => selectedIds.includes(v.id))

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <Layout title="Voyages" subtitle="Gestion & Analytiques des trajets">

      {/* ── DELETE PREVIEW MODAL ── */}
      {deletePreviewFor && (
        <DeletePreviewModal
          voyages={deletePreviewFor}
          livraisons={livraisons}
          achats={achats}
          charges={charges}
          gasoilData={gasoilData}
          retours={retours}
          onConfirm={confirmSoftDelete}
          onCancel={() => setDeletePreviewFor(null)}
          archiving={archiving}
        />
      )}

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
              <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">Odomètre au chargement</label>
                <input type="number" value={editVoyageForm.km_depart||''} onChange={e=>setEditVoyageForm({...editVoyageForm,km_depart:e.target.value})} className="input w-full" placeholder="Ex: 125000"/></div>
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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-slate-500 font-medium">
            {loading ? 'Chargement...' : `${filteredVoyages.length} voyage${filteredVoyages.length !== 1 ? 's' : ''} sur la période`}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/voyages/archives"
              className="text-xs px-3 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 font-semibold transition flex items-center gap-1.5">
              🗄️ Archives
            </Link>
            <button onClick={() => setShowForm(v => !v)}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 transition flex items-center gap-2 shadow-sm">
              <span className="text-base">🚛</span> Nouveau voyage
            </button>
          </div>
        </div>

        {/* ── SELECTION ACTION BAR ── */}
        {selectedIds.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-amber-600 font-black text-sm">
                {selectedIds.length} voyage{selectedIds.length > 1 ? 's' : ''} sélectionné{selectedIds.length > 1 ? 's' : ''}
              </span>
              <button onClick={() => setSelectedIds([])}
                className="text-xs text-amber-500 hover:text-amber-700 underline">
                Tout désélectionner
              </button>
            </div>
            <button
              onClick={() => openDeletePreview(selectedVoyageObjs)}
              className="bg-amber-500 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-amber-600 transition flex items-center gap-2">
              🗄️ Archiver la sélection
            </button>
          </div>
        )}

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
              <div className="col-span-2">
                <label className="text-xs text-slate-500 font-semibold mb-1 block">Odomètre au chargement (optionnel)</label>
                <input type="number" value={form.km_depart} onChange={e => setForm({...form, km_depart: e.target.value})}
                  className="input w-full" placeholder="Ex: 125000" />
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
              <div className="text-2xl font-black text-slate-800">{fmtMoney(global.revenue.total)}</div>
              <div className="text-[10px] text-slate-400 mt-1">DHS · {filteredVoyages.length} voyages</div>
            </div>
            <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-4">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Coût total</div>
              <div className="text-2xl font-black text-red-500">{fmtMoney(global.cost.total)}</div>
              <div className="text-[10px] text-slate-400 mt-1">DHS</div>
            </div>
            <div className={`bg-white rounded-2xl border shadow-sm p-4 ${global.profit >= 0 ? 'border-emerald-100' : 'border-red-100'}`}>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Profit net</div>
              <div className={`text-2xl font-black ${global.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {global.profit >= 0 ? '+' : ''}{fmtMoney(global.profit)}
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
              <span className="text-[10px] text-slate-400">Cliquez sur un en-tête pour trier · cochez pour sélectionner</span>
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
                      {/* Select-all checkbox */}
                      <th className="py-2.5 px-3 w-8">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={() => toggleSelectAll(sortedVoyages)}
                          className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
                          title={allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                        />
                      </th>
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
                    {sortedVoyages.map(v => {
                      const isSelected = selectedIds.includes(v.id)
                      return (
                        <tr key={v.id}
                          className={`border-b border-slate-50 transition ${isSelected ? 'bg-amber-50' : 'hover:bg-blue-50/20'}`}>
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(v.id)}
                              className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
                            />
                          </td>
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
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-600 whitespace-nowrap">{fmtMoney(v.revenue.total)}</td>
                          <td className="py-2.5 px-3 text-right text-red-400 whitespace-nowrap">−{fmtMoney(v.cost.total)}</td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap"><ProfitCell v={v.profit} /></td>
                          <td className="py-2.5 px-3 text-right"><MargeBadge m={v.marge} /></td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1 whitespace-nowrap">
                              <Link href={`/voyages/${v.id}`}
                                className="text-blue-500 hover:text-blue-700 font-semibold text-[10px]">
                                Voir →
                              </Link>
                              <button onClick={() => { setEditingVoyage(v); setEditVoyageForm({ date_depart: v.date_depart, camion_id: v.camion_id, camion_plaque: v.camion_plaque, chauffeur: v.chauffeur, destination: v.destination, note: v.note, statut: v.statut, km_depart: v.km_depart }) }}
                                className="text-slate-300 hover:text-blue-500 transition text-xs px-0.5" title="Modifier">✏️</button>
                              <button
                                onClick={() => openDeletePreview([v])}
                                className="text-slate-300 hover:text-amber-500 transition text-xs px-0.5"
                                title="Archiver">
                                🗄️
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <TotalRow cols={[
                      { value: '' },
                      { value: `Total (${sortedVoyages.length})`, cls: 'text-sm' },
                      { value: '' }, { value: '' },
                      { value: sortedVoyages.reduce((s,v)=>s+v.nbLivs,0), center: true, cls: 'text-blue-300' },
                      { value: fmtMoney(global.revenue.total), right: true, cls: 'text-emerald-400' },
                      { value: '−'+fmtMoney(global.cost.total), right: true, cls: 'text-red-300' },
                      { value: (global.profit>=0?'+':'')+fmtMoney(global.profit), right: true, cls: global.profit>=0?'text-emerald-400 text-base':'text-red-400 text-base' },
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
                        <td className="py-3 px-3 text-right font-bold text-emerald-600">{fmtMoney(d.revenue.total)}</td>
                        <td className="py-3 px-3 text-right text-red-400">−{fmtMoney(d.cost.total)}</td>
                        <td className="py-3 px-3 text-right"><ProfitCell v={d.profit} /></td>
                        <td className="py-3 px-3 text-right"><MargeBadge m={d.marge} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <TotalRow cols={[
                      { value: 'TOTAL' },
                      { value: filteredVoyages.length, center: true, cls: 'text-blue-300' },
                      { value: fmtMoney(global.revenue.total), right: true, cls: 'text-emerald-400' },
                      { value: '−'+fmtMoney(global.cost.total), right: true, cls: 'text-red-300' },
                      { value: (global.profit>=0?'+':'')+fmtMoney(global.profit), right: true, cls: global.profit>=0?'text-emerald-400 text-base':'text-red-400 text-base' },
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
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xl">🚛</span>
                      <span className="font-black text-slate-800 text-lg">{ca.plaque}</span>
                      {ca.chauffeur && <span className="text-sm text-slate-500">· {ca.chauffeur}</span>}
                      {ca.type_camion === 'loue'
                        ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">🔑 Loué</span>
                        : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">🏢 Propre</span>
                      }
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 ml-8">
                      {ca.nbV} voyage{ca.nbV !== 1 ? 's' : ''} · {fmt(ca.totalBriques)} briques
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-black ${ca.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {ca.profit >= 0 ? '+' : ''}{fmtMoney(ca.profit)} <span className="text-xs font-normal text-slate-400">DHS</span>
                    </div>
                    <div className="mt-0.5"><MargeBadge m={ca.marge} /></div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-emerald-50 rounded-xl p-3">
                    <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide">Revenu brut</div>
                    <div className="font-black text-emerald-700 mt-0.5 text-sm">{fmtMoney(ca.revenue.total)} DHS</div>
                  </div>
                  <div className="bg-red-50 rounded-xl p-3">
                    <div className="text-[10px] text-red-500 font-semibold uppercase tracking-wide">Coût total</div>
                    <div className="font-black text-red-600 mt-0.5 text-sm">{fmtMoney(ca.cost.total)} DHS</div>
                  </div>
                  {ca.type_camion === 'loue' ? (
                    <div className="bg-amber-50 rounded-xl p-3">
                      <div className="text-[10px] text-amber-600 font-semibold uppercase tracking-wide">Location</div>
                      <div className="font-black text-amber-700 mt-0.5 text-sm">{fmtMoney(ca.cost.rental || 0)} DHS</div>
                    </div>
                  ) : (
                    <div className="bg-orange-50 rounded-xl p-3">
                      <div className="text-[10px] text-orange-500 font-semibold uppercase tracking-wide">Gasoil</div>
                      <div className="font-black text-orange-600 mt-0.5 text-sm">{fmtMoney(ca.cost.fuel)} DHS</div>
                    </div>
                  )}
                  <div className="bg-blue-50 rounded-xl p-3">
                    <div className="text-[10px] text-blue-500 font-semibold uppercase tracking-wide">Briques transp.</div>
                    <div className="font-black text-blue-700 mt-0.5 text-sm">{fmt(ca.totalBriques)} u.</div>
                  </div>
                </div>
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
                      {ca.bestVoyage.profit >= 0 ? '+' : ''}{fmtMoney(ca.bestVoyage.profit)} DHS
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
                  — gasoil, location et charges divisés proportionnellement à la quantité de briques (grignon exclu)
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
                      <ColH label="Achat (WAC)" right />
                      <ColH label="Gasoil ÷" right />
                      <ColH label="Location ÷" right />
                      <ColH label="Charges ÷" right />
                      <ColH label="= Profit" right />
                      <ColH label="Marge" right />
                    </tr>
                  </thead>
                  <tbody>
                    {clientStats.map((c, i) => (
                      <tr key={c.key} className="border-b border-slate-50 hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3 text-slate-400 font-semibold">{i + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-800">
                          {c.client_nom}
                          {c.type_produit === 'grignon' && <span className="ml-1.5 text-[9px] bg-lime-100 text-lime-700 px-1.5 py-0.5 rounded font-semibold">GRIGNON</span>}
                          {c.hasUndeterminedCost && <span className="text-amber-500 ml-1.5" title="⚠ Coût d'achat indéterminé pour au moins une livraison">⚠</span>}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{c.nbLivs}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500">{fmt(c.qte)}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600">{fmtMoney(c.revenue.total)}</td>
                        <td className="py-2.5 px-3 text-right text-red-400">−{fmtMoney(c.cost.achatWAC)}</td>
                        <td className="py-2.5 px-3 text-right text-orange-400">−{fmtMoney(c.cost.fuelAllocated)}</td>
                        <td className="py-2.5 px-3 text-right text-amber-500">{c.cost.rentalAllocated > 0 ? `−${fmtMoney(c.cost.rentalAllocated)}` : '—'}</td>
                        <td className="py-2.5 px-3 text-right text-red-400">−{fmtMoney(c.cost.chargesAllocated)}</td>
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
                      { value: fmtMoney(clientStats.reduce((s,c)=>s+c.revenue.total,0)), right: true, cls: 'text-emerald-400' },
                      { value: '−'+fmtMoney(clientStats.reduce((s,c)=>s+c.cost.achatWAC,0)), right: true, cls: 'text-red-300' },
                      { value: '−'+fmtMoney(clientStats.reduce((s,c)=>s+c.cost.fuelAllocated,0)), right: true, cls: 'text-orange-300' },
                      { value: '−'+fmtMoney(clientStats.reduce((s,c)=>s+c.cost.rentalAllocated,0)), right: true, cls: 'text-amber-300' },
                      { value: '−'+fmtMoney(clientStats.reduce((s,c)=>s+c.cost.chargesAllocated,0)), right: true, cls: 'text-red-300' },
                      { value: (global.profit>=0?'+':'')+fmtMoney(clientStats.reduce((s,c)=>s+c.profit,0)), right: true, cls: global.profit>=0?'text-emerald-400 text-base':'text-red-400 text-base' },
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
