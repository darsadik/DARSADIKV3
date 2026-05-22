import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const ADMIN = 'abdelhafidbaadi@gmail.com'
const fmt  = n => Math.round(n || 0).toLocaleString('fr-MA')

// ── Print via hidden iframe — stays on same page (PWA safe) ──
function printViaIframe(htmlContent) {
  const existing = document.getElementById('__print_iframe')
  if (existing) existing.remove()
  const iframe = document.createElement('iframe')
  iframe.id = '__print_iframe'
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;opacity:0;'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow.document
  doc.open(); doc.write(htmlContent); doc.close()
  setTimeout(() => {
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
  }, 300)
}

const fmtDate = d => { if (!d) return '—'; const [y,m,j] = d.split('-'); return `${j}/${m}/${y}` }
const fmtD = n => parseFloat(n || 0).toFixed(2)
const today = () => new Date().toISOString().split('T')[0]
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

const PRINT_CSS = `
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; padding: 30px 36px; font-size: 12px; color: #1e293b !important; background: #fff !important; margin: 0; }
      h2 { font-size: 14px; color: #1e293b !important; margin: 18px 0 8px; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; }
      .sub, .subtitle { color: #64748b !important; font-size: 11px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
      th { background: #1a5fa8 !important; color: #fff !important; padding: 9px 12px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid #1355a0; }
      td { padding: 8px 12px; border: 1px solid #e2e8f0; font-size: 11px; color: #1e293b !important; vertical-align: middle; }
      tr:nth-child(even) td { background: #f8fafc !important; }
      tfoot td { background: #e8f0fe !important; font-weight: 800 !important; color: #1e293b !important; border: 1px solid #c7d8f7; border-top: 2px solid #1a5fa8 !important; font-size: 12px; }
      b, strong { color: #1e293b !important; font-weight: 800; }
      .right, [style*="text-align:right"], [style*="text-align: right"] { text-align: right; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; background: #e2e8f0 !important; color: #1e293b !important; border: 1px solid #cbd5e1; }
      .fourn-block { margin-bottom: 24px; page-break-inside: avoid; }
      .fourn-header { background: #1a5fa8 !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .fourn-title { font-size: 13px; font-weight: 800; color: #fff !important; }
      .prod-block { margin-bottom: 12px; }
      .prod-header { background: #f1f5f9 !important; border-left: 4px solid #1a5fa8; padding: 5px 10px; font-weight: 700; font-size: 11px; color: #1e293b !important; margin-bottom: 4px; border-radius: 0 4px 4px 0; }
      .grand-tfoot td { background: #e2e8f0 !important; font-weight: 900 !important; color: #1e293b !important; border-top: 3px solid #1a5fa8 !important; font-size: 13px; }
      .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; color: #94a3b8 !important; font-size: 10px; }
      .camion-header { background: #1a5fa8 !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
      .info-box { background: #f8fafc !important; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
      .info-box b { display: block; margin-bottom: 4px; color: #1e293b !important; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
      .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 50px; }
      .sig { text-align: center; border-top: 1px solid #94a3b8; padding-top: 8px; color: #555 !important; font-size: 11px; }
      @media print { button, .no-print { display: none !important; } body { padding: 12px 18px; } }
      @page { size: A4; margin: 10mm 12mm; }
`

const CO_HEADER = (title, sub) => `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;margin-bottom:4px"><div><div style="font-size:26px;font-weight:900;color:#1a3a6b;letter-spacing:-0.5px;line-height:1.1">DAR SADIK</div><div style="font-size:15px;font-weight:700;color:#1a5fa8;direction:rtl">دار صديق</div><div style="font-size:11px;color:#475569;margin-top:2px;direction:rtl">بائع جميع مواد البناء</div></div><div style="text-align:right;padding-top:4px"><div style="font-size:11px;color:#334155;margin-bottom:4px;font-weight:600">📞 Mohamed: 06 61 32 56 65 &nbsp;·&nbsp; Sadik: 06 61 97 87 47 &nbsp;·&nbsp; Bureau: 06 62 82 88 20</div><div style="font-size:11px;color:#334155;margin-bottom:4px">✉️ Dar.sadik@hotmail.com</div><div style="font-size:11px;color:#64748b">📍 Selouane - Nador</div></div></div><div style="height:3px;background:linear-gradient(90deg,#1a5fa8,#3b82f6);border-radius:2px;margin-bottom:20px"></div><div style="font-size:16px;font-weight:800;color:#1e293b;margin-bottom:4px">${title}</div><div style="font-size:11px;color:#64748b;margin-bottom:18px">${sub}</div>`

const CO_FOOTER = dt => `<div class="footer"><span>DAR SADIK — دار صديق — Selouane, Nador</span><span>Généré le ${dt}</span></div>`

function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const check = () => setM(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return m
}

