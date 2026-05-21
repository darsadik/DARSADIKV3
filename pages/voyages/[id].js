import { useState, useEffect, useCallback } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { useRouter } from 'next/router'
import Link from 'next/link'

const fmt     = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtD    = n => parseFloat(n || 0).toFixed(2)
const fmtDate = d => { if (!d) return '—'; const [y,m,j] = d.split('-'); return `${j}/${m}/${y}` }
const today   = () => new Date().toISOString().split('T')[0]

// ─── CHARGE CATEGORIES ───────────────────────────────────────────────────────
const CHARGE_CATS = [
  { key: 'ouvriers',    label: 'Ouvriers / MDO',    icon: '👷' },
  { key: 'chauffeur',   label: 'Chauffeur',          icon: '🧑‍✈️' },
  { key: 'autoroute',   label: 'Péage / Autoroute',  icon: '🛣️' },
  { key: 'gendarmerie', label: 'Gendarmerie',         icon: '🚔' },
  { key: 'controle',    label: 'Contrôle / Police',  icon: '🛂' },
  { key: 'nourriture',  label: 'Nourriture',          icon: '🍽️' },
  { key: 'reparation',  label: 'Réparation camion',  icon: '🔧' },
  { key: 'chargement',  label: 'Chargement',          icon: '📦' },
  { key: 'autres',      label: 'Autres',              icon: '➕' },
]

