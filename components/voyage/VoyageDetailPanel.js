import { useState, useEffect, useCallback, useRef, useMemo, forwardRef, useImperativeHandle } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { fmt, fmtD, fmtDate, today } from '../../lib/utils'
import { CHARGE_CATS, COMMON_CHARGE_KEYS } from '../../lib/voyage-constants'
import { loadVoyageData } from '../../lib/services/voyage/loaders'
import { updateStatut as dbUpdateStatut, updateKm as dbUpdateKm, recalcOdometerChain, updateFuelMode as dbUpdateFuelMode } from '../../lib/services/voyage/updates'
import { saveAchat as dbSaveAchat, delAchat as dbDelAchat } from '../../lib/services/voyage/achats'
import { saveLiv as dbSaveLiv, delLiv as dbDelLiv } from '../../lib/services/voyage/livraisons'
import { saveChargeGrid as dbSaveChargeGrid, delCharge as dbDelCharge } from '../../lib/services/voyage/charges'
import { saveRetour as dbSaveRetour, delRetour as dbDelRetour } from '../../lib/services/voyage/retours'
import { useVoyageTransactionEdit } from '../../lib/hooks/useVoyageTransactionEdit'
import AchatSection from './AchatSection'
import LivraisonSection from './LivraisonSection'
import EditTransactionModal from './EditTransactionModal'
import ChargesSection from './ChargesSection'
import RetourSection from './RetourSection'
import GasoilSection from './GasoilSection'
import FuelModeSection from './FuelModeSection'
import LocationSection from './LocationSection'
import ValidationPanel from './ValidationPanel'
import { computeVoyageProfit, DEFAULT_REMISE_CARBURANT_RATE } from '../../lib/services/profitability'
import { fetchRemiseCarburantRate } from '../../lib/services/settings'

