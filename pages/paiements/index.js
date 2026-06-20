import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmt, fmtDate, today, startOfMonth, useIsMobile, openPrintWindow } from '../../lib/utils'

const MODES = ['Espèce', 'Chèque', 'Virement', 'Paiement fournisseur']
const CHEQUE_STATUSES = ['pending', 'validated', 'rejected']
const CHEQUE_STATUS_LABELS = { pending: '⏳ En attente', validated: '✅ Validé', rejected: '❌ Rejeté' }
const CHEQUE_STATUS_COLORS = { pending: 'bg-amber-50 text-amber-700', validated: 'bg-green-50 text-green-700', rejected: 'bg-red-50 text-red-700' }

const emptyForm = () => ({
  date: today(),
  client_id: '',
  societe: '',
  mode: 'Espèce',
  montant: '',
  note: '',
  camion_id: '',
  cheque_number: '',
  cheque_bank: '',
  cheque_status: 'pending',
  fournisseur_id: '',
})

export default function Paiements() {
  const { user } = useAuth()
  const isMobile = useIsMobile()

  // ── DATA ──
  const [clients, setClients] = useState([])
  const [paiements, setPaiements] = useState([])
  const [camions, setCamions] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [grignonClients, setGrignonClients] = useState([])
  const [grignonPaiements, setGrignonPaiements] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingGrignon, setSavingGrignon] = useState(false)

  // ── UI ──
  const [showForm, setShowForm] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [showGrignonForm, setShowGrignonForm] = useState(false)
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'cheques' | 'fournisseurs' | 'grignon'
  const [verifiedPmt, setVerifiedPmt] = useState(new Set())
  const toggleVerifyPmt = id => setVerifiedPmt(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const [editPmtId, setEditPmtId] = useState(null)
  const [editPmtOriginal, setEditPmtOriginal] = useState(null)
  const [editGrignonPmtId, setEditGrignonPmtId] = useState(null)
  const [editGrignonPmtOriginal, setEditGrignonPmtOriginal] = useState(null)

  // ── GRIGNON FORM ──
  const emptyGrignonForm = () => ({ date: today(), client_id: '', mode: 'Espèce', montant: '', note: '' })
  const [grignonForm, setGrignonForm] = useState(emptyGrignonForm())

  // ── FILTERS ──
  const [filterClient, setFilterClient] = useState('')
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo, setFilterTo] = useState(today())
  const [filterMode, setFilterMode] = useState('')
  const [filterChequeStatus, setFilterChequeStatus] = useState('')
  const [filterFournisseur, setFilterFournisseur] = useState('')
  const [searchCheque, setSearchCheque] = useState('')
  const [filterSociete, setFilterSociete] = useState('')

  // ── FORM ──
  const [form, setForm] = useState(emptyForm())

  // ── OUTGOING PAYMENTS (décaissements) ──
  const [payMode, setPayMode] = useState('incoming') // 'incoming' | 'outgoing'
  const [gFournisseurs, setGFournisseurs] = useState([])
  const emptyOut = () => ({
    date: today(), type: 'fourn_brique', tiers_id: '', tiers_nom: '',
    mode: 'Espèce', montant: '', note: '',
    cheque_number: '', cheque_bank: '', cheque_status: 'pending',
    also_fourn_brique_id: '', // grignon→brique linkage (same company e.g. Nova Brique)
  })
  const [outForm, setOutForm] = useState(emptyOut())
  const [savingOut, setSavingOut] = useState(false)
  const [editOutId, setEditOutId] = useState(null)
  const [outTab, setOutTab] = useState('fourn_brique') // table filter

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: cl }, { data: pa }, { data: ca }, { data: fo }, { data: gc }, { data: gp }, { data: gf }] = await Promise.all([
      supabase.from('clients').select('*').order('nom'),
      supabase.from('paiements').select('*').order('date', { ascending: true }),
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('fournisseurs').select('*').order('nom'),
      supabase.from('grignon_clients').select('*').order('nom'),
      supabase.from('grignon_paiements').select('*').order('date', { ascending: true }),
      supabase.from('grignon_fournisseurs').select('*').order('nom'),
    ])
    setClients(cl || [])
    setPaiements(pa || [])
    setCamions(ca || [])
    setFournisseurs(fo || [])
    setGrignonClients(gc || [])
    setGrignonPaiements(gp || [])
    setGFournisseurs(gf || [])
    setLoading(false)
  }

  const selectedClient = clients.find(c => c.id === parseInt(form.client_id))
  const montant = parseFloat(form.montant) || 0
  const soldeApres = (selectedClient?.solde || 0) - montant
  const isCheque = form.mode === 'Chèque'
  const isFournisseurMode = ['Chèque', 'Virement', 'Paiement fournisseur'].includes(form.mode)

  function startEditPmt(p) {
    setForm({
      date: p.date,
      client_id: String(p.client_id),
      societe: p.societe || '',
      mode: p.mode,
      montant: String(p.montant),
      note: p.note || '',
      camion_id: p.camion_id ? String(p.camion_id) : '',
      cheque_number: p.cheque_number || '',
      cheque_bank: p.cheque_bank || '',
      cheque_status: p.cheque_status || 'pending',
      fournisseur_id: p.fournisseur_id ? String(p.fournisseur_id) : '',
    })
    setEditPmtId(p.id)
    setEditPmtOriginal(p)
    setShowForm(true)
  }

  function cancelEditPmt() {
    setEditPmtId(null)
    setEditPmtOriginal(null)
    setForm(emptyForm())
    setShowForm(false)
  }

  // ── SAVE / UPDATE ──
  async function savePaiement(e) {
    e.preventDefault()
    if (!form.client_id || !montant) return
    setSaving(true)

    const client = selectedClient
    const camion = camions.find(c => c.id === parseInt(form.camion_id))
    const fournisseur = fournisseurs.find(f => f.id === parseInt(form.fournisseur_id))
    const clientId = parseInt(form.client_id)

    const payload = {
      date: form.date,
      client_id: clientId,
      client_nom: client?.nom || '',
      societe: form.societe || null,
      mode: form.mode,
      montant,
      note: form.note,
      camion_id: form.camion_id ? parseInt(form.camion_id) : null,
      camion_plaque: camion?.plaque || null,
      cheque_number: isCheque ? (form.cheque_number || null) : null,
      cheque_bank:   isCheque ? (form.cheque_bank   || null) : null,
      cheque_status: isCheque ? form.cheque_status           : null,
      fournisseur_id:  form.fournisseur_id ? parseInt(form.fournisseur_id) : null,
      fournisseur_nom: fournisseur?.nom || null,
      // architecture fields — keeps compatibility with new paiements table
      type_compte: 'client_brique',
      sens: 'entrant',
    }

    try {
      if (editPmtId) {
        const { error } = await supabase.from('paiements').update(payload).eq('id', editPmtId)
        if (error) throw error
        const orig = editPmtOriginal
        if (orig.client_id === clientId) {
          const diff = montant - (orig.montant || 0)
          if (diff !== 0) {
            // Fresh-read before updating solde
            const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', clientId).single()
            if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde || 0) - diff }).eq('id', clientId)
          }
        } else {
          // Client changed: restore old client, charge new client
          const { data: freshOldCl } = await supabase.from('clients').select('solde').eq('id', orig.client_id).single()
          if (freshOldCl) await supabase.from('clients').update({ solde: (freshOldCl.solde || 0) + (orig.montant || 0) }).eq('id', orig.client_id)
          const { data: freshNewCl } = await supabase.from('clients').select('solde').eq('id', clientId).single()
          if (freshNewCl) await supabase.from('clients').update({ solde: (freshNewCl.solde || 0) - montant }).eq('id', clientId)
        }
        setEditPmtId(null)
        setEditPmtOriginal(null)
      } else {
        const { error } = await supabase.from('paiements').insert(payload)
        if (error) throw error
        // Update client solde
        const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', clientId).single()
        if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde || 0) - montant }).eq('id', clientId)
        // If payment directed to fournisseur → also reduce fournisseur solde
        if (payload.fournisseur_id) {
          const { data: freshF } = await supabase.from('fournisseurs').select('solde').eq('id', payload.fournisseur_id).single()
          if (freshF) await supabase.from('fournisseurs').update({ solde: Math.max(0, (freshF.solde||0) - montant) }).eq('id', payload.fournisseur_id)
        }
      }

      setForm(emptyForm())
      setShowForm(false)
      loadAll()
    } catch (err) {
      alert('Erreur enregistrement paiement: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── DELETE ──
  async function deletePaiement(pmtId, clientId, m) {
    if (!confirm('Supprimer ce paiement ?')) return
    try {
      const { error } = await supabase.from('paiements').delete().eq('id', pmtId)
      if (error) throw error
      // Fresh-read before updating solde
      const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', clientId).single()
      if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde || 0) + m }).eq('id', clientId)
      loadAll()
    } catch (err) {
      alert('Erreur suppression paiement: ' + err.message)
    }
  }

  function startEditGrignonPmt(p) {
    setGrignonForm({ date: p.date, client_id: String(p.client_id), mode: p.mode, montant: String(p.montant), note: p.note || '' })
    setEditGrignonPmtId(p.id)
    setEditGrignonPmtOriginal(p)
    setShowGrignonForm(true)
  }

  function cancelEditGrignonPmt() {
    setEditGrignonPmtId(null)
    setEditGrignonPmtOriginal(null)
    setGrignonForm(emptyGrignonForm())
    setShowGrignonForm(false)
  }

  // ── GRIGNON SAVE / UPDATE ──
  async function saveGrignonPaiement(e) {
    e.preventDefault()
    const montantG = parseFloat(grignonForm.montant) || 0
    if (!grignonForm.client_id || !montantG) return
    setSavingGrignon(true)
    const cl = grignonClients.find(c => c.id === parseInt(grignonForm.client_id))

    const grignonClientId = parseInt(grignonForm.client_id)
    try {
      if (editGrignonPmtId) {
        const { error } = await supabase.from('grignon_paiements').update({
          date: grignonForm.date,
          client_id: grignonClientId,
          client_nom: cl?.nom || '',
          mode: grignonForm.mode,
          montant: montantG,
          note: grignonForm.note || null,
        }).eq('id', editGrignonPmtId)
        if (error) throw error
        const orig = editGrignonPmtOriginal
        if (orig.client_id === grignonClientId) {
          const diff = montantG - (orig.montant || 0)
          if (diff !== 0) {
            const { data: freshCl } = await supabase.from('grignon_clients').select('solde').eq('id', grignonClientId).single()
            if (freshCl) await supabase.from('grignon_clients').update({ solde: (freshCl.solde || 0) - diff }).eq('id', grignonClientId)
          }
        } else {
          const { data: freshOldCl } = await supabase.from('grignon_clients').select('solde').eq('id', orig.client_id).single()
          if (freshOldCl) await supabase.from('grignon_clients').update({ solde: (freshOldCl.solde || 0) + (orig.montant || 0) }).eq('id', orig.client_id)
          const { data: freshNewCl } = await supabase.from('grignon_clients').select('solde').eq('id', grignonClientId).single()
          if (freshNewCl) await supabase.from('grignon_clients').update({ solde: (freshNewCl.solde || 0) - montantG }).eq('id', grignonClientId)
        }
        setEditGrignonPmtId(null)
        setEditGrignonPmtOriginal(null)
      } else {
        const { error } = await supabase.from('grignon_paiements').insert({
          date: grignonForm.date,
          client_id: grignonClientId,
          client_nom: cl?.nom || '',
          mode: grignonForm.mode,
          montant: montantG,
          note: grignonForm.note || null,
        })
        if (error) throw error
        const { data: freshCl } = await supabase.from('grignon_clients').select('solde').eq('id', grignonClientId).single()
        if (freshCl) await supabase.from('grignon_clients').update({ solde: (freshCl.solde || 0) - montantG }).eq('id', grignonClientId)
      }
      setGrignonForm(emptyGrignonForm())
      setShowGrignonForm(false)
      loadAll()
    } catch (err) {
      alert('Erreur paiement grignon: ' + err.message)
    } finally {
      setSavingGrignon(false)
    }
  }

  async function deleteGrignonPaiement(pmtId, clientId, m) {
    if (!confirm('Supprimer ce paiement grignon ?')) return
    try {
      const { error } = await supabase.from('grignon_paiements').delete().eq('id', pmtId)
      if (error) throw error
      const { data: freshCl } = await supabase.from('grignon_clients').select('solde').eq('id', clientId).single()
      if (freshCl) await supabase.from('grignon_clients').update({ solde: (freshCl.solde || 0) + m }).eq('id', clientId)
      loadAll()
    } catch (err) {
      alert('Erreur suppression paiement grignon: ' + err.message)
    }
  }

  // ── OUTGOING: config + helpers ──
  const OUT_TYPES = {
    fourn_brique:  { label: 'Fournisseur Brique',  icon: '🏭', color: '#1d4ed8', table: 'fournisseurs' },
    fourn_grignon: { label: 'Fournisseur Grignon', icon: '🌿', color: '#15803d', table: 'grignon_fournisseurs' },
    gasoil:        { label: 'Station Gasoil',      icon: '⛽', color: '#f97316', table: null },
  }
  function outTiersOptions(type) {
    if (type === 'fourn_brique')  return fournisseurs
    if (type === 'fourn_grignon') return gFournisseurs
    return []
  }

  async function saveOutgoing(e) {
    e.preventDefault()
    const m = parseFloat(outForm.montant) || 0
    if (!m) return
    if (outForm.type !== 'gasoil' && !outForm.tiers_id) { alert('Sélectionnez un tiers'); return }
    setSavingOut(true)
    try {
      const type = outForm.type
      const opts = outTiersOptions(type)
      const tiers = opts.find(t => t.id === parseInt(outForm.tiers_id))
      const isCheque = outForm.mode === 'Chèque'

      const payload = {
        date: outForm.date,
        type_compte: type,
        sens: 'sortant',
        mode: outForm.mode,
        montant: m,
        note: outForm.note || null,
        client_nom: tiers?.nom || (type === 'gasoil' ? (outForm.tiers_nom || 'Station Gasoil') : ''),
        fournisseur_id:   type === 'fourn_brique'  ? parseInt(outForm.tiers_id) : null,
        fournisseur_nom:  type === 'fourn_brique'  ? tiers?.nom : (type==='gasoil' ? (outForm.tiers_nom||'Gasoil') : null),
        grignon_fourn_id: type === 'fourn_grignon' ? parseInt(outForm.tiers_id) : null,
        cheque_number: isCheque ? (outForm.cheque_number || null) : null,
        cheque_bank:   isCheque ? (outForm.cheque_bank   || null) : null,
        cheque_status: isCheque ? outForm.cheque_status           : null,
      }

      if (editOutId) {
        // reverse old before re-applying
        const orig = paiements.find(p => p.id === editOutId)
        if (orig) await reverseOutSolde(orig)
        const { error } = await supabase.from('paiements').update(payload).eq('id', editOutId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('paiements').insert(payload)
        if (error) throw error
      }

      // Apply solde reduction to the supplier account
      if (type === 'fourn_brique' && payload.fournisseur_id) {
        const { data: f } = await supabase.from('fournisseurs').select('solde').eq('id', payload.fournisseur_id).single()
        if (f) await supabase.from('fournisseurs').update({ solde: Math.max(0,(f.solde||0) - m) }).eq('id', payload.fournisseur_id)
      } else if (type === 'fourn_grignon' && payload.grignon_fourn_id) {
        const { data: f } = await supabase.from('grignon_fournisseurs').select('solde').eq('id', payload.grignon_fourn_id).single()
        if (f) await supabase.from('grignon_fournisseurs').update({ solde: Math.max(0,(f.solde||0) - m) }).eq('id', payload.grignon_fourn_id)
        // Grignon clarification: Nova Brique is often also a Fournisseur Brique.
        // Optionally ALSO reduce a fournisseur brique account.
        if (outForm.also_fourn_brique_id) {
          const { data: fb } = await supabase.from('fournisseurs').select('solde').eq('id', parseInt(outForm.also_fourn_brique_id)).single()
          if (fb) await supabase.from('fournisseurs').update({ solde: Math.max(0,(fb.solde||0) - m) }).eq('id', parseInt(outForm.also_fourn_brique_id))
        }
      }

      setOutForm(emptyOut())
      setEditOutId(null)
      loadAll()
    } catch (err) {
      alert('Erreur paiement sortant: ' + err.message)
    } finally {
      setSavingOut(false)
    }
  }

  async function reverseOutSolde(p) {
    const m = p.montant || 0
    if (p.type_compte === 'fourn_brique' && p.fournisseur_id) {
      const { data: f } = await supabase.from('fournisseurs').select('solde').eq('id', p.fournisseur_id).single()
      if (f) await supabase.from('fournisseurs').update({ solde: (f.solde||0) + m }).eq('id', p.fournisseur_id)
    } else if (p.type_compte === 'fourn_grignon' && p.grignon_fourn_id) {
      const { data: f } = await supabase.from('grignon_fournisseurs').select('solde').eq('id', p.grignon_fourn_id).single()
      if (f) await supabase.from('grignon_fournisseurs').update({ solde: (f.solde||0) + m }).eq('id', p.grignon_fourn_id)
    }
  }

  async function deleteOutgoing(p) {
    if (!confirm('Supprimer ce paiement sortant ?')) return
    await reverseOutSolde(p)
    await supabase.from('paiements').delete().eq('id', p.id)
    loadAll()
  }

  function startEditOut(p) {
    setEditOutId(p.id)
    setOutForm({
      date: p.date, type: p.type_compte,
      tiers_id: String(p.fournisseur_id || p.grignon_fourn_id || ''),
      tiers_nom: p.fournisseur_nom || p.client_nom || '',
      mode: p.mode || 'Espèce', montant: String(p.montant || ''),
      note: p.note || '',
      cheque_number: p.cheque_number || '', cheque_bank: p.cheque_bank || '',
      cheque_status: p.cheque_status || 'pending',
      also_fourn_brique_id: '',
    })
    setPayMode('outgoing')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // outgoing payments list (from paiements with sens=sortant)
  const outgoingPayments = paiements.filter(p =>
    p.sens === 'sortant' || ['fourn_brique','fourn_grignon','gasoil'].includes(p.type_compte)
  ).filter(p => {
    if (filterFrom && p.date < filterFrom) return false
    if (filterTo   && p.date > filterTo)   return false
    if (outTab !== 'all' && p.type_compte !== outTab) return false
    return true
  }).sort((a,b) => b.date.localeCompare(a.date))
  const totalOutgoing = outgoingPayments.reduce((s,p) => s+(p.montant||0), 0)

  // ── UPDATE CHEQUE STATUS (inline, no page reload needed) ──
  async function updateChequeStatus(id, status) {
    await supabase.from('paiements').update({ cheque_status: status }).eq('id', id)
    loadAll()
  }

  // ── FILTER ──
  const filtered = paiements
    .filter(p => {
      if (filterClient && p.client_id !== parseInt(filterClient)) return false
      if (filterFrom && p.date < filterFrom) return false
      if (filterTo && p.date > filterTo) return false
      if (filterMode && p.mode !== filterMode) return false
      if (filterChequeStatus && p.cheque_status !== filterChequeStatus) return false
      if (filterFournisseur && p.fournisseur_id !== parseInt(filterFournisseur)) return false
      if (searchCheque && !(p.cheque_number || '').toLowerCase().includes(searchCheque.toLowerCase())) return false
      if (filterSociete && !(p.societe || '').toLowerCase().includes(filterSociete.toLowerCase())) return false
      if (activeTab === 'cheques' && p.mode !== 'Chèque') return false
      if (activeTab === 'fournisseurs' && !p.fournisseur_id) return false
      if (activeTab === 'grignon') return false // grignon has its own section
      return true
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  const total = filtered.reduce((s, p) => s + (p.montant || 0), 0)

  // ── STATS (full period, ignoring tab/search) ──
  const allInPeriod = paiements.filter(p =>
    (!filterFrom || p.date >= filterFrom) && (!filterTo || p.date <= filterTo)
  )
  const chequesPending  = allInPeriod.filter(p => p.mode === 'Chèque' && p.cheque_status === 'pending').length
  const chequesRejected = allInPeriod.filter(p => p.mode === 'Chèque' && p.cheque_status === 'rejected').length
  const totalFournisseur = allInPeriod.filter(p => p.fournisseur_id).reduce((s, p) => s + (p.montant || 0), 0)

  // ── HELPERS ──
  const modeBadgeColor = mode => {
    if (mode === 'Espèce') return 'bg-green-100 text-green-700'
    if (mode === 'Chèque') return 'bg-amber-100 text-amber-700'
    if (mode === 'Virement') return 'bg-blue-100 text-blue-700'
    return 'bg-purple-100 text-purple-700'
  }
  const ChequeBadge = ({ p }) => {
    if (p.mode !== 'Chèque' || !p.cheque_status) return null
    return (
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CHEQUE_STATUS_COLORS[p.cheque_status]}`}>
        {CHEQUE_STATUS_LABELS[p.cheque_status]}
      </span>
    )
  }

  // ── PRINT ──
  function printPaiements() {
    const _now = new Date()
    const printDateTime = _now.toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' à ' + String(_now.getHours()).padStart(2,'0') + ':' + String(_now.getMinutes()).padStart(2,'0')
    const pendingCount = filtered.filter(p=>p.cheque_status==='pending').length
    openPrintWindow(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Paiements — DAR SADIK</title>
<style>
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;background:#fff}
  .hdr{background:#1a3a6b;padding:14px 24px;display:flex;justify-content:space-between;align-items:flex-start}
  .co-n{font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;line-height:1}
  .co-ar{font-size:12px;color:#93c5fd;direction:rtl;margin-top:2px}
  .co-tag{font-size:9px;color:#93c5fd;margin-top:1px}
  .co-r{text-align:right;font-size:10px;color:#bfdbfe;line-height:1.7}
  .co-r strong{color:#fff}
  .btn-p,.btn-d{padding:5px 12px;border:none;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;margin-right:5px}
  .btn-p{background:#475569;color:#fff}.btn-d{background:#16a34a;color:#fff}
  .bdy{padding:18px 24px}
  .ttl{font-size:16px;font-weight:800;color:#1e293b;margin-bottom:4px}
  .sub{font-size:11px;color:#64748b;margin-bottom:14px}
  .kpi-g{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
  .kpi{padding:10px 13px;border:1px solid #e2e8f0;border-radius:6px;border-left:3px solid #cbd5e1}
  .lbl{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;margin-bottom:3px}
  .val{font-size:18px;font-weight:900;line-height:1}
  .kpi.gn{border-left-color:#16a34a}.kpi.gn .val{color:#16a34a}
  .kpi.bl{border-left-color:#1d4ed8}.kpi.bl .val{color:#1d4ed8}
  .kpi.am{border-left-color:#b45309}.kpi.am .val{color:#b45309}
  .sec{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#475569;border-bottom:2px solid #1a3a6b;padding-bottom:4px;margin:16px 0 8px}
  table{width:100%;border-collapse:collapse}
  thead th{background:#334155 !important;color:#fff !important;padding:8px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;text-align:left}
  thead th.r{text-align:right}
  tbody td{padding:7px 10px;font-size:10px;color:#1e293b;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  tbody td.r{text-align:right;font-family:monospace}
  tbody td.m{color:#94a3b8;font-size:10px}
  tbody tr:nth-child(even) td{background:#f8fafc !important}
  tbody tr.rej td{background:#fef2f2 !important}
  .num{font-weight:700;font-size:11px}.gv{color:#16a34a;font-weight:700}
  tfoot td{background:#1e293b !important;color:#fff !important;padding:8px 10px;font-weight:700;font-size:11px;border:none !important}
  tfoot td.r{font-size:12px}
  .badge{display:inline-block;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700}
  .b-esp{background:#dcfce7;color:#166534}.b-chq{background:#fef9c3;color:#854d0e}
  .b-vir{background:#dbeafe;color:#1e40af}.b-fou{background:#f3e8ff;color:#6b21a8}
  .s-pending{color:#b45309}.s-validated{color:#16a34a}.s-rejected{color:#dc2626;font-weight:700}
  .foot{margin-top:18px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
  @media print{.btn-p,.btn-d{display:none !important}}
  @page{size:A4;margin:8mm 10mm}
</style>
</head><body>
<div class="hdr">
  <div>
    <div class="co-n">DAR SADIK</div>
    <div class="co-ar">دار صديق</div>
    <div class="co-tag">بائع جميع مواد البناء &nbsp;·&nbsp; Selouane, Nador</div>
  </div>
  <div class="co-r">
    <div><strong>Mohamed</strong> 06 61 32 56 65 &nbsp;·&nbsp; <strong>Sadik</strong> 06 61 97 87 47 &nbsp;·&nbsp; <strong>Bureau</strong> 06 62 82 88 20</div>
    <div>Dar.sadik@hotmail.com</div>
    <div style="margin-top:6px"><button class="btn-p" onclick="window.print()">Imprimer</button><button class="btn-d" onclick="window.print()">Télécharger PDF</button></div>
    <div style="font-size:9px;color:#93c5fd;margin-top:3px">Généré le ${printDateTime}</div>
  </div>
</div>
<div class="bdy">
<div class="ttl">Paiements Clients</div>
<div class="sub">Période : ${fmtDate(filterFrom)} → ${fmtDate(filterTo)} &nbsp;·&nbsp; ${filtered.length} paiements</div>
<div class="kpi-g">
  <div class="kpi gn"><div class="lbl">Total encaissé</div><div class="val">${fmt(total)} DHS</div></div>
  <div class="kpi bl"><div class="lbl">Nombre de paiements</div><div class="val">${filtered.length}</div></div>
  <div class="kpi am"><div class="lbl">Chèques en attente</div><div class="val">${pendingCount}</div></div>
</div>
<div class="sec">Détail des paiements (${filtered.length})</div>
<table><thead><tr>
  <th>Date</th><th>Client</th><th>Société</th><th>Mode</th><th>N° Chèque</th><th>Banque</th><th>Statut</th><th>Fournisseur</th><th class="r">Montant DHS</th><th>Note</th>
</tr></thead><tbody>
${filtered.map(p => {
  const bc = p.mode==='Espèce'?'b-esp':p.mode==='Chèque'?'b-chq':p.mode==='Virement'?'b-vir':'b-fou'
  const sl = p.cheque_status ? {pending:'En attente',validated:'Validé',rejected:'Rejeté'}[p.cheque_status] : '—'
  const sc = p.cheque_status ? `s-${p.cheque_status}` : ''
  return `<tr class="${p.cheque_status==='rejected'?'rej':''}">
    <td>${fmtDate(p.date)}</td><td><b>${p.client_nom}</b></td>
    <td>${p.societe||'—'}</td>
    <td><span class="badge ${bc}">${p.mode}</span></td>
    <td style="font-family:monospace">${p.cheque_number||'—'}</td>
    <td>${p.cheque_bank||'—'}</td>
    <td class="${sc}">${p.mode==='Chèque'?sl:'—'}</td>
    <td>${p.fournisseur_nom||'—'}</td>
    <td class="r num gv">− ${fmt(p.montant)}</td>
    <td class="m">${p.note||'—'}</td>
  </tr>`
}).join('')}
</tbody><tfoot><tr>
  <td colspan="8">TOTAL (${filtered.length})</td>
  <td class="r">− ${fmt(total)} DHS</td><td></td>
</tr></tfoot></table>
<div class="foot"><span>DAR SADIK — دار صديق — Selouane, Nador</span><span>Généré le ${printDateTime}</span></div>
</div></body></html>`)
  }

  // ── CSV ──
  function exportCSV() {
    let csv = `Date,Client,Société,Mode,N° Chèque,Banque,Statut Chèque,Fournisseur,Montant DHS,Note\n`
    filtered.forEach(p => {
      csv += `${fmtDate(p.date)},${p.client_nom},"${p.societe||''}",${p.mode},${p.cheque_number||''},${p.cheque_bank||''},${p.cheque_status||''},${p.fournisseur_nom||''},${p.montant||0},"${p.note||''}"\n`
    })
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `Paiements-${filterFrom}-${filterTo}.csv`; a.click()
  }

  // ══════════════════════════════════════════════════════════════
  // FORM UI
  // ══════════════════════════════════════════════════════════════
  const FormContent = (
    <form onSubmit={savePaiement} className="space-y-4">

      <div><label className="label">Date</label>
        <input className="input" type="date" value={form.date}
          onChange={e => setForm({...form, date: e.target.value})} required />
      </div>

      <div><label className="label">Client</label>
        <select className="input" value={form.client_id}
          onChange={e => setForm({...form, client_id: e.target.value})} required>
          <option value="">Sélectionner...</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.nom} — {fmt(c.solde||0)} DHS</option>)}
        </select>
      </div>

      <div><label className="label">Société (optionnel)</label>
        <input className="input" placeholder="Nom de la société si le paiement est fait par une entreprise"
          value={form.societe} onChange={e => setForm({...form, societe: e.target.value})} />
      </div>

      <div><label className="label">Mode de paiement</label>
        <select className="input" value={form.mode}
          onChange={e => setForm({...form, mode: e.target.value, cheque_number:'', cheque_bank:'', cheque_status:'pending', fournisseur_id:''})}>
          {MODES.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      {/* CHÈQUE FIELDS */}
      {isCheque && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="text-xs font-bold text-amber-800 mb-1">📄 Détails du chèque</div>
          <div><label className="label">N° de chèque</label>
            <input className="input font-mono" placeholder="123456789"
              value={form.cheque_number} onChange={e => setForm({...form, cheque_number: e.target.value})} />
          </div>
          <div><label className="label">Banque (optionnel)</label>
            <input className="input" placeholder="Attijariwafa, CIH, BMCE..."
              value={form.cheque_bank} onChange={e => setForm({...form, cheque_bank: e.target.value})} />
          </div>
          <div><label className="label">Statut initial</label>
            <select className="input" value={form.cheque_status}
              onChange={e => setForm({...form, cheque_status: e.target.value})}>
              {CHEQUE_STATUSES.map(s => <option key={s} value={s}>{CHEQUE_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* FOURNISSEUR-DIRECTED PAYMENT */}
      {isFournisseurMode && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
          <div className="text-xs font-bold text-purple-800 mb-1">🏭 Paiement dirigé fournisseur (optionnel)</div>
          <div className="text-xs text-purple-500 mb-2">
            Le paiement reste dans le compte client. Il sera aussi comptabilisé chez le fournisseur sélectionné.
          </div>
          <div><label className="label">Fournisseur</label>
            <select className="input" value={form.fournisseur_id}
              onChange={e => setForm({...form, fournisseur_id: e.target.value})}>
              <option value="">— Aucun —</option>
              {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </div>
        </div>
      )}

      <div><label className="label">🚛 Camion (optionnel)</label>
        <select className="input" value={form.camion_id}
          onChange={e => setForm({...form, camion_id: e.target.value})}>
          <option value="">— Sans camion —</option>
          {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}{c.chauffeur ? ` — ${c.chauffeur}` : ''}</option>)}
        </select>
      </div>

      <div><label className="label">Montant (DHS)</label>
        <input className="input" type="number" placeholder="50000"
          value={form.montant} onChange={e => setForm({...form, montant: e.target.value})} required />
      </div>

      <div><label className="label">Note / Référence</label>
        <input className="input" placeholder="Référence..."
          value={form.note} onChange={e => setForm({...form, note: e.target.value})} />
      </div>

      {/* BALANCE PREVIEW */}
      {selectedClient && montant > 0 && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Solde actuel</span>
            <span className="font-bold text-red-600">{fmt(selectedClient.solde||0)} DHS</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Paiement</span>
            <span className="font-bold text-green-600">− {fmt(montant)} DHS</span>
          </div>
          <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
            <span className="text-gray-700 font-semibold">
              {soldeApres < 0 ? '🟢 Avance client (crédit)' : 'Solde après'}
            </span>
            <span className={`font-bold text-lg ${soldeApres > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {soldeApres < 0 ? `+${fmt(Math.abs(soldeApres))} DHS` : `${fmt(soldeApres)} DHS`}
            </span>
          </div>
          {soldeApres < 0 && (
            <div className="text-xs text-green-700 bg-green-50 rounded-lg p-2">
              ✅ Ce client aura une avance de <b>{fmt(Math.abs(soldeApres))} DHS</b> déduite des prochaines ventes.
            </div>
          )}
        </div>
      )}

      {editPmtId && (
        <button type="button" onClick={cancelEditPmt} className="btn-secondary w-full justify-center">
          Annuler la modification
        </button>
      )}
      <button type="submit" disabled={saving} className="btn-success w-full justify-center">
        {saving ? 'Enregistrement...' : editPmtId ? '✓ Modifier le paiement' : '✓ Enregistrer le paiement'}
      </button>
    </form>
  )

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  const OutgoingSection = (
    <div className={`${isMobile ? '' : 'grid grid-cols-1 lg:grid-cols-3 gap-6'}`}>
      {/* FORM */}
      <div className="lg:col-span-1 space-y-4">
        <div className={`card ${editOutId ? 'ring-2 ring-red-400' : ''}`}>
          <h2 className="font-semibold text-gray-900 mb-4">
            {editOutId ? 'Modifier paiement émis' : 'Nouveau paiement émis'}
          </h2>
          <form onSubmit={saveOutgoing} className="space-y-4">
            <div>
              <label className="label">Type de paiement sortant</label>
              <select className="input" value={outForm.type}
                onChange={e=>setOutForm({...emptyOut(), type:e.target.value, date:outForm.date})}>
                <option value="fourn_brique">🏭 Fournisseur Brique</option>
                <option value="fourn_grignon">🌿 Fournisseur Grignon</option>
                <option value="gasoil">⛽ Station Gasoil</option>
              </select>
            </div>
            <div><label className="label">Date</label>
              <input className="input" type="date" value={outForm.date} onChange={e=>setOutForm({...outForm,date:e.target.value})} required />
            </div>
            {outForm.type !== 'gasoil' ? (
              <div><label className="label">{OUT_TYPES[outForm.type].icon} {OUT_TYPES[outForm.type].label}</label>
                <select className="input" value={outForm.tiers_id} onChange={e=>setOutForm({...outForm,tiers_id:e.target.value})} required>
                  <option value="">Sélectionner...</option>
                  {outTiersOptions(outForm.type).map(t=><option key={t.id} value={t.id}>{t.nom} — {fmt(t.solde||0)} DHS</option>)}
                </select>
              </div>
            ) : (
              <div><label className="label">Station / Description</label>
                <input className="input" placeholder="ex: Station Petrom Selouane" value={outForm.tiers_nom} onChange={e=>setOutForm({...outForm,tiers_nom:e.target.value})} />
              </div>
            )}

            {/* Grignon → Brique linkage (same company e.g. Nova Brique) */}
            {outForm.type === 'fourn_grignon' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                <div className="text-xs font-bold text-amber-800">🔗 Même société aussi Fournisseur Brique ?</div>
                <div className="text-xs text-amber-600">Ex: Nova Brique. Le paiement réduira aussi le compte fournisseur brique sélectionné.</div>
                <select className="input text-xs" value={outForm.also_fourn_brique_id} onChange={e=>setOutForm({...outForm,also_fourn_brique_id:e.target.value})}>
                  <option value="">— Aucun (grignon seulement) —</option>
                  {fournisseurs.map(f=><option key={f.id} value={f.id}>{f.nom} — {fmt(f.solde||0)} DHS</option>)}
                </select>
              </div>
            )}

            <div><label className="label">Mode</label>
              <select className="input" value={outForm.mode} onChange={e=>setOutForm({...outForm,mode:e.target.value})}>
                {['Espèce','Chèque','Virement'].map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            {outForm.mode === 'Chèque' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-amber-800">📄 Détails du chèque</div>
                <div><label className="label">N° de chèque</label>
                  <input className="input font-mono" value={outForm.cheque_number} onChange={e=>setOutForm({...outForm,cheque_number:e.target.value})} />
                </div>
                <div><label className="label">Banque</label>
                  <input className="input" value={outForm.cheque_bank} onChange={e=>setOutForm({...outForm,cheque_bank:e.target.value})} />
                </div>
                <div><label className="label">Statut</label>
                  <select className="input" value={outForm.cheque_status} onChange={e=>setOutForm({...outForm,cheque_status:e.target.value})}>
                    {CHEQUE_STATUSES.map(s=><option key={s} value={s}>{CHEQUE_STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div><label className="label">Montant (DHS)</label>
              <input className="input" type="number" value={outForm.montant} onChange={e=>setOutForm({...outForm,montant:e.target.value})} required />
            </div>
            <div><label className="label">Note / Référence</label>
              <input className="input" value={outForm.note} onChange={e=>setOutForm({...outForm,note:e.target.value})} />
            </div>
            {editOutId && <button type="button" onClick={()=>{setEditOutId(null);setOutForm(emptyOut())}} className="btn-secondary w-full justify-center">Annuler</button>}
            <button type="submit" disabled={savingOut} className="btn-primary w-full justify-center" style={{background:OUT_TYPES[outForm.type].color}}>
              {savingOut ? '...' : editOutId ? '✓ Modifier' : '✓ Enregistrer le paiement'}
            </button>
          </form>
        </div>
      </div>

      {/* TABLE */}
      <div className="lg:col-span-2">
        <div className="card">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="font-semibold text-gray-900">Paiements émis</h2>
            <span className="font-bold text-red-600">Total: {fmt(totalOutgoing)} DHS</span>
          </div>
          {/* Out tabs */}
          <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 flex-wrap">
            {[['all','Tous'],['fourn_brique','🏭 Fourn. Brique'],['fourn_grignon','🌿 Fourn. Grignon'],['gasoil','⛽ Gasoil']].map(([k,l])=>(
              <button key={k} onClick={()=>setOutTab(k)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${outTab===k?'bg-white text-gray-900 shadow-sm':'text-gray-500'}`}>{l}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mb-4 items-end">
            <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} /></div>
            <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)} /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className="th">Date</th><th className="th">Type</th><th className="th">Tiers</th>
                <th className="th">Mode</th><th className="th">N° Chèque</th>
                <th className="th text-right">Montant DHS</th><th className="th">Note</th><th className="th"></th>
              </tr></thead>
              <tbody>
                {outgoingPayments.map(p => {
                  const t = OUT_TYPES[p.type_compte] || OUT_TYPES.fourn_brique
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="td text-gray-500">{fmtDate(p.date)}</td>
                      <td className="td"><span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{background:t.color}}>{t.icon} {t.label}</span></td>
                      <td className="td font-semibold">{p.client_nom || p.fournisseur_nom || '—'}</td>
                      <td className="td"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${modeBadgeColor(p.mode)}`}>{p.mode}</span></td>
                      <td className="td text-xs font-mono text-gray-600">{p.cheque_number||'—'}</td>
                      <td className="td text-right font-bold text-red-600">− {fmt(p.montant)} DHS</td>
                      <td className="td text-gray-400 text-xs">{p.note||'—'}</td>
                      <td className="td">
                        <div className="flex gap-1">
                          <button className="btn-secondary text-xs px-2 py-1" onClick={()=>startEditOut(p)}>✎</button>
                          <button className="btn-danger" onClick={()=>deleteOutgoing(p)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {outgoingPayments.length === 0 && (
                  <tr><td colSpan={8} className="td text-center text-gray-400 py-10">Aucun paiement émis</td></tr>
                )}
              </tbody>
              {outgoingPayments.length > 0 && (
                <tfoot><tr>
                  <td className="tfoot-td" colSpan={5}>TOTAL ({outgoingPayments.length})</td>
                  <td className="tfoot-td text-right text-red-600">− {fmt(totalOutgoing)} DHS</td>
                  <td className="tfoot-td" colSpan={2}></td>
                </tr></tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <Layout title="Paiements" subtitle="Suivi professionnel des paiements, chèques et virements fournisseurs">

      {/* INCOMING / OUTGOING TOGGLE */}
      <div className="flex gap-2 mb-6">
        <button onClick={()=>setPayMode('incoming')}
          className={`flex-1 py-3 rounded-xl font-bold text-sm border transition-all ${payMode==='incoming'?'bg-brand-700 text-white border-brand-700':'bg-white text-gray-600 border-gray-200'}`}
          style={payMode==='incoming'?{background:'#1e3a5f'}:{}}>
          ↓ Paiements Reçus — Clients
        </button>
        <button onClick={()=>setPayMode('outgoing')}
          className={`flex-1 py-3 rounded-xl font-bold text-sm border transition-all ${payMode==='outgoing'?'text-white border-transparent':'bg-white text-gray-600 border-gray-200'}`}
          style={payMode==='outgoing'?{background:'#475569'}:{}}>
          ↑ Paiements Émis — Fournisseurs & Gasoil
        </button>
      </div>

      {payMode === 'outgoing' ? OutgoingSection : isMobile ? (
        // ── MOBILE ──────────────────────────────────────────────
        <div>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="stat-card border border-green-100 bg-green-50 text-center">
              <div className="stat-label text-green-600">Total reçu</div>
              <div className="stat-value text-green-700" style={{fontSize:18}}>{fmt(total)} DHS</div>
            </div>
            <div className="stat-card border border-blue-100 bg-blue-50 text-center">
              <div className="stat-label text-blue-600">Paiements</div>
              <div className="stat-value text-blue-700" style={{fontSize:18}}>{filtered.length}</div>
            </div>
            {chequesPending > 0 && (
              <div className="stat-card border border-amber-200 bg-amber-50 text-center">
                <div className="stat-label text-amber-600">Chèques en attente</div>
                <div className="stat-value text-amber-700" style={{fontSize:18}}>{chequesPending}</div>
              </div>
            )}
            {chequesRejected > 0 && (
              <div className="stat-card border border-red-200 bg-red-50 text-center">
                <div className="stat-label text-red-600">⚠️ Chèques rejetés</div>
                <div className="stat-value text-red-700" style={{fontSize:18}}>{chequesRejected}</div>
              </div>
            )}
          </div>

          <button onClick={() => { if (showForm && editPmtId) cancelEditPmt(); else setShowForm(!showForm) }}
            className={`w-full mb-4 py-3 text-white font-bold rounded-xl transition-all ${editPmtId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'}`}>
            {showForm ? (editPmtId ? '✕ Annuler modification' : '▲ Fermer') : '💰 + Nouveau paiement'}
          </button>
          {showForm && (
            <div className={`card mb-4 ${editPmtId ? 'ring-2 ring-amber-400' : ''}`}>
              {editPmtId && <div className="text-xs font-bold text-amber-700 mb-3 bg-amber-50 rounded-lg px-3 py-2">✏️ Modification du paiement</div>}
              {FormContent}
            </div>
          )}

          <button className="mobile-collapse-btn mb-2" onClick={() => setShowFilters(!showFilters)}>
            <span>🔍 Filtres</span><span>{showFilters ? '▲' : '▼'}</span>
          </button>
          {showFilters && (
            <div className="card mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} /></div>
                <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e => setFilterTo(e.target.value)} /></div>
              </div>
              <div><label className="label">Client</label>
                <select className="input" value={filterClient} onChange={e => setFilterClient(e.target.value)}>
                  <option value="">Tous</option>{clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div><label className="label">Mode</label>
                <select className="input" value={filterMode} onChange={e => setFilterMode(e.target.value)}>
                  <option value="">Tous</option>{MODES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div><label className="label">Statut chèque</label>
                <select className="input" value={filterChequeStatus} onChange={e => setFilterChequeStatus(e.target.value)}>
                  <option value="">Tous</option>{CHEQUE_STATUSES.map(s => <option key={s} value={s}>{CHEQUE_STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div><label className="label">🔎 N° Chèque</label>
                <input className="input" placeholder="Rechercher un numéro..." value={searchCheque} onChange={e => setSearchCheque(e.target.value)} />
              </div>
              <div><label className="label">Fournisseur</label>
                <select className="input" value={filterFournisseur} onChange={e => setFilterFournisseur(e.target.value)}>
                  <option value="">Tous</option>{fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
              </div>
              <div><label className="label">Société</label>
                <input className="input" placeholder="Rechercher par société..." value={filterSociete} onChange={e => setFilterSociete(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setFilterClient(''); setFilterMode(''); setFilterFrom(startOfMonth()); setFilterTo(today()); setFilterChequeStatus(''); setFilterFournisseur(''); setSearchCheque(''); setFilterSociete('') }}
                  className="btn-secondary text-xs flex-1 justify-center">↺ Reset</button>
                <button onClick={printPaiements} className="btn-primary text-xs flex-1 justify-center" style={{background:'#4f46e5'}}>🖨️ PDF</button>
                <button onClick={exportCSV} className="btn-primary text-xs flex-1 justify-center" style={{background:'#16a34a'}}>📥 CSV</button>
              </div>
            </div>
          )}

          {/* Tab bar */}
          <div className="flex gap-1 mb-3 bg-gray-100 rounded-xl p-1">
            {[['all','Tous'],['cheques','📄 Chèques'],['fournisseurs','🏭 Fourn.'],['grignon','🫒 Grignon']].map(([key, label]) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab===key?'bg-white text-gray-900 shadow-sm':'text-gray-500'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Grignon tab content */}
          {activeTab === 'grignon' ? (
            <div>
              <button onClick={() => setShowGrignonForm(!showGrignonForm)}
                className="w-full mb-4 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl transition-all">
                {showGrignonForm ? '▲ Fermer' : '🫒 + Paiement client grignon'}
              </button>
              {showGrignonForm && (
                <form onSubmit={saveGrignonPaiement} className="card mb-4 space-y-3">
                  <div><label className="label">Date</label>
                    <input className="input" type="date" value={grignonForm.date} onChange={e => setGrignonForm({...grignonForm, date: e.target.value})} required />
                  </div>
                  <div><label className="label">Client grignon</label>
                    <select className="input" value={grignonForm.client_id} onChange={e => setGrignonForm({...grignonForm, client_id: e.target.value})} required>
                      <option value="">Sélectionner...</option>
                      {grignonClients.map(c => <option key={c.id} value={c.id}>{c.nom} — {fmt(c.solde||0)} DHS</option>)}
                    </select>
                  </div>
                  <div><label className="label">Mode</label>
                    <select className="input" value={grignonForm.mode} onChange={e => setGrignonForm({...grignonForm, mode: e.target.value})}>
                      {['Espèce','Chèque','Virement'].map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Montant (DHS)</label>
                    <input className="input" type="number" value={grignonForm.montant} onChange={e => setGrignonForm({...grignonForm, montant: e.target.value})} required />
                  </div>
                  <div><label className="label">Note</label>
                    <input className="input" value={grignonForm.note} onChange={e => setGrignonForm({...grignonForm, note: e.target.value})} />
                  </div>
                  <button type="submit" disabled={savingGrignon} className="btn-success w-full justify-center">
                    {savingGrignon ? '...' : '✓ Enregistrer'}
                  </button>
                </form>
              )}
              <div className="mobile-card-list">
                {grignonPaiements.filter(p => (!filterFrom || p.date >= filterFrom) && (!filterTo || p.date <= filterTo))
                  .sort((a,b) => b.date.localeCompare(a.date))
                  .map(p => (
                  <div key={p.id} className="mobile-row-card"
                    onClick={e => { if (e.target.closest('button') || e.target.closest('select')) return; toggleVerifyPmt(p.id) }}
                    style={{cursor:'pointer', ...(verifiedPmt.has(p.id) ? {background:'#dcfce7', borderLeft:'3px solid #16a34a'} : {})}}>
                    <div className="card-header">
                      <div>
                        <div className="card-title">{p.client_nom}{verifiedPmt.has(p.id) && <span style={{color:'#16a34a',fontWeight:900,marginLeft:6,fontSize:14}}>✓</span>}</div>
                        <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>{fmtDate(p.date)}</div>
                      </div>
                      <div style={{color:'#16a34a',fontWeight:700,fontSize:16}}>− {fmt(p.montant)} DHS</div>
                    </div>
                    <div className="card-meta">
                      <span>{p.mode}</span>
                      {p.note && <span>{p.note}</span>}
                    </div>
                    <div className="card-actions">
                      <button className="btn-secondary text-xs" onClick={e => { e.stopPropagation(); startEditGrignonPmt(p); window.scrollTo({top:0,behavior:'smooth'}) }}>✎ Modifier</button>
                      <button className="btn-danger" onClick={() => deleteGrignonPaiement(p.id, p.client_id, p.montant)}>✕ Supprimer</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
          /* Mobile brique list */
          loading ? <div className="text-center text-gray-400 py-10">Chargement...</div> : (
            <div className="mobile-card-list">
              {filtered.map(p => (
                <div key={p.id}
                className={`mobile-row-card ${!verifiedPmt.has(p.id) && p.cheque_status==='rejected'?'border-l-4 border-red-400':''}`}
                onClick={e => { if (e.target.closest('button') || e.target.closest('select')) return; toggleVerifyPmt(p.id) }}
                style={{cursor:'pointer', ...(verifiedPmt.has(p.id) ? {background:'#dcfce7', borderLeft:'3px solid #16a34a'} : {})}}>
                  <div className="card-header">
                    <div>
                      <div className="card-title">{p.client_nom}{verifiedPmt.has(p.id) && <span style={{color:'#16a34a',fontWeight:900,marginLeft:6,fontSize:14}}>✓</span>}</div>
                      <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>{fmtDate(p.date)}</div>
                    </div>
                    <div style={{color:'#16a34a',fontWeight:700,fontSize:16}}>− {fmt(p.montant)} DHS</div>
                  </div>
                  <div className="card-meta">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${modeBadgeColor(p.mode)}`}>{p.mode}</span>
                    {p.societe && <span className="text-gray-700 text-xs font-semibold">🏢 {p.societe}</span>}
                    {p.cheque_number && <span className="font-mono text-xs">📄 {p.cheque_number}</span>}
                    {p.fournisseur_nom && <span className="text-purple-700 text-xs">🏭 {p.fournisseur_nom}</span>}
                    {p.camion_plaque && <span>🚛 {p.camion_plaque}</span>}
                    {p.note && <span>{p.note}</span>}
                  </div>
                  {p.mode === 'Chèque' && (
                    <div className="flex gap-1 mt-2 flex-wrap items-center">
                      <ChequeBadge p={p} />
                      {CHEQUE_STATUSES.filter(s => s !== p.cheque_status).map(s => (
                        <button key={s} onClick={() => updateChequeStatus(p.id, s)}
                          className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                          → {CHEQUE_STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="card-actions">
                    <button className="btn-secondary text-xs" onClick={e => { e.stopPropagation(); startEditPmt(p); setShowForm(true); window.scrollTo({top:0,behavior:'smooth'}) }}>✎ Modifier</button>
                    <button className="btn-danger" onClick={() => deletePaiement(p.id, p.client_id, p.montant)}>✕ Supprimer</button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="text-center text-gray-400 py-10">Aucun paiement pour cette sélection</div>}
            </div>
          )
          )}
        </div>

      ) : (
        // ── DESKTOP ─────────────────────────────────────────────
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT: FORM + SIDEBAR */}
          <div className="lg:col-span-1 space-y-4">
            <div className={`card ${editPmtId ? 'ring-2 ring-amber-400' : ''}`}>
              <h2 className="font-semibold text-gray-900 mb-4">
                {editPmtId ? '✏️ Modifier le paiement' : '💰 Nouveau paiement'}
              </h2>
              {FormContent}
            </div>

            {/* Alert: rejected cheques */}
            {chequesRejected > 0 && (
              <div className="bg-red-50 border border-red-300 rounded-xl p-4">
                <div className="font-bold text-red-700 text-sm mb-1">⚠️ {chequesRejected} chèque(s) rejeté(s)</div>
                <div className="text-xs text-red-500">Consultez l'onglet Chèques pour les détails.</div>
              </div>
            )}

            {/* Fournisseur summary */}
            {fournisseurs.length > 0 && (
              <div className="card">
                <h3 className="font-semibold text-gray-900 text-sm mb-3">🏭 Récap. fournisseurs (période)</h3>
                <div className="space-y-2">
                  {fournisseurs.map(f => {
                    const tf = allInPeriod.filter(p => p.fournisseur_id === f.id).reduce((s,p) => s+(p.montant||0), 0)
                    if (!tf) return null
                    const nb = allInPeriod.filter(p => p.fournisseur_id === f.id).length
                    return (
                      <div key={f.id} className="flex justify-between items-center text-sm py-1 border-b border-gray-100">
                        <div>
                          <div className="font-medium text-gray-800">{f.nom}</div>
                          <div className="text-xs text-gray-400">{nb} paiement(s)</div>
                        </div>
                        <span className="font-bold text-purple-700">{fmt(tf)} DHS</span>
                      </div>
                    )
                  })}
                  {totalFournisseur === 0 && <div className="text-xs text-gray-400">Aucun paiement fournisseur sur la période</div>}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: TABLE */}
          <div className="lg:col-span-2">
            <div className="card">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h2 className="font-semibold text-gray-900">Historique des paiements</h2>
                <div className="flex gap-2">
                  <button onClick={printPaiements} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ PDF</button>
                <button onClick={exportCSV} className="btn-primary text-xs px-3 py-1.5" style={{background:'#16a34a'}}>📊 Excel</button>
                  <button onClick={exportCSV} className="btn-primary text-xs px-3 py-1.5" style={{background:'#16a34a'}}>📥 CSV</button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-4 items-end">
                <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} /></div>
                <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e => setFilterTo(e.target.value)} /></div>
                <div><label className="label">Client</label>
                  <select className="input" value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{minWidth:'140px'}}>
                    <option value="">Tous</option>{clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                <div><label className="label">Mode</label>
                  <select className="input" value={filterMode} onChange={e => setFilterMode(e.target.value)}>
                    <option value="">Tous</option>{MODES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div><label className="label">Statut chèque</label>
                  <select className="input" value={filterChequeStatus} onChange={e => setFilterChequeStatus(e.target.value)}>
                    <option value="">Tous</option>{CHEQUE_STATUSES.map(s => <option key={s} value={s}>{CHEQUE_STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
                <div><label className="label">🔎 N° Chèque</label>
                  <input className="input" placeholder="Rechercher..." style={{width:'130px'}} value={searchCheque} onChange={e => setSearchCheque(e.target.value)} />
                </div>
                <div><label className="label">Fournisseur</label>
                  <select className="input" value={filterFournisseur} onChange={e => setFilterFournisseur(e.target.value)}>
                    <option value="">Tous</option>{fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select>
                </div>
                <div><label className="label">Société</label>
                  <input className="input" placeholder="Rechercher..." style={{width:'140px'}} value={filterSociete} onChange={e => setFilterSociete(e.target.value)} />
                </div>
                <button onClick={() => { setFilterClient(''); setFilterMode(''); setFilterFrom(startOfMonth()); setFilterTo(today()); setFilterChequeStatus(''); setFilterFournisseur(''); setSearchCheque(''); setFilterSociete('') }}
                  className="btn-secondary text-xs">↺</button>
              </div>

              {/* Tab bar */}
              <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
                {[['all','Tous les paiements'],['cheques','📄 Chèques'],['fournisseurs','🏭 Fournisseurs'],['grignon','🫒 Grignon']].map(([key, label]) => (
                  <button key={key} onClick={() => setActiveTab(key)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab===key?'bg-white text-gray-900 shadow-sm':'text-gray-500'}`}>
                    {label}
                    {key==='cheques' && chequesPending>0 && <span className="ml-1 bg-amber-500 text-white text-xs px-1.5 rounded-full">{chequesPending}</span>}
                    {key==='cheques' && chequesRejected>0 && <span className="ml-1 bg-red-500 text-white text-xs px-1.5 rounded-full">⚠️{chequesRejected}</span>}
                  </button>
                ))}
              </div>

              {/* Summary bar */}
              <div className="flex gap-4 mb-3 text-sm flex-wrap items-center">
                <span className="font-bold text-green-600">Total : {fmt(total)} DHS</span>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">{filtered.length} paiement(s)</span>
                {chequesPending>0 && <span className="text-amber-600 font-semibold">⏳ {chequesPending} en attente</span>}
                {chequesRejected>0 && <span className="text-red-600 font-bold">⚠️ {chequesRejected} rejeté(s)</span>}
              </div>

              {/* Table / Grignon section */}
              {activeTab === 'grignon' ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-semibold text-slate-700">
                      🫒 Paiements clients Grignon — Total: <span className="text-emerald-600">
                        {fmt(grignonPaiements.filter(p => (!filterFrom||p.date>=filterFrom)&&(!filterTo||p.date<=filterTo)).reduce((s,p)=>s+(p.montant||0),0))} DHS
                      </span>
                    </div>
                    <button onClick={() => setShowGrignonForm(!showGrignonForm)}
                      className="text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-emerald-800 transition">
                      {showGrignonForm ? 'Fermer' : '+ Nouveau paiement grignon'}
                    </button>
                  </div>
                  {showGrignonForm && (
                    <form onSubmit={saveGrignonPaiement} className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div><label className="label">Date</label>
                        <input className="input" type="date" value={grignonForm.date} onChange={e => setGrignonForm({...grignonForm, date: e.target.value})} required />
                      </div>
                      <div><label className="label">Client grignon</label>
                        <select className="input" value={grignonForm.client_id} onChange={e => setGrignonForm({...grignonForm, client_id: e.target.value})} required>
                          <option value="">Sélectionner...</option>
                          {grignonClients.map(c => <option key={c.id} value={c.id}>{c.nom} — {fmt(c.solde||0)} DHS</option>)}
                        </select>
                      </div>
                      <div><label className="label">Mode</label>
                        <select className="input" value={grignonForm.mode} onChange={e => setGrignonForm({...grignonForm, mode: e.target.value})}>
                          {['Espèce','Chèque','Virement'].map(m => <option key={m}>{m}</option>)}
                        </select>
                      </div>
                      <div><label className="label">Montant (DHS)</label>
                        <input className="input" type="number" value={grignonForm.montant} onChange={e => setGrignonForm({...grignonForm, montant: e.target.value})} required />
                      </div>
                      <div><label className="label">Note</label>
                        <input className="input" value={grignonForm.note} onChange={e => setGrignonForm({...grignonForm, note: e.target.value})} />
                      </div>
                      <div className="flex items-end gap-2">
                        <button type="button" onClick={() => setShowGrignonForm(false)} className="btn-secondary text-xs">Annuler</button>
                        <button type="submit" disabled={savingGrignon} className="btn-success text-xs">
                          {savingGrignon ? '...' : '✓ Enregistrer'}
                        </button>
                      </div>
                    </form>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr>
                        <th className="th">Date</th>
                        <th className="th">Client</th>
                        <th className="th">Mode</th>
                        <th className="th text-right">Montant DHS</th>
                        <th className="th">Note</th>
                        <th className="th"></th>
                      </tr></thead>
                      <tbody>
                        {grignonPaiements
                          .filter(p => (!filterFrom||p.date>=filterFrom)&&(!filterTo||p.date<=filterTo))
                          .sort((a,b) => b.date.localeCompare(a.date))
                          .map(p => (
                          <tr key={p.id} className="hover:bg-gray-50"
                            onClick={e => { if (e.target.closest('button') || e.target.closest('select')) return; toggleVerifyPmt(p.id) }}
                            style={{cursor:'pointer', ...(verifiedPmt.has(p.id) ? {background:'#dcfce7', boxShadow:'inset 3px 0 0 #16a34a'} : {})}}>
                            <td className="td text-gray-500">{verifiedPmt.has(p.id) && <span style={{color:'#16a34a',fontWeight:900,marginRight:4}}>✓</span>}{fmtDate(p.date)}</td>
                            <td className="td font-semibold">{p.client_nom}</td>
                            <td className="td"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${modeBadgeColor(p.mode)}`}>{p.mode}</span></td>
                            <td className="td text-right font-bold text-green-600">− {fmt(p.montant)}</td>
                            <td className="td text-gray-400 text-xs">{p.note || '—'}</td>
                            <td className="td">
                              <div className="flex gap-1">
                                <button className="btn-secondary text-xs px-2 py-1" onClick={e => { e.stopPropagation(); startEditGrignonPmt(p) }}>✎</button>
                                <button className="btn-danger" onClick={() => deleteGrignonPaiement(p.id, p.client_id, p.montant)}>✕</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {grignonPaiements.length === 0 && (
                          <tr><td colSpan={6} className="td text-center text-gray-400 py-10">Aucun paiement grignon enregistré</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : loading ? <div className="text-center text-gray-400 py-10">Chargement...</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr>
                      <th className="th">Date</th>
                      <th className="th">Client</th>
                      <th className="th">Société</th>
                      <th className="th">Mode</th>
                      <th className="th">N° Chèque</th>
                      <th className="th">Statut chèque</th>
                      <th className="th">Fournisseur</th>
                      <th className="th text-right">Montant DHS</th>
                      <th className="th">Note</th>
                      <th className="th"></th>
                    </tr></thead>
                    <tbody>
                      {filtered.map(p => (
                        <tr key={p.id}
                          className={`hover:bg-gray-50 ${!verifiedPmt.has(p.id) && p.cheque_status==='rejected'?'bg-red-50':''}`}
                          onClick={e => { if (e.target.closest('button') || e.target.closest('select')) return; toggleVerifyPmt(p.id) }}
                          style={{cursor:'pointer', ...(verifiedPmt.has(p.id) ? {background:'#dcfce7', boxShadow:'inset 3px 0 0 #16a34a'} : {})}}>
                          <td className="td text-gray-500">{verifiedPmt.has(p.id) && <span style={{color:'#16a34a',fontWeight:900,marginRight:4}}>✓</span>}{fmtDate(p.date)}</td>
                          <td className="td font-semibold">{p.client_nom}</td>
                          <td className="td text-xs text-gray-600">{p.societe || <span className="text-gray-300">—</span>}</td>
                          <td className="td">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${modeBadgeColor(p.mode)}`}>{p.mode}</span>
                          </td>
                          <td className="td text-xs font-mono text-gray-700">
                            {p.cheque_number ? (
                              <div>
                                <div className="font-bold">{p.cheque_number}</div>
                                {p.cheque_bank && <div className="text-gray-400 text-xs">{p.cheque_bank}</div>}
                              </div>
                            ) : '—'}
                          </td>
                          <td className="td">
                            {p.mode === 'Chèque' && p.cheque_status ? (
                              <div className="flex flex-col gap-1">
                                <ChequeBadge p={p} />
                                <select value={p.cheque_status}
                                  onChange={e => updateChequeStatus(p.id, e.target.value)}
                                  className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white cursor-pointer mt-1"
                                  style={{fontSize:11}}>
                                  {CHEQUE_STATUSES.map(s => <option key={s} value={s}>{CHEQUE_STATUS_LABELS[s]}</option>)}
                                </select>
                              </div>
                            ) : '—'}
                          </td>
                          <td className="td">
                            {p.fournisseur_nom
                              ? <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">{p.fournisseur_nom}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="td text-right font-bold text-green-600">− {fmt(p.montant)}</td>
                          <td className="td text-gray-400 text-xs">{p.note || '—'}</td>
                          <td className="td">
                            <div className="flex gap-1">
                              <button className="btn-secondary text-xs px-2 py-1" onClick={e => { e.stopPropagation(); startEditPmt(p) }}>✎</button>
                              <button className="btn-danger" onClick={() => deletePaiement(p.id, p.client_id, p.montant)}>✕</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr><td colSpan={10} className="td text-center text-gray-400 py-10">Aucun paiement pour cette sélection</td></tr>
                      )}
                    </tbody>
                    {filtered.length > 0 && (
                      <tfoot><tr>
                        <td className="tfoot-td" colSpan={7}>TOTAL REÇU ({filtered.length})</td>
                        <td className="tfoot-td text-right text-green-700">− {fmt(total)} DHS</td>
                        <td className="tfoot-td" colSpan={2}></td>
                      </tr></tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