// ─── SECTION CARD ─────────────────────────────────────────────────────────────
function Section({ icon, title, children, action, color = 'blue' }) {
  const colors = {
    blue:    'border-blue-100 bg-blue-50/30',
    green:   'border-emerald-100 bg-emerald-50/30',
    orange:  'border-orange-100 bg-orange-50/30',
    purple:  'border-purple-100 bg-purple-50/30',
    red:     'border-red-100 bg-red-50/30',
    slate:   'border-slate-100 bg-slate-50/30',
  }
  return (
    <div className={`rounded-2xl border ${colors[color]} overflow-hidden`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className="font-bold text-slate-700 text-sm">{title}</span>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────
function Empty({ text }) {
  return <div className="text-center py-3 text-slate-400 text-xs italic">{text}</div>
}

// ─── ROW DELETE BUTTON ────────────────────────────────────────────────────────
function DelBtn({ onDel }) {
  return (
    <button onClick={onDel} className="text-red-300 hover:text-red-500 transition text-xs px-1.5">✕</button>
  )
}

export default function VoyageDetail() {
  const router   = useRouter()
  const { id }   = router.query
  const { user } = useAuth()

  // ── master data ──
  const [voyage,    setVoyage]    = useState(null)
  const [camions,   setCamions]   = useState([])
  const [clients,   setClients]   = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [grignonFournisseurs, setGrignonFournisseurs] = useState([])
  const [typeBriques, setTypeBriques] = useState([])
  const [loading,   setLoading]   = useState(true)

  // ── section data ──
  const [achats,    setAchats]    = useState([])
  const [livraisons,setLivraisons]= useState([])
  const [retours,   setRetours]   = useState([])
  const [gasoil,    setGasoil]    = useState([])
  const [charges,   setCharges]   = useState([])

  // ── forms ──
  const [showAchat,    setShowAchat]    = useState(false)
  const [showLiv,      setShowLiv]      = useState(false)
  const [showRetour,   setShowRetour]   = useState(false)
  const [showGasoil,   setShowGasoil]   = useState(false)
  const [showCharge,   setShowCharge]   = useState(false)

  const [achatForm, setAchatForm] = useState({ date_achat: today(), type_produit: 'brique', fournisseur_id: '', type_brique_id: '', qte: '', prix_achat: '', note: '' })
  const [livForm,   setLivForm]   = useState({ date_livraison: today(), type_produit: 'brique', client_id: '', type_brique_id: '', qte: '', prix_vente: '', prix_achat: '', note: '' })
  const [retForm,   setRetForm]   = useState({ date_retour: today(), client_nom: '', destination: '', montant: '', montant_paye: '', note: '' })
  const [gasForm,   setGasForm]   = useState({ date_gasoil: today(), station: 'HMIDA ZAIO — Station Petrom', qte_litres: '', prix_unitaire: '12.40', note: '' })
  const [chgForm,   setChgForm]   = useState({ date_charge: today(), categorie: 'ouvriers', description: '', montant: '', facture_client: false, client_id: '', note: '' })

  const [savingAchat,  setSavingAchat]  = useState(false)
  const [savingLiv,    setSavingLiv]    = useState(false)
  const [savingRetour, setSavingRetour] = useState(false)
  const [savingGas,    setSavingGas]    = useState(false)
  const [savingChg,    setSavingChg]    = useState(false)
  const [savingStatut, setSavingStatut] = useState(false)
  const [msg,          setMsg]          = useState('')

  const loadVoyage = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [
      { data: v },
      { data: ca },
      { data: cl },
      { data: fo },
      { data: gf },
      { data: ty },
      { data: ac },
      { data: li },
      { data: re },
      { data: ga },
      { data: ch },
    ] = await Promise.all([
      supabase.from('voyages').select('*').eq('id', id).single(),
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('clients').select('*').order('nom'),
      supabase.from('fournisseurs').select('*').order('nom'),
      supabase.from('grignon_fournisseurs').select('*').order('nom'),
      supabase.from('type_briques').select('*').order('nom'),
      supabase.from('voyage_achats').select('*').eq('voyage_id', id).order('created_at'),
      supabase.from('voyage_livraisons').select('*').eq('voyage_id', id).order('created_at'),
      supabase.from('voyage_retours').select('*').eq('voyage_id', id).order('created_at'),
      supabase.from('voyage_gasoil').select('*').eq('voyage_id', id).order('created_at'),
      supabase.from('voyage_charges').select('*').eq('voyage_id', id).order('created_at'),
    ])
    setVoyage(v)
    setCamions(ca || [])
    setClients(cl || [])
    setFournisseurs(fo || [])
    setGrignonFournisseurs(gf || [])
    setTypeBriques(ty || [])
    setAchats(ac || [])
    setLivraisons(li || [])
    setRetours(re || [])
    setGasoil(ga || [])
    setCharges(ch || [])
    setLoading(false)
  }, [id])

  useEffect(() => { loadVoyage() }, [loadVoyage])

  // ── PROFIT CALCULATIONS ────────────────────────────────────────────────────
  const totalGasoil      = gasoil.reduce((s, g) => s + (g.total || 0), 0)
  const totalChargesFixed = charges.filter(c => !c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)
  const totalChargesClient = charges.filter(c => c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)
  const totalRevenuLivs  = livraisons.reduce((s, l) => s + (l.total_vente || 0), 0)
  const totalAchatLivs   = livraisons.reduce((s, l) => s + ((l.qte||0)*(l.prix_achat||0)), 0)
  const totalRetours     = retours.reduce((s, r) => s + (r.montant_paye || 0), 0)
  const revenuBrut       = totalRevenuLivs + totalRetours + totalChargesClient
  const coutTotal        = totalAchatLivs + totalGasoil + totalChargesFixed
  const profitNet        = revenuBrut - coutTotal
  const margePercent     = revenuBrut > 0 ? Math.round(profitNet / revenuBrut * 100) : 0

  // Unique clients count for gasoil/charge split
  const clientsUniques = [...new Set(livraisons.map(l => l.client_id).filter(Boolean))]
  const nbClients = Math.max(clientsUniques.length, 1)
  const gasoilParClient = nbClients > 0 ? totalGasoil / nbClients : 0
  const chargesFixesParClient = nbClients > 0 ? totalChargesFixed / nbClients : 0

  // Per client profit
  const clientProfits = clientsUniques.map(cid => {
    const cl = clients.find(c => c.id === cid)
    const myLivs = livraisons.filter(l => l.client_id === cid)
    const myCharges = charges.filter(c => c.facture_client && c.client_id === cid)
    const rev = myLivs.reduce((s, l) => s + (l.total_vente || 0), 0) + myCharges.reduce((s, c) => s + (c.montant || 0), 0)
    const cout = myLivs.reduce((s, l) => s + ((l.qte||0)*(l.prix_achat||0)), 0) + gasoilParClient + chargesFixesParClient
    return { id: cid, nom: cl?.nom || myLivs[0]?.client_nom || '—', rev, cout, profit: rev - cout }
  })

  // ── SAVE ACHAT ─────────────────────────────────────────────────────────────
  async function saveAchat(e) {
    e.preventDefault()
    if (!achatForm.qte || !achatForm.prix_achat) { showMsg('❌ Quantité et prix requis'); return }
    setSavingAchat(true)
    const qte = parseFloat(achatForm.qte) || 0
    const prix = parseFloat(achatForm.prix_achat) || 0
    const total_achat = Math.round(qte * prix * 100) / 100
    const fourn = achatForm.type_produit === 'brique'
      ? fournisseurs.find(f => f.id === parseInt(achatForm.fournisseur_id))
      : grignonFournisseurs.find(f => f.id === parseInt(achatForm.fournisseur_id))
    const ty = typeBriques.find(t => t.id === parseInt(achatForm.type_brique_id))

    await supabase.from('voyage_achats').insert({
      voyage_id:       parseInt(id),
      date_achat:      achatForm.date_achat,
      type_produit:    achatForm.type_produit,
      fournisseur_id:  achatForm.fournisseur_id ? parseInt(achatForm.fournisseur_id) : null,
      fournisseur_nom: fourn?.nom || '',
      type_brique:     achatForm.type_produit === 'grignon' ? 'Grignon' : (ty?.nom || ''),
      qte, prix_achat: prix,
      note: achatForm.note || null,
    })
    setSavingAchat(false)
    setShowAchat(false)
    setAchatForm({ date_achat: today(), type_produit: 'brique', fournisseur_id: '', type_brique_id: '', qte: '', prix_achat: '', note: '' })
    loadVoyage()
  }

  // ── SAVE LIVRAISON ─────────────────────────────────────────────────────────
  async function saveLiv(e) {
    e.preventDefault()
    if (!livForm.client_id || !livForm.qte || !livForm.prix_vente) { showMsg('❌ Client, quantité et prix requis'); return }
    setSavingLiv(true)
    const qte        = parseFloat(livForm.qte)        || 0
    const prix_vente = parseFloat(livForm.prix_vente) || 0
    const prix_achat = parseFloat(livForm.prix_achat) || 0
    const total_vente = Math.round(qte * prix_vente * 100) / 100
    const total_achat = Math.round(qte * prix_achat * 100) / 100
    const marge       = Math.round((total_vente - total_achat) * 100) / 100
    const cl  = clients.find(c => c.id === parseInt(livForm.client_id))
    const ty  = typeBriques.find(t => t.id === parseInt(livForm.type_brique_id))

    // Save to voyage_livraisons
    const { data: livData } = await supabase.from('voyage_livraisons').insert({
      voyage_id:       parseInt(id),
      date_livraison:  livForm.date_livraison,
      type_produit:    livForm.type_produit,
      client_id:       parseInt(livForm.client_id),
      client_nom:      cl?.nom || '',
      type_brique:     livForm.type_produit === 'grignon' ? 'Grignon' : (ty?.nom || ''),
      qte, prix_vente, prix_achat,
      note: livForm.note || null,
    }).select().single()

    // Also save to ventes table (for client accounting) — briques only
    if (livForm.type_produit === 'brique' && livData) {
      const { data: venteData } = await supabase.from('ventes').insert({
        date:          livForm.date_livraison,
        date_fournisseur: livForm.date_livraison,
        client_id:     parseInt(livForm.client_id),
        client_nom:    cl?.nom || '',
        camion_id:     voyage?.camion_id || null,
        camion_plaque: voyage?.camion_plaque || '',
        chauffeur:     voyage?.chauffeur || '',
        type_brique_id: livForm.type_brique_id ? parseInt(livForm.type_brique_id) : null,
        type_brique:   ty?.nom || '',
        qte, prix_vente, prix_achat,
        total_vente, total_achat, marge,
        voyage_id:     parseInt(id),
      }).select().single()
      // Link vente_id back
      if (venteData) {
        await supabase.from('voyage_livraisons').update({ vente_id: venteData.id }).eq('id', livData.id)
      }
      // Update client solde
      if (cl) await supabase.from('clients').update({ solde: (cl.solde || 0) + total_vente }).eq('id', cl.id)
    }

    // Also save to grignon_operations (for grignon accounting)
    if (livForm.type_produit === 'grignon') {
      await supabase.from('grignon_operations').insert({
        date:          livForm.date_livraison,
        client_id:     parseInt(livForm.client_id),
        client_nom:    cl?.nom || '',
        camion_id:     voyage?.camion_id || null,
        camion_plaque: voyage?.camion_plaque || '',
        chauffeur:     voyage?.chauffeur || '',
        qte, prix_vente, prix_achat,
        total_vente, total_achat, marge,
        voyage_id:     parseInt(id),
      })
    }

    setSavingLiv(false)
    setShowLiv(false)
    setLivForm({ date_livraison: today(), type_produit: 'brique', client_id: '', type_brique_id: '', qte: '', prix_vente: '', prix_achat: '', note: '' })
    loadVoyage()
  }

  // ── SAVE RETOUR ────────────────────────────────────────────────────────────
  async function saveRetour(e) {
    e.preventDefault()
    if (!retForm.client_nom || !retForm.montant) { showMsg('❌ Client et montant requis'); return }
    setSavingRetour(true)
    const montant      = parseFloat(retForm.montant)       || 0
    const montant_paye = parseFloat(retForm.montant_paye)  || 0
    const restant      = Math.max(0, montant - montant_paye)

    // Save to voyage_retours
    await supabase.from('voyage_retours').insert({
      voyage_id:    parseInt(id),
      date_retour:  retForm.date_retour,
      client_nom:   retForm.client_nom.trim(),
      destination:  retForm.destination || null,
      montant, montant_paye,
      note: retForm.note || null,
    })
    // Also save to retours_transport
    await supabase.from('retours_transport').insert({
      date:          retForm.date_retour,
      client_nom:    retForm.client_nom.trim(),
      destination:   retForm.destination || null,
      camion_id:     voyage?.camion_id || null,
      camion_plaque: voyage?.camion_plaque || null,
      chauffeur:     voyage?.chauffeur || null,
      montant, montant_paye, restant,
      voyage_id:     parseInt(id),
    })
    setSavingRetour(false)
    setShowRetour(false)
    setRetForm({ date_retour: today(), client_nom: '', destination: '', montant: '', montant_paye: '', note: '' })
    loadVoyage()
  }

  // ── SAVE GASOIL ────────────────────────────────────────────────────────────
  async function saveGasoil(e) {
    e.preventDefault()
    if (!gasForm.qte_litres || !gasForm.prix_unitaire) { showMsg('❌ Quantité et prix requis'); return }
    setSavingGas(true)
    const qte = parseFloat(gasForm.qte_litres)    || 0
    const pu  = parseFloat(gasForm.prix_unitaire) || 0
    const total = Math.round(qte * pu * 100) / 100

    // Save to voyage_gasoil
    await supabase.from('voyage_gasoil').insert({
      voyage_id:     parseInt(id),
      date_gasoil:   gasForm.date_gasoil,
      station:       gasForm.station,
      qte_litres:    qte,
      prix_unitaire: pu,
      note: gasForm.note || null,
    })
    // Also save to gasoil table
    const camion = camions.find(c => c.id === voyage?.camion_id)
    const { data: gasData } = await supabase.from('gasoil').insert({
      date:          gasForm.date_gasoil,
      camion_id:     voyage?.camion_id || null,
      camion_plaque: voyage?.camion_plaque || '',
      chauffeur:     voyage?.chauffeur || '',
      station:       gasForm.station,
      qte: qte, prix_unitaire: pu, total,
      voyage_id:     parseInt(id),
    }).select().single()
    // Update camion stats
    if (camion) {
      await supabase.from('camions').update({
        gasoil_dhs: (camion.gasoil_dhs || 0) + total,
        pleins:     (camion.pleins || 0) + 1,
        litres:     (camion.litres || 0) + qte,
      }).eq('id', camion.id)
    }
    setSavingGas(false)
    setShowGasoil(false)
    setGasForm({ date_gasoil: today(), station: 'HMIDA ZAIO — Station Petrom', qte_litres: '', prix_unitaire: '12.40', note: '' })
    loadVoyage()
  }

  // ── SAVE CHARGE ────────────────────────────────────────────────────────────
  async function saveCharge(e) {
    e.preventDefault()
    if (!chgForm.montant) { showMsg('❌ Montant requis'); return }
    setSavingChg(true)
    const montant = parseFloat(chgForm.montant) || 0
    const cl = clients.find(c => c.id === parseInt(chgForm.client_id))

    await supabase.from('voyage_charges').insert({
      voyage_id:     parseInt(id),
      date_charge:   chgForm.date_charge,
      categorie:     chgForm.categorie,
      description:   chgForm.description || null,
      montant,
      facture_client: chgForm.facture_client,
      client_id:     chgForm.facture_client && chgForm.client_id ? parseInt(chgForm.client_id) : null,
      client_nom:    chgForm.facture_client ? (cl?.nom || '') : null,
      note: chgForm.note || null,
    })

    // If billed to client, also add MDO entry to ventes
    if (chgForm.facture_client && chgForm.client_id && cl) {
      await supabase.from('ventes').insert({
        date: chgForm.date_charge,
        client_id: parseInt(chgForm.client_id),
        client_nom: cl.nom,
        camion_id: voyage?.camion_id || null,
        camion_plaque: voyage?.camion_plaque || '',
        type_entree: 'mdo',
        montant_mdo: montant,
        description_mdo: chgForm.description || chgForm.categorie,
        voyage_id: parseInt(id),
      })
      await supabase.from('clients').update({ solde: (cl.solde || 0) + montant }).eq('id', cl.id)
    }

    setSavingChg(false)
    setShowCharge(false)
    setChgForm({ date_charge: today(), categorie: 'ouvriers', description: '', montant: '', facture_client: false, client_id: '', note: '' })
    loadVoyage()
  }

  // ── DELETE HANDLERS ────────────────────────────────────────────────────────
  async function delAchat(row) {
    await supabase.from('voyage_achats').delete().eq('id', row.id)
    loadVoyage()
  }
  async function delLiv(row) {
    // Remove from voyage_livraisons
    await supabase.from('voyage_livraisons').delete().eq('id', row.id)
    // Remove linked vente + reverse client solde
    if (row.vente_id) {
      const cl = clients.find(c => c.id === row.client_id)
      await supabase.from('ventes').delete().eq('id', row.vente_id)
      if (cl) await supabase.from('clients').update({ solde: (cl.solde || 0) - (row.total_vente || 0) }).eq('id', cl.id)
    }
    loadVoyage()
  }
  async function delRetour(row) {
    await supabase.from('voyage_retours').delete().eq('id', row.id)
    if (row.retour_id) await supabase.from('retours_transport').delete().eq('id', row.retour_id)
    loadVoyage()
  }
  async function delGasoil(row) {
    await supabase.from('voyage_gasoil').delete().eq('id', row.id)
    if (row.gasoil_id) {
      const camion = camions.find(c => c.id === voyage?.camion_id)
      await supabase.from('gasoil').delete().eq('id', row.gasoil_id)
      if (camion) {
        await supabase.from('camions').update({
          gasoil_dhs: Math.max(0, (camion.gasoil_dhs || 0) - (row.total || 0)),
          pleins:     Math.max(0, (camion.pleins || 0) - 1),
          litres:     Math.max(0, (camion.litres || 0) - (row.qte_litres || 0)),
        }).eq('id', camion.id)
      }
    }
    loadVoyage()
  }
  async function delCharge(row) {
    await supabase.from('voyage_charges').delete().eq('id', row.id)
    loadVoyage()
  }

  async function updateStatut(s) {
    setSavingStatut(true)
    await supabase.from('voyages').update({ statut: s }).eq('id', id)
    setSavingStatut(false)
    loadVoyage()
  }

  function showMsg(m) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  if (loading) return <Layout title="Voyage"><div className="text-center py-20 text-slate-400">Chargement...</div></Layout>
  if (!voyage) return <Layout title="Voyage"><div className="text-center py-20 text-slate-400">Voyage introuvable</div></Layout>

  const isTermine = voyage.statut === 'termine'

  return (
    <Layout
      title={voyage.reference || `Voyage #${voyage.id}`}
      subtitle={`${voyage.camion_plaque}${voyage.chauffeur ? ' • ' + voyage.chauffeur : ''}${voyage.destination ? ' → ' + voyage.destination : ''}`}
    >
      <div className="max-w-5xl mx-auto space-y-4">

        {msg && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm font-semibold px-4 py-2 rounded-xl">{msg}</div>
        )}

        {/* ── HEADER ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/voyages" className="text-blue-500 hover:text-blue-700 text-sm font-semibold">← Voyages</Link>
            <span className="text-slate-200">|</span>
            <div>
              <div className="font-black text-slate-800">{voyage.reference || `Voyage #${voyage.id}`}</div>
              <div className="text-xs text-slate-500">{fmtDate(voyage.date_depart)} • {voyage.camion_plaque}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              voyage.statut === 'termine'
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                : 'bg-amber-50 text-amber-600 border-amber-200'
            }`}>
              {voyage.statut === 'termine' ? '✅ Terminé' : '🔄 En cours'}
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

        {/* ── PROFIT SUMMARY ── */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white shadow-lg">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Résultat du voyage</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-[10px] text-slate-400 mb-1">Revenu brut</div>
              <div className="text-lg font-black text-emerald-400">{fmt(revenuBrut)} DHS</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-1">Coût achats</div>
              <div className="text-lg font-black text-red-400">{fmt(totalAchatLivs)} DHS</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-1">Gasoil + Charges</div>
              <div className="text-lg font-black text-orange-400">{fmt(totalGasoil + totalChargesFixed)} DHS</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-1">Profit net</div>
              <div className={`text-2xl font-black ${profitNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {profitNet >= 0 ? '+' : ''}{fmt(profitNet)} DHS
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Marge: {margePercent}%</div>
            </div>
          </div>

          {/* Per client breakdown */}
          {clientProfits.length > 0 && (
            <div className="border-t border-slate-700 pt-4">
              <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">
                Profit par client — Gasoil ({fmt(gasoilParClient)} DHS) + Charges ({fmt(chargesFixesParClient)} DHS) divisés en {nbClients}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {clientProfits.map(cp => (
                  <div key={cp.id} className="bg-slate-700/50 rounded-xl p-3">
                    <div className="font-bold text-sm text-white">{cp.nom}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Rev: {fmt(cp.rev)} • Coût: {fmt(cp.cout)}</div>
                    <div className={`text-base font-black mt-1 ${cp.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {cp.profit >= 0 ? '+' : ''}{fmt(cp.profit)} DHS
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION: ACHATS ── */}
        <Section icon="📦" title="Achats (Briques & Grignon)" color="blue"
          action={
            <button onClick={() => setShowAchat(v => !v)}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-700 transition">
              {showAchat ? 'Fermer' : '+ Ajouter achat'}
            </button>
          }>

          {showAchat && (
            <form onSubmit={saveAchat} className="bg-white border border-blue-100 rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Date achat</label>
                <input type="date" value={achatForm.date_achat} onChange={e => setAchatForm({...achatForm, date_achat: e.target.value})}
                  className="input w-full text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Type produit</label>
                <select value={achatForm.type_produit} onChange={e => setAchatForm({...achatForm, type_produit: e.target.value, fournisseur_id: '', type_brique_id: ''})}
                  className="input w-full text-sm">
                  <option value="brique">🧱 Briques</option>
                  <option value="grignon">🫒 Grignon</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Fournisseur</label>
                <select value={achatForm.fournisseur_id} onChange={e => setAchatForm({...achatForm, fournisseur_id: e.target.value})}
                  className="input w-full text-sm">
                  <option value="">— Sélectionner —</option>
                  {(achatForm.type_produit === 'brique' ? fournisseurs : grignonFournisseurs).map(f =>
                    <option key={f.id} value={f.id}>{f.nom}</option>
                  )}
                </select>
              </div>
              {achatForm.type_produit === 'brique' && (
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">Type brique</label>
                  <select value={achatForm.type_brique_id} onChange={e => setAchatForm({...achatForm, type_brique_id: e.target.value})}
                    className="input w-full text-sm">
                    <option value="">— Sélectionner —</option>
                    {typeBriques.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Quantité</label>
                <input type="number" value={achatForm.qte} onChange={e => setAchatForm({...achatForm, qte: e.target.value})}
                  className="input w-full text-sm" placeholder="6000" required />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Prix achat / unité</label>
                <input type="number" step="0.01" value={achatForm.prix_achat} onChange={e => setAchatForm({...achatForm, prix_achat: e.target.value})}
                  className="input w-full text-sm" placeholder="1.20" required />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Total achat</label>
                <div className="input w-full text-sm bg-slate-50 font-bold text-slate-700 flex items-center">
                  {fmt((parseFloat(achatForm.qte)||0) * (parseFloat(achatForm.prix_achat)||0))} DHS
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Note</label>
                <input type="text" value={achatForm.note} onChange={e => setAchatForm({...achatForm, note: e.target.value})}
                  className="input w-full text-sm" placeholder="Optionnel..." />
              </div>
              <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowAchat(false)} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600">Annuler</button>
                <button type="submit" disabled={savingAchat} className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg font-semibold">
                  {savingAchat ? '...' : '✅ Enregistrer'}
                </button>
              </div>
            </form>
          )}

          {achats.length === 0 ? <Empty text="Aucun achat enregistré" /> : (
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
                      <td className="py-2 pr-3 font-semibold">{a.type_brique || a.type_produit}</td>
                      <td className="py-2 pr-3 text-slate-500">{a.fournisseur_nom || '—'}</td>
                      <td className="py-2 pr-3 text-right">{fmt(a.qte)}</td>
                      <td className="py-2 pr-3 text-right">{fmtD(a.prix_achat)}</td>
                      <td className="py-2 text-right font-bold text-red-500">{fmt(a.total_achat)} DHS</td>
                      <td className="py-2 pl-2"><DelBtn onDel={() => delAchat(a)} /></td>
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
        <Section icon="🚚" title="Livraisons clients" color="green"
          action={
            <button onClick={() => setShowLiv(v => !v)}
              className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-emerald-700 transition">
              {showLiv ? 'Fermer' : '+ Ajouter livraison'}
            </button>
          }>

          {showLiv && (
            <form onSubmit={saveLiv} className="bg-white border border-emerald-100 rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Date livraison</label>
                <input type="date" value={livForm.date_livraison} onChange={e => setLivForm({...livForm, date_livraison: e.target.value})}
                  className="input w-full text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Type produit</label>
                <select value={livForm.type_produit} onChange={e => setLivForm({...livForm, type_produit: e.target.value, type_brique_id: ''})}
                  className="input w-full text-sm">
                  <option value="brique">🧱 Briques</option>
                  <option value="grignon">🫒 Grignon</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Client *</label>
                <select value={livForm.client_id} onChange={e => setLivForm({...livForm, client_id: e.target.value})}
                  className="input w-full text-sm" required>
                  <option value="">— Sélectionner —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              {livForm.type_produit === 'brique' && (
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">Type brique</label>
                  <select value={livForm.type_brique_id} onChange={e => setLivForm({...livForm, type_brique_id: e.target.value})}
                    className="input w-full text-sm">
                    <option value="">— Sélectionner —</option>
                    {typeBriques.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Quantité livrée *</label>
                <input type="number" value={livForm.qte} onChange={e => setLivForm({...livForm, qte: e.target.value})}
                  className="input w-full text-sm" placeholder="3500" required />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Prix vente / unité *</label>
                <input type="number" step="0.01" value={livForm.prix_vente} onChange={e => setLivForm({...livForm, prix_vente: e.target.value})}
                  className="input w-full text-sm" placeholder="2.10" required />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Prix achat / unité</label>
                <input type="number" step="0.01" value={livForm.prix_achat} onChange={e => setLivForm({...livForm, prix_achat: e.target.value})}
                  className="input w-full text-sm" placeholder="1.20" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Total vente</label>
                <div className="input w-full text-sm bg-slate-50 font-bold text-emerald-600 flex items-center">
                  {fmt((parseFloat(livForm.qte)||0) * (parseFloat(livForm.prix_vente)||0))} DHS
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Marge brute</label>
                <div className="input w-full text-sm bg-slate-50 font-bold text-blue-600 flex items-center">
                  {fmt((parseFloat(livForm.qte)||0) * ((parseFloat(livForm.prix_vente)||0) - (parseFloat(livForm.prix_achat)||0)))} DHS
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Note</label>
                <input type="text" value={livForm.note} onChange={e => setLivForm({...livForm, note: e.target.value})}
                  className="input w-full text-sm" placeholder="Optionnel..." />
              </div>
              <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowLiv(false)} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600">Annuler</button>
                <button type="submit" disabled={savingLiv} className="text-xs bg-emerald-600 text-white px-4 py-1.5 rounded-lg font-semibold">
                  {savingLiv ? '...' : '✅ Enregistrer'}
                </button>
              </div>
            </form>
          )}

          {livraisons.length === 0 ? <Empty text="Aucune livraison enregistrée" /> : (
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
                    <th className="text-right pb-2 pr-3">Marge brute</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {livraisons.map(l => (
                    <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pr-3 text-slate-500">{fmtDate(l.date_livraison)}</td>
                      <td className="py-2 pr-3 font-semibold">{l.client_nom}</td>
                      <td className="py-2 pr-3 text-slate-500">{l.type_brique || l.type_produit}</td>
                      <td className="py-2 pr-3 text-right">{fmt(l.qte)}</td>
                      <td className="py-2 pr-3 text-right">{fmtD(l.prix_vente)}</td>
                      <td className="py-2 pr-3 text-right font-bold text-emerald-600">{fmt(l.total_vente)} DHS</td>
                      <td className="py-2 pr-3 text-right font-semibold text-blue-600">{fmt((l.total_vente||0) - (l.prix_achat||0)*(l.qte||0))} DHS</td>
                      <td className="py-2 pl-2"><DelBtn onDel={() => delLiv(l)} /></td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold">
                    <td colSpan={4} className="py-2 pr-3 text-right text-[10px] uppercase text-slate-700">Total livraisons</td>
                    <td></td>
                    <td className="py-2 pr-3 text-right text-emerald-600">{fmt(totalRevenuLivraisons)} DHS</td>
                    <td className="py-2 pr-3 text-right text-blue-600">{fmt(livraisons.reduce((s,l)=>s+((l.total_vente||0)-(l.prix_achat||0)*(l.qte||0)),0))} DHS</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ── SECTION: RETOUR TRANSPORT ── */}
        <Section icon="↩️" title="Retour transport" color="purple"
          action={
            <button onClick={() => setShowRetour(v => !v)}
              className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-purple-700 transition">
              {showRetour ? 'Fermer' : '+ Ajouter retour'}
            </button>
          }>

          {showRetour && (
            <form onSubmit={saveRetour} className="bg-white border border-purple-100 rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Date</label>
                <input type="date" value={retForm.date_retour} onChange={e => setRetForm({...retForm, date_retour: e.target.value})}
                  className="input w-full text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Client retour *</label>
                <input type="text" value={retForm.client_nom} onChange={e => setRetForm({...retForm, client_nom: e.target.value})}
                  className="input w-full text-sm" placeholder="Nom du client" required />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Destination</label>
                <input type="text" value={retForm.destination} onChange={e => setRetForm({...retForm, destination: e.target.value})}
                  className="input w-full text-sm" placeholder="Ex: Berkane..." />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant total *</label>
                <input type="number" value={retForm.montant} onChange={e => setRetForm({...retForm, montant: e.target.value})}
                  className="input w-full text-sm" placeholder="1500" required />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant payé</label>
                <input type="number" value={retForm.montant_paye} onChange={e => setRetForm({...retForm, montant_paye: e.target.value})}
                  className="input w-full text-sm" placeholder="0" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Restant</label>
                <div className="input w-full text-sm bg-slate-50 font-bold text-orange-600 flex items-center">
                  {fmt(Math.max(0, (parseFloat(retForm.montant)||0) - (parseFloat(retForm.montant_paye)||0)))} DHS
                </div>
              </div>
              <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowRetour(false)} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600">Annuler</button>
                <button type="submit" disabled={savingRetour} className="text-xs bg-purple-600 text-white px-4 py-1.5 rounded-lg font-semibold">
                  {savingRetour ? '...' : '✅ Enregistrer'}
                </button>
              </div>
            </form>
          )}

          {retours.length === 0 ? <Empty text="Aucun retour transport sur ce voyage" /> : (
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
                      <td className="py-2 pr-3 text-slate-500">{r.destination || '—'}</td>
                      <td className="py-2 pr-3 text-right font-bold text-purple-600">{fmt(r.montant)} DHS</td>
                      <td className="py-2 pr-3 text-right text-emerald-600">{fmt(r.montant_paye)} DHS</td>
                      <td className="py-2 text-right text-orange-500 font-semibold">{r.restant > 0 ? fmt(r.restant)+' DHS ⚠' : '✓'}</td>
                      <td className="py-2 pl-2"><DelBtn onDel={() => delRetour(r)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ── SECTION: GASOIL ── */}
        <Section icon="⛽" title="Gasoil" color="orange"
          action={
            <button onClick={() => setShowGasoil(v => !v)}
              className="text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-orange-600 transition">
              {showGasoil ? 'Fermer' : '+ Ajouter gasoil'}
            </button>
          }>

          {showGasoil && (
            <form onSubmit={saveGasoil} className="bg-white border border-orange-100 rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Date</label>
                <input type="date" value={gasForm.date_gasoil} onChange={e => setGasForm({...gasForm, date_gasoil: e.target.value})}
                  className="input w-full text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Station</label>
                <select value={gasForm.station} onChange={e => setGasForm({...gasForm, station: e.target.value})}
                  className="input w-full text-sm">
                  <option>HMIDA ZAIO — Station Petrom</option>
                  <option>Autre station</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Litres *</label>
                <input type="number" step="0.01" value={gasForm.qte_litres} onChange={e => setGasForm({...gasForm, qte_litres: e.target.value})}
                  className="input w-full text-sm" placeholder="200" required />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Prix / litre *</label>
                <input type="number" step="0.01" value={gasForm.prix_unitaire} onChange={e => setGasForm({...gasForm, prix_unitaire: e.target.value})}
                  className="input w-full text-sm" placeholder="12.40" required />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Total</label>
                <div className="input w-full text-sm bg-slate-50 font-bold text-orange-600 flex items-center">
                  {fmt((parseFloat(gasForm.qte_litres)||0) * (parseFloat(gasForm.prix_unitaire)||0))} DHS
                </div>
              </div>
              {nbClients > 1 && (
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">Part / client ({nbClients} clients)</label>
                  <div className="input w-full text-sm bg-amber-50 font-bold text-amber-600 flex items-center">
                    {fmt(((parseFloat(gasForm.qte_litres)||0) * (parseFloat(gasForm.prix_unitaire)||0)) / nbClients)} DHS
                  </div>
                </div>
              )}
              <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowGasoil(false)} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600">Annuler</button>
                <button type="submit" disabled={savingGas} className="text-xs bg-orange-500 text-white px-4 py-1.5 rounded-lg font-semibold">
                  {savingGas ? '...' : '✅ Enregistrer'}
                </button>
              </div>
            </form>
          )}

          {gasoil.length === 0 ? <Empty text="Aucun gasoil enregistré" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                    <th className="text-left pb-2 pr-3">Date</th>
                    <th className="text-left pb-2 pr-3">Station</th>
                    <th className="text-right pb-2 pr-3">Litres</th>
                    <th className="text-right pb-2 pr-3">Prix/L</th>
                    <th className="text-right pb-2 pr-3">Total</th>
                    {nbClients > 1 && <th className="text-right pb-2 pr-3">÷{nbClients}</th>}
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
                      {nbClients > 1 && <td className="py-2 pr-3 text-right text-amber-600 font-semibold">{fmt(g.total / nbClients)} DHS</td>}
                      <td className="py-2 pl-2"><DelBtn onDel={() => delGasoil(g)} /></td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold">
                    <td colSpan={4} className="py-2 pr-3 text-right text-[10px] uppercase text-slate-700">Total gasoil</td>
                    <td className="py-2 pr-3 text-right text-orange-600">{fmt(totalGasoil)} DHS</td>
                    {nbClients > 1 && <td className="py-2 pr-3 text-right text-amber-600">{fmt(gasoilParClient)} DHS/client</td>}
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ── SECTION: CHARGES ── */}
        <Section icon="💸" title="Charges du voyage" color="red"
          action={
            <button onClick={() => setShowCharge(v => !v)}
              className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-red-600 transition">
              {showCharge ? 'Fermer' : '+ Ajouter charge'}
            </button>
          }>

          {showCharge && (
            <form onSubmit={saveCharge} className="bg-white border border-red-100 rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Date</label>
                <input type="date" value={chgForm.date_charge} onChange={e => setChgForm({...chgForm, date_charge: e.target.value})}
                  className="input w-full text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Catégorie</label>
                <select value={chgForm.categorie} onChange={e => setChgForm({...chgForm, categorie: e.target.value})}
                  className="input w-full text-sm">
                  {CHARGE_CATS.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant *</label>
                <input type="number" value={chgForm.montant} onChange={e => setChgForm({...chgForm, montant: e.target.value})}
                  className="input w-full text-sm" placeholder="800" required />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Description</label>
                <input type="text" value={chgForm.description} onChange={e => setChgForm({...chgForm, description: e.target.value})}
                  className="input w-full text-sm" placeholder="Ex: 3 ouvriers chargement..." />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="facture_client" checked={chgForm.facture_client}
                  onChange={e => setChgForm({...chgForm, facture_client: e.target.checked, client_id: ''})}
                  className="rounded" />
                <label htmlFor="facture_client" className="text-xs font-semibold text-slate-600 cursor-pointer">
                  Facturé au client ?
                </label>
              </div>
              {chgForm.facture_client && (
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">Client concerné</label>
                  <select value={chgForm.client_id} onChange={e => setChgForm({...chgForm, client_id: e.target.value})}
                    className="input w-full text-sm">
                    <option value="">— Sélectionner —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
              )}
              <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowCharge(false)} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600">Annuler</button>
                <button type="submit" disabled={savingChg} className="text-xs bg-red-500 text-white px-4 py-1.5 rounded-lg font-semibold">
                  {savingChg ? '...' : '✅ Enregistrer'}
                </button>
              </div>
            </form>
          )}

          {charges.length === 0 ? <Empty text="Aucune charge enregistrée" /> : (
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
                      <td className="py-2 pr-3 font-semibold">{CHARGE_CATS.find(x=>x.key===c.categorie)?.label || c.categorie}</td>
                      <td className="py-2 pr-3 text-slate-500">{c.description || '—'}</td>
                      <td className="py-2 pr-3 text-right font-bold text-red-600">{fmt(c.montant)} DHS</td>
                      <td className="py-2 text-xs">
                        {c.facture_client
                          ? <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded font-semibold">📋 {c.client_nom || 'Client'}</span>
                          : <span className="text-slate-300">Entreprise</span>}
                      </td>
                      <td className="py-2 pl-2"><DelBtn onDel={() => delCharge(c)} /></td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold">
                    <td colSpan={3} className="py-2 pr-3 text-right text-[10px] uppercase text-slate-700">Total charges fixes</td>
                    <td className="py-2 pr-3 text-right text-red-600">{fmt(totalChargesFixed)} DHS</td>
                    <td className="py-2 text-xs text-slate-400">{nbClients > 1 ? `÷${nbClients} = ${fmt(chargesFixesParClient)} DHS/client` : ''}</td>
                    <td></td>
                  </tr>
                  {totalChargesClient > 0 && (
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

      </div>
    </Layout>
  )
}