// Extracted verbatim from pages/voyages/[id].js so the exact same editable
// voyage workspace (state, save/delete handlers, section wiring) can be
// embedded inside Review Mode's right pane without duplicating any logic.
// `embedded=false` (the standalone /voyages/[id] page) renders byte-identical
// output to before. `embedded=true` (Review Mode) suppresses the sidebar
// voyage-nav rail, mobile swipe-nav bar, and "← Voyages" link, since the host
// page owns its own queue/prev-next navigation instead.
const VoyageDetailPanel = forwardRef(function VoyageDetailPanel({ voyageId, embedded = false, onSaved, onVoyageLoaded }, ref) {
  const router   = useRouter()
  const id       = voyageId
  const touchStartX = useRef(null)

  // ── master data ──
  const [voyage,             setVoyage]             = useState(null)
  const [camions,            setCamions]            = useState([])
  const [clients,            setClients]            = useState([])
  const [fournisseurs,       setFournisseurs]       = useState([])
  const [grignonFournisseurs,setGrignonFournisseurs]= useState([])
  const [grignonClients,     setGrignonClients]     = useState([])
  const [typeBriques,        setTypeBriques]        = useState([])
  const [loading,            setLoading]            = useState(true)
  const [remiseRate,         setRemiseRate]         = useState(DEFAULT_REMISE_CARBURANT_RATE)

  // ── section data ──
  const [achats,     setAchats]     = useState([])
  const [livraisons, setLivraisons] = useState([])
  const [retours,    setRetours]    = useState([])
  const [gasoil,     setGasoil]     = useState([])
  const [charges,    setCharges]    = useState([])
  const [locations,  setLocations]  = useState([])
  const [loueurs,    setLoueurs]    = useState([])

  // ── sidebar ──
  const [sidebarVoyages, setSidebarVoyages] = useState([])
  const [sidebarProfits, setSidebarProfits] = useState({})
  const [sidebarSearch,  setSidebarSearch]  = useState('')

  // ── add forms ──
  const [showAchat,  setShowAchat]  = useState(false)
  const [showLiv,    setShowLiv]    = useState(false)
  const [showRetour, setShowRetour] = useState(false)
  const [showCharge,   setShowCharge]   = useState(false)
  const [showGasoilPicker, setShowGasoilPicker] = useState(false)
  const [camionPleins,     setCamionPleins]     = useState([])
  const [linkingGasoil,    setLinkingGasoil]    = useState(false)
  const [showLocation, setShowLocation] = useState(false)
  const [locForm,      setLocForm]      = useState({ loueur_id: '', montant_location: '', montant_paye: '', note: '' })
  const [savingLoc,    setSavingLoc]    = useState(false)

  const [achatForm, setAchatForm] = useState({ date_achat: today(), type_produit: 'brique', fournisseur_id: '', type_brique_id: '', qte: '', prix_achat: '', note: '' })
  const [livForm,   setLivForm]   = useState({ date_livraison: today(), type_produit: 'brique', client_id: '', type_brique_id: '', qte: '', prix_vente: '', prix_achat: '', remise: '', note: '', frais: [] })
  const [retForm,   setRetForm]   = useState({ date_retour: today(), client_nom: '', destination: '', montant: '', montant_paye: '', note: '' })

  const emptyChgGrid = () => Object.fromEntries(CHARGE_CATS.map(c => [c.key, '']))
  const [chgDate,       setChgDate]       = useState(today())
  const [chgGrid,       setChgGrid]       = useState(emptyChgGrid())
  const [chgFactureMap, setChgFactureMap] = useState({})

  // ── UX: active step / section navigation ──
  const [activeStep,  setActiveStep]   = useState(null) // 'achat'|'livraison'|'retour'|'charge'|'gasoil'
  const sectionRefs = {
    achat:     useRef(null),
    livraison: useRef(null),
    retour:    useRef(null),
    charge:    useRef(null),
    gasoil:    useRef(null),
    location:  useRef(null),
    profit:    useRef(null),
  }
  function scrollTo(key) {
    sectionRefs[key]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveStep(key)
    // auto-open the form
    if (key === 'achat')     setShowAchat(true)
    if (key === 'livraison') setShowLiv(true)
    if (key === 'retour')    setShowRetour(true)
    if (key === 'charge')    setShowCharge(true)
    if (key === 'gasoil')    loadCamionPleins()
    if (key === 'location')  setShowLocation(true)
  }

  // Smart defaults: auto-fill prix_achat in livForm from last achat in this voyage
  useEffect(() => {
    if (showLiv && achats.length > 0) {
      const lastAchat = achats[achats.length - 1]
      if (lastAchat && !livForm.prix_achat) {
        setLivForm(f => ({ ...f, prix_achat: String(lastAchat.prix_achat || '') }))
      }
    }
  }, [showLiv])

  // ── saving ──
  const [savingAchat,  setSavingAchat]  = useState(false)
  const [savingLiv,    setSavingLiv]    = useState(false)
  const [savingRetour, setSavingRetour] = useState(false)
  const [savingChg,    setSavingChg]    = useState(false)
  const [savingStatut, setSavingStatut] = useState(false)
  const [msg,          setMsg]          = useState('')
  const [loadError,    setLoadError]    = useState(null)

  const { toast, ToastContainer } = useToast()

  // ── km tracking ──
  const [vehicleGasoil, setVehicleGasoil] = useState([])
  const [kmForm,        setKmForm]        = useState({ km_depart: '' })
  const [editingKm,     setEditingKm]     = useState(false)
  const [savingKm,      setSavingKm]      = useState(false)

  // ── UX additions ──
  const addAnotherLivRef               = useRef(false)
  const addAnotherAchatRef             = useRef(false)
  const [showAchatNote,  setShowAchatNote]  = useState(false)
  const [showLivNote,    setShowLivNote]    = useState(false)
  const [showAllCharges, setShowAllCharges] = useState(false)

  // ── LOAD VOYAGE ──────────────────────────────────────────────────────────────
  const loadVoyage = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setLoadError(null)
    try {
      const d = await loadVoyageData(id)
      setVoyage(d.voyage)
      setCamions(d.camions)
      setClients(d.clients)
      setFournisseurs(d.fournisseurs)
      setGrignonFournisseurs(d.grignonFournisseurs)
      setGrignonClients(d.grignonClients)
      setTypeBriques(d.typeBriques)
      setAchats(d.achats)
      setLivraisons(d.livraisons)
      setRetours(d.retours)
      setGasoil(d.gasoil)
      setCharges(d.charges)
      setLocations(d.locations)
      setLoueurs(d.loueurs)
      onVoyageLoaded?.(d.voyage)
    } catch (err) {
      setLoadError(err.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadVoyage() }, [loadVoyage])
  useEffect(() => { fetchRemiseCarburantRate().then(setRemiseRate) }, [])

  // ── EDIT (shared with every other page that displays voyage-derived data) ───
  const {
    editRow, editForm, setEditForm, editSaving, editError,
    openEdit, closeEdit, save: saveEditRow,
  } = useVoyageTransactionEdit({ onSaved: loadVoyage, camionId: voyage?.camion_id })
  useEffect(() => { if (editError) toast(editError) }, [editError])

  // ── LOAD VEHICLE GASOIL FOR KM-BASED ALLOCATION ──────────────────────────────
  useEffect(() => {
    if (!voyage?.camion_id) return
    supabase.from('gasoil')
      .select('id,km,total,date,qte,adblue_total')
      .eq('camion_id', voyage.camion_id)
      .not('km', 'is', null)
      .order('km', { ascending: true })
      .then(({ data }) => setVehicleGasoil(data || []))
  }, [voyage?.camion_id])

  // ── LOAD SIDEBAR (shared engine — lighter-weight: no km-based fuel here) ─────
  // Not needed when embedded (Review Mode owns its own queue/prev-next).
  useEffect(() => {
    if (embedded) return
    async function loadSidebar() {
      const [{ data: vs }, { data: ac }, { data: li }, { data: ga }, { data: ch }, { data: re }, { data: sl }] = await Promise.all([
        supabase.from('voyages').select('id,date_depart,camion_plaque,destination,statut,reference').order('date_depart', { ascending: false }),
        supabase.from('voyage_achats').select('voyage_id,type_produit,type_brique,total_achat,qte,prix_achat'),
        supabase.from('voyage_livraisons').select('voyage_id,type_produit,type_brique,qte,total_vente,frais_total'),
        supabase.from('voyage_gasoil').select('voyage_id,total'),
        supabase.from('voyage_charges').select('voyage_id,montant,facture_client'),
        supabase.from('voyage_retours').select('voyage_id,montant'),
        supabase.from('voyage_locations').select('voyage_id,montant_location'),
      ])
      setSidebarVoyages(vs || [])
      const profits = {}
      ;(vs || []).forEach(v => {
        const p = computeVoyageProfit({
          voyage: v,
          achats: (ac||[]).filter(a=>a.voyage_id===v.id),
          livraisons: (li||[]).filter(l=>l.voyage_id===v.id),
          charges: (ch||[]).filter(c=>c.voyage_id===v.id),
          retours: (re||[]).filter(r=>r.voyage_id===v.id),
          locations: (sl||[]).filter(l=>l.voyage_id===v.id),
          camionRefills: [],
          voyageGasoilRows: (ga||[]).filter(g=>g.voyage_id===v.id),
          remiseRate,
        })
        profits[v.id] = p.profit
      })
      setSidebarProfits(profits)
    }
    loadSidebar()
  }, [embedded])

  // ── LOAD CAMION PLEINS (for gasoil selector) ─────────────────────────────────
  async function loadCamionPleins() {
    if (!voyage?.camion_id) return
    const { data } = await supabase.from('gasoil')
      .select('*')
      .eq('camion_id', voyage.camion_id)
      .order('date', { ascending: false })
      .limit(20)
    setCamionPleins(data || [])
    setShowGasoilPicker(true)
  }

  async function linkGasoilToVoyage(plein) {
    setLinkingGasoil(true)
    // Save to voyage_gasoil
    const { error } = await supabase.from('voyage_gasoil').insert({
      voyage_id:    parseInt(id),
      date_gasoil:  plein.date,
      station:      plein.station || '',
      qte_litres:   plein.qte || 0,
      prix_unitaire: plein.prix_unitaire || 0,
      gasoil_id:    plein.id,
    })
    if (!error) {
      // Link the gasoil record to this voyage
      await supabase.from('gasoil').update({ voyage_id: parseInt(id) }).eq('id', plein.id)
      setShowGasoilPicker(false)
      loadVoyage()
    } else {
      toast('Erreur: ' + error.message)
    }
    setLinkingGasoil(false)
  }

  // ── PROFIT CALCULATIONS (shared engine — lib/services/profitability.js) ─────

  // Distance readout only (independent of the fuel formula's own internal km check)
  const voyageKm = (voyage?.km_arrivee && voyage?.km_depart)
    ? Math.max(0, parseFloat(voyage.km_arrivee) - parseFloat(voyage.km_depart))
    : null

  const totalGasoilManuel = gasoil.reduce((s,g) => s+(g.total||0), 0)

  // Memoized (not just inline) so its identity only changes when the actual
  // section data changes — not on every keystroke in an unrelated add-form —
  // since it also drives the onSaved notification below.
  const result = useMemo(() => computeVoyageProfit({
    voyage, achats, livraisons, charges, retours, locations,
    camionRefills: vehicleGasoil,
    voyageGasoilRows: gasoil,
    remiseRate,
  }), [voyage, achats, livraisons, charges, retours, locations, vehicleGasoil, gasoil, remiseRate])

  // Let the host page (Review Mode) patch just this one voyage's row after
  // any load/save completes, instead of refetching its whole list. The third
  // argument carries the raw section arrays already in memory here, so the
  // host can run its own read-only anomaly checks without a second fetch.
  useEffect(() => {
    if (voyage) onSaved?.(voyage, result, { achats, livraisons, gasoil, charges, retours, locations })
  }, [voyage, result])

  const revenuBrut        = result.revenue.total
  const totalAchats       = result.cost.achatTotal
  const totalChargesFixed = result.cost.chargesOperationnelles
  const totalLocation     = result.cost.rental
  const fuelCost          = result.cost.fuel
  const fuelSource        = result.cost.fuelSource
  const profitNet         = result.profit
  const margePercent      = result.marge

  // Truck type: loué trucks add location cost to total
  const isLoue = camions.find(c => c.id === voyage?.camion_id)?.type_camion === 'loue'

  const clientProfits = result.clients

  // ── SIDEBAR NAVIGATION ───────────────────────────────────────────────────────
  const sidebarFiltered = sidebarSearch
    ? sidebarVoyages.filter(v =>
        (v.camion_plaque||'').toLowerCase().includes(sidebarSearch.toLowerCase()) ||
        (v.destination||'').toLowerCase().includes(sidebarSearch.toLowerCase()) ||
        fmtDate(v.date_depart).includes(sidebarSearch)
      )
    : sidebarVoyages

  const currentIdx = sidebarFiltered.findIndex(v => v.id === parseInt(id))
  const prevVoyage = currentIdx > 0 ? sidebarFiltered[currentIdx-1] : null
  const nextVoyage = currentIdx < sidebarFiltered.length-1 ? sidebarFiltered[currentIdx+1] : null

  function navigateTo(vid) { router.push(`/voyages/${vid}`) }
  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX }
  function onTouchEnd(e) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 60) {
      if (dx < 0 && nextVoyage) navigateTo(nextVoyage.id)
      if (dx > 0 && prevVoyage) navigateTo(prevVoyage.id)
    }
    touchStartX.current = null
  }

  // ── SAVE ACHAT ───────────────────────────────────────────────────────────────
  async function saveAchat(e) {
    e.preventDefault()
    if (!achatForm.qte || !achatForm.prix_achat) { showMsg('❌ Quantité et prix requis'); return }
    setSavingAchat(true)
    try {
      await dbSaveAchat(id, achatForm, { fournisseurs, grignonFournisseurs, typeBriques, voyage })
      if (addAnotherAchatRef.current) {
        const nextType = achatForm.type_produit === 'brique' ? 'grignon' : 'brique'
        setAchatForm(f => ({ ...f, type_produit: nextType, fournisseur_id: '', type_brique_id: '', qte: '', prix_achat: '', note: '' }))
        setShowAchatNote(false)
      } else {
        setShowAchat(false)
        setShowAchatNote(false)
        setAchatForm({ date_achat: today(), type_produit: 'brique', fournisseur_id: '', type_brique_id: '', qte: '', prix_achat: '', note: '' })
      }
      addAnotherAchatRef.current = false
      loadVoyage()
    } catch (err) {
      toast('Erreur enregistrement achat: ' + err.message)
    } finally { setSavingAchat(false) }
  }

  // ── SAVE LIVRAISON ───────────────────────────────────────────────────────────
  async function saveLiv(e) {
    e.preventDefault()
    if (!livForm.client_id || !livForm.qte || !livForm.prix_vente) { showMsg('❌ Client, quantité et prix requis'); return }
    setSavingLiv(true)
    try {
      await dbSaveLiv(id, livForm, { clients, grignonClients, typeBriques, voyage, achats })
      if (addAnotherLivRef.current) {
        setLivForm(f => ({ ...f, client_id: '', qte: '', remise: '', note: '', frais: [] }))
        setShowLivNote(false)
      } else {
        setShowLiv(false)
        setLivForm({ date_livraison: today(), type_produit: 'brique', client_id: '', type_brique_id: '', qte: '', prix_vente: '', prix_achat: '', remise: '', note: '', frais: [] })
        setShowLivNote(false)
      }
      addAnotherLivRef.current = false
      loadVoyage()
    } catch (err) {
      toast('Erreur enregistrement livraison: ' + err.message)
    } finally { setSavingLiv(false) }
  }

  // ── SAVE RETOUR ──────────────────────────────────────────────────────────────
  async function saveRetour(e) {
    e.preventDefault()
    if (!retForm.client_nom || !retForm.montant) { showMsg('❌ Client et montant requis'); return }
    setSavingRetour(true)
    try {
      await dbSaveRetour(id, retForm, { voyage })
      setShowRetour(false)
      setRetForm({ date_retour: today(), client_nom: '', destination: '', montant: '', montant_paye: '', note: '' })
      loadVoyage()
    } catch (err) {
      toast('Erreur enregistrement retour: ' + err.message)
    } finally { setSavingRetour(false) }
  }

  // ── SAVE CHARGES GRID ────────────────────────────────────────────────────────
  async function saveChargeGrid(e) {
    e.preventDefault()
    if (CHARGE_CATS.filter(cat => parseFloat(chgGrid[cat.key]) > 0).length === 0) { showMsg('❌ Entrez au moins un montant'); return }
    setSavingChg(true)
    try {
      await dbSaveChargeGrid(id, chgDate, chgGrid, chgFactureMap, { clients, voyage })
      setShowCharge(false)
      setChgGrid(emptyChgGrid()); setChgFactureMap({}); setChgDate(today())
      loadVoyage()
    } catch (err) {
      toast('Erreur enregistrement charges: ' + err.message)
    } finally { setSavingChg(false) }
  }

  // ── DELETE HANDLERS ──────────────────────────────────────────────────────────
  async function delAchat(row) {
    try {
      await dbDelAchat(row)
      loadVoyage()
    } catch (err) { toast('Erreur suppression achat: ' + err.message) }
  }

  async function delLiv(row) {
    try {
      await dbDelLiv(row)
      loadVoyage()
    } catch (err) { toast('Erreur suppression livraison: ' + err.message) }
  }

  async function delRetour(row) {
    try {
      await dbDelRetour(row)
      loadVoyage()
    } catch (err) { toast('Erreur suppression retour: ' + err.message) }
  }

  async function delGasoil(row) {
    try {
      const { error: rpcErr } = await supabase.rpc('delete_voyage_gasoil', { p_id: row.id })
      if (rpcErr) {
        // Fallback: manual with fresh-read camion
        await supabase.from('voyage_gasoil').delete().eq('id', row.id)
        if (row.gasoil_id) await supabase.from('gasoil').delete().eq('id', row.gasoil_id)
        if (voyage?.camion_id && row.total) {
          const { data: freshCam } = await supabase.from('camions').select('gasoil_dhs,pleins,litres').eq('id', voyage.camion_id).single()
          if (freshCam) await supabase.from('camions').update({
            gasoil_dhs: Math.max(0,(freshCam.gasoil_dhs||0)-row.total),
            pleins:     Math.max(0,(freshCam.pleins||0)-1),
            litres:     Math.max(0,(freshCam.litres||0)-(row.qte_litres||0)),
          }).eq('id', voyage.camion_id)
        }
      }
      loadVoyage()
    } catch (err) { toast('Erreur suppression gasoil: ' + err.message) }
  }

  async function delCharge(row) {
    try {
      await dbDelCharge(row, voyage?.camion_id)
      loadVoyage()
    } catch (err) { toast('Erreur suppression charge: ' + err.message) }
  }
  async function updateStatut(s) {
    setSavingStatut(true)
    await dbUpdateStatut(id, s)
    setSavingStatut(false); loadVoyage()
  }

  async function updateKm() {
    setSavingKm(true)
    await dbUpdateKm(id, kmForm.km_depart)
    if (voyage?.camion_id) await recalcOdometerChain(voyage.camion_id)
    setSavingKm(false)
    setEditingKm(false)
    loadVoyage()
  }

  async function saveFuelMode(fields) {
    await dbUpdateFuelMode(id, fields)
    loadVoyage()
  }

  async function saveLocation(e) {
    e.preventDefault()
    setSavingLoc(true)
    try {
      const montant_location = parseFloat(locForm.montant_location) || 0
      const montant_paye     = parseFloat(locForm.montant_paye) || 0
      const reste            = Math.max(0, montant_location - montant_paye)
      const loueur           = loueurs.find(l => l.id === parseInt(locForm.loueur_id))
      const payload = {
        loueur_id:        loueur ? parseInt(locForm.loueur_id) : null,
        loueur_nom:       loueur?.nom || '',
        montant_location,
        montant_paye,
        reste,
        note: locForm.note || null,
      }
      if (locations.length > 0) {
        await supabase.from('voyage_locations').update(payload).eq('id', locations[0].id)
      } else {
        await supabase.from('voyage_locations').insert({ ...payload, voyage_id: parseInt(id) })
      }
      setShowLocation(false)
      loadVoyage()
    } catch (err) { toast('Erreur location: ' + err.message) }
    finally { setSavingLoc(false) }
  }

  async function delLocation(loc) {
    await supabase.from('voyage_locations').delete().eq('id', loc.id)
    loadVoyage()
  }

  // Exposes the currently-open add-form's own save handler to the host page
  // (Review Mode's Ctrl+S) — calls the exact same save*/validation logic a
  // click on that form's own "Enregistrer" button would, nothing new. No
  // deps array: always closes over the latest state, correctness over a
  // premature optimization here.
  useImperativeHandle(ref, () => ({
    saveActive() {
      const fakeEvent = { preventDefault() {} }
      if (showAchat)    { saveAchat(fakeEvent);      return true }
      if (showLiv)      { saveLiv(fakeEvent);        return true }
      if (showRetour)   { saveRetour(fakeEvent);     return true }
      if (showCharge)   { saveChargeGrid(fakeEvent); return true }
      if (showLocation) { saveLocation(fakeEvent);   return true }
      return false
    },
  }))

  function showMsg(m) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  if (loading) return <div className="text-center py-20 text-slate-400">Chargement...</div>
  if (loadError) return (
    <div className="text-center py-20">
      <div className="text-red-500 font-bold text-lg mb-2">❌ {loadError}</div>
      <button onClick={loadVoyage} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-xl font-semibold text-sm hover:bg-blue-700 transition">
        Réessayer
      </button>
    </div>
  )
  if (!voyage) return <div className="text-center py-20 text-slate-400">Voyage introuvable</div>

  const isTermine = voyage.statut === 'termine'

  return (
    <>
      <ToastContainer />
      <EditTransactionModal
        editRow={editRow} editForm={editForm} setEditForm={setEditForm}
        onSave={saveEditRow} onCancel={closeEdit} saving={editSaving}
      />

      {/* ── TWO-COLUMN LAYOUT ── */}
      <div className={embedded ? undefined : 'flex gap-4 items-start'}
        onTouchStart={embedded ? undefined : onTouchStart}
        onTouchEnd={embedded ? undefined : onTouchEnd}>

        {/* ── SIDEBAR: desktop only, standalone page only ── */}
        {!embedded && (
        <div className="hidden md:flex flex-col w-60 flex-shrink-0 self-start sticky bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
          style={{ top: '5.5rem', maxHeight: 'calc(100vh - 7rem)' }}>
          <div className="p-3 border-b border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-700 text-xs uppercase tracking-wide">🚛 Voyages</span>
              <Link href="/voyages" className="text-[10px] text-blue-500 hover:underline font-semibold">Liste →</Link>
            </div>
            <input type="text" value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)}
              placeholder="Camion, ville, date…"
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-slate-50" />
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {sidebarFiltered.map(v => {
              const profit   = sidebarProfits[v.id]
              const isActive = v.id === parseInt(id)
              return (
                <button key={v.id} onClick={() => navigateTo(v.id)}
                  className={`w-full text-left px-3 py-2.5 transition-colors
                    ${isActive ? 'bg-blue-600' : 'hover:bg-blue-50/60'}`}>
                  <div className={`font-bold text-xs leading-tight ${isActive ? 'text-white' : 'text-slate-800'}`}>
                    {v.reference || `#${v.id}`}
                  </div>
                  <div className={`text-[10px] mt-0.5 ${isActive ? 'text-blue-200' : 'text-slate-400'}`}>
                    {fmtDate(v.date_depart)} · {v.camion_plaque}
                    {v.destination ? ` → ${v.destination}` : ''}
                  </div>
                  {profit !== undefined && (
                    <div className={`text-[10px] font-bold mt-0.5 ${
                      profit >= 0
                        ? (isActive ? 'text-emerald-300' : 'text-emerald-600')
                        : (isActive ? 'text-red-300' : 'text-red-500')
                    }`}>
                      {profit >= 0 ? '+' : ''}{fmt(profit)} DHS
                    </div>
                  )}
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50">
            <button onClick={() => prevVoyage && navigateTo(prevVoyage.id)} disabled={!prevVoyage}
              className="font-bold text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded-lg hover:bg-white transition text-sm">←</button>
            <span className="text-[10px] text-slate-500 font-semibold">
              {currentIdx >= 0 ? `${currentIdx+1} / ${sidebarFiltered.length}` : '—'}
            </span>
            <button onClick={() => nextVoyage && navigateTo(nextVoyage.id)} disabled={!nextVoyage}
              className="font-bold text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded-lg hover:bg-white transition text-sm">→</button>
          </div>
        </div>
        )}

        {/* ── MAIN CONTENT ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ── MOBILE NAV: standalone page only ── */}
          {!embedded && (
          <div className="md:hidden bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between px-2 py-2.5">
            <button onClick={() => prevVoyage && navigateTo(prevVoyage.id)} disabled={!prevVoyage}
              className="text-xl font-bold text-slate-500 hover:text-slate-800 disabled:opacity-30 px-3 py-1 rounded-xl hover:bg-slate-50 transition">←</button>
            <div className="text-center">
              <div className="text-xs font-bold text-slate-700">{fmtDate(voyage.date_depart)} · {voyage.camion_plaque}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {currentIdx >= 0 ? `${currentIdx+1} / ${sidebarFiltered.length}` : ''}
              </div>
            </div>
            <button onClick={() => nextVoyage && navigateTo(nextVoyage.id)} disabled={!nextVoyage}
              className="text-xl font-bold text-slate-500 hover:text-slate-800 disabled:opacity-30 px-3 py-1 rounded-xl hover:bg-slate-50 transition">→</button>
          </div>
          )}

          {msg && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm font-semibold px-4 py-2 rounded-xl">{msg}</div>
          )}

          {/* ── HEADER ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {!embedded && (
                <>
                  <Link href="/voyages" className="text-blue-500 hover:text-blue-700 text-sm font-semibold hidden md:inline">← Voyages</Link>
                  <span className="text-slate-200 hidden md:inline">|</span>
                </>
              )}
              <div>
                <div className="font-black text-slate-800">{voyage.reference || `Voyage #${voyage.id}`}</div>
                <div className="text-xs text-slate-500">{fmtDate(voyage.date_depart)} • {voyage.camion_plaque}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                voyage.statut==='termine' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'
              }`}>
                {voyage.statut==='termine' ? '✅ Terminé' : '🔄 En cours'}
              </span>
              {!isTermine ? (
                <button onClick={() => updateStatut('termine')} disabled={savingStatut}
                  className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-emerald-700 transition">
                  Clôturer le voyage
                </button>
              ) : (
                <button onClick={() => updateStatut('en_cours')} disabled={savingStatut}
                  className="text-xs bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg font-semibold hover:bg-slate-300 transition">
                  Réouvrir
                </button>
              )}
            </div>
          </div>

          {/* ── ODOMETER BAR ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Odomètre au chargement</div>
                  {editingKm ? (
                    <input type="number" value={kmForm.km_depart}
                      onChange={e => setKmForm({ ...kmForm, km_depart: e.target.value })}
                      className="input text-sm w-28" placeholder="125000" />
                  ) : (
                    <div className="text-sm font-bold text-slate-700">
                      {voyage.km_depart ? fmt(voyage.km_depart) : <span className="text-slate-300 font-normal">—</span>}
                    </div>
                  )}
                </div>
                <div className="text-slate-300 text-lg mt-3">→</div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Odomètre voyage suivant</div>
                  <div className="text-sm font-bold text-slate-700">
                    {voyage.km_arrivee ? fmt(voyage.km_arrivee) : <span className="text-slate-300 font-normal">— (pas encore de voyage suivant)</span>}
                  </div>
                </div>
                {voyageKm !== null && voyageKm > 0 && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5">
                    <div className="text-[10px] text-blue-400 uppercase tracking-wide">Distance</div>
                    <div className="text-sm font-black text-blue-700">{fmt(voyageKm)} km</div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {editingKm ? (
                  <>
                    <button onClick={updateKm} disabled={savingKm}
                      className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-700 transition">
                      {savingKm ? '...' : '✓ Enregistrer'}
                    </button>
                    <button onClick={() => setEditingKm(false)}
                      className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition">
                      Annuler
                    </button>
                  </>
                ) : (
                  <button onClick={() => { setKmForm({ km_depart: voyage.km_depart || '' }); setEditingKm(true) }}
                    className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition">
                    ✏️ Saisir odomètre
                  </button>
                )}
              </div>
            </div>
          </div>

          </div>
          <div ref={sectionRefs.profit}>
          {/* ── STEP NAVIGATOR ── */}
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border border-slate-100 rounded-2xl shadow-sm mb-4 p-2">
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              {[
                { key: 'achat',     icon: '📦', label: 'Achats',     count: achats.length,     color: '#3b82f6' },
                { key: 'livraison', icon: '🚚', label: 'Livraisons', count: livraisons.length, color: '#10b981' },
                { key: 'retour',    icon: '↩️',  label: 'Retours',   count: retours.length,    color: '#8b5cf6' },
                { key: 'charge',    icon: '💸', label: 'Charges',    count: charges.length,    color: '#ef4444' },
                { key: 'gasoil',    icon: '⛽', label: 'Gasoil',     count: gasoil.length,     color: '#f97316' },
                ...(isLoue ? [{ key: 'location', icon: '🔑', label: 'Location', count: locations.length, color: '#d97706' }] : []),
                { key: 'profit',    icon: '📊', label: 'Résultat',   count: null,              color: '#1e3a5f' },
              ].map(step => (
                <button key={step.key} onClick={() => scrollTo(step.key)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={activeStep === step.key
                    ? { background: step.color, color: '#fff' }
                    : { background: '#f8fafc', color: '#64748b' }
                  }>
                  <span>{step.icon}</span>
                  <span className="hidden sm:inline">{step.label}</span>
                  {step.count !== null && step.count > 0 && (
                    <span className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                      style={activeStep === step.key
                        ? { background: 'rgba(255,255,255,0.3)', color: '#fff' }
                        : { background: step.color + '22', color: step.color }
                      }>{step.count}</span>
                  )}
                  {step.count === 0 && (
                    <span className="ml-0.5 text-[10px] opacity-40">○</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── PROFIT SUMMARY ── */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white shadow-lg">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Résultat du voyage</div>
            {/* Truck type badge */}
            {isLoue && (
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs font-bold bg-amber-800/60 text-amber-300 px-2.5 py-1 rounded-lg">🔑 Camion loué</span>
                {locations.length > 0 && <span className="text-xs text-amber-300">{locations[0].loueur_nom || '—'}</span>}
              </div>
            )}
            <div className={`grid gap-4 mb-4 ${isLoue ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'}`}>
              <div>
                <div className="text-[10px] text-slate-400 mb-1">Revenu brut</div>
                <div className="text-lg font-black text-emerald-400">{fmt(revenuBrut)} DHS</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 mb-1">Coût achats</div>
                <div className="text-lg font-black text-red-400">{fmt(totalAchats)} DHS</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 mb-1 flex items-center gap-1 flex-wrap">
                  Carburant + Charges
                  {fuelSource === 'automatic'     && <span className="text-[9px] bg-emerald-900/60 text-emerald-300 px-1.5 py-0.5 rounded font-bold">⚡ auto</span>}
                  {fuelSource === 'manuel'        && <span className="text-[9px] bg-amber-900/60 text-amber-300 px-1.5 py-0.5 rounded font-bold">📝 manuel</span>}
                  {fuelSource === 'manual_rate'   && <span className="text-[9px] bg-blue-900/60 text-blue-300 px-1.5 py-0.5 rounded font-bold">📏 estim. km</span>}
                  {fuelSource === 'manual_amount' && <span className="text-[9px] bg-purple-900/60 text-purple-300 px-1.5 py-0.5 rounded font-bold">💰 montant</span>}
                  {fuelSource === 'none' && !isLoue && <span className="text-[9px] bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded font-bold">⚠ manquant</span>}
                </div>
                <div className="text-lg font-black text-orange-400">{fmt(fuelCost + totalChargesFixed)} DHS</div>
                {fuelSource === 'automatic' && voyageKm > 0 && (
                  <div className="text-[10px] text-emerald-300 mt-0.5">{fmt(voyageKm)} km · {fmtD(fuelCost / voyageKm)} DHS/km</div>
                )}
              </div>
              {isLoue && (
                <div>
                  <div className="text-[10px] text-slate-400 mb-1 flex items-center gap-1">
                    Location camion
                    {totalLocation === 0 && <span className="text-[9px] bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded font-bold">⚠ non saisi</span>}
                  </div>
                  <div className="text-lg font-black text-amber-400">{fmt(totalLocation)} DHS</div>
                  {locations.length > 0 && locations[0].reste > 0 && (
                    <div className="text-[10px] text-red-300 mt-0.5">Reste: {fmt(locations[0].reste)} DHS</div>
                  )}
                </div>
              )}
              <div>
                <div className="text-[10px] text-slate-400 mb-1">Profit net</div>
                <div className={`text-2xl font-black ${profitNet>=0?'text-emerald-400':'text-red-400'}`}>
                  {profitNet>=0?'+':''}{fmt(profitNet)} DHS
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Marge: {margePercent}%</div>
              </div>
            </div>
            {clientProfits.length > 0 && (
              <div className="border-t border-slate-700 pt-4">
                <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">
                  Profit par client — répartition proportionnelle par quantité livrée
                  {fuelSource === 'none' && <span className="ml-2 text-red-400">⚠ carburant non inclus</span>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {clientProfits.map(cp => (
                    <div key={cp.key} className="bg-slate-700/50 rounded-xl p-3">
                      <div className="font-bold text-sm text-white">
                        {cp.client_nom}
                        {cp.hasUndeterminedCost && <span className="text-amber-400 ml-1" title="⚠ Coût d'achat indéterminé pour au moins une livraison">⚠</span>}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        ID {cp.client_id} · {cp.type_produit === 'grignon' ? <span className="text-amber-400">Grignon</span> : <span className="text-blue-400">Brique</span>}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {fmt(cp.qte)} u · {Math.round(cp.briqueShare * 100)}% du carburant/location/charges du voyage
                      </div>
                      <div className="text-[10px] text-slate-400">Rev: {fmt(cp.revenue.total)} · Coût: {fmt(cp.cost.total)}</div>
                      <div className={`text-base font-black mt-1 ${cp.profit>=0?'text-emerald-400':'text-red-400'}`}>
                        {cp.profit>=0?'+':''}{fmt(cp.profit)} DHS
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── VALIDATION DU VOYAGE ── */}
          <ValidationPanel achats={achats} livraisons={livraisons} />

          {/* ── SECTION: ACHATS ── */}
          <div ref={sectionRefs.achat}>
          <AchatSection
            achats={achats}
            showAchat={showAchat} onToggleForm={() => setShowAchat(v=>!v)}
            achatForm={achatForm} onFormChange={setAchatForm}
            showAchatNote={showAchatNote} onShowNote={() => setShowAchatNote(true)}
            savingAchat={savingAchat}
            fournisseurs={fournisseurs} grignonFournisseurs={grignonFournisseurs} typeBriques={typeBriques}
            addAnotherAchatRef={addAnotherAchatRef}
            onSave={saveAchat} onCancel={() => { setShowAchat(false); setShowAchatNote(false) }}
            onEdit={a => openEdit('achat', a)} onDel={delAchat}
          />

          {/* ── SECTION: LIVRAISONS ── */}
          </div>
          <div ref={sectionRefs.livraison}>
          <LivraisonSection
            livraisons={livraisons}
            showLiv={showLiv} onToggleForm={() => setShowLiv(v=>!v)}
            livForm={livForm} onFormChange={setLivForm}
            showLivNote={showLivNote} onShowNote={() => setShowLivNote(true)}
            savingLiv={savingLiv}
            clients={clients} grignonClients={grignonClients} typeBriques={typeBriques}
            addAnotherLivRef={addAnotherLivRef}
            onSave={saveLiv} onCancel={() => { setShowLiv(false); setShowLivNote(false) }}
            onEdit={l => openEdit('liv', l)} onDel={delLiv}
          />

          {/* ── SECTION: RETOUR TRANSPORT ── */}
          </div>
          <div ref={sectionRefs.retour}>
          <RetourSection
            retours={retours}
            showRetour={showRetour} onToggleForm={() => setShowRetour(v => !v)}
            retForm={retForm} onFormChange={setRetForm}
            savingRetour={savingRetour}
            clients={clients}
            onSave={saveRetour} onCancel={() => setShowRetour(false)}
            onEdit={r => openEdit('retour', r)} onDel={delRetour}
          />

          {/* ── SECTION: GASOIL ── */}
          </div>
          <div ref={sectionRefs.gasoil} className="space-y-4">
          <FuelModeSection
            voyage={voyage}
            fuelCost={fuelCost}
            fuelSource={fuelSource}
            voyageKm={voyageKm}
            onSave={saveFuelMode}
          />
          <GasoilSection
            gasoil={gasoil}
            showGasoilPicker={showGasoilPicker} onClosePicker={() => setShowGasoilPicker(false)}
            camionPleins={camionPleins}
            linkingGasoil={linkingGasoil}
            onLoadPleins={loadCamionPleins}
            onLinkGasoil={linkGasoilToVoyage}
            onDel={delGasoil}
            fuelSource={fuelSource}
            fuelCost={fuelCost}
            voyageKm={voyageKm}
            totalGasoilManuel={totalGasoilManuel}
            camionPlaque={voyage?.camion_plaque}
            voyageId={id}
          />

          {/* ── SECTION: CHARGES ── */}
          </div>
          <div ref={sectionRefs.charge}>
          <ChargesSection
            charges={charges}
            showCharge={showCharge} onToggleForm={() => setShowCharge(v => !v)}
            chgDate={chgDate} onDateChange={setChgDate}
            chgGrid={chgGrid} onGridChange={setChgGrid}
            chgFactureMap={chgFactureMap} onFactureMapChange={setChgFactureMap}
            showAllCharges={showAllCharges} onShowAll={setShowAllCharges}
            savingChg={savingChg}
            clients={clients}
            onSave={saveChargeGrid}
            onCancel={() => { setShowCharge(false); setChgGrid(emptyChgGrid()); setChgFactureMap({}); setShowAllCharges(false) }}
            onEdit={c => openEdit('charge', c)} onDel={delCharge}
          />

          {/* ── SECTION: LOCATION CAMION (camions loués only) ── */}
          {isLoue && (
            <div ref={sectionRefs.location}>
            <LocationSection
              locations={locations}
              showLocation={showLocation}
              onToggleForm={() => {
                if (!showLocation && locations.length > 0) {
                  const l = locations[0]
                  setLocForm({ loueur_id: l.loueur_id ? String(l.loueur_id) : '', montant_location: String(l.montant_location || ''), montant_paye: String(l.montant_paye || ''), note: l.note || '' })
                }
                setShowLocation(v => !v)
              }}
              locForm={locForm} onFormChange={setLocForm}
              savingLoc={savingLoc}
              loueurs={loueurs}
              onSave={saveLocation} onCancel={() => setShowLocation(false)}
              onDel={delLocation}
            />
            </div>
          )}

        </div>
        </div>{/* last section ref div */}
      </div>
    </>
  )
})

export default VoyageDetailPanel