function exportGrignonCSV(rows, filename) {
  const bom = '\uFEFF'
  const csv = rows.map(r => r.map(cell => '"'+String(cell||'').replace(/"/g,'""')+'"').join(',')).join('\n')
  const blob = new Blob([bom+csv], {type:'text/csv;charset=utf-8;'})
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = filename+'-'+today()+'.csv'; a.click()
}

export default function Grignon() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const admin = user?.email === ADMIN
  const [editRow, setEditRow] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg, setEditMsg] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null) // op id waiting confirm

  // ── Grignon-isolated data (never mixed with main project) ──
  const [operations, setOperations]     = useState([])
  const [clients, setClients]           = useState([])       // grignon_clients
  const [camions, setCamions]           = useState([])       // grignon_camions
  const [fournisseurs, setFournisseurs] = useState([])       // grignon_fournisseurs
  const [fournPaiements, setFournPaiements] = useState([])  // grignon_fournisseur_paiements
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)

  // ui
  const [view, setView]                 = useState('dashboard') // dashboard | client | fournisseur | paiements_fourn | camion | saisie
  const [filterFrom, setFilterFrom]     = useState(startOfMonth())
  const [filterTo, setFilterTo]         = useState(today())
  const [filterClient, setFilterClient] = useState('')
  const [filterFourn, setFilterFourn]   = useState('')
  const [filterCamion, setFilterCamion] = useState('')
  const [showFilters, setShowFilters]   = useState(false)

  // paiement fournisseur form
  const [paiForm, setPaiForm]           = useState({ date: today(), fournisseur_id: '', montant: '', mode_paiement: 'Espèce', note: '' })
  const [paiSaving, setPaiSaving]       = useState(false)
  const [paiMsg, setPaiMsg]             = useState('')
  // paiements filters
  const [paiFilterFourn, setPaiFilterFourn] = useState('')
  const [paiFilterMode, setPaiFilterMode]   = useState('')
  const [paiFilterFrom, setPaiFilterFrom]   = useState(startOfMonth())
  const [paiFilterTo, setPaiFilterTo]       = useState(today())

  // client/fournisseur/camion management
  const [newClientNom, setNewClientNom]           = useState('')
  const [newFournNom, setNewFournNom]             = useState('')
  const [newCamionPlaque, setNewCamionPlaque]     = useState('')
  const [newCamionChauffeur, setNewCamionChauffeur] = useState('')

  // form
  const [form, setForm] = useState({
    date: today(), client_id: '', camion_id: '', fournisseur_id: '',
    qte: '', prix_achat: '', prix_vente: '', note: ''
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    // ALL queries use grignon_* tables — completely isolated from main project
    const [{ data: ops }, { data: cl }, { data: ca }, { data: fo }, { data: fp }] = await Promise.all([
      supabase.from('grignon_operations').select('*').order('date', { ascending: true }),
      supabase.from('grignon_clients').select('*').order('nom'),
      supabase.from('grignon_camions').select('*').order('plaque'),
      supabase.from('grignon_fournisseurs').select('*').order('nom'),
      supabase.from('grignon_fournisseur_paiements').select('*').order('date', { ascending: true }),
    ])
    setOperations(ops || [])
    setClients(cl || [])
    setCamions(ca || [])
    setFournisseurs(fo || [])
    setFournPaiements(fp || [])
    setLoading(false)
  }

  // ── computed preview ──
  const qte      = parseFloat(form.qte) || 0
  const pAchat   = parseFloat(form.prix_achat) || 0
  const pVente   = parseFloat(form.prix_vente) || 0
  const totAchat = Math.round(qte * pAchat * 100) / 100
  const totVente = Math.round(qte * pVente * 100) / 100
  const marge    = Math.round((totVente - totAchat) * 100) / 100

  async function saveOperation() {
    if (!admin) return
    setSaving(true)
    const cl = clients.find(c => c.id === parseInt(form.client_id))
    const ca = camions.find(c => c.id === parseInt(form.camion_id))
    const fo = fournisseurs.find(f => f.id === parseInt(form.fournisseur_id))

    // inserts into grignon_operations — never touches main tables
    await supabase.from('grignon_operations').insert({
      date:            form.date,
      client_id:       form.client_id   ? parseInt(form.client_id)   : null,
      client_nom:      cl?.nom  || '',
      camion_id:       form.camion_id   ? parseInt(form.camion_id)   : null,
      camion_plaque:   ca?.plaque || '',
      chauffeur:       ca?.chauffeur || '',
      fournisseur_id:  form.fournisseur_id ? parseInt(form.fournisseur_id) : null,
      fournisseur_nom: fo?.nom  || '',
      qte,
      prix_achat:  pAchat,
      prix_vente:  pVente,
      total_achat: totAchat,
      total_vente: totVente,
      marge,
      note: form.note,
    })

    // update grignon client solde — NOT main clients table
    if (cl && totVente > 0) {
      await supabase.from('grignon_clients').update({ solde: (cl.solde || 0) + totVente }).eq('id', cl.id)
    }

    setSaving(false)
    setForm({ date: today(), client_id: '', camion_id: '', fournisseur_id: '', qte: '', prix_achat: '', prix_vente: '', note: '' })
    loadAll()
  }

  function openEditGrignon(op) {
    setEditRow(op)
    setEditForm({
      date:           op.date || '',
      qte:            op.qte || '',
      prix_vente:     op.prix_vente || '',
      prix_achat:     op.prix_achat || '',
      note:           op.note || '',
      client_id:      op.client_id || '',
      fournisseur_id: op.fournisseur_id || '',
      camion_id:      op.camion_id || '',
    })
    setEditMsg('')
  }

  async function saveEditGrignon(e) {
    e.preventDefault()
    if (!editRow) return
    setEditSaving(true)
    const qte = parseFloat(editForm.qte) || 0
    const pv  = parseFloat(editForm.prix_vente) || 0
    const pa  = parseFloat(editForm.prix_achat) || 0
    const total_vente = Math.round(qte * pv * 100) / 100
    const total_achat = Math.round(qte * pa * 100) / 100
    const marge = Math.round((total_vente - total_achat) * 100) / 100

    const cl = clients.find(c => c.id === parseInt(editForm.client_id))
    const fo = fournisseurs.find(f => f.id === parseInt(editForm.fournisseur_id))
    const ca = camions.find(c => c.id === parseInt(editForm.camion_id))

    const { error } = await supabase.from('grignon_operations').update({
      date:            editForm.date,
      qte, prix_vente: pv, prix_achat: pa,
      total_vente, total_achat, marge,
      note:            editForm.note || null,
      client_id:       editForm.client_id ? parseInt(editForm.client_id) : null,
      client_nom:      cl?.nom || '',
      fournisseur_id:  editForm.fournisseur_id ? parseInt(editForm.fournisseur_id) : null,
      fournisseur_nom: fo?.nom || '',
      camion_id:       editForm.camion_id ? parseInt(editForm.camion_id) : null,
      camion_plaque:   ca?.plaque || '',
      chauffeur:       ca?.chauffeur || '',
    }).eq('id', editRow.id)

    // fix client solde: reverse old total_vente, apply new
    if (!error) {
      const oldCl = clients.find(c => c.id === editRow.client_id)
      const newCl = cl
      // remove old vente from old client
      if (oldCl && editRow.total_vente) {
        await supabase.from('grignon_clients')
          .update({ solde: Math.max(0, (oldCl.solde || 0) - (editRow.total_vente || 0)) })
          .eq('id', oldCl.id)
      }
      // add new vente to new client
      if (newCl && total_vente > 0) {
        // reload fresh solde to avoid stale value
        const { data: freshCl } = await supabase.from('grignon_clients').select('solde').eq('id', newCl.id).single()
        await supabase.from('grignon_clients')
          .update({ solde: (freshCl?.solde || 0) + total_vente })
          .eq('id', newCl.id)
      }
    }

    setEditSaving(false)
    if (error) {
      setEditMsg('❌ ' + error.message)
    } else {
      setEditMsg('✅ Enregistré !')
      setTimeout(() => { setEditRow(null); setEditMsg('') }, 800)
      loadAll()
    }
  }

  async function deleteOperation(op) {
    if (!admin) return
    if (deleteConfirm !== op.id) {
      setDeleteConfirm(op.id)
      setTimeout(() => setDeleteConfirm(null), 3000) // auto cancel after 3s
      return
    }
    setDeleteConfirm(null)
    await supabase.from('grignon_operations').delete().eq('id', op.id)
    if (op.client_id && op.total_vente) {
      const cl = clients.find(c => c.id === op.client_id)
      if (cl) await supabase.from('grignon_clients').update({ solde: Math.max(0, (cl.solde || 0) - op.total_vente) }).eq('id', cl.id)
    }
    loadAll()
  }

  // ── Grignon client management ──
  async function addClient() {
    if (!admin || !newClientNom.trim()) return
    await supabase.from('grignon_clients').insert({ nom: newClientNom.trim(), solde: 0, opening_balance: 0 })
    setNewClientNom('')
    loadAll()
  }

  async function deleteClient(id) {
    if (!admin || !confirm('Supprimer ce client grignon ?')) return
    await supabase.from('grignon_clients').delete().eq('id', id)
    loadAll()
  }

  async function editOpeningBalance(client) {
    if (!admin) return
    const v = prompt(`Solde initial (ancien solde) de ${client.nom}\nActuel: ${Math.round(client.opening_balance || 0).toLocaleString('fr-MA')} DHS\n\nCe montant représente ce que le client devait AVANT d'utiliser cette app.`, client.opening_balance || 0)
    if (v === null) return
    const n = parseFloat(v)
    if (isNaN(n)) return
    // Recalc solde from grignon_operations
    const { data: ops } = await supabase.from('grignon_operations').select('total_vente').eq('client_id', client.id)
    const totalV = (ops || []).reduce((s, o) => s + (o.total_vente || 0), 0)
    const newSolde = n + totalV
    await supabase.from('grignon_clients').update({ opening_balance: n, solde: newSolde }).eq('id', client.id)
    loadAll()
  }

  // ── Grignon fournisseur management ──
  async function addFournisseur() {
    if (!admin || !newFournNom.trim()) return
    await supabase.from('grignon_fournisseurs').insert({ nom: newFournNom.trim() })
    setNewFournNom('')
    loadAll()
  }

  async function deleteFournisseur(id) {
    if (!admin || !confirm('Supprimer ce fournisseur grignon ?')) return
    await supabase.from('grignon_fournisseurs').delete().eq('id', id)
    loadAll()
  }

  // ── Grignon fournisseur paiements CRUD ──
  async function savePaiement() {
    if (!admin) return
    if (!paiForm.fournisseur_id || !paiForm.montant || parseFloat(paiForm.montant) <= 0) {
      setPaiMsg('❌ Fournisseur et montant requis')
      return
    }
    setPaiSaving(true)
    const fo = fournisseurs.find(f => f.id === parseInt(paiForm.fournisseur_id))
    const { error } = await supabase.from('grignon_fournisseur_paiements').insert({
      date:            paiForm.date,
      fournisseur_id:  parseInt(paiForm.fournisseur_id),
      fournisseur_nom: fo?.nom || '',
      montant:         parseFloat(paiForm.montant),
      mode_paiement:   paiForm.mode_paiement,
      note:            paiForm.note || null,
    })
    setPaiSaving(false)
    if (error) {
      setPaiMsg('❌ ' + error.message)
    } else {
      setPaiMsg('✅ Paiement enregistré !')
      setPaiForm({ date: today(), fournisseur_id: '', montant: '', mode_paiement: 'Espèce', note: '' })
      setTimeout(() => setPaiMsg(''), 2500)
      loadAll()
    }
  }

  async function deletePaiement(id) {
    if (!admin || !confirm('Supprimer ce paiement fournisseur ?')) return
    await supabase.from('grignon_fournisseur_paiements').delete().eq('id', id)
    loadAll()
  }

  // ── Grignon camion management ──
  async function addCamion() {
    if (!admin || !newCamionPlaque.trim()) return
    await supabase.from('grignon_camions').insert({ plaque: newCamionPlaque.trim(), chauffeur: newCamionChauffeur.trim() })
    setNewCamionPlaque('')
    setNewCamionChauffeur('')
    loadAll()
  }

  async function deleteCamion(id) {
    if (!admin || !confirm('Supprimer ce camion grignon ?')) return
    await supabase.from('grignon_camions').delete().eq('id', id)
    loadAll()
  }

  // ── filtering ──
  const applyFilters = (list) => list.filter(op => {
    if (filterFrom  && op.date < filterFrom) return false
    if (filterTo    && op.date > filterTo)   return false
    if (filterClient && op.client_id !== parseInt(filterClient)) return false
    if (filterFourn  && op.fournisseur_nom !== filterFourn) return false
    if (filterCamion && op.camion_plaque  !== filterCamion) return false
    return true
  })

  const filtered = applyFilters(operations)
  const uniqueFourns  = [...new Set(operations.map(o => o.fournisseur_nom).filter(Boolean))]
  const uniqueCamions = [...new Set(operations.map(o => o.camion_plaque).filter(Boolean))]

  // ── Grignon KPIs — fully isolated from main dashboard ──
  const totalKg    = operations.reduce((s, o) => s + (o.qte || 0), 0)
  const totalAchat = operations.reduce((s, o) => s + (o.total_achat || 0), 0)
  const totalVente = operations.reduce((s, o) => s + (o.total_vente || 0), 0)
  const totalMarge = operations.reduce((s, o) => s + (o.marge || 0), 0)
  const totalClients = clients.length
  const totalCreances = clients.reduce((s, c) => s + (c.solde || 0), 0)
  const totalPaidFourn = fournPaiements.reduce((s, p) => s + (p.montant || 0), 0)
  const totalRestantFourn = totalAchat - totalPaidFourn

  // month stats for dashboard
  const thisMonth = startOfMonth()
  const monthOps  = operations.filter(o => o.date >= thisMonth)
  const monthKg   = monthOps.reduce((s, o) => s + (o.qte || 0), 0)
  const monthAchat= monthOps.reduce((s, o) => s + (o.total_achat || 0), 0)
  const monthVente= monthOps.reduce((s, o) => s + (o.total_vente || 0), 0)
  const monthMarge= monthOps.reduce((s, o) => s + (o.marge || 0), 0)

  // top clients by volume
  const byClient = {}
  filtered.forEach(op => {
    const n = op.client_nom || 'Sans client'
    if (!byClient[n]) byClient[n] = { vente: 0, qte: 0 }
    byClient[n].vente += op.total_vente || 0
    byClient[n].qte   += op.qte || 0
  })
  const topClients = Object.entries(byClient).sort((a,b) => b[1].vente - a[1].vente).slice(0, 5)

  // top fournisseurs
  const byFourn = {}
  filtered.forEach(op => {
    const n = op.fournisseur_nom || 'Sans fournisseur'
    if (!byFourn[n]) byFourn[n] = { achat: 0, qte: 0 }
    byFourn[n].achat += op.total_achat || 0
    byFourn[n].qte   += op.qte || 0
  })
  const topFourns = Object.entries(byFourn).sort((a,b) => b[1].achat - a[1].achat).slice(0, 5)

  // ── TABS ──
  const tabs = [
    { key: 'dashboard',        label: '📊 Tableau de bord' },
    { key: 'client',           label: '👤 Clients' },
    { key: 'fournisseur',      label: '🏭 Fournisseurs', adminOnly: true },
    { key: 'paiements_fourn',  label: '💳 Paiements Fourn.', adminOnly: true },
    { key: 'camion',           label: '🚛 Camions' },
    ...(admin ? [
      { key: 'gestion',   label: '⚙️ Gestion' },
      { key: 'saisie',    label: '➕ Saisie' },
    ] : []),
  ].filter(t => !t.adminOnly || admin)

  // ── PRINT HELPERS ──
  function printClientView() {
    const rows = filtered.map(op => `
      <tr>
        <td>${fmtDate(op.date)}</td>
        <td><b>${op.client_nom || '—'}</b></td>
        <td style="text-align:right">${fmtD(op.qte)} kg</td>
        <td style="text-align:right">${fmtD(op.prix_vente)}</td>
        <td style="text-align:right"><b>${fmt(op.total_vente)}</b></td>
        <td>${op.camion_plaque || '—'}</td>
      </tr>`).join('')
    const totQte   = filtered.reduce((s, o) => s + (o.qte || 0), 0)
    const totVente = filtered.reduce((s, o) => s + (o.total_vente || 0), 0)
        printViaIframe(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Grignon (Fitour) — Ventes Clients</title>
      <style>${PRINT_CSS}</style></head><body>
      ${CO_HEADER('🫒 Grignon (Fitour) — Ventes Clients', 'Période : '+filterFrom+' → '+filterTo+' · '+filtered.length+' opérations · Total : '+fmt(totVente)+' DHS')}
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button onclick="window.print()" style="padding:7px 14px;background:#475569;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">🖨️ Imprimer</button>
        <button onclick="window.print()" style="padding:7px 14px;background:#16a34a;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">📥 PDF</button>
      </div>
      <table>
        <thead><tr>
          <th>Date</th><th>Client</th>
          <th style="text-align:right">Qté (kg)</th>
          <th style="text-align:right">Prix/kg DHS</th>
          <th style="text-align:right">Total DHS</th>
          <th>Transport</th>
        </tr></thead>
        <tbody>${rows}${filtered.length===0?'<tr><td colspan="6" style="text-align:center;color:#aaa;padding:20px">Aucune opération</td></tr>':''}</tbody>
        ${filtered.length>0?`<tfoot><tr>
          <td colspan="2">TOTAL (${filtered.length})</td>
          <td style="text-align:right">${fmtD(totQte)} kg</td>
          <td></td>
          <td style="text-align:right">${fmt(totVente)} DHS</td>
          <td></td>
        </tr></tfoot>`:''}
      </table>
      ${CO_FOOTER(new Date().toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'})+' à '+String(new Date().getHours()).padStart(2,'0')+':'+String(new Date().getMinutes()).padStart(2,'0'))}
      </body></html>`)

  }

  function printFournisseurView() {
    const byF = {}
    filtered.forEach(op => {
      const f = op.fournisseur_nom || 'Sans fournisseur'
      if (!byF[f]) byF[f] = { days: {}, total_qte: 0, total_achat: 0 }
      byF[f].total_qte   += op.qte || 0
      byF[f].total_achat += op.total_achat || 0
      if (!byF[f].days[op.date]) byF[f].days[op.date] = { qte: 0, total: 0, prix: op.prix_achat }
      byF[f].days[op.date].qte   += op.qte || 0
      byF[f].days[op.date].total += op.total_achat || 0
    })
    const sections = Object.entries(byF).map(([fourn, data]) => {
      const dayRows = Object.entries(data.days).sort(([a],[b])=>a.localeCompare(b)).map(([date, d]) =>
        `<tr><td>${date}</td><td style="text-align:right">${fmtD(d.qte)} kg</td>
         <td style="text-align:right">${fmtD(d.prix)}</td>
         <td style="text-align:right"><b>${fmt(d.total)}</b></td></tr>`
      ).join('')
      return `
        <div class="section-title">🏭 ${fourn}</div>
        <table>
          <thead><tr><th>Date</th><th style="text-align:right">Qté (kg)</th><th style="text-align:right">Prix/kg DHS</th><th style="text-align:right">Total Achat DHS</th></tr></thead>
          <tbody>${dayRows}</tbody>
          <tfoot><tr><td>TOTAL</td><td style="text-align:right">${fmtD(data.total_qte)} kg</td><td></td><td style="text-align:right">${fmt(data.total_achat)} DHS</td></tr></tfoot>
        </table>`
    }).join('')
        printViaIframe(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
      <title>Grignon — Achats Fournisseurs — DAR SADIK</title>
      <style>${PRINT_CSS}</style></head><body>
      ${CO_HEADER('🫒 Grignon — Achats Fournisseurs', 'Période : '+filterFrom+' → '+filterTo)}
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button onclick="window.print()" style="padding:7px 14px;background:#475569;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">🖨️ Imprimer</button>
        <button onclick="window.print()" style="padding:7px 14px;background:#16a34a;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">📥 PDF</button>
      </div>
      ${sections || '<p style="color:#aaa">Aucune donnée pour cette période</p>'}
      ${CO_FOOTER(new Date().toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'})+' à '+String(new Date().getHours()).padStart(2,'0')+':'+String(new Date().getMinutes()).padStart(2,'0'))}
      </body></html>`)

  }

  function printCamionView() {
    const byCamion = {}
    filtered.forEach(op => {
      const p = op.camion_plaque || 'Sans camion'
      if (!byCamion[p]) byCamion[p] = []
      byCamion[p].push(op)
    })
    const sections = Object.entries(byCamion).map(([plaque, ops]) => {
      const rows = ops.map(op => `<tr>
        <td>${fmtDate(op.date)}</td>
        <td>${op.fournisseur_nom||'—'}</td>
        <td>${op.client_nom||'—'}</td>
        <td style="text-align:right">${fmtD(op.qte)} kg</td>
        <td>${op.client_id ? 'Vente' : 'Achat'}</td>
      </tr>`).join('')
      const totKg = ops.reduce((s,o)=>s+(o.qte||0),0)
      return `
        <div class="section-title">🚛 ${plaque}</div>
        <table>
          <thead><tr><th>Date</th><th>Fournisseur</th><th>Client</th><th style="text-align:right">Qté (kg)</th><th>Type</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td colspan="3">TOTAL (${ops.length} op.)</td><td style="text-align:right">${fmtD(totKg)} kg</td><td></td></tr></tfoot>
        </table>`
    }).join('')
        printViaIframe(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
      <title>Grignon — Camions — DAR SADIK</title>
      <style>${PRINT_CSS}</style></head><body>
      ${CO_HEADER('🫒 Grignon — Suivi Camions', 'Période : '+filterFrom+' → '+filterTo)}
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button onclick="window.print()" style="padding:7px 14px;background:#475569;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">🖨️ Imprimer</button>
        <button onclick="window.print()" style="padding:7px 14px;background:#16a34a;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">📥 PDF</button>
      </div>
      ${sections || '<p style="color:#aaa">Aucune donnée pour cette période</p>'}
      ${CO_FOOTER(new Date().toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'})+' à '+String(new Date().getHours()).padStart(2,'0')+':'+String(new Date().getMinutes()).padStart(2,'0'))}
      </body></html>`)

  }

  // ──────────────────────────────────────────────────────────

  function printDashboard() {
    const _now = new Date()
    const printDateTime = _now.toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' à ' + String(_now.getHours()).padStart(2,'0') + ':' + String(_now.getMinutes()).padStart(2,'0')
    const totalOB = clients.reduce((s,c) => s + (c.opening_balance || 0), 0)
    printViaIframe(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
      <title>Grignon — Tableau de bord — DAR SADIK</title>
      <style>${PRINT_CSS}</style></head><body>
      ${CO_HEADER('🫒 Grignon (Fitour) — Tableau de bord', 'Généré le '+printDateTime)}
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button onclick="window.print()" style="padding:7px 14px;background:#475569;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">🖨️ Imprimer</button>
        <button onclick="window.print()" style="padding:7px 14px;background:#16a34a;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">📥 PDF</button>
      </div>

      ${totalOB > 0 ? `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px;margin-bottom:16px">
        🏦 <b>Soldes initiaux inclus: ${fmt(totalOB)} DHS</b> — Anciens soldes avant l'utilisation de l'app
      </div>` : ''}

      <div class="section-title">📊 Totaux globaux</div>
      <div class="kpi-grid">
        <div class="kpi-box kpi-amber"><div class="lbl">Total quantité</div><div class="val">${fmtD(totalKg)} kg</div></div>
        <div class="kpi-box kpi-blue"><div class="lbl">Total achats</div><div class="val">${fmt(totalAchat)} DHS</div></div>
        <div class="kpi-box kpi-purple"><div class="lbl">Total ventes</div><div class="val">${fmt(totalVente)} DHS</div></div>
        <div class="kpi-box kpi-green"><div class="lbl">Marge brute</div><div class="val">${fmt(totalMarge)} DHS</div></div>
        <div class="kpi-box kpi-orange"><div class="lbl">Créances clients</div><div class="val">${fmt(totalCreances)} DHS</div></div>
        <div class="kpi-box"><div class="lbl">Opérations</div><div class="val">${operations.length}</div></div>
      </div>

      <div class="section-title">📅 Ce mois-ci</div>
      <div class="kpi-grid">
        <div class="kpi-box kpi-amber"><div class="lbl">Quantité</div><div class="val">${fmtD(monthKg)} kg</div></div>
        <div class="kpi-box kpi-blue"><div class="lbl">Achats</div><div class="val">${fmt(monthAchat)} DHS</div></div>
        <div class="kpi-box kpi-purple"><div class="lbl">Ventes</div><div class="val">${fmt(monthVente)} DHS</div></div>
        <div class="kpi-box kpi-green"><div class="lbl">Marge</div><div class="val">${fmt(monthMarge)} DHS</div></div>
      </div>

      <div class="section-title">👤 Top clients</div>
      <table>
        <thead><tr><th>Client</th><th style="text-align:right">Quantité (kg)</th><th style="text-align:right">Vente DHS</th></tr></thead>
        <tbody>${topClients.map(([nom, d]) => `<tr><td><b>${nom}</b></td><td style="text-align:right">${fmtD(d.qte)} kg</td><td style="text-align:right">${fmt(d.vente)} DHS</td></tr>`).join('')}
        ${topClients.length === 0 ? '<tr><td colspan="3" style="text-align:center;color:#aaa">Aucun client</td></tr>' : ''}</tbody>
      </table>

      <div class="section-title">🏭 Top fournisseurs</div>
      <table>
        <thead><tr><th>Fournisseur</th><th style="text-align:right">Quantité (kg)</th><th style="text-align:right">Achat DHS</th></tr></thead>
        <tbody>${topFourns.map(([nom, d]) => `<tr><td><b>${nom}</b></td><td style="text-align:right">${fmtD(d.qte)} kg</td><td style="text-align:right">${fmt(d.achat)} DHS</td></tr>`).join('')}
        ${topFourns.length === 0 ? '<tr><td colspan="3" style="text-align:center;color:#aaa">Aucun fournisseur</td></tr>' : ''}</tbody>
      </table>

      <div class="section-title">📋 Clients — Soldes</div>
      <table>
        <thead><tr><th>Client</th><th style="text-align:right">Solde initial DHS</th><th style="text-align:right">Solde total DHS</th></tr></thead>
        <tbody>${clients.map(c => `<tr><td><b>${c.nom}</b></td><td style="text-align:right">${fmt(c.opening_balance || 0)}</td><td style="text-align:right;color:#c2410c"><b>${fmt(c.solde || 0)}</b></td></tr>`).join('')}
        ${clients.length === 0 ? '<tr><td colspan="3" style="text-align:center;color:#aaa">Aucun client</td></tr>' : ''}</tbody>
        ${clients.length > 0 ? `<tfoot><tr><td>TOTAL</td><td style="text-align:right">${fmt(clients.reduce((s,c)=>s+(c.opening_balance||0),0))}</td><td style="text-align:right;color:#c2410c">${fmt(totalCreances)}</td></tr></tfoot>` : ''}
      </table>
      ${CO_FOOTER(printDateTime)}
      </body></html>`)

  }

  //  DASHBOARD — fully separate from main project dashboard
  // ──────────────────────────────────────────────────────────
  function DashboardView() {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🫒</span>
            <h2 className="text-xl font-bold text-gray-900">Tableau de bord — Grignon (Fitour)</h2>
            <span className="ml-2 text-xs bg-amber-100 text-amber-700 rounded-full px-3 py-1 font-semibold">Module isolé</span>
          </div>
          <button onClick={printDashboard} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ Imprimer Dashboard</button>
        </div>

        {/* All-time KPIs */}
        <div>
          <div className="text-xs font-bold text-gray-400 uppercase mb-2">Totaux globaux</div>
          {(() => {
            const totalOB = clients.reduce((s,c) => s + (c.opening_balance || 0), 0)
            return totalOB > 0 ? (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
                <span className="text-xl">🏦</span>
                <div>
                  <span className="font-bold text-amber-800">Soldes initiaux inclus: {fmt(totalOB)} DHS</span>
                  <div className="text-xs text-amber-600">Anciens soldes avant l'utilisation de l'app</div>
                </div>
              </div>
            ) : null
          })()}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="stat-card border border-amber-100 bg-amber-50">
              <div className="stat-label text-amber-600">Total quantité</div>
              <div className="stat-value text-amber-700">{fmtD(totalKg)} kg</div>
              <div className="stat-sub">Tous grignons traités</div>
            </div>
            <div className="stat-card border border-blue-100 bg-blue-50">
              <div className="stat-label text-blue-600">Total achats</div>
              <div className="stat-value text-blue-700">{fmt(totalAchat)} DHS</div>
              <div className="stat-sub">Fournisseurs grignon</div>
            </div>
            <div className="stat-card border border-purple-100 bg-purple-50">
              <div className="stat-label text-purple-600">Total ventes</div>
              <div className="stat-value text-purple-700">{fmt(totalVente)} DHS</div>
              <div className="stat-sub">Clients grignon</div>
            </div>
            <div className="stat-card border border-green-100 bg-green-50">
              <div className="stat-label text-green-600">Marge brute</div>
              <div className="stat-value text-green-700">{fmt(totalMarge)} DHS</div>
              <div className="stat-sub">{totalVente > 0 ? Math.round(totalMarge / totalVente * 100) : 0}% marge</div>
            </div>
            <div className="stat-card border border-orange-100 bg-orange-50">
              <div className="stat-label text-orange-600">Créances clients</div>
              <div className="stat-value text-orange-700">{fmt(totalCreances)} DHS</div>
              <div className="stat-sub">{totalClients} client(s) — soldes initiaux inclus</div>
            </div>
            <div className="stat-card border border-gray-100 bg-gray-50">
              <div className="stat-label text-gray-500">Opérations</div>
              <div className="stat-value text-gray-700">{operations.length}</div>
              <div className="stat-sub">Total enregistrées</div>
            </div>
            <div className="stat-card border border-green-100 bg-green-50">
              <div className="stat-label text-green-600">Payé fournisseurs</div>
              <div className="stat-value text-green-700">{fmt(totalPaidFourn)} DHS</div>
              <div className="stat-sub">Total paiements grignon</div>
            </div>
            <div className="stat-card" style={{borderColor: totalRestantFourn > 0 ? '#fecaca' : '#bbf7d0', background: totalRestantFourn > 0 ? '#fef2f2' : '#f0fdf4'}}>
              <div className="stat-label" style={{color: totalRestantFourn > 0 ? '#dc2626' : '#16a34a'}}>Reste à payer fourn.</div>
              <div className="stat-value" style={{color: totalRestantFourn > 0 ? '#dc2626' : '#16a34a'}}>{fmt(totalRestantFourn)} DHS</div>
              <div className="stat-sub">Solde dû aux fournisseurs</div>
            </div>
          </div>
        </div>

        {/* Month KPIs */}
        <div>
          <div className="text-xs font-bold text-gray-400 uppercase mb-2">Ce mois-ci</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="stat-card border border-amber-100 bg-amber-50">
              <div className="stat-label text-amber-600">Quantité</div>
              <div className="stat-value text-amber-700">{fmtD(monthKg)} kg</div>
            </div>
            <div className="stat-card border border-blue-100 bg-blue-50">
              <div className="stat-label text-blue-600">Achats</div>
              <div className="stat-value text-blue-700">{fmt(monthAchat)} DHS</div>
            </div>
            <div className="stat-card border border-purple-100 bg-purple-50">
              <div className="stat-label text-purple-600">Ventes</div>
              <div className="stat-value text-purple-700">{fmt(monthVente)} DHS</div>
            </div>
            <div className="stat-card border border-green-100 bg-green-50">
              <div className="stat-label text-green-600">Marge</div>
              <div className="stat-value text-green-700">{fmt(monthMarge)} DHS</div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Top clients */}
          <div className="card">
            <h3 className="font-bold text-gray-900 mb-4">👤 Top clients grignon</h3>
            {topClients.length === 0 ? (
              <div className="text-center text-gray-400 py-6">Aucun client</div>
            ) : (
              <div className="space-y-2">
                {topClients.map(([nom, d]) => (
                  <div key={nom} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="font-semibold text-gray-900">{nom}</div>
                      <div className="text-xs text-gray-400">{fmtD(d.qte)} kg</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-purple-700">{fmt(d.vente)} DHS</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top fournisseurs */}
          <div className="card">
            <h3 className="font-bold text-gray-900 mb-4">🏭 Top fournisseurs grignon</h3>
            {topFourns.length === 0 ? (
              <div className="text-center text-gray-400 py-6">Aucun fournisseur</div>
            ) : (
              <div className="space-y-2">
                {topFourns.map(([nom, d]) => (
                  <div key={nom} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="font-semibold text-gray-900">{nom}</div>
                      <div className="text-xs text-gray-400">{fmtD(d.qte)} kg</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-amber-700">{fmt(d.achat)} DHS</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent ops */}
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-4">📋 Dernières opérations grignon</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Client</th>
                  <th className="th">Fournisseur</th>
                  <th className="th text-right">Qté</th>
                  <th className="th text-right">Vente</th>
                  <th className="th text-right">Marge</th>
                </tr>
              </thead>
              <tbody>
                {[...operations].reverse().slice(0, 8).map(op => (
                  <tr key={op.id} className="hover:bg-gray-50">
                    <td className="td text-gray-500">{fmtDate(op.date)}</td>
                    <td className="td font-semibold">{op.client_nom || '—'}</td>
                    <td className="td text-gray-500">{op.fournisseur_nom || '—'}</td>
                    <td className="td text-right">{fmtD(op.qte)} kg</td>
                    <td className="td text-right font-bold text-purple-700">{fmt(op.total_vente)}</td>
                    <td className="td text-right font-bold text-green-600">{fmt(op.marge)}</td>
                  </tr>
                ))}
                {operations.length === 0 && (
                  <tr><td colSpan={6} className="td text-center text-gray-400 py-8">Aucune opération</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // ── VIEW COMPONENTS ──
  function ClientView() {
    const totQte   = filtered.reduce((s,o)=>s+(o.qte||0),0)
    const totVente = filtered.reduce((s,o)=>s+(o.total_vente||0),0)
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-bold text-gray-900">{filtered.length} opération(s)</h3>
          <div className="flex gap-2">
            <button onClick={printClientView} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ PDF</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th">Client</th>
                <th className="th text-right">Qté (kg)</th>
                <th className="th text-right">Prix/kg DHS</th>
                <th className="th text-right">Total DHS</th>
                <th className="th">Transport</th>
                {admin && <th className="th"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(op => (
                <tr key={op.id} className="hover:bg-gray-50">
                  <td className="td text-gray-500">{fmtDate(op.date)}</td>
                  <td className="td font-semibold">{op.client_nom || '—'}</td>
                  <td className="td text-right">{fmtD(op.qte)}</td>
                  <td className="td text-right text-gray-500">{fmtD(op.prix_vente)}</td>
                  <td className="td text-right font-bold">{fmt(op.total_vente)}</td>
                  <td className="td text-gray-500">{op.camion_plaque || '—'}</td>
                  {admin && <td className="td">
                    <div className="flex gap-1 items-center">
                      <button onClick={() => openEditGrignon(op)} className="btn-secondary text-xs px-2" style={{color:'#1a5fa8',borderColor:'#1a5fa8'}}>✏️</button>
                      {deleteConfirm === op.id
                        ? <button onClick={() => deleteOperation(op)} className="text-xs px-2 py-1 rounded-lg font-bold" style={{background:'#dc2626',color:'#fff'}}>Confirmer ✕</button>
                        : <button onClick={() => deleteOperation(op)} className="btn-danger text-xs">✕</button>
                      }
                    </div>
                  </td>}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="td text-center text-gray-400 py-8">Aucune opération</td></tr>}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr>
                  <td className="tfoot-td" colSpan={2}>TOTAL ({filtered.length})</td>
                  <td className="tfoot-td text-right">{fmtD(totQte)} kg</td>
                  <td className="tfoot-td"></td>
                  <td className="tfoot-td text-right">{fmt(totVente)} DHS</td>
                  <td className="tfoot-td" colSpan={admin ? 2 : 1}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    )
  }

  function FournisseurView() {
    if (!admin) return (
      <div className="card flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <div className="text-xl font-bold text-gray-900">Accès restreint</div>
        <div className="text-gray-500 mt-2">Réservé à l'administrateur</div>
      </div>
    )
    const byF = {}
    filtered.forEach(op => {
      const f = op.fournisseur_nom || 'Sans fournisseur'
      const fid = op.fournisseur_id || null
      if (!byF[f]) byF[f] = { fid, days: {}, total_qte: 0, total_achat: 0, total_vente: 0, total_marge: 0 }
      byF[f].total_qte   += op.qte || 0
      byF[f].total_achat += op.total_achat || 0
      byF[f].total_vente += op.total_vente || 0
      byF[f].total_marge += op.marge || 0
      if (!byF[f].days[op.date]) byF[f].days[op.date] = { qte: 0, total_achat: 0, prix: op.prix_achat }
      byF[f].days[op.date].qte         += op.qte || 0
      byF[f].days[op.date].total_achat += op.total_achat || 0
    })

    // Compute total paid and remaining balance per fournisseur (all-time, not filtered by date)
    const paidByFourn = {}
    fournPaiements.forEach(p => {
      const fid = p.fournisseur_id
      paidByFourn[fid] = (paidByFourn[fid] || 0) + (p.montant || 0)
    })
    // total achat all-time per fournisseur id
    const achatByFournId = {}
    operations.forEach(op => {
      if (op.fournisseur_id) {
        achatByFournId[op.fournisseur_id] = (achatByFournId[op.fournisseur_id] || 0) + (op.total_achat || 0)
      }
    })

    function printFournisseurViewWithBalances() {
      const sections = Object.entries(byF).map(([fourn, data]) => {
        const totalPaid = paidByFourn[data.fid] || 0
        const totalAchatAllTime = achatByFournId[data.fid] || 0
        const restant = totalAchatAllTime - totalPaid
        const dayRows = Object.entries(data.days).sort(([a],[b])=>a.localeCompare(b)).map(([date, d]) =>
          `<tr><td>${date}</td><td style="text-align:right">${fmtD(d.qte)} kg</td>
           <td style="text-align:right">${fmtD(d.prix)}</td>
           <td style="text-align:right"><b>${fmt(d.total_achat)}</b></td></tr>`
        ).join('')
        return `
          <div class="fourn-block">
            <div class="fourn-header">
              <span class="fourn-title">🏭 ${fourn}</span>
              <span>${fmtD(data.total_qte)} kg — ${fmt(data.total_achat)} DHS</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
              <div class="info-box"><b>Total achats (global)</b>${fmt(totalAchatAllTime)} DHS</div>
              <div class="info-box"><b>Total payé</b><span style="color:#16a34a">${fmt(totalPaid)} DHS</span></div>
              <div class="info-box"><b>Reste à payer</b><span style="color:${restant > 0 ? '#dc2626' : '#16a34a'}">${fmt(restant)} DHS</span></div>
            </div>
            <table>
              <thead><tr><th>Date</th><th style="text-align:right">Qté (kg)</th><th style="text-align:right">Prix/kg DHS</th><th style="text-align:right">Total Achat DHS</th></tr></thead>
              <tbody>${dayRows}</tbody>
              <tfoot><tr><td>TOTAL (période)</td><td style="text-align:right">${fmtD(data.total_qte)} kg</td><td></td><td style="text-align:right">${fmt(data.total_achat)} DHS</td></tr></tfoot>
            </table>
          </div>`
      }).join('')
            printViaIframe(`<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>Grignon (Fitour) — Achats Fournisseurs</title>
        <style>${PRINT_CSS}
        .section-title{font-weight:800;font-size:13px;margin:18px 0 8px;border-left:4px solid #1a5fa8;padding-left:10px;color:#1a5fa8}
        </style></head><body>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div><h1>🫒 DAR SADIK — Grignon · Achats & Soldes Fournisseurs</h1>
          <div class="sub">Période: ${filterFrom} → ${filterTo} | Généré le ${new Date().toLocaleDateString('fr-MA')}</div></div>
          <div><button onclick="window.print()" style="padding:8px 16px;background:#1a5fa8;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">🖨️ Imprimer / PDF</button></div>
        </div>
        ${sections || '<p style="color:#aaa">Aucune donnée pour cette période</p>'}
        </body></html>`)

    }

    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <button onClick={printFournisseurViewWithBalances} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ PDF Fournisseurs</button>
          <button onClick={()=>exportGrignonCSV([['Fournisseur','Date','Qte kg','Prix achat','Total achat DHS'],...filtered.map(o=>[o.fournisseur_nom||'',fmtDate(o.date),o.qte||0,o.prix_achat||0,o.total_achat||0])],'Grignon-Fournisseurs')} className="btn-primary text-xs px-3 py-1.5" style={{background:'#16a34a'}}>📊 Excel</button>
        </div>
        {Object.entries(byF).map(([fourn, data]) => {
          const totalPaid = paidByFourn[data.fid] || 0
          const totalAchatAllTime = achatByFournId[data.fid] || 0
          const restant = totalAchatAllTime - totalPaid
          return (
            <div key={fourn} className="card">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="font-bold text-lg text-brand-700">🏭 {fourn}</h3>
                <div className="flex gap-4 text-sm flex-wrap">
                  <span className="text-gray-500">Période: <b className="text-gray-900">{fmtD(data.total_qte)} kg</b></span>
                  <span className="text-gray-500">Achat: <b className="text-amber-700">{fmt(data.total_achat)} DHS</b></span>
                  <span className="text-gray-500">Marge: <b className="text-green-600">{fmt(data.total_marge)} DHS</b></span>
                </div>
              </div>

              {/* Balance summary */}
              <div className="grid grid-cols-3 gap-3 mb-5 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="text-center">
                  <div className="text-xs text-gray-400 uppercase font-semibold mb-1">Total achats (global)</div>
                  <div className="text-lg font-bold text-gray-800">{fmt(totalAchatAllTime)} DHS</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-green-500 uppercase font-semibold mb-1">Total payé</div>
                  <div className="text-lg font-bold text-green-700">{fmt(totalPaid)} DHS</div>
                </div>
                <div className="text-center">
                  <div className="text-xs uppercase font-semibold mb-1" style={{color: restant > 0 ? '#dc2626' : '#16a34a'}}>Reste à payer</div>
                  <div className="text-lg font-bold" style={{color: restant > 0 ? '#dc2626' : '#16a34a'}}>{fmt(restant)} DHS</div>
                </div>
              </div>

              <div className="text-xs font-bold text-gray-500 uppercase mb-2">📅 Suivi journalier (période filtrée)</div>
              <div className="overflow-x-auto mb-4">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Date</th>
                      <th className="th text-right">Qté (kg)</th>
                      <th className="th text-right">Prix/kg DHS</th>
                      <th className="th text-right">Total Achat DHS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.days).sort(([a],[b])=>a.localeCompare(b)).map(([date, d]) => (
                      <tr key={date} className="hover:bg-gray-50">
                        <td className="td font-semibold">{date}</td>
                        <td className="td text-right">{fmtD(d.qte)}</td>
                        <td className="td text-right text-gray-500">{fmtD(d.prix)}</td>
                        <td className="td text-right font-bold text-amber-700">{fmt(d.total_achat)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="tfoot-td">TOTAL (période)</td>
                      <td className="tfoot-td text-right">{fmtD(data.total_qte)} kg</td>
                      <td className="tfoot-td"></td>
                      <td className="tfoot-td text-right">{fmt(data.total_achat)} DHS</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        })}
        {Object.keys(byF).length === 0 && <div className="card text-center py-10 text-gray-400">Aucune donnée</div>}
      </div>
    )
  }

  function PaiementsFournView() {
    if (!admin) return (
      <div className="card flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <div className="text-xl font-bold text-gray-900">Accès restreint</div>
        <div className="text-gray-500 mt-2">Réservé à l'administrateur</div>
      </div>
    )

    // Filter payments
    const filteredPai = fournPaiements.filter(p => {
      if (paiFilterFourn && p.fournisseur_id !== parseInt(paiFilterFourn)) return false
      if (paiFilterMode  && p.mode_paiement !== paiFilterMode) return false
      if (paiFilterFrom  && p.date < paiFilterFrom) return false
      if (paiFilterTo    && p.date > paiFilterTo) return false
      return true
    })

    // All-time totals per fournisseur
    const achatByFournId = {}
    operations.forEach(op => {
      if (op.fournisseur_id) {
        achatByFournId[op.fournisseur_id] = (achatByFournId[op.fournisseur_id] || 0) + (op.total_achat || 0)
      }
    })
    const paidByFourn = {}
    fournPaiements.forEach(p => {
      paidByFourn[p.fournisseur_id] = (paidByFourn[p.fournisseur_id] || 0) + (p.montant || 0)
    })

    const totalFilteredPaid = filteredPai.reduce((s,p) => s + (p.montant || 0), 0)

    const MODE_COLORS = { 'Espèce': 'bg-green-100 text-green-700', 'Chèque': 'bg-blue-100 text-blue-700', 'Virement': 'bg-purple-100 text-purple-700' }

    function printPaiementsView() {
      const rows = filteredPai.map(p => {
        const totalAchat = achatByFournId[p.fournisseur_id] || 0
        return `<tr>
          <td>${fmtDate(p.date)}</td>
          <td><b>${p.fournisseur_nom || '—'}</b></td>
          <td style="text-align:right"><b>${fmt(p.montant)}</b></td>
          <td><span class="badge">${p.mode_paiement}</span></td>
          <td>${p.note || '—'}</td>
        </tr>`
      }).join('')

      // Per-fournisseur balance summary
      const balanceRows = fournisseurs.map(f => {
        const totalAchat = achatByFournId[f.id] || 0
        const totalPaid  = paidByFourn[f.id] || 0
        const restant    = totalAchat - totalPaid
        return `<tr>
          <td><b>${f.nom}</b></td>
          <td style="text-align:right">${fmt(totalAchat)}</td>
          <td style="text-align:right;color:#16a34a">${fmt(totalPaid)}</td>
          <td style="text-align:right;color:${restant > 0 ? '#dc2626' : '#16a34a'}"><b>${fmt(restant)}</b></td>
        </tr>`
      }).join('')

            printViaIframe(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
        <title>Grignon — Paiements Fournisseurs — DAR SADIK</title>
        <style>${PRINT_CSS}</style></head><body>
        ${CO_HEADER('🫒 Grignon — Paiements Fournisseurs', 'Période : '+paiFilterFrom+' → '+paiFilterTo+' · '+filteredPai.length+' paiements · Total : '+fmt(totalFilteredPaid)+' DHS')}
        <div style="display:flex;gap:8px;margin-bottom:16px">
          <button onclick="window.print()" style="padding:7px 14px;background:#475569;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">🖨️ Imprimer</button>
          <button onclick="window.print()" style="padding:7px 14px;background:#16a34a;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">📥 PDF</button>
        </div>

        <h2>📋 Récapitulatif des soldes fournisseurs</h2>
        <table>
          <thead><tr><th>Fournisseur</th><th style="text-align:right">Total achats DHS</th><th style="text-align:right">Total payé DHS</th><th style="text-align:right">Reste à payer DHS</th></tr></thead>
          <tbody>${balanceRows}</tbody>
          <tfoot><tr>
            <td>TOTAL</td>
            <td style="text-align:right">${fmt(fournisseurs.reduce((s,f) => s + (achatByFournId[f.id]||0), 0))}</td>
            <td style="text-align:right">${fmt(fournisseurs.reduce((s,f) => s + (paidByFourn[f.id]||0), 0))}</td>
            <td style="text-align:right">${fmt(fournisseurs.reduce((s,f) => s + ((achatByFournId[f.id]||0)-(paidByFourn[f.id]||0)), 0))}</td>
          </tr></tfoot>
        </table>

        <h2 style="margin-top:24px">💳 Historique des paiements (${filteredPai.length})</h2>
        <table>
          <thead><tr><th>Date</th><th>Fournisseur</th><th style="text-align:right">Montant DHS</th><th>Mode</th><th>Note</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#aaa">Aucun paiement</td></tr>'}</tbody>
          ${filteredPai.length > 0 ? `<tfoot><tr><td colspan="2">TOTAL (${filteredPai.length})</td><td style="text-align:right">${fmt(totalFilteredPaid)}</td><td colspan="2"></td></tr></tfoot>` : ''}
        </table>
        ${CO_FOOTER(new Date().toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'})+' à '+String(new Date().getHours()).padStart(2,'0')+':'+String(new Date().getMinutes()).padStart(2,'0'))}
        </body></html>`)

    }

    return (
      <div className="space-y-6">
        {/* New payment form */}
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-4">💳 Enregistrer un paiement fournisseur</h3>
          <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4'} gap-3 mb-3`}>
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={paiForm.date} onChange={e=>setPaiForm({...paiForm,date:e.target.value})} />
            </div>
            <div>
              <label className="label">Fournisseur grignon</label>
              <select className="input" value={paiForm.fournisseur_id} onChange={e=>setPaiForm({...paiForm,fournisseur_id:e.target.value})}>
                <option value="">— Choisir —</option>
                {fournisseurs.map(f=><option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Montant (DHS)</label>
              <input type="text" inputMode="decimal" className="input" placeholder="ex: 5000" value={paiForm.montant} onChange={e=>setPaiForm({...paiForm,montant:e.target.value})} />
            </div>
            <div>
              <label className="label">Mode de paiement</label>
              <select className="input" value={paiForm.mode_paiement} onChange={e=>setPaiForm({...paiForm,mode_paiement:e.target.value})}>
                <option value="Espèce">💵 Espèce</option>
                <option value="Chèque">📝 Chèque</option>
                <option value="Virement">🏦 Virement</option>
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="label">Note (optionnel)</label>
            <input className="input" placeholder="Référence, chèque N°..." value={paiForm.note} onChange={e=>setPaiForm({...paiForm,note:e.target.value})} />
          </div>
          {paiMsg && (
            <div className={`text-sm font-semibold p-2 rounded-lg mb-3 ${paiMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{paiMsg}</div>
          )}
          <button onClick={savePaiement} disabled={paiSaving} className={`btn-primary ${isMobile ? 'w-full justify-center' : ''}`}>
            {paiSaving ? 'Enregistrement...' : '✓ Enregistrer le paiement'}
          </button>
        </div>

        {/* Balance summary per fournisseur */}
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-4">📊 Soldes fournisseurs grignon</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Fournisseur</th>
                  <th className="th text-right">Total achats DHS</th>
                  <th className="th text-right">Total payé DHS</th>
                  <th className="th text-right">Reste à payer DHS</th>
                </tr>
              </thead>
              <tbody>
                {fournisseurs.map(f => {
                  const totalAchat = achatByFournId[f.id] || 0
                  const totalPaid  = paidByFourn[f.id] || 0
                  const restant    = totalAchat - totalPaid
                  return (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="td font-semibold">{f.nom}</td>
                      <td className="td text-right text-amber-700 font-bold">{fmt(totalAchat)}</td>
                      <td className="td text-right text-green-700 font-bold">{fmt(totalPaid)}</td>
                      <td className="td text-right font-bold" style={{color: restant > 0 ? '#dc2626' : '#16a34a'}}>{fmt(restant)}</td>
                    </tr>
                  )
                })}
                {fournisseurs.length === 0 && <tr><td colSpan={4} className="td text-center text-gray-400">Aucun fournisseur</td></tr>}
              </tbody>
              {fournisseurs.length > 0 && (
                <tfoot>
                  <tr>
                    <td className="tfoot-td">TOTAL</td>
                    <td className="tfoot-td text-right">{fmt(fournisseurs.reduce((s,f)=>s+(achatByFournId[f.id]||0),0))}</td>
                    <td className="tfoot-td text-right">{fmt(fournisseurs.reduce((s,f)=>s+(paidByFourn[f.id]||0),0))}</td>
                    <td className="tfoot-td text-right">{fmt(fournisseurs.reduce((s,f)=>s+((achatByFournId[f.id]||0)-(paidByFourn[f.id]||0)),0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Filters + history */}
        <div className="card">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="font-bold text-gray-900">💳 Historique des paiements</h3>
            <button onClick={printPaiementsView} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ PDF</button>
                    <button onClick={()=>exportGrignonCSV([['Date','Fournisseur','Montant DHS','Mode','Note'],...filteredPai.map(p=>[fmtDate(p.date),p.fournisseur_nom||'',p.montant||0,p.mode_paiement,p.note||''])],'Grignon-Paiements')} className="btn-primary text-xs px-3 py-1.5" style={{background:'#16a34a'}}>📊 Excel</button>
          </div>

          {/* Filters */}
          <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4'} gap-3 mb-4 p-3 bg-gray-50 rounded-xl`}>
            <div>
              <label className="label">Du</label>
              <input type="date" className="input" value={paiFilterFrom} onChange={e=>setPaiFilterFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Au</label>
              <input type="date" className="input" value={paiFilterTo} onChange={e=>setPaiFilterTo(e.target.value)} />
            </div>
            <div>
              <label className="label">Fournisseur</label>
              <select className="input" value={paiFilterFourn} onChange={e=>setPaiFilterFourn(e.target.value)}>
                <option value="">Tous</option>
                {fournisseurs.map(f=><option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Mode de paiement</label>
              <select className="input" value={paiFilterMode} onChange={e=>setPaiFilterMode(e.target.value)}>
                <option value="">Tous</option>
                <option value="Espèce">💵 Espèce</option>
                <option value="Chèque">📝 Chèque</option>
                <option value="Virement">🏦 Virement</option>
              </select>
            </div>
          </div>
          <div className="text-xs text-gray-400 mb-3">{filteredPai.length} paiement(s) — Total: <b className="text-green-700">{fmt(totalFilteredPaid)} DHS</b></div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Fournisseur</th>
                  <th className="th text-right">Montant DHS</th>
                  <th className="th">Mode</th>
                  <th className="th">Note</th>
                  {admin && <th className="th"></th>}
                </tr>
              </thead>
              <tbody>
                {filteredPai.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="td text-gray-500">{fmtDate(p.date)}</td>
                    <td className="td font-semibold">{p.fournisseur_nom || '—'}</td>
                    <td className="td text-right font-bold text-green-700">{fmt(p.montant)}</td>
                    <td className="td">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${MODE_COLORS[p.mode_paiement] || 'bg-gray-100 text-gray-700'}`}>
                        {p.mode_paiement}
                      </span>
                    </td>
                    <td className="td text-gray-400">{p.note || '—'}</td>
                    {admin && <td className="td">
                      <button onClick={() => deletePaiement(p.id)} className="btn-danger text-xs">✕</button>
                    </td>}
                  </tr>
                ))}
                {filteredPai.length === 0 && <tr><td colSpan={6} className="td text-center text-gray-400 py-8">Aucun paiement pour cette période</td></tr>}
              </tbody>
              {filteredPai.length > 0 && (
                <tfoot>
                  <tr>
                    <td className="tfoot-td" colSpan={2}>TOTAL ({filteredPai.length})</td>
                    <td className="tfoot-td text-right">{fmt(totalFilteredPaid)} DHS</td>
                    <td className="tfoot-td" colSpan={admin ? 3 : 2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    )
  }

  function CamionView() {
    const byCamion = {}
    filtered.forEach(op => {
      const p = op.camion_plaque || 'Sans camion'
      if (!byCamion[p]) byCamion[p] = { ops: [], total_qte: 0, chauffeur: op.chauffeur || '' }
      byCamion[p].ops.push(op)
      byCamion[p].total_qte += op.qte || 0
    })
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <button onClick={printCamionView} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ PDF Camions</button>
        </div>
        {Object.entries(byCamion).sort((a,b) => b[1].total_qte - a[1].total_qte).map(([plaque, data]) => (
          <div key={plaque} className="card">
            <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
              <div>
                <div className="text-lg font-bold text-gray-900">🚛 {plaque}</div>
                {data.chauffeur && <div className="text-sm text-gray-500 mt-1">👤 {data.chauffeur}</div>}
              </div>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-amber-50 rounded-xl p-3">
                  <div className="text-xs text-gray-400">Opérations</div>
                  <div className="text-xl font-bold text-amber-600">{data.ops.length}</div>
                </div>
                <div className="bg-green-50 rounded-xl p-3">
                  <div className="text-xs text-gray-400">Total kg</div>
                  <div className="text-xl font-bold text-green-600">{fmtD(data.total_qte)}</div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Fournisseur</th>
                    <th className="th">Client</th>
                    <th className="th text-right">Qté (kg)</th>
                    <th className="th">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ops.map(op => (
                    <tr key={op.id} className="hover:bg-gray-50">
                      <td className="td text-gray-500">{fmtDate(op.date)}</td>
                      <td className="td text-gray-600">{op.fournisseur_nom || '—'}</td>
                      <td className="td font-semibold">{op.client_nom || '—'}</td>
                      <td className="td text-right">{fmtD(op.qte)}</td>
                      <td className="td">
                        <span className={op.client_id ? 'badge-blue' : 'badge-gray'}>
                          {op.client_id ? 'Vente' : 'Achat'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="tfoot-td" colSpan={3}>TOTAL ({data.ops.length})</td>
                    <td className="tfoot-td text-right">{fmtD(data.total_qte)} kg</td>
                    <td className="tfoot-td"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ))}
        {Object.keys(byCamion).length === 0 && <div className="card text-center py-10 text-gray-400">Aucune donnée</div>}
      </div>
    )
  }

  // GestionView is rendered inline to prevent input focus loss on re-render

  // ──────────────────────────────────────────────────────────
  //  RENDER
  // ──────────────────────────────────────────────────────────
  return (
    <Layout title="Grignon (Fitour)" subtitle="Module isolé — achats, ventes et transport">

      {/* Module badge */}
      <div className="flex items-center gap-3 mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl">
        <span className="text-2xl">🫒</span>
        <div>
          <div className="font-bold text-amber-800">Module Grignon (Fitour)</div>
          <div className="text-xs text-amber-600">Clients, fournisseurs et camions séparés du projet principal</div>
        </div>
      </div>

      {/* Grignon KPI summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="stat-card border border-amber-100 bg-amber-50">
          <div className="stat-label text-amber-600">Total kg</div>
          <div className="stat-value text-amber-700">{fmtD(totalKg)} kg</div>
          <div className="stat-sub">Grignon traités</div>
        </div>
        <div className="stat-card border border-blue-100 bg-blue-50">
          <div className="stat-label text-blue-600">Total achats</div>
          <div className="stat-value text-blue-700">{fmt(totalAchat)} DHS</div>
          <div className="stat-sub">Fournisseurs</div>
        </div>
        <div className="stat-card border border-purple-100 bg-purple-50">
          <div className="stat-label text-purple-600">Total ventes</div>
          <div className="stat-value text-purple-700">{fmt(totalVente)} DHS</div>
          <div className="stat-sub">Clients</div>
        </div>
        <div className="stat-card border border-green-100 bg-green-50">
          <div className="stat-label text-green-600">Marge brute</div>
          <div className="stat-value text-green-700">{fmt(totalMarge)} DHS</div>
          <div className="stat-sub">{totalVente > 0 ? Math.round(totalMarge / totalVente * 100) : 0}%</div>
        </div>
        <div className="stat-card" style={{borderColor: totalRestantFourn > 0 ? '#fecaca' : '#bbf7d0', background: totalRestantFourn > 0 ? '#fef2f2' : '#f0fdf4'}}>
          <div className="stat-label" style={{color: totalRestantFourn > 0 ? '#dc2626' : '#16a34a'}}>Reste fourn.</div>
          <div className="stat-value" style={{color: totalRestantFourn > 0 ? '#dc2626' : '#16a34a'}}>{fmt(totalRestantFourn)} DHS</div>
          <div className="stat-sub">Solde dû</div>
        </div>
      </div>

      {/* TABS */}
      <div className={isMobile ? 'mobile-tabs mb-4' : 'flex flex-wrap gap-2 mb-4'}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={isMobile
              ? (view === t.key ? 'active' : '')
              : `px-4 py-2 rounded-xl border text-sm font-bold transition-all ${view===t.key?'bg-brand-500 text-white border-brand-500':'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`
            }>
            {t.label}
          </button>
        ))}
      </div>

      {/* FILTERS — only shown for data views */}
      {['client','fournisseur','camion'].includes(view) && (
        isMobile ? (
          <div className="mb-4">
            <button className="mobile-collapse-btn" onClick={() => setShowFilters(!showFilters)}>
              <span>🔍 Filtres ({filterFrom} → {filterTo})</span>
              <span>{showFilters ? '▲' : '▼'}</span>
            </button>
            {showFilters && (
              <div className="card mt-2 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} /></div>
                  <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)} /></div>
                </div>
                <div><label className="label">Client grignon</label>
                  <select className="input" value={filterClient} onChange={e=>setFilterClient(e.target.value)}>
                    <option value="">Tous</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                <div><label className="label">Camion grignon</label>
                  <select className="input" value={filterCamion} onChange={e=>setFilterCamion(e.target.value)}>
                    <option value="">Tous</option>{uniqueCamions.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <button onClick={()=>{setFilterClient('');setFilterFourn('');setFilterCamion('');setFilterFrom(startOfMonth());setFilterTo(today());setShowFilters(false)}}
                  className="btn-secondary w-full justify-center text-xs">↺ Réinitialiser</button>
              </div>
            )}
            <div className="text-xs text-gray-400 mt-2 px-1">{filtered.length} opération(s) — {fmtD(filtered.reduce((s,o)=>s+(o.qte||0),0))} kg</div>
          </div>
        ) : (
          <div className="card mb-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} /></div>
              <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)} /></div>
              <div><label className="label">Client grignon</label>
                <select className="input" value={filterClient} onChange={e=>setFilterClient(e.target.value)}>
                  <option value="">Tous</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              {admin && <div><label className="label">Fournisseur grignon</label>
                <select className="input" value={filterFourn} onChange={e=>setFilterFourn(e.target.value)}>
                  <option value="">Tous</option>{uniqueFourns.map(f=><option key={f}>{f}</option>)}
                </select>
              </div>}
              <div><label className="label">Camion grignon</label>
                <select className="input" value={filterCamion} onChange={e=>setFilterCamion(e.target.value)}>
                  <option value="">Tous</option>{uniqueCamions.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <button onClick={()=>{setFilterClient('');setFilterFourn('');setFilterCamion('');setFilterFrom(startOfMonth());setFilterTo(today())}}
                className="btn-secondary text-xs">↺ Réinitialiser</button>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              {filtered.length} opération(s) — {fmtD(filtered.reduce((s,o)=>s+(o.qte||0),0))} kg — ventes: {fmt(filtered.reduce((s,o)=>s+(o.total_vente||0),0))} DHS
            </div>
          </div>
        )
      )}

      {/* SAISIE FORM */}
      {view === 'saisie' && admin && (
        <div className="space-y-6">
        <div className="card mb-4">
          <h3 className="font-bold text-gray-900 mb-4">➕ Nouvelle opération grignon (fitour)</h3>
          <div>
            <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4'} gap-3 mb-3`}>
              <div><label className="label">Date</label>
                <input type="date" className="input" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required />
              </div>
              <div><label className="label">Client grignon</label>
                <select className="input" value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})}>
                  <option value="">— Sans client —</option>
                  {clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div><label className="label">Fournisseur grignon</label>
                <select className="input" value={form.fournisseur_id} onChange={e=>setForm({...form,fournisseur_id:e.target.value})}>
                  <option value="">— Sans fournisseur —</option>
                  {fournisseurs.map(f=><option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
              </div>
              <div><label className="label">Camion grignon</label>
                <select className="input" value={form.camion_id} onChange={e=>setForm({...form,camion_id:e.target.value})}>
                  <option value="">— Sans camion —</option>
                  {camions.map(c=><option key={c.id} value={c.id}>{c.plaque}{c.chauffeur?` — ${c.chauffeur}`:''}</option>)}
                </select>
              </div>
            </div>
            <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-3'} gap-3 mb-3`}>
              <div><label className="label">Quantité (kg)</label>
                <input type="number" step="0.01" className="input" placeholder="ex: 500" value={form.qte} onChange={e=>setForm({...form,qte:e.target.value})} required />
              </div>
              <div><label className="label">Prix achat / kg (DHS)</label>
                <input type="number" step="0.01" className="input" placeholder="ex: 30.00" value={form.prix_achat} onChange={e=>setForm({...form,prix_achat:e.target.value})} />
              </div>
              <div><label className="label">Prix vente / kg (DHS)</label>
                <input type="number" step="0.01" className="input" placeholder="ex: 35.00" value={form.prix_vente} onChange={e=>setForm({...form,prix_vente:e.target.value})} />
              </div>
            </div>
            <div className="mb-3">
              <label className="label">Note (optionnel)</label>
              <input className="input" placeholder="..." value={form.note} onChange={e=>setForm({...form,note:e.target.value})} />
            </div>

            {/* PREVIEW */}
            {qte > 0 && (pAchat > 0 || pVente > 0) && (
              <div className="grid grid-cols-3 gap-3 bg-amber-50 rounded-xl p-4 mb-4 text-center">
                <div><div className="text-xs text-gray-400">Total achat</div><div className="text-lg font-bold text-amber-700">{fmt(totAchat)} DHS</div></div>
                <div><div className="text-xs text-gray-400">Total vente</div><div className="text-lg font-bold text-blue-700">{fmt(totVente)} DHS</div></div>
                <div><div className="text-xs text-gray-400">Marge</div><div className={`text-lg font-bold ${marge>=0?'text-green-600':'text-red-600'}`}>{fmt(marge)} DHS</div></div>
              </div>
            )}

            <button onClick={saveOperation} disabled={saving} className={`btn-primary ${isMobile ? 'w-full justify-center' : ''}`}>
              {saving ? 'Enregistrement...' : '✓ Enregistrer'}
            </button>
          </div>
        </div>

        {/* Recent operations with edit/delete — shown directly in saisie */}
        {admin && (
          <div className="card">
            <h3 className="font-bold text-gray-900 mb-4">📋 Dernières saisies — modifier / supprimer</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Client</th>
                    <th className="th">Fournisseur</th>
                    <th className="th text-right">Qté kg</th>
                    <th className="th text-right">P.Achat</th>
                    <th className="th text-right">P.Vente</th>
                    <th className="th text-right">Total vente</th>
                    <th className="th">Note</th>
                    <th className="th"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...operations].reverse().slice(0, 20).map(op => (
                    <tr key={op.id} className="hover:bg-gray-50">
                      <td className="td text-gray-500">{fmtDate(op.date)}</td>
                      <td className="td font-semibold">{op.client_nom || '—'}</td>
                      <td className="td text-gray-500">{op.fournisseur_nom || '—'}</td>
                      <td className="td text-right">{fmtD(op.qte)}</td>
                      <td className="td text-right text-amber-600">{fmtD(op.prix_achat)}</td>
                      <td className="td text-right text-blue-600">{fmtD(op.prix_vente)}</td>
                      <td className="td text-right font-bold text-purple-700">{fmt(op.total_vente)}</td>
                      <td className="td text-gray-400 text-xs">{op.note || '—'}</td>
                      <td className="td">
                        <div className="flex gap-1 items-center">
                          <button
                            onClick={() => openEditGrignon(op)}
                            className="btn-secondary text-xs px-2"
                            style={{color:'#1a5fa8', borderColor:'#1a5fa8'}}
                          >✏️</button>
                          {deleteConfirm === op.id
                            ? <button onClick={() => deleteOperation(op)} className="text-xs px-2 py-1 rounded-lg font-bold" style={{background:'#dc2626',color:'#fff'}}>Confirmer ✕</button>
                            : <button onClick={() => deleteOperation(op)} className="btn-danger text-xs">✕</button>
                          }
                        </div>
                      </td>
                    </tr>
                  ))}
                  {operations.length === 0 && (
                    <tr><td colSpan={9} className="td text-center text-gray-400 py-8">Aucune opération</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {operations.length > 20 && (
              <div className="text-xs text-gray-400 mt-2 text-center">Affichage des 20 dernières saisies. Pour voir tout, allez dans l'onglet 👤 Clients.</div>
            )}
          </div>
        )}
        </div>
      )}

      {/* VIEWS */}
      {loading ? (
        <div className="card text-center py-10 text-gray-400">Chargement...</div>
      ) : (
        <>
          {view === 'dashboard'    && DashboardView()}
          {view === 'client'       && ClientView()}
          {view === 'fournisseur'  && FournisseurView()}
          {view === 'paiements_fourn' && PaiementsFournView()}
          {view === 'camion'       && CamionView()}
          {view === 'gestion' && (
            !admin ? (
              <div className="card flex flex-col items-center justify-center py-20 text-center">
                <div className="text-5xl mb-4">🔒</div>
                <div className="text-xl font-bold text-gray-900">Accès restreint</div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Clients */}
                <div className="card">
                  <h3 className="font-bold text-gray-900 mb-4">👤 Clients Grignon</h3>
                  <div className="flex gap-2 mb-4">
                    <input
                      className="input flex-1"
                      placeholder="Nom du client grignon"
                      value={newClientNom}
                      onChange={e => setNewClientNom(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addClient() }}
                    />
                    <button onClick={addClient} className="btn-primary">+ Ajouter</button>
                  </div>
                  <div className="space-y-2">
                    {clients.map(c => (
                      <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                        <div>
                          <span className="font-semibold">{c.nom}</span>
                          <span className="ml-3 text-xs text-amber-600">🏦 Initial: {fmt(c.opening_balance || 0)} DHS</span>
                          <span className="ml-2 text-xs text-orange-600">Solde: {fmt(c.solde)} DHS</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => editOpeningBalance(c)} className="text-xs px-2 py-1 rounded-lg border font-semibold" style={{background:'#fef3c7',color:'#92400e',borderColor:'#fde68a'}}>🏦 Solde initial</button>
                          <button onClick={() => deleteClient(c.id)} className="btn-danger text-xs">✕</button>
                        </div>
                      </div>
                    ))}
                    {clients.length === 0 && <div className="text-gray-400 text-sm">Aucun client grignon</div>}
                  </div>
                </div>

                {/* Fournisseurs */}
                <div className="card">
                  <h3 className="font-bold text-gray-900 mb-4">🏭 Fournisseurs Grignon</h3>
                  <div className="flex gap-2 mb-4">
                    <input
                      className="input flex-1"
                      placeholder="Nom du fournisseur grignon"
                      value={newFournNom}
                      onChange={e => setNewFournNom(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addFournisseur() }}
                    />
                    <button onClick={addFournisseur} className="btn-primary">+ Ajouter</button>
                  </div>
                  <div className="space-y-2">
                    {fournisseurs.map(f => (
                      <div key={f.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                        <span className="font-semibold">{f.nom}</span>
                        <button onClick={() => deleteFournisseur(f.id)} className="btn-danger text-xs">✕</button>
                      </div>
                    ))}
                    {fournisseurs.length === 0 && <div className="text-gray-400 text-sm">Aucun fournisseur grignon</div>}
                  </div>
                </div>

                {/* Camions */}
                <div className="card">
                  <h3 className="font-bold text-gray-900 mb-4">🚛 Camions Grignon</h3>
                  <div className="flex gap-2 mb-4 flex-wrap">
                    <input
                      className="input"
                      placeholder="Plaque"
                      value={newCamionPlaque}
                      onChange={e => setNewCamionPlaque(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addCamion() }}
                    />
                    <input
                      className="input"
                      placeholder="Chauffeur (optionnel)"
                      value={newCamionChauffeur}
                      onChange={e => setNewCamionChauffeur(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addCamion() }}
                    />
                    <button onClick={addCamion} className="btn-primary">+ Ajouter</button>
                  </div>
                  <div className="space-y-2">
                    {camions.map(c => (
                      <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                        <div>
                          <span className="font-semibold">{c.plaque}</span>
                          {c.chauffeur && <span className="ml-2 text-xs text-gray-500">— {c.chauffeur}</span>}
                        </div>
                        <button onClick={() => deleteCamion(c.id)} className="btn-danger text-xs">✕</button>
                      </div>
                    ))}
                    {camions.length === 0 && <div className="text-gray-400 text-sm">Aucun camion grignon</div>}
                  </div>
                </div>
              </div>
            )
          )}
        </>
      )}

      {/* ── GRIGNON EDIT MODAL ── */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{background:'rgba(0,0,0,0.5)'}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto" style={{maxHeight:'90vh'}}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">✏️ Modifier l'opération #{editRow.id}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{editRow.client_nom || '—'} · {fmtDate(editRow.date)}</p>
              </div>
              <button onClick={() => setEditRow(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={saveEditGrignon} className="p-5 space-y-3">

              {/* Date */}
              <div>
                <label className="label">Date</label>
                <input type="date" className="input" required
                  value={editForm.date}
                  onChange={e => setEditForm({...editForm, date: e.target.value})} />
              </div>

              {/* Client / Fournisseur */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Client</label>
                  <select className="input" value={editForm.client_id} onChange={e => setEditForm({...editForm, client_id: e.target.value})}>
                    <option value="">— Sans client —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Fournisseur</label>
                  <select className="input" value={editForm.fournisseur_id} onChange={e => setEditForm({...editForm, fournisseur_id: e.target.value})}>
                    <option value="">— Sans fournisseur —</option>
                    {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select>
                </div>
              </div>

              {/* Camion */}
              <div>
                <label className="label">Camion</label>
                <select className="input" value={editForm.camion_id} onChange={e => setEditForm({...editForm, camion_id: e.target.value})}>
                  <option value="">— Sans camion —</option>
                  {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}{c.chauffeur ? ` — ${c.chauffeur}` : ''}</option>)}
                </select>
              </div>

              {/* Qté / Prix */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Quantité (kg)</label>
                  <input type="number" step="0.01" className="input" required
                    value={editForm.qte}
                    onChange={e => setEditForm({...editForm, qte: e.target.value})} />
                </div>
                <div>
                  <label className="label">Prix achat/kg</label>
                  <input type="number" step="0.01" className="input"
                    value={editForm.prix_achat}
                    onChange={e => setEditForm({...editForm, prix_achat: e.target.value})} />
                </div>
                <div>
                  <label className="label">Prix vente/kg</label>
                  <input type="number" step="0.01" className="input"
                    value={editForm.prix_vente}
                    onChange={e => setEditForm({...editForm, prix_vente: e.target.value})} />
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="label">Note</label>
                <input type="text" className="input" placeholder="optionnel"
                  value={editForm.note}
                  onChange={e => setEditForm({...editForm, note: e.target.value})} />
              </div>

              {/* Preview */}
              {editForm.qte && (editForm.prix_vente || editForm.prix_achat) && (() => {
                const q  = parseFloat(editForm.qte) || 0
                const pv = parseFloat(editForm.prix_vente) || 0
                const pa = parseFloat(editForm.prix_achat) || 0
                return (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div><div className="text-amber-500">Total achat</div><div className="font-bold text-amber-700">{fmt(Math.round(q*pa))} DHS</div></div>
                    <div><div className="text-blue-400">Total vente</div><div className="font-bold text-blue-700">{fmt(Math.round(q*pv))} DHS</div></div>
                    <div><div className="text-green-400">Marge</div><div className="font-bold text-green-700">{fmt(Math.round(q*(pv-pa)))} DHS</div></div>
                  </div>
                )
              })()}

              {editMsg && (
                <div className={`text-sm font-semibold text-center p-2 rounded-lg ${editMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {editMsg}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={editSaving} className="btn-primary flex-1 justify-center">
                  {editSaving ? 'Enregistrement...' : '✓ Enregistrer'}
                </button>
                <button type="button" onClick={() => setEditRow(null)} className="btn-secondary">Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </Layout>
  )
}
