import { useState, useEffect, useCallback, useRef } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import { useAuth } from '../_app'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { fmt, fmtD, fmtDate, today } from '../../lib/utils'
import { CHARGE_CATS, COMMON_CHARGE_KEYS } from '../../lib/voyage-constants'
import { loadVoyageData } from '../../lib/services/voyage/loaders'
import { updateStatut as dbUpdateStatut, updateKm as dbUpdateKm } from '../../lib/services/voyage/updates'
import { saveAchat as dbSaveAchat, updateAchat as dbUpdateAchat, delAchat as dbDelAchat } from '../../lib/services/voyage/achats'
import { saveLiv as dbSaveLiv, updateLiv as dbUpdateLiv, delLiv as dbDelLiv } from '../../lib/services/voyage/livraisons'
import Section from '../../components/ui/Section'
import Empty from '../../components/ui/Empty'
import DelBtn from '../../components/ui/DelBtn'
import EditBtn from '../../components/ui/EditBtn'

export default function VoyageDetail() {
  const router   = useRouter()
  const { id }   = router.query
  const { user } = useAuth()
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
  const [livForm,   setLivForm]   = useState({ date_livraison: today(), type_produit: 'brique', client_id: '', type_brique_id: '', qte: '', prix_vente: '', prix_achat: '', remise: '', note: '' })
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

  // ── edit state ──
  const [editRow,    setEditRow]    = useState(null) // { type, data }
  const [editForm,   setEditForm]   = useState({})
  const [editSaving, setEditSaving] = useState(false)

  // ── km tracking ──
  const [vehicleGasoil, setVehicleGasoil] = useState([])
  const [kmForm,        setKmForm]        = useState({ km_depart: '', km_arrivee: '' })
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
    } catch (err) {
      setLoadError(err.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadVoyage() }, [loadVoyage])

  // ── LOAD VEHICLE GASOIL FOR KM-BASED ALLOCATION ──────────────────────────────
  useEffect(() => {
    if (!voyage?.camion_id) return
    supabase.from('gasoil')
      .select('id,km,total,date,qte')
      .eq('camion_id', voyage.camion_id)
      .not('km', 'is', null)
      .order('km', { ascending: true })
      .then(({ data }) => setVehicleGasoil(data || []))
  }, [voyage?.camion_id])

  // ── LOAD SIDEBAR ─────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadSidebar() {
      const [{ data: vs }, { data: ac }, { data: li }, { data: ga }, { data: ch }, { data: re }, { data: sl }] = await Promise.all([
        supabase.from('voyages').select('id,date_depart,camion_plaque,destination,statut,reference').order('date_depart', { ascending: false }),
        supabase.from('voyage_achats').select('voyage_id,total_achat,qte,prix_achat'),
        supabase.from('voyage_livraisons').select('voyage_id,total_vente'),
        supabase.from('voyage_gasoil').select('voyage_id,total'),
        supabase.from('voyage_charges').select('voyage_id,montant,facture_client'),
        supabase.from('voyage_retours').select('voyage_id,montant_paye'),
        supabase.from('voyage_locations').select('voyage_id,montant_location'),
      ])
      setSidebarVoyages(vs || [])
      const profits = {}
      ;(vs || []).forEach(v => {
        const revLivs = (li||[]).filter(l=>l.voyage_id===v.id).reduce((s,l)=>s+(l.total_vente||0),0)
        const revRets = (re||[]).filter(r=>r.voyage_id===v.id).reduce((s,r)=>s+(r.montant_paye||0),0)
        const revChg  = (ch||[]).filter(c=>c.voyage_id===v.id&&c.facture_client).reduce((s,c)=>s+(c.montant||0),0)
        const coutAc  = (ac||[]).filter(a=>a.voyage_id===v.id).reduce((s,a)=>s+(a.total_achat||(a.qte||0)*(a.prix_achat||0)),0)
        const coutGas = (ga||[]).filter(g=>g.voyage_id===v.id).reduce((s,g)=>s+(g.total||0),0)
        const coutChg = (ch||[]).filter(c=>c.voyage_id===v.id&&!c.facture_client).reduce((s,c)=>s+(c.montant||0),0)
        const coutLoc = (sl||[]).filter(l=>l.voyage_id===v.id).reduce((s,l)=>s+(l.montant_location||0),0)
        profits[v.id] = (revLivs+revRets+revChg)-(coutAc+coutGas+coutChg+coutLoc)
      })
      setSidebarProfits(profits)
    }
    loadSidebar()
  }, [])

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

  // ── PROFIT CALCULATIONS ──────────────────────────────────────────────────────

  // km-based fuel allocation — find last fill-up at/before km_depart, apply its cost/km rate
  const voyageKm = (voyage?.km_arrivee && voyage?.km_depart)
    ? Math.max(0, parseFloat(voyage.km_arrivee) - parseFloat(voyage.km_depart))
    : null

  const kmBasedFuelCost = (() => {
    if (!voyageKm || voyageKm <= 0 || vehicleGasoil.length < 2) return null
    const vStart = parseFloat(voyage.km_depart)
    const sorted = [...vehicleGasoil].sort((a, b) => parseFloat(a.km) - parseFloat(b.km))
    let fillIdx = -1
    for (let i = 0; i < sorted.length; i++) {
      if (parseFloat(sorted[i].km) <= vStart) fillIdx = i
    }
    if (fillIdx < 0 || fillIdx >= sorted.length - 1) return null
    const g1 = sorted[fillIdx], g2 = sorted[fillIdx + 1]
    const cycleKm = parseFloat(g2.km) - parseFloat(g1.km)
    if (cycleKm <= 0) return null
    return Math.round(voyageKm * (g1.total || 0) / cycleKm * 100) / 100
  })()

  const totalGasoilManuel  = gasoil.reduce((s,g) => s+(g.total||0), 0)
  const totalChargesFixed  = charges.filter(c=>!c.facture_client).reduce((s,c) => s+(c.montant||0), 0)
  const totalChargesClient = charges.filter(c=>c.facture_client).reduce((s,c) => s+(c.montant||0), 0)
  const totalRevenuLivs    = livraisons.reduce((s,l) => s+(l.total_vente||0), 0)
  const totalAchats        = achats.reduce((s,a) => s+(a.total_achat||(a.qte||0)*(a.prix_achat||0)), 0)
  const totalRetours       = retours.reduce((s,r) => s+(r.montant_paye||0), 0)
  const totalLocation      = locations.reduce((s,l) => s+(l.montant_location||0), 0)
  const revenuBrut         = totalRevenuLivs + totalRetours + totalChargesClient

  // Fuel: prefer km-based auto-allocation, fallback to historical manual voyage_gasoil entries
  const fuelCost   = kmBasedFuelCost !== null ? kmBasedFuelCost : totalGasoilManuel
  const fuelSource = kmBasedFuelCost !== null ? 'km' : (totalGasoilManuel > 0 ? 'manuel' : 'none')

  // Truck type: loué trucks add location cost to total
  const isLoue      = camions.find(c => c.id === voyage?.camion_id)?.type_camion === 'loue'
  const coutTotal   = totalAchats + fuelCost + totalLocation + totalChargesFixed
  const profitNet   = revenuBrut - coutTotal
  const margePercent = revenuBrut > 0 ? Math.round(profitNet/revenuBrut*100) : 0

  // Per-client distribution: quantity-weighted (proportional to briques delivered)
  const clientsUniques = [...new Set(livraisons.map(l=>l.client_id).filter(Boolean))]
  const nbClients      = Math.max(clientsUniques.length, 1)
  const totalQteVoyage = livraisons.reduce((s,l) => s+(l.qte||0), 0)

  const clientProfits = clientsUniques.map(cid => {
    const myLivs    = livraisons.filter(l=>l.client_id===cid)
    const isGrignon = myLivs[0]?.type_produit === 'grignon'
    const cl        = isGrignon
      ? grignonClients.find(c=>c.id===cid)
      : clients.find(c=>c.id===cid)
    const myCharges = charges.filter(c=>c.facture_client&&c.client_id===cid)
    const myQte     = myLivs.reduce((s,l) => s+(l.qte||0), 0)
    const qteShare  = totalQteVoyage > 0 ? myQte / totalQteVoyage : 1 / nbClients
    const rev       = myLivs.reduce((s,l)=>s+(l.total_vente||0),0) + myCharges.reduce((s,c)=>s+(c.montant||0),0)
    const cout      = myLivs.reduce((s,l)=>s+(l.total_achat||(l.qte||0)*(l.prix_achat||0)),0)
                    + (fuelCost + totalLocation) * qteShare
                    + totalChargesFixed * qteShare
    return { id: cid, nom: cl?.nom || myLivs[0]?.client_nom || '—', isGrignon, rev, cout, profit: rev-cout, qte: myQte, qteShare }
  })

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

  // ── EDIT HELPERS ─────────────────────────────────────────────────────────────
  function openEdit(type, data) { setEditRow({ type, data }); setEditForm({ ...data }) }

  async function updateAchat() {
    setEditSaving(true)
    try {
      await dbUpdateAchat(editRow.data, editForm)
      setEditRow(null); loadVoyage()
    } catch (err) {
      toast('Erreur modification achat: ' + err.message)
    } finally { setEditSaving(false) }
  }

  async function updateLiv() {
    setEditSaving(true)
    try {
      await dbUpdateLiv(editRow.data, editForm)
      setEditRow(null); loadVoyage()
    } catch (err) {
      toast('Erreur modification livraison: ' + err.message)
    } finally { setEditSaving(false) }
  }

  async function updateRetour() {
    setEditSaving(true)
    try {
      const old = editRow.data
      const montant = parseFloat(editForm.montant)||0, montant_paye = parseFloat(editForm.montant_paye)||0
      const restant = Math.max(0, montant-montant_paye)
      const { error } = await supabase.from('voyage_retours').update({
        date_retour: editForm.date_retour, client_nom: editForm.client_nom,
        destination: editForm.destination||null, montant, montant_paye, note: editForm.note||null
      }).eq('id', old.id)
      if (error) throw error
      if (old.retour_id) {
        await supabase.from('retours_transport').update({ montant, montant_paye, restant }).eq('id', old.retour_id)
      }
      setEditRow(null); loadVoyage()
    } catch (err) {
      toast('Erreur modification retour: ' + err.message)
    } finally { setEditSaving(false) }
  }

  async function updateCharge() {
    setEditSaving(true)
    try {
      const old = editRow.data
      const montant = parseFloat(editForm.montant)||0
      const { error } = await supabase.from('voyage_charges').update({
        date_charge: editForm.date_charge, montant
      }).eq('id', old.id)
      if (error) throw error

      const diff = montant - (old.montant||0)
      if (diff !== 0) {
        // Sync client solde + linked vente if billed to client
        if (old.facture_client && old.client_id) {
          const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', old.client_id).single()
          if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde||0)+diff }).eq('id', old.client_id)
          await supabase.from('ventes')
            .update({ montant_mdo: montant })
            .eq('voyage_id', old.voyage_id)
            .eq('client_id', old.client_id)
            .eq('type_entree', 'mdo')
            .eq('montant_mdo', old.montant)
            .eq('description_mdo', old.description)
        }
        // Sync global charges table
        if (old.categorie && voyage?.camion_id) {
          const { data: chRow } = await supabase.from('charges')
            .select('*')
            .eq('date', old.date_charge)
            .eq('camion_id', voyage.camion_id)
            .limit(1)
            .maybeSingle()
          if (chRow) {
            const newCatVal = Math.max(0, (chRow[old.categorie] || 0) + diff)
            const newTotal  = Math.max(0, (chRow.total || 0) + diff)
            await supabase.from('charges')
              .update({ [old.categorie]: newCatVal, total: newTotal })
              .eq('id', chRow.id)
          }
        }
      }

      setEditRow(null); loadVoyage()
    } catch (err) {
      toast('Erreur modification charge: ' + err.message)
    } finally { setEditSaving(false) }
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
        setLivForm(f => ({ ...f, client_id: '', qte: '', remise: '', note: '' }))
        setShowLivNote(false)
      } else {
        setShowLiv(false)
        setLivForm({ date_livraison: today(), type_produit: 'brique', client_id: '', type_brique_id: '', qte: '', prix_vente: '', prix_achat: '', remise: '', note: '' })
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
      const montant = parseFloat(retForm.montant)||0, montant_paye = parseFloat(retForm.montant_paye)||0
      const restant = Math.max(0, montant-montant_paye)
      let rtId = null
      const { data: rtData } = await supabase.from('retours_transport').insert({
        date: retForm.date_retour, client_nom: retForm.client_nom.trim(), destination: retForm.destination||null,
        camion_id: voyage?.camion_id||null, camion_plaque: voyage?.camion_plaque||null, chauffeur: voyage?.chauffeur||null,
        montant, montant_paye, restant, voyage_id: parseInt(id),
      }).select().single()
      rtId = rtData?.id || null

      const { error } = await supabase.from('voyage_retours').insert({
        voyage_id:    parseInt(id),
        date_retour:  retForm.date_retour,
        client_nom:   retForm.client_nom.trim(),
        destination:  retForm.destination || null,
        montant,
        montant_paye,
        retour_id:    rtId,
        note:         retForm.note || null,
      })
      if (error) {
        // fallback without retour_id if column not yet added
        const { error: err2 } = await supabase.from('voyage_retours').insert({
          voyage_id: parseInt(id), date_retour: retForm.date_retour, client_nom: retForm.client_nom.trim(),
          destination: retForm.destination||null, montant, montant_paye, note: retForm.note||null,
        })
        if (err2) throw err2
      }
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
    const rows = CHARGE_CATS.filter(cat => parseFloat(chgGrid[cat.key]) > 0)
    if (rows.length === 0) { showMsg('❌ Entrez au moins un montant'); return }
    setSavingChg(true)
    try {
      for (const cat of rows) {
        const montant = parseFloat(chgGrid[cat.key])||0
        const clientId = chgFactureMap[cat.key] ? parseInt(chgFactureMap[cat.key]) : null
        const cl = clientId ? clients.find(c=>c.id===clientId) : null
        const { error } = await supabase.from('voyage_charges').insert({
          voyage_id: parseInt(id), date_charge: chgDate, categorie: cat.key, description: cat.label,
          montant, facture_client: !!cl, client_id: cl ? clientId : null, client_nom: cl?.nom||null,
        })
        if (error) throw error
        if (cl) {
          await supabase.from('ventes').insert({
            date: chgDate, client_id: clientId, client_nom: cl.nom,
            camion_id: voyage?.camion_id||null, camion_plaque: voyage?.camion_plaque||'',
            type_entree: 'mdo', montant_mdo: montant, description_mdo: cat.label, voyage_id: parseInt(id),
          })
          // Fresh-read client before updating solde
          const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', clientId).single()
          if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde||0)+montant }).eq('id', clientId)
        }
      }
      // Mirror to global charges table so /charges page shows voyage charges
      const globalPayload = {
        date:          chgDate,
        camion_id:     voyage?.camion_id     || null,
        camion_plaque: voyage?.camion_plaque || '',
        note:          voyage?.reference     || `Voyage #${id}`,
        total:         rows.reduce((s, cat) => s + (parseFloat(chgGrid[cat.key]) || 0), 0),
      }
      CHARGE_CATS.forEach(cat => { globalPayload[cat.key] = parseFloat(chgGrid[cat.key]) || 0 })
      await supabase.from('charges').insert(globalPayload)

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
      const { error: rpcErr } = await supabase.rpc('delete_voyage_retour', { p_id: row.id })
      if (rpcErr) {
        // Fallback
        await supabase.from('voyage_retours').delete().eq('id', row.id)
        if (row.retour_id) await supabase.from('retours_transport').delete().eq('id', row.retour_id)
      }
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
      const { error } = await supabase.from('voyage_charges').delete().eq('id', row.id)
      if (error) throw error

      // Reverse client solde + linked vente if billed to client
      if (row.facture_client && row.client_id) {
        const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', row.client_id).single()
        if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde||0) - (row.montant||0) }).eq('id', row.client_id)
        await supabase.from('ventes')
          .delete()
          .eq('voyage_id', row.voyage_id)
          .eq('client_id', row.client_id)
          .eq('type_entree', 'mdo')
          .eq('montant_mdo', row.montant)
          .eq('description_mdo', row.description)
      }

      // Update the mirrored charges row: zero out this category and reduce total
      if (row.categorie && voyage?.camion_id) {
        const { data: chRow } = await supabase.from('charges')
          .select('*')
          .eq('date', row.date_charge)
          .eq('camion_id', voyage.camion_id)
          .limit(1)
          .maybeSingle()
        if (chRow) {
          const newTotal = Math.max(0, (chRow.total || 0) - (row.montant || 0))
          await supabase.from('charges')
            .update({ [row.categorie]: 0, total: newTotal })
            .eq('id', chRow.id)
        }
      }

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
    await dbUpdateKm(id, kmForm.km_depart, kmForm.km_arrivee)
    setSavingKm(false)
    setEditingKm(false)
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

  function showMsg(m) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  if (loading) return <Layout title="Voyage"><div className="text-center py-20 text-slate-400">Chargement...</div></Layout>
  if (loadError) return (
    <Layout title="Voyage">
      <div className="text-center py-20">
        <div className="text-red-500 font-bold text-lg mb-2">❌ {loadError}</div>
        <button onClick={loadVoyage} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-xl font-semibold text-sm hover:bg-blue-700 transition">
          Réessayer
        </button>
      </div>
    </Layout>
  )
  if (!voyage) return <Layout title="Voyage"><div className="text-center py-20 text-slate-400">Voyage introuvable</div></Layout>

  const isTermine = voyage.statut === 'termine'

  // ── EDIT MODAL (inline render) ────────────────────────────────────────────────
  const ef = editForm
  const setEf = v => setEditForm(prev => ({ ...prev, ...v }))

  return (
    <Layout
      title={voyage.reference || `Voyage #${voyage.id}`}
      subtitle={`${voyage.camion_plaque}${voyage.chauffeur?' • '+voyage.chauffeur:''}${voyage.destination?' → '+voyage.destination:''}`}
    >
      <ToastContainer />
      {/* ── EDIT MODAL OVERLAY ── */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={e => { if (e.target===e.currentTarget) setEditRow(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 text-sm">
                {editRow.type==='achat'  && '✏️ Modifier Achat'}
                {editRow.type==='liv'    && '✏️ Modifier Livraison'}
                {editRow.type==='retour' && '✏️ Modifier Retour'}
                {editRow.type==='charge' && '✏️ Modifier Charge'}
              </h3>
              <button onClick={() => setEditRow(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {editRow.type==='achat' && <>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Date</label>
                  <input type="date" value={ef.date_achat||''} onChange={e=>setEf({date_achat:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Quantité</label>
                  <input type="number" value={ef.qte||''} onChange={e=>setEf({qte:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Prix achat / u</label>
                  <input type="number" step="0.01" value={ef.prix_achat||''} onChange={e=>setEf({prix_achat:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Total achat</label>
                  <div className="input w-full text-sm bg-slate-50 font-bold text-red-600">{fmt((parseFloat(ef.qte)||0)*(parseFloat(ef.prix_achat)||0))} DHS</div></div>
              </>}
              {editRow.type==='liv' && <>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Date livraison</label>
                  <input type="date" value={ef.date_livraison||''} onChange={e=>setEf({date_livraison:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Quantité</label>
                  <input type="number" value={ef.qte||''} onChange={e=>setEf({qte:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Prix vente / u</label>
                  <input type="number" step="0.01" value={ef.prix_vente||''} onChange={e=>setEf({prix_vente:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Prix achat / u</label>
                  <input type="number" step="0.01" value={ef.prix_achat||''} onChange={e=>setEf({prix_achat:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Remise (DHS)</label>
                  <input type="number" step="0.01" value={ef.remise||''} onChange={e=>setEf({remise:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Total vente</label>
                  <div className="input w-full text-sm bg-slate-50 font-bold text-emerald-600">{fmt(Math.max(0,(parseFloat(ef.qte)||0)*(parseFloat(ef.prix_vente)||0)-(parseFloat(ef.remise)||0)))} DHS</div></div>
              </>}
              {editRow.type==='retour' && <>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Date</label>
                  <input type="date" value={ef.date_retour||''} onChange={e=>setEf({date_retour:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Client</label>
                  <input type="text" value={ef.client_nom||''} onChange={e=>setEf({client_nom:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Destination</label>
                  <input type="text" value={ef.destination||''} onChange={e=>setEf({destination:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant total</label>
                  <input type="number" value={ef.montant||''} onChange={e=>setEf({montant:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant payé</label>
                  <input type="number" value={ef.montant_paye||''} onChange={e=>setEf({montant_paye:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Restant</label>
                  <div className="input w-full text-sm bg-slate-50 font-bold text-orange-600">{fmt(Math.max(0,(parseFloat(ef.montant)||0)-(parseFloat(ef.montant_paye)||0)))} DHS</div></div>
              </>}
              {editRow.type==='charge' && <>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Date</label>
                  <input type="date" value={ef.date_charge||''} onChange={e=>setEf({date_charge:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant (DHS)</label>
                  <input type="number" value={ef.montant||''} onChange={e=>setEf({montant:e.target.value})} className="input w-full text-sm"/></div>
              </>}
            </div>
            <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-slate-100">
              <button onClick={() => setEditRow(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">
                Annuler
              </button>
              <button
                onClick={() => {
                  if (editRow.type==='achat')  updateAchat()
                  if (editRow.type==='liv')    updateLiv()
                  if (editRow.type==='retour') updateRetour()
                  if (editRow.type==='charge') updateCharge()
                }}
                disabled={editSaving}
                className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 transition disabled:opacity-60">
                {editSaving ? '⌛ Sauvegarde...' : '✅ Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TWO-COLUMN LAYOUT ── */}
      <div className="flex gap-4 items-start" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

        {/* ── SIDEBAR: desktop only ── */}
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

        {/* ── MAIN CONTENT ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ── MOBILE NAV ── */}
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

          {msg && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm font-semibold px-4 py-2 rounded-xl">{msg}</div>
          )}

          {/* ── HEADER ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link href="/voyages" className="text-blue-500 hover:text-blue-700 text-sm font-semibold hidden md:inline">← Voyages</Link>
              <span className="text-slate-200 hidden md:inline">|</span>
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

          {/* ── KM TRACKING BAR ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">KM Départ</div>
                  {editingKm ? (
                    <input type="number" value={kmForm.km_depart}
                      onChange={e => setKmForm({ ...kmForm, km_depart: e.target.value })}
                      className="input text-sm w-28" placeholder="85000" />
                  ) : (
                    <div className="text-sm font-bold text-slate-700">
                      {voyage.km_depart ? fmt(voyage.km_depart) : <span className="text-slate-300 font-normal">—</span>}
                    </div>
                  )}
                </div>
                <div className="text-slate-300 text-lg mt-3">→</div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">KM Arrivée</div>
                  {editingKm ? (
                    <input type="number" value={kmForm.km_arrivee}
                      onChange={e => setKmForm({ ...kmForm, km_arrivee: e.target.value })}
                      className="input text-sm w-28" placeholder="87500" />
                  ) : (
                    <div className="text-sm font-bold text-slate-700">
                      {voyage.km_arrivee ? fmt(voyage.km_arrivee) : <span className="text-slate-300 font-normal">—</span>}
                    </div>
                  )}
                </div>
                {voyageKm !== null && voyageKm > 0 && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5">
                    <div className="text-[10px] text-blue-400 uppercase tracking-wide">Distance</div>
                    <div className="text-sm font-black text-blue-700">{fmt(voyageKm)} km</div>
                  </div>
                )}
                {fuelSource === 'km' && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-1.5">
                    <div className="text-[10px] text-emerald-500 uppercase tracking-wide">⚡ Carburant auto</div>
                    <div className="text-sm font-black text-emerald-700">{fmt(fuelCost)} DHS</div>
                  </div>
                )}
                {fuelSource === 'none' && voyageKm && (
                  <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-1.5">
                    <div className="text-[10px] text-red-400 uppercase tracking-wide">⚠ Carburant</div>
                    <div className="text-xs text-red-500 font-semibold">Données km insuffisantes</div>
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
                  <button onClick={() => { setKmForm({ km_depart: voyage.km_depart || '', km_arrivee: voyage.km_arrivee || '' }); setEditingKm(true) }}
                    className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition">
                    ✏️ Saisir KM
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
                  {fuelSource === 'km'     && <span className="text-[9px] bg-emerald-900/60 text-emerald-300 px-1.5 py-0.5 rounded font-bold">⚡ km</span>}
                  {fuelSource === 'manuel' && <span className="text-[9px] bg-amber-900/60 text-amber-300 px-1.5 py-0.5 rounded font-bold">📝 manuel</span>}
                  {fuelSource === 'none' && !isLoue && <span className="text-[9px] bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded font-bold">⚠ manquant</span>}
                </div>
                <div className="text-lg font-black text-orange-400">{fmt(fuelCost + totalChargesFixed)} DHS</div>
                {fuelSource === 'km' && voyageKm > 0 && (
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
                    <div key={cp.id} className="bg-slate-700/50 rounded-xl p-3">
                      <div className="font-bold text-sm text-white">{cp.nom}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        ID {cp.id} · {cp.isGrignon ? <span className="text-amber-400">Grignon</span> : <span className="text-blue-400">Brique</span>}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {fmt(cp.qte)} u · {Math.round(cp.qteShare * 100)}% du voyage
                      </div>
                      <div className="text-[10px] text-slate-400">Rev: {fmt(cp.rev)} · Coût: {fmt(cp.cout)}</div>
                      <div className={`text-base font-black mt-1 ${cp.profit>=0?'text-emerald-400':'text-red-400'}`}>
                        {cp.profit>=0?'+':''}{fmt(cp.profit)} DHS
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── SECTION: ACHATS ── */}
          <div ref={sectionRefs.achat}>
          <Section icon="📦" title="Achats (Briques & Grignon)" color="blue"
            action={
              <button onClick={() => setShowAchat(v=>!v)}
                className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-700 transition">
                {showAchat ? 'Fermer' : '+ Ajouter achat'}
              </button>
            }>
            {showAchat && (
              <form onSubmit={saveAchat} className="bg-white border border-blue-100 rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Date achat</label>
                  <input type="date" value={achatForm.date_achat} onChange={e=>setAchatForm({...achatForm,date_achat:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Type produit</label>
                  <select value={achatForm.type_produit} onChange={e=>setAchatForm({...achatForm,type_produit:e.target.value,fournisseur_id:'',type_brique_id:''})} className="input w-full text-sm">
                    <option value="brique">🧱 Briques</option>
                    <option value="grignon">🫒 Grignon</option>
                  </select></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Fournisseur</label>
                  <select value={achatForm.fournisseur_id} onChange={e=>setAchatForm({...achatForm,fournisseur_id:e.target.value})} className="input w-full text-sm">
                    <option value="">— Sélectionner —</option>
                    {(achatForm.type_produit==='brique'?fournisseurs:grignonFournisseurs).map(f=><option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select></div>
                {achatForm.type_produit==='brique' && (
                  <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Type brique</label>
                    <select value={achatForm.type_brique_id} onChange={e=>setAchatForm({...achatForm,type_brique_id:e.target.value})} className="input w-full text-sm">
                      <option value="">— Sélectionner —</option>
                      {typeBriques.map(t=><option key={t.id} value={t.id}>{t.nom}</option>)}
                    </select></div>
                )}
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Quantité</label>
                  <input type="number" value={achatForm.qte} onChange={e=>setAchatForm({...achatForm,qte:e.target.value})} className="input w-full text-sm" placeholder="6000" required/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Prix achat / u</label>
                  <input type="number" step="0.01" value={achatForm.prix_achat} onChange={e=>setAchatForm({...achatForm,prix_achat:e.target.value})} className="input w-full text-sm" placeholder="1.20" required/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Total achat</label>
                  <div className="input w-full text-sm bg-slate-50 font-bold text-slate-700 flex items-center">{fmt((parseFloat(achatForm.qte)||0)*(parseFloat(achatForm.prix_achat)||0))} DHS</div></div>
                <div>
                  {showAchatNote
                    ? <><label className="text-[10px] font-semibold text-slate-500 block mb-1">Note</label>
                        <input type="text" value={achatForm.note} onChange={e=>setAchatForm({...achatForm,note:e.target.value})} className="input w-full text-sm" placeholder="Optionnel..."/></>
                    : <button type="button" onClick={()=>setShowAchatNote(true)} className="text-[10px] text-slate-400 hover:text-slate-600">＋ Ajouter une note</button>
                  }
                </div>
                {/* Live preview */}
                {achatForm.qte && achatForm.prix_achat && (
                  <div className="col-span-2 md:col-span-3 grid grid-cols-3 gap-2 p-3 rounded-xl bg-blue-50 border border-blue-100">
                    <div className="text-center">
                      <div className="text-[10px] text-blue-400 uppercase">Quantité</div>
                      <div className="font-bold text-blue-700">{fmt(parseFloat(achatForm.qte)||0)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-blue-400 uppercase">Prix/u</div>
                      <div className="font-bold text-blue-700">{fmtD(parseFloat(achatForm.prix_achat)||0)} DHS</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-blue-400 uppercase font-bold">Total achat</div>
                      <div className="font-black text-red-600 text-lg">
                        {fmt(Math.round((parseFloat(achatForm.qte)||0)*(parseFloat(achatForm.prix_achat)||0)*100)/100)} DHS
                      </div>
                    </div>
                  </div>
                )}
                <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-1 flex-wrap">
                  <button type="button" onClick={()=>{setShowAchat(false);setShowAchatNote(false)}} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600">Annuler</button>
                  <button type="submit" onMouseDown={()=>{ addAnotherAchatRef.current = true }} disabled={savingAchat}
                    className="text-xs bg-blue-500 text-white px-4 py-1.5 rounded-lg font-semibold">
                    {savingAchat ? '...' : achatForm.type_produit === 'brique' ? '＋ Ajouter Grignon' : '＋ Ajouter Briques'}
                  </button>
                  <button type="submit" onMouseDown={()=>{ addAnotherAchatRef.current = false }} disabled={savingAchat}
                    className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg font-semibold">
                    {savingAchat ? '...' : '✅ Enregistrer'}
                  </button>
                </div>
              </form>
            )}
            {achats.length===0 ? <Empty text="Aucun achat enregistré"/> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                      <th className="text-left pb-2 pr-3">Date</th>
                      <th className="text-left pb-2 pr-3">Produit</th>
                      <th className="text-left pb-2 pr-3">Fournisseur</th>
                      <th className="text-right pb-2 pr-3">Qté</th>
                      <th className="text-right pb-2 pr-3">Prix/u</th>
                      <th className="text-right pb-2">Total</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {achats.map(a => (
                      <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 pr-3 text-slate-500">{fmtDate(a.date_achat)}</td>
                        <td className="py-2 pr-3 font-semibold">{a.type_brique||a.type_produit}</td>
                        <td className="py-2 pr-3 text-slate-500">{a.fournisseur_nom||'—'}</td>
                        <td className="py-2 pr-3 text-right">{fmt(a.qte)}</td>
                        <td className="py-2 pr-3 text-right">{fmtD(a.prix_achat)}</td>
                        <td className="py-2 text-right font-bold text-red-500">{fmt(a.total_achat)} DHS</td>
                        <td className="py-2 pl-1 flex items-center gap-0.5">
                          <EditBtn onEdit={() => openEdit('achat', a)}/>
                          <DelBtn onDel={() => delAchat(a)}/>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="py-2 pr-3 font-bold text-slate-700 text-right text-[10px] uppercase">Total achats</td>
                      <td className="py-2 font-black text-red-600">{fmt(achats.reduce((s,a)=>s+(a.total_achat||0),0))} DHS</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ── SECTION: LIVRAISONS ── */}
          </div>
          <div ref={sectionRefs.livraison}>
          <Section icon="🚚" title="Livraisons clients" color="green"
            action={
              <button onClick={() => setShowLiv(v=>!v)}
                className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-emerald-700 transition">
                {showLiv ? 'Fermer' : '+ Ajouter livraison'}
              </button>
            }>
            {showLiv && (
              <form onSubmit={saveLiv} className="bg-white border border-emerald-100 rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Date livraison</label>
                  <input type="date" value={livForm.date_livraison} onChange={e=>setLivForm({...livForm,date_livraison:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Type produit</label>
                  <select value={livForm.type_produit} onChange={e=>setLivForm({...livForm,type_produit:e.target.value,type_brique_id:''})} className="input w-full text-sm">
                    <option value="brique">🧱 Briques</option>
                    <option value="grignon">🫒 Grignon</option>
                  </select></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Client *</label>
                  <select value={livForm.client_id} onChange={e=>setLivForm({...livForm,client_id:e.target.value})} className="input w-full text-sm" required>
                    <option value="">— Sélectionner —</option>
                    {(livForm.type_produit==='grignon'?grignonClients:clients).map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select></div>
                {livForm.type_produit==='brique' && (
                  <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Type brique</label>
                    <select value={livForm.type_brique_id} onChange={e=>setLivForm({...livForm,type_brique_id:e.target.value})} className="input w-full text-sm">
                      <option value="">— Sélectionner —</option>
                      {typeBriques.map(t=><option key={t.id} value={t.id}>{t.nom}</option>)}
                    </select></div>
                )}
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Quantité livrée *</label>
                  <input type="number" value={livForm.qte} onChange={e=>setLivForm({...livForm,qte:e.target.value})} className="input w-full text-sm" placeholder="3500" required/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Prix vente / u *</label>
                  <input type="number" step="0.01" value={livForm.prix_vente} onChange={e=>setLivForm({...livForm,prix_vente:e.target.value})} className="input w-full text-sm" placeholder="2.10" required/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Prix achat / u</label>
                  <input type="number" step="0.01" value={livForm.prix_achat} onChange={e=>setLivForm({...livForm,prix_achat:e.target.value})} className="input w-full text-sm" placeholder="1.20"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Remise (DHS)</label>
                  <input type="number" step="0.01" value={livForm.remise} onChange={e=>setLivForm({...livForm,remise:e.target.value})} className="input w-full text-sm" placeholder="0"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Total vente</label>
                  <div className="input w-full text-sm bg-slate-50 font-bold text-emerald-600 flex items-center">
                    {fmt(Math.max(0,(parseFloat(livForm.qte)||0)*(parseFloat(livForm.prix_vente)||0)-(parseFloat(livForm.remise)||0)))} DHS
                  </div></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Marge brute</label>
                  <div className="input w-full text-sm bg-slate-50 font-bold text-blue-600 flex items-center">
                    {fmt(Math.max(0,(parseFloat(livForm.qte)||0)*(parseFloat(livForm.prix_vente)||0)-(parseFloat(livForm.remise)||0))-(parseFloat(livForm.qte)||0)*(parseFloat(livForm.prix_achat)||0))} DHS
                  </div></div>
                <div>
                  {showLivNote
                    ? <><label className="text-[10px] font-semibold text-slate-500 block mb-1">Note</label>
                        <input type="text" value={livForm.note} onChange={e=>setLivForm({...livForm,note:e.target.value})} className="input w-full text-sm" placeholder="Optionnel..."/></>
                    : <button type="button" onClick={()=>setShowLivNote(true)} className="text-[10px] text-slate-400 hover:text-slate-600">＋ Ajouter une note</button>
                  }
                </div>
                {/* Live preview */}
                {livForm.qte && livForm.prix_vente && (
                  <div className="col-span-2 md:col-span-3 grid grid-cols-4 gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                    <div className="text-center">
                      <div className="text-[10px] text-emerald-400 uppercase">Qté</div>
                      <div className="font-bold text-emerald-700">{fmt(parseFloat(livForm.qte)||0)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-emerald-400 uppercase">Total vente</div>
                      <div className="font-bold text-emerald-700">
                        {fmt(Math.max(0,(parseFloat(livForm.qte)||0)*(parseFloat(livForm.prix_vente)||0)-(parseFloat(livForm.remise)||0)))} DHS
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-blue-400 uppercase">Marge</div>
                      <div className="font-bold text-blue-700">
                        {fmt(Math.max(0,(parseFloat(livForm.qte)||0)*(parseFloat(livForm.prix_vente)||0)-(parseFloat(livForm.remise)||0))-(parseFloat(livForm.qte)||0)*(parseFloat(livForm.prix_achat)||0))} DHS
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-purple-400 uppercase">Marge%</div>
                      <div className="font-bold text-purple-700">
                        {(() => {
                          const tv = Math.max(0,(parseFloat(livForm.qte)||0)*(parseFloat(livForm.prix_vente)||0)-(parseFloat(livForm.remise)||0))
                          const ta = (parseFloat(livForm.qte)||0)*(parseFloat(livForm.prix_achat)||0)
                          return tv > 0 ? Math.round((tv-ta)/tv*100) : 0
                        })()}%
                      </div>
                    </div>
                  </div>
                )}
                <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-1 flex-wrap">
                  <button type="button" onClick={()=>{setShowLiv(false);setShowLivNote(false)}} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600">Annuler</button>
                  <button type="submit" onMouseDown={()=>{ addAnotherLivRef.current = true }} disabled={savingLiv}
                    className="text-xs bg-emerald-500 text-white px-4 py-1.5 rounded-lg font-semibold">
                    {savingLiv ? '...' : '＋ Ajouter une autre'}
                  </button>
                  <button type="submit" onMouseDown={()=>{ addAnotherLivRef.current = false }} disabled={savingLiv}
                    className="text-xs bg-emerald-600 text-white px-4 py-1.5 rounded-lg font-semibold">
                    {savingLiv ? '...' : '✅ Enregistrer'}
                  </button>
                </div>
              </form>
            )}
            {livraisons.length===0 ? <Empty text="Aucune livraison enregistrée"/> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                      <th className="text-left pb-2 pr-3">Date</th>
                      <th className="text-left pb-2 pr-3">Client</th>
                      <th className="text-left pb-2 pr-3">Produit</th>
                      <th className="text-right pb-2 pr-3">Qté</th>
                      <th className="text-right pb-2 pr-3">P.Vente</th>
                      <th className="text-right pb-2 pr-3">Total vente</th>
                      <th className="text-right pb-2 pr-3">Marge</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {livraisons.map(l => (
                      <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 pr-3 text-slate-500">{fmtDate(l.date_livraison)}</td>
                        <td className="py-2 pr-3 font-semibold">{l.client_nom}</td>
                        <td className="py-2 pr-3 text-slate-500">{l.type_brique||l.type_produit}</td>
                        <td className="py-2 pr-3 text-right">{fmt(l.qte)}</td>
                        <td className="py-2 pr-3 text-right">
                          {fmtD(l.prix_vente)}
                          {l.remise>0 && <span className="ml-1 text-orange-500 text-[9px]">-{fmt(l.remise)}</span>}
                        </td>
                        <td className="py-2 pr-3 text-right font-bold text-emerald-600">{fmt(l.total_vente)} DHS</td>
                        <td className="py-2 pr-3 text-right font-semibold text-blue-600">{fmt(l.marge||((l.total_vente||0)-(l.prix_achat||0)*(l.qte||0)))} DHS</td>
                        <td className="py-2 pl-1 flex items-center gap-0.5">
                          <EditBtn onEdit={() => openEdit('liv', l)}/>
                          <DelBtn onDel={() => delLiv(l)}/>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold">
                      <td colSpan={4} className="py-2 pr-3 text-right text-[10px] uppercase text-slate-700">Total livraisons</td>
                      <td></td>
                      <td className="py-2 pr-3 text-right text-emerald-600">{fmt(totalRevenuLivs)} DHS</td>
                      <td className="py-2 pr-3 text-right text-blue-600">{fmt(livraisons.reduce((s,l)=>s+(l.marge||((l.total_vente||0)-(l.prix_achat||0)*(l.qte||0))),0))} DHS</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ── SECTION: RETOUR TRANSPORT ── */}
          </div>
          <div ref={sectionRefs.retour}>
          <Section icon="↩️" title="Retour transport" color="purple"
            action={
              <button onClick={() => setShowRetour(v=>!v)}
                className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-purple-700 transition">
                {showRetour ? 'Fermer' : '+ Ajouter retour'}
              </button>
            }>
            {showRetour && (
              <form onSubmit={saveRetour} className="bg-white border border-purple-100 rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Date</label>
                  <input type="date" value={retForm.date_retour} onChange={e=>setRetForm({...retForm,date_retour:e.target.value})} className="input w-full text-sm"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Client retour *</label>
                  <input list="ret-clients" type="text" value={retForm.client_nom} onChange={e=>setRetForm({...retForm,client_nom:e.target.value})} className="input w-full text-sm" placeholder="Nom du client" required/>
                  <datalist id="ret-clients">{clients.map(c=><option key={c.id} value={c.nom}/>)}</datalist>
                </div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Destination</label>
                  <input type="text" value={retForm.destination} onChange={e=>setRetForm({...retForm,destination:e.target.value})} className="input w-full text-sm" placeholder="Ex: Berkane..."/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant total *</label>
                  <input type="number" value={retForm.montant} onChange={e=>setRetForm({...retForm,montant:e.target.value})} className="input w-full text-sm" placeholder="1500" required/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant payé</label>
                  <input type="number" value={retForm.montant_paye} onChange={e=>setRetForm({...retForm,montant_paye:e.target.value})} className="input w-full text-sm" placeholder="0"/></div>
                <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Restant</label>
                  <div className="input w-full text-sm bg-slate-50 font-bold text-orange-600 flex items-center">
                    {fmt(Math.max(0,(parseFloat(retForm.montant)||0)-(parseFloat(retForm.montant_paye)||0)))} DHS
                  </div></div>
                <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-1">
                  <button type="button" onClick={()=>setShowRetour(false)} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600">Annuler</button>
                  <button type="submit" disabled={savingRetour} className="text-xs bg-purple-600 text-white px-4 py-1.5 rounded-lg font-semibold">{savingRetour?'...':'✅ Enregistrer'}</button>
                </div>
              </form>
            )}
            {retours.length===0 ? <Empty text="Aucun retour transport sur ce voyage"/> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                      <th className="text-left pb-2 pr-3">Date</th>
                      <th className="text-left pb-2 pr-3">Client</th>
                      <th className="text-left pb-2 pr-3">Destination</th>
                      <th className="text-right pb-2 pr-3">Montant</th>
                      <th className="text-right pb-2 pr-3">Payé</th>
                      <th className="text-right pb-2">Reste</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {retours.map(r => (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 pr-3 text-slate-500">{fmtDate(r.date_retour)}</td>
                        <td className="py-2 pr-3 font-semibold">{r.client_nom}</td>
                        <td className="py-2 pr-3 text-slate-500">{r.destination||'—'}</td>
                        <td className="py-2 pr-3 text-right font-bold text-purple-600">{fmt(r.montant)} DHS</td>
                        <td className="py-2 pr-3 text-right text-emerald-600">{fmt(r.montant_paye)} DHS</td>
                        <td className="py-2 text-right text-orange-500 font-semibold">{r.restant>0?fmt(r.restant)+' DHS ⚠':'✓'}</td>
                        <td className="py-2 pl-1 flex items-center gap-0.5">
                          <EditBtn onEdit={() => openEdit('retour', r)}/>
                          <DelBtn onDel={() => delRetour(r)}/>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ── SECTION: GASOIL ── */}
          </div>
          <div ref={sectionRefs.gasoil}>
          <Section icon="⛽" title={`Gasoil${gasoil.length > 0 ? ` (${gasoil.length} plein(s))` : ''}`} color="orange"
            action={
              <button onClick={loadCamionPleins}
                className="text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-orange-600 transition">
                + Lier un plein
              </button>
            }>

            {/* Gasoil Picker */}
            {showGasoilPicker && (
              <div className="bg-white border border-orange-100 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-slate-700">
                    Choisir un plein — {voyage?.camion_plaque}
                  </span>
                  <button onClick={() => setShowGasoilPicker(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>
                {camionPleins.length === 0 ? (
                  <div className="text-center py-4 text-slate-400 text-xs">
                    Aucun plein enregistré pour ce camion.
                    <Link href="/gasoil" className="text-blue-500 hover:underline ml-1">
                      → Ajouter dans Gasoil
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {camionPleins.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-2 rounded-lg border border-slate-100 hover:bg-orange-50">
                        <div className="text-xs">
                          <span className="font-semibold text-slate-700">{fmtDate(p.date)}</span>
                          <span className="text-slate-400 ml-2">{p.station || '—'}</span>
                          <span className="text-orange-600 font-bold ml-2">{p.qte}L × {fmtD(p.prix_unitaire)} = {fmt(p.total)} DHS</span>
                          {p.voyage_id && p.voyage_id !== parseInt(id) && (
                            <span className="text-red-400 ml-2">(déjà lié à un autre voyage)</span>
                          )}
                        </div>
                        <button
                          onClick={() => linkGasoilToVoyage(p)}
                          disabled={linkingGasoil}
                          className="text-xs bg-orange-500 text-white px-2 py-1 rounded-lg font-semibold hover:bg-orange-600 ml-2">
                          ✓ Lier
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {gasoil.length === 0 ? (
              <div className="text-center py-3 space-y-1">
                {fuelSource === 'km' ? (
                  <div className="text-sm font-semibold text-emerald-600">
                    ⚡ Alloué automatiquement — {fmt(fuelCost)} DHS ({fmt(voyageKm)} km)
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">
                    Cliquez sur "+ Lier un plein" pour associer un gasoil à ce voyage
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                      <th className="text-left pb-2 pr-3">Date</th>
                      <th className="text-left pb-2 pr-3">Station</th>
                      <th className="text-right pb-2 pr-3">Litres</th>
                      <th className="text-right pb-2 pr-3">Prix/L</th>
                      <th className="text-right pb-2 pr-3">Total</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {gasoil.map(g => (
                      <tr key={g.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 pr-3 text-slate-500">{fmtDate(g.date_gasoil)}</td>
                        <td className="py-2 pr-3 text-slate-500 truncate max-w-[140px]">{g.station}</td>
                        <td className="py-2 pr-3 text-right">{g.qte_litres}L</td>
                        <td className="py-2 pr-3 text-right">{fmtD(g.prix_unitaire)}</td>
                        <td className="py-2 pr-3 text-right font-bold text-orange-600">{fmt(g.total)} DHS</td>
                        <td className="py-2 pl-1"><DelBtn onDel={() => delGasoil(g)}/></td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold">
                      <td colSpan={4} className="py-2 pr-3 text-right text-[10px] uppercase text-slate-700">Total (historique)</td>
                      <td className="py-2 pr-3 text-right text-orange-600">{fmt(totalGasoilManuel)} DHS</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
                {fuelSource === 'km' && (
                  <div className="mt-2 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                    ⚡ Ce voyage utilise l'allocation km automatique ({fmt(fuelCost)} DHS) — les entrées ci-dessus sont conservées à titre d'historique.
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* ── SECTION: CHARGES ── */}
          </div>
          <div ref={sectionRefs.charge}>
          <Section icon="💸" title="Charges du voyage" color="red"
            action={
              <button onClick={() => setShowCharge(v=>!v)}
                className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-red-600 transition">
                {showCharge ? 'Fermer' : '+ Saisir charges'}
              </button>
            }>
            {showCharge && (
              <form onSubmit={saveChargeGrid} className="bg-white border border-red-100 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-3 mb-4">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Date</label>
                  <input type="date" value={chgDate} onChange={e=>setChgDate(e.target.value)} className="input text-sm"/>
                  <span className="text-[10px] text-slate-400 ml-2">Saisissez les montants présents. Laissez vide si absent.</span>
                </div>
                <div className="space-y-2">
                  {CHARGE_CATS.filter(cat => showAllCharges || COMMON_CHARGE_KEYS.has(cat.key) || parseFloat(chgGrid[cat.key]) > 0).map(cat => (
                    <div key={cat.key} className="grid grid-cols-12 gap-2 items-center py-2 border-b border-slate-50">
                      <div className="col-span-3 flex items-center gap-2">
                        <span className="text-base">{cat.icon}</span>
                        <span className="text-xs font-semibold text-slate-700">{cat.label}</span>
                      </div>
                      <div className="col-span-3">
                        <input type="number" value={chgGrid[cat.key]}
                          onChange={e=>setChgGrid(g=>({...g,[cat.key]:e.target.value}))}
                          className={`input w-full text-sm text-right ${parseFloat(chgGrid[cat.key])>0?'border-red-300 bg-red-50 font-bold':''}`}
                          placeholder="0"/>
                      </div>
                      <div className="col-span-1 text-[10px] text-slate-400 font-semibold">DHS</div>
                      <div className="col-span-5 flex items-center gap-2">
                        {parseFloat(chgGrid[cat.key])>0 && (<>
                          <input type="checkbox" id={`fc_${cat.key}`} checked={!!chgFactureMap[cat.key]}
                            onChange={e=>setChgFactureMap(m=>({...m,[cat.key]:e.target.checked?'':undefined}))}
                            className="rounded flex-shrink-0"/>
                          <label htmlFor={`fc_${cat.key}`} className="text-[10px] text-slate-500 cursor-pointer whitespace-nowrap">Facturé client</label>
                          {chgFactureMap[cat.key]!==undefined && (
                            <select value={chgFactureMap[cat.key]||''} onChange={e=>setChgFactureMap(m=>({...m,[cat.key]:e.target.value}))} className="input text-xs flex-1">
                              <option value="">— Client —</option>
                              {clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                            </select>
                          )}
                        </>)}
                      </div>
                    </div>
                  ))}
                </div>
                {!showAllCharges && (
                  <button type="button" onClick={() => setShowAllCharges(true)}
                    className="text-xs text-slate-400 hover:text-slate-600 mt-3 font-semibold">
                    ＋ Voir toutes les charges ({CHARGE_CATS.filter(c => !COMMON_CHARGE_KEYS.has(c.key)).length} autres catégories)
                  </button>
                )}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                  <div className="text-sm font-bold text-slate-700">
                    Total: <span className="text-red-600">{fmt(CHARGE_CATS.reduce((s,c)=>s+(parseFloat(chgGrid[c.key])||0),0))} DHS</span>
                    <span className="text-[10px] text-slate-400 ml-2">({CHARGE_CATS.filter(c=>parseFloat(chgGrid[c.key])>0).length} catégorie(s))</span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={()=>{setShowCharge(false);setChgGrid(emptyChgGrid());setChgFactureMap({});setShowAllCharges(false)}}
                      className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600">Annuler</button>
                    <button type="submit" disabled={savingChg}
                      className="text-xs bg-red-500 text-white px-5 py-1.5 rounded-lg font-bold hover:bg-red-600 transition">
                      {savingChg?'...':'✅ Enregistrer les charges'}
                    </button>
                  </div>
                </div>
              </form>
            )}
            {charges.length===0 ? <Empty text="Aucune charge enregistrée"/> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                      <th className="text-left pb-2 pr-3">Date</th>
                      <th className="text-left pb-2 pr-3">Catégorie</th>
                      <th className="text-left pb-2 pr-3">Description</th>
                      <th className="text-right pb-2 pr-3">Montant</th>
                      <th className="text-left pb-2">Client?</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {charges.map(c => (
                      <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 pr-3 text-slate-500">{fmtDate(c.date_charge)}</td>
                        <td className="py-2 pr-3 font-semibold">{(() => { const cat = CHARGE_CATS.find(x => x.key === c.categorie); return cat ? `${cat.icon} ${cat.label}` : c.categorie })()}</td>
                        <td className="py-2 pr-3 text-slate-500">{c.description||'—'}</td>
                        <td className="py-2 pr-3 text-right font-bold text-red-600">{fmt(c.montant)} DHS</td>
                        <td className="py-2 text-xs">
                          {c.facture_client
                            ? <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded font-semibold">📋 {c.client_nom||'Client'}</span>
                            : <span className="text-slate-300">Entreprise</span>}
                        </td>
                        <td className="py-2 pl-1 flex items-center gap-0.5">
                          <EditBtn onEdit={() => openEdit('charge', c)}/>
                          <DelBtn onDel={() => delCharge(c)}/>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold">
                      <td colSpan={3} className="py-2 pr-3 text-right text-[10px] uppercase text-slate-700">Total charges fixes</td>
                      <td className="py-2 pr-3 text-right text-red-600">{fmt(totalChargesFixed)} DHS</td>
                      <td className="py-2 text-xs text-slate-400">répartition par quantité</td>
                      <td></td>
                    </tr>
                    {totalChargesClient>0 && (
                      <tr className="bg-emerald-50">
                        <td colSpan={3} className="py-2 pr-3 text-right text-[10px] uppercase text-slate-700">Charges facturées clients</td>
                        <td className="py-2 pr-3 text-right text-emerald-600 font-bold">{fmt(totalChargesClient)} DHS</td>
                        <td colSpan={2}></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ── SECTION: LOCATION CAMION (camions loués only) ── */}
          {isLoue && (
            <div ref={sectionRefs.location}>
            <Section icon="🔑" title="Location camion" color="purple"
              action={
                <button onClick={() => {
                  if (!showLocation && locations.length > 0) {
                    const l = locations[0]
                    setLocForm({ loueur_id: l.loueur_id ? String(l.loueur_id) : '', montant_location: String(l.montant_location || ''), montant_paye: String(l.montant_paye || ''), note: l.note || '' })
                  }
                  setShowLocation(v => !v)
                }}
                  className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-purple-700 transition">
                  {showLocation ? 'Fermer' : locations.length === 0 ? '+ Saisir location' : '✏️ Modifier'}
                </button>
              }>

              {showLocation && (
                <form onSubmit={saveLocation} className="bg-white border border-purple-100 rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="col-span-2 md:col-span-3">
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">Loueur</label>
                    <select value={locForm.loueur_id} onChange={e => setLocForm({...locForm, loueur_id: e.target.value})} className="input w-full text-sm">
                      <option value="">— Sélectionner un loueur —</option>
                      {loueurs.map(l => <option key={l.id} value={l.id}>{l.nom}{l.telephone ? ` · ${l.telephone}` : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant location (DHS)</label>
                    <input type="number" step="0.01" min="0" value={locForm.montant_location}
                      onChange={e => setLocForm({...locForm, montant_location: e.target.value})}
                      className="input w-full text-sm font-bold" placeholder="0" required />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant payé (DHS)</label>
                    <input type="number" step="0.01" min="0" value={locForm.montant_paye}
                      onChange={e => setLocForm({...locForm, montant_paye: e.target.value})}
                      className="input w-full text-sm" placeholder="0" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">Reste à payer</label>
                    <div className="input w-full text-sm bg-slate-50 font-bold text-red-600 flex items-center">
                      {fmt(Math.max(0, (parseFloat(locForm.montant_location)||0) - (parseFloat(locForm.montant_paye)||0)))} DHS
                    </div>
                  </div>
                  <div className="col-span-2 md:col-span-3">
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">Note (optionnel)</label>
                    <input type="text" value={locForm.note} onChange={e => setLocForm({...locForm, note: e.target.value})}
                      className="input w-full text-sm" placeholder="ex: chèque #123, mode de paiement..." />
                  </div>
                  <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setShowLocation(false)}
                      className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600">Annuler</button>
                    <button type="submit" disabled={savingLoc}
                      className="text-xs bg-purple-600 text-white px-5 py-1.5 rounded-lg font-bold hover:bg-purple-700 transition">
                      {savingLoc ? '...' : '✅ Enregistrer'}
                    </button>
                  </div>
                </form>
              )}

              {locations.length === 0 ? (
                <div className="text-center py-4 space-y-1">
                  <div className="text-sm text-slate-400">Location non saisie</div>
                  <div className="text-xs text-slate-300">Cliquez sur "+ Saisir location" pour enregistrer le coût de location</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                        <th className="text-left pb-2 pr-3">Loueur</th>
                        <th className="text-right pb-2 pr-3">Montant location</th>
                        <th className="text-right pb-2 pr-3">Payé</th>
                        <th className="text-right pb-2 pr-3">Reste</th>
                        <th className="pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {locations.map(loc => (
                        <tr key={loc.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-2 pr-3 font-semibold text-slate-700">{loc.loueur_nom || '—'}</td>
                          <td className="py-2 pr-3 text-right font-bold text-purple-600">{fmt(loc.montant_location)} DHS</td>
                          <td className="py-2 pr-3 text-right font-semibold text-emerald-600">{fmt(loc.montant_paye)} DHS</td>
                          <td className="py-2 pr-3 text-right font-bold text-red-600">
                            {Math.max(0, (loc.montant_location||0) - (loc.montant_paye||0)) > 0
                              ? `${fmt(Math.max(0, (loc.montant_location||0)-(loc.montant_paye||0)))} DHS`
                              : <span className="text-emerald-600">✓ Soldé</span>
                            }
                          </td>
                          <td className="py-2 pl-1"><DelBtn onDel={() => delLocation(loc)}/></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {locations[0]?.note && (
                    <div className="mt-2 text-xs text-slate-400 px-1">📝 {locations[0].note}</div>
                  )}
                </div>
              )}
            </Section>
            </div>
          )}

        </div>
        </div>{/* last section ref div */}
      </div>
    </Layout>
  )
}
