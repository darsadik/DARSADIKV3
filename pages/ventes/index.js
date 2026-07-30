import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import * as XLSX from 'xlsx'
import { fmt, fmtD, fmtDate, today, startOfMonth, useIsMobile, openPrintWindow } from '../../lib/utils'
import { useVoyageTransactionEdit } from '../../lib/hooks/useVoyageTransactionEdit'
import EditTransactionModal from '../../components/voyage/EditTransactionModal'
import { resolveLivraisonByVenteId } from '../../lib/services/voyage/resolveSource'
import { delLiv as dbDelLiv } from '../../lib/services/voyage/livraisons'

const ADMIN = 'abdelhafidbaadi@gmail.com'

export default function Ventes() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const admin = user?.email === ADMIN
  const [editRow, setEditRow] = useState(null)   // vente being edited
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg, setEditMsg] = useState('')
  const [ventes, setVentes] = useState([])
  const [clients, setClients] = useState([])
  const [camions, setCamions] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [typeBriques, setTypeBriques] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [achats,   setAchats]   = useState([])
  const [view, setView] = useState('client')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ date: today(), date_fournisseur: today(), client_id: '', camion_id: '', fournisseur_id: '', type_brique_id: '', qte: '', prix_vente: '', prix_achat: '', bon: '', note: '', retour_client: '', retour_montant: '', retour_paye: '', retour_note: '' })
  const [showRetour, setShowRetour] = useState(false)
  const [mdoForm, setMdoForm] = useState({ date: today(), client_id: '', camion_id: '', montant: '', type: 'mdo', description: '', note: '' })
  const [mdoSaving, setMdoSaving] = useState(false)
  const [mdoMsg, setMdoMsg] = useState('')
  const [remiseForm, setRemiseForm] = useState({ date: today(), client_id: '', montant: '', note: '' })
  const [remiseSaving, setRemiseSaving] = useState(false)
  const [remiseMsg, setRemiseMsg] = useState('')
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo, setFilterTo] = useState(today())
  const [filterClient, setFilterClient] = useState('')
  const [filterFourn, setFilterFourn] = useState('')
  const [filterCamion, setFilterCamion] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [fournTab, setFournTab] = useState('produit')
  const [verifiedVentes, setVerifiedVentes] = useState(new Set())
  const toggleVerifyVente = id => setVerifiedVentes(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: v }, { data: cl }, { data: ca }, { data: fo }, { data: ty }, { data: ach }] = await Promise.all([
      supabase.from('ventes').select('*').not('client_id','is',null).order('date', { ascending: true }),
      supabase.from('clients').select('*').order('nom'),
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('fournisseurs').select('*').order('nom'),
      supabase.from('type_briques').select('*').order('nom'),
      supabase.from('achats').select('*').order('date', { ascending: true }),
    ])
    setVentes(v || []); setClients(cl || []); setCamions(ca || [])
    setFournisseurs(fo || []); setTypeBriques(ty || [])
    setAchats(ach || [])
    setLoading(false)
  }

  const filtered = ventes.filter(v => {
    const vDate = v.date  // client delivery date
    if (filterFrom && vDate < filterFrom) return false
    if (filterTo && vDate > filterTo) return false
    if (filterClient && v.client_id !== parseInt(filterClient)) return false
    if (filterFourn && v.fournisseur !== filterFourn) return false
    if (filterCamion && v.camion_plaque !== filterCamion) return false
    return true
  })

  const tv = Math.round((parseFloat(form.qte)||0) * (parseFloat(form.prix_vente)||0) * 100) / 100
  const ta = Math.round((parseFloat(form.qte)||0) * (parseFloat(form.prix_achat)||0) * 100) / 100
  const mg = Math.round(tv - ta, 2)

  async function saveVente(e) {
    e.preventDefault()
    if (!admin) return
    setSaving(true)
    try {
      const clientId = parseInt(form.client_id)
      const ca = camions.find(c => c.id === parseInt(form.camion_id))
      const fo = fournisseurs.find(f => f.id === parseInt(form.fournisseur_id))
      const ty = typeBriques.find(t => t.id === parseInt(form.type_brique_id))
      const cl = clients.find(c => c.id === clientId)
      const retour_montant = parseFloat(form.retour_montant) || 0
      const retour_paye = parseFloat(form.retour_paye) || 0
      const retour_restant = retour_montant > 0 ? Math.round((retour_montant - retour_paye) * 100) / 100 : 0
      const { error } = await supabase.from('ventes').insert({
        date: form.date,
        date_fournisseur: form.date_fournisseur || form.date,
        client_id: clientId, client_nom: cl?.nom || '',
        camion_id: parseInt(form.camion_id), camion_plaque: ca?.plaque || '', chauffeur: ca?.chauffeur || '',
        fournisseur_id: parseInt(form.fournisseur_id) || null, fournisseur: fo?.nom || '',
        type_brique_id: parseInt(form.type_brique_id) || null, type_brique: ty?.nom || '',
        qte: parseFloat(form.qte), prix_vente: parseFloat(form.prix_vente),
        prix_achat: parseFloat(form.prix_achat) || 0,
        total_vente: tv, total_achat: ta, marge: mg,
        bon: form.bon, note: form.note,
        retour_client: form.retour_client || null,
        retour_montant: retour_montant || null,
        retour_paye: retour_paye || null,
        retour_restant: retour_restant || null,
        retour_note: form.retour_note || null,
        voyage_id: null, // explicitly null — direct entry, not from voyage
      })
      if (error) throw error
      // Fresh-read before solde update
      const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', clientId).single()
      if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde || 0) + tv }).eq('id', clientId)
      setShowForm(false)
      setForm({ date: today(), date_fournisseur: today(), client_id: '', camion_id: '', fournisseur_id: '', type_brique_id: '', qte: '', prix_vente: '', prix_achat: '', bon: '', note: '', retour_client: '', retour_montant: '', retour_paye: '', retour_note: '' })
      setShowRetour(false)
      loadAll()
    } catch (err) {
      alert('Erreur enregistrement vente: ' + err.message)
    } finally { setSaving(false) }
  }

  function openEdit(v) {
    setEditRow(v)
    setEditForm({
      date: v.date || '',
      date_fournisseur: v.date_fournisseur || v.date || '',
      qte: v.qte || '',
      prix_vente: v.prix_vente || '',
      prix_achat: v.prix_achat || '',
      bon: v.bon || '',
      note: v.note || '',
      retour_client: v.retour_client || '',
      retour_montant: v.retour_montant || '',
      retour_paye: v.retour_paye || '',
      retour_note: v.retour_note || '',
    })
    setEditMsg('')
  }

  async function saveEdit(e) {
    e.preventDefault()
    if (!editRow) return
    setEditSaving(true)
    const qte = parseFloat(editForm.qte) || 0
    const pv  = parseFloat(editForm.prix_vente) || 0
    const pa  = parseFloat(editForm.prix_achat) || 0
    const total_vente = Math.round(qte * pv * 100) / 100
    const total_achat = Math.round(qte * pa * 100) / 100
    const marge = Math.round((total_vente - total_achat) * 100) / 100

    const retour_montant = parseFloat(editForm.retour_montant) || 0
    const retour_paye    = parseFloat(editForm.retour_paye) || 0
    const retour_restant = retour_montant > 0 ? Math.round((retour_montant - retour_paye) * 100) / 100 : 0

    const { error } = await supabase.from('ventes').update({
      date: editForm.date,
      date_fournisseur: editForm.date_fournisseur || editForm.date,
      qte, prix_vente: pv, prix_achat: pa,
      total_vente, total_achat, marge,
      bon: editForm.bon || null,
      note: editForm.note || null,
      retour_client: editForm.retour_client || null,
      retour_montant: retour_montant || null,
      retour_paye: retour_paye || null,
      retour_restant: retour_restant || null,
      retour_note: editForm.retour_note || null,
    }).eq('id', editRow.id)

    // Adjust client solde with fresh-read
    if (!error && editRow.client_id) {
      const diff = total_vente - (editRow.total_vente || 0)
      if (diff !== 0) {
        const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', editRow.client_id).single()
        if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde || 0) + diff }).eq('id', editRow.client_id)
      }
    }

    setEditSaving(false)
    if (error) {
      setEditMsg('❌ Erreur: ' + error.message)
    } else {
      setEditMsg('✅ Modifications enregistrées !')
      setTimeout(() => { setEditRow(null); setEditMsg('') }, 1000)
      loadAll()
    }
  }

  async function deleteVente(v) {
    if (!admin) return
    if (v.voyage_id) {
      if (!confirm('Cette vente est liée à un voyage. Si la livraison a déjà été supprimée du voyage, vous pouvez continuer. Supprimer quand même ?')) return
    } else {
      if (!confirm('Supprimer cette vente ?')) return
    }
    try {
      const { error } = await supabase.from('ventes').delete().eq('id', v.id)
      if (error) throw error
      const amount = ['mdo','gasoil','autre'].includes(v.type_entree) ? (v.montant_mdo || 0)
                   : v.type_entree === 'remise' ? -(v.montant_mdo || 0)
                   : (v.total_vente || 0)
      if (v.client_id && amount !== 0) {
        const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', v.client_id).single()
        if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde || 0) - amount }).eq('id', v.client_id)
      }
      loadAll()
    } catch (err) {
      alert('Erreur suppression vente: ' + err.message)
    }
  }

  // ── VOYAGE-LINKED VENTES: edit/delete through the voyage, not this table ──
  // Voyage is the single source of truth (see CLAUDE.md) — a `ventes` row with
  // voyage_id set is a mirror of a voyage_livraisons row. Editing/deleting it
  // directly here (the old openEdit/saveEdit/deleteVente path above) would
  // desync it from the voyage. When resolvable, route through the same shared
  // modal + updateLiv/delLiv used everywhere else; only fall back to the local
  // editor for rows that aren't voyage-linked (voyage_id === null, e.g. the
  // manual "Nouvelle vente" form below) or that predate this link (rare).
  const {
    editRow: voyEditRow, editForm: voyEditForm, setEditForm: setVoyEditForm,
    editSaving: voyEditSaving, editError: voyEditError,
    openEdit: openVoyEdit, closeEdit: closeVoyEdit, save: saveVoyEdit,
  } = useVoyageTransactionEdit({ onSaved: loadAll })
  useEffect(() => { if (voyEditError) alert(voyEditError) }, [voyEditError])

  async function editVente(v) {
    if (v.voyage_id) {
      const resolved = await resolveLivraisonByVenteId(v.id)
      if (resolved) { openVoyEdit('liv', resolved); return }
    }
    openEdit(v)
  }

  async function deleteVenteSmart(v) {
    if (v.voyage_id) {
      const resolved = await resolveLivraisonByVenteId(v.id)
      if (resolved) {
        if (!admin) return
        if (!confirm('Supprimer cette livraison (et sa vente associée) ?')) return
        try {
          await dbDelLiv(resolved)
          loadAll()
        } catch (err) { alert('Erreur suppression livraison: ' + err.message) }
        return
      }
    }
    deleteVente(v)
  }

  async function saveRemise(e) {
    e.preventDefault()
    if (!admin) return
    const montant = parseFloat(remiseForm.montant) || 0
    if (!remiseForm.client_id || montant <= 0) { setRemiseMsg('❌ Client et montant requis'); return }
    setRemiseSaving(true)
    const cl = clients.find(c => c.id === parseInt(remiseForm.client_id))
    const { error } = await supabase.from('ventes').insert({
      date: remiseForm.date, type_entree: 'remise',
      client_id: parseInt(remiseForm.client_id), client_nom: cl?.nom || '',
      montant_mdo: montant, description_mdo: remiseForm.note || 'Remise accordée',
      note: remiseForm.note || null,
      total_vente: -montant, total_achat: 0, marge: -montant,
      qte: null, prix_vente: null, prix_achat: null,
      camion_id: null, camion_plaque: '', chauffeur: '',
    })
    if (!error && cl?.id) {
      const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', cl.id).single()
      if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde||0) - montant }).eq('id', cl.id)
    }
    setRemiseSaving(false)
    if (error) { setRemiseMsg('❌ ' + error.message) }
    else {
      setRemiseMsg('✅ Remise enregistrée !')
      setRemiseForm({ date: today(), client_id: '', montant: '', note: '' })
      setTimeout(() => setRemiseMsg(''), 2500)
      loadAll()
    }
  }

  async function saveMdo(e) {
    e.preventDefault()
    if (!admin) return
    const montant = parseFloat(mdoForm.montant) || 0
    if (!mdoForm.client_id || montant <= 0) { setMdoMsg('❌ Client et montant requis'); return }
    setMdoSaving(true)
    const cl = clients.find(c => c.id === parseInt(mdoForm.client_id))
    const ca = camions.find(c => c.id === parseInt(mdoForm.camion_id))
    const { error } = await supabase.from('ventes').insert({
      date: mdoForm.date,
      type_entree: mdoForm.type,
      client_id: parseInt(mdoForm.client_id),
      client_nom: cl?.nom || '',
      camion_id: mdoForm.camion_id ? parseInt(mdoForm.camion_id) : null,
      camion_plaque: ca?.plaque || '',
      chauffeur: ca?.chauffeur || '',
      montant_mdo: montant,
      description_mdo: mdoForm.description || null,
      note: mdoForm.note || null,
      // brique fields null
      qte: null, prix_vente: null, prix_achat: null,
      total_vente: montant, total_achat: 0, marge: montant,
    })
    if (!error && cl?.id) {
      const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', cl.id).single()
      if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde || 0) + montant }).eq('id', cl.id)
    }
    setMdoSaving(false)
    if (error) {
      setMdoMsg('❌ ' + error.message)
    } else {
      setMdoMsg(mdoForm.type === 'gasoil' ? '✅ Frais gasoil enregistré !' : mdoForm.type === 'autre' ? '✅ Charge enregistrée !' : '✅ Main d\'œuvre enregistrée !')
      setMdoForm({ date: today(), client_id: '', camion_id: '', montant: '', type: 'mdo', description: '', note: '' })
      setTimeout(() => setMdoMsg(''), 2500)
      loadAll()
    }
  }


  function exportCSV() {
    const rows = [
      ['Date', 'Client', 'Produit', 'Camion', 'Fournisseur', 'Quantite', 'Prix/u', 'Total DHS', 'BON', 'Note'],
      ...filtered.map(v => [
        fmtDate(v.date), v.client_nom, v.type_brique || '', v.camion_plaque || '',
        v.fournisseur || '', v.qte || '', v.prix_vente || '', v.total_vente || 0,
        v.bon || '', v.note || '',
      ]),
    ]
    const csv = rows.map(r => r.map(cell => '"'+String(cell).replace(/"/g,'""')+'"').join(',')).join('\n')
    const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'})
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'Ventes-'+filterFrom+'-'+filterTo+'.csv'; a.click()
  }

  function printClientView() {
    const tQ = filtered.reduce((s,v)=>s+(v.qte||0),0)
    const tV = filtered.reduce((s,v)=>s+(v.total_vente||0),0)
    const tR = filtered.reduce((s,v)=>s+(v.retour_montant||0),0)
    const tRR = filtered.reduce((s,v)=>s+(v.retour_restant||0),0)
    const hasRetour = filtered.some(v => v.retour_client)
    const retourRows = hasRetour ? filtered.filter(v=>v.retour_client).map(v=>`<tr><td>${fmtDate(v.date)}</td><td><b>${v.client_nom}</b></td><td>${v.camion_plaque}</td><td>${v.retour_client}</td><td style="text-align:right">${fmt(v.retour_montant)}</td><td style="text-align:right">${fmt(v.retour_paye||0)}</td><td style="text-align:right" style="color:${v.retour_restant>0?'#f97316':'#16a34a'}">${v.retour_restant>0?fmt(v.retour_restant)+' ⚠':'Payé ✓'}</td></tr>`).join('') : ''
    const _now = new Date()
    const printDateTime = _now.toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' à ' + String(_now.getHours()).padStart(2,'0') + ':' + String(_now.getMinutes()).padStart(2,'0')
    openPrintWindow(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Ventes — DAR SADIK</title>
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
  .kpi.bl{border-left-color:#1d4ed8}.kpi.bl .val{color:#1d4ed8}
  .kpi.gn{border-left-color:#16a34a}.kpi.gn .val{color:#16a34a}
  .kpi.am{border-left-color:#b45309}.kpi.am .val{color:#b45309}
  .sec{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#475569;border-bottom:2px solid #1a3a6b;padding-bottom:4px;margin:16px 0 8px}
  table{width:100%;border-collapse:collapse}
  thead th{background:#334155 !important;color:#fff !important;padding:8px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;text-align:left}
  thead th.r{text-align:right}
  tbody td{padding:7px 10px;font-size:10px;color:#1e293b;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  tbody td.r{text-align:right;font-family:monospace}
  tbody td.m{color:#94a3b8;font-size:10px}
  tbody tr:nth-child(even) td{background:#f8fafc !important}
  .num{font-weight:700;font-size:11px}
  .tag{background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:3px;padding:1px 6px;font-size:9px;font-weight:700}
  tfoot td{background:#1e293b !important;color:#fff !important;padding:8px 10px;font-weight:700;font-size:11px;border:none !important}
  tfoot td.r{font-size:12px}
  .foot{margin-top:18px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
  @media print{.btn-p,.btn-d{display:none !important}}
  @page{size:A4;margin:8mm 10mm}
</style></head><body>
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
<div class="ttl">Ventes — ${fmtDate(filterFrom)} → ${fmtDate(filterTo)}</div>
<div class="sub">${filtered.length} ventes &nbsp;·&nbsp; Total Qté : ${fmt(tQ)} briques &nbsp;·&nbsp; Total : ${fmt(tV)} DHS</div>
<div class="kpi-g">
  <div class="kpi bl"><div class="lbl">Total quantité</div><div class="val">${fmt(tQ)}</div></div>
  <div class="kpi gn"><div class="lbl">Total ventes</div><div class="val">${fmt(tV)} DHS</div></div>
  <div class="kpi am"><div class="lbl">Retours transport</div><div class="val">${fmt(tR)} DHS</div></div>
</div>
<div class="sec">Détail des ventes (${filtered.length})</div>
<table><thead><tr>
  <th>Date</th><th>Client</th><th>Produit</th><th>Transport</th>
  <th class="r">Qté</th><th class="r">Prix/u</th><th class="r">Total DHS</th><th>Note</th>
</tr></thead>
<tbody>${filtered.map(v=>`<tr>
  <td>${fmtDate(v.date)}</td><td><b>${v.client_nom}</b></td>
  <td><span class="tag">${v.type_brique||'—'}</span></td>
  <td>${v.camion_plaque||'—'}</td>
  <td class="r">${fmt(v.qte)}</td>
  <td class="r">${fmtD(v.prix_vente)}</td>
  <td class="r num">${fmt(v.total_vente)}</td>
  <td class="m">${v.note||'—'}</td>
</tr>`).join('')}</tbody>
<tfoot><tr>
  <td colspan="4">TOTAL (${filtered.length} ventes)</td>
  <td class="r">${fmt(tQ)}</td><td></td>
  <td class="r">${fmt(tV)} DHS</td><td></td>
</tr></tfoot>
</table>
${hasRetour ? `<div class="sec">Retours Transport</div>
<table><thead><tr>
  <th>Date</th><th>Client vente</th><th>Camion</th><th>Retour client</th>
  <th class="r">Montant</th><th class="r">Payé</th><th class="r">Restant</th>
</tr></thead>
<tbody>${retourRows}</tbody>
<tfoot><tr>
  <td colspan="4">TOTAL RETOURS</td>
  <td class="r">${fmt(tR)} DHS</td><td></td>
  <td class="r">${fmt(tRR)} DHS</td>
</tr></tfoot>
</table>` : ''}
<div class="foot"><span>DAR SADIK — دار صديق — Selouane, Nador</span><span>Généré le ${printDateTime}</span></div>
</div></body></html>`)
  }

  function exportClientCSV() {
    let csv = `Date,Client,Produit,Transport,Quantité,Prix unitaire DHS,Total DHS\n`
    filtered.forEach(v => { csv += `${fmtDate(v.date)},${v.client_nom},${v.type_brique||''},${v.camion_plaque},${v.qte||0},${v.prix_vente||0},${v.total_vente||0}\n` })
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `Ventes-${filterFrom}-${filterTo}.csv`; a.click()
  }

  function exportXLSX() {
    const detailRows = filtered.map(v => ({
      'Date':           fmtDate(v.date),
      'Client':         v.client_nom || '',
      'Type':           v.type_entree === 'mdo' ? "Main d'oeuvre"
                      : v.type_entree === 'gasoil' ? 'Frais Gasoil'
                      : v.type_entree === 'autre' ? 'Autre'
                      : v.type_entree === 'remise' ? 'Remise'
                      : 'Vente brique',
      'Produit':        v.type_brique || '',
      'Camion':         v.camion_plaque || '',
      'Fournisseur':    v.fournisseur || '',
      'Quantite':       v.qte || 0,
      'Prix/u DHS':     v.prix_vente || 0,
      'Total DHS':      v.total_vente || 0,
      'BON':            v.bon || '',
      'Note':           v.note || '',
      'Retour client':  v.retour_client || '',
      'Montant retour': v.retour_montant || 0,
      'Retour paye':    v.retour_paye || 0,
      'Retour restant': v.retour_restant || 0,
    }))

    const tQ  = filtered.reduce((s, v) => s + (v.qte || 0), 0)
    const tV  = filtered.reduce((s, v) => s + (v.total_vente || 0), 0)
    const tR  = filtered.reduce((s, v) => s + (v.retour_montant || 0), 0)
    const tRR = filtered.reduce((s, v) => s + (v.retour_restant || 0), 0)
    detailRows.push({
      'Date': 'TOTAL', 'Client': `${filtered.length} ligne(s)`,
      'Type': '', 'Produit': '', 'Camion': '', 'Fournisseur': '',
      'Quantite': tQ, 'Prix/u DHS': '', 'Total DHS': tV,
      'BON': '', 'Note': '', 'Retour client': '',
      'Montant retour': tR, 'Retour paye': '', 'Retour restant': tRR,
    })

    const byClient = {}
    filtered.forEach(v => {
      const nom = v.client_nom || 'Inconnu'
      if (!byClient[nom]) byClient[nom] = { qte: 0, total: 0, nb: 0 }
      byClient[nom].qte   += v.qte || 0
      byClient[nom].total += v.total_vente || 0
      byClient[nom].nb    += 1
    })
    const clientRows = Object.entries(byClient)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([nom, d]) => ({ 'Client': nom, 'Nb ventes': d.nb, 'Total briques': d.qte, 'Total DHS': d.total }))

    const wb  = XLSX.utils.book_new()
    const ws1 = XLSX.utils.json_to_sheet(detailRows)
    const ws2 = XLSX.utils.json_to_sheet(clientRows)
    ws1['!cols'] = [{wch:12},{wch:20},{wch:14},{wch:14},{wch:12},{wch:16},{wch:10},{wch:10},{wch:12},{wch:10},{wch:20},{wch:18},{wch:14},{wch:12},{wch:14}]
    ws2['!cols'] = [{wch:22},{wch:10},{wch:16},{wch:12}]
    XLSX.utils.book_append_sheet(wb, ws1, 'Ventes')
    XLSX.utils.book_append_sheet(wb, ws2, 'Recap clients')
    XLSX.writeFile(wb, `Ventes-${filterFrom}-${filterTo}.xlsx`)
  }

  const uniqueCamions = [...new Set(ventes.map(v=>v.camion_plaque).filter(Boolean))]
  const uniqueFourns = [...new Set(allAchats.map(v=>v.fournisseur).filter(Boolean))].sort()

  const tabs = [
    { key: 'client',      label: '👥 Clients' },
    { key: 'fournisseur', label: '🏭 Fournisseur' },
    { key: 'camion',      label: '🚛 Camions' },
    ...(admin ? [
      { key: 'saisie', label: '➕ Saisie' },
      { key: 'mdo',    label: '🔧 MDO / Gasoil / Autre' },
      { key: 'remise',  label: '🎁 Remises' },
    ] : []),
  ]

  function VenteCard({ v }) {
    const isMdo    = ['mdo','gasoil','autre'].includes(v.type_entree)
    const isRemise = v.type_entree === 'remise'
    const isVerified = verifiedVentes.has(v.id)
    return (
      <div className="mobile-row-card"
        onClick={e => { if (e.target.closest('button') || e.target.closest('select')) return; toggleVerifyVente(v.id) }}
        style={{
          cursor: 'pointer',
          ...(isVerified ? {background:'#dcfce7', borderLeft:'3px solid #16a34a'}
            : isMdo ? {borderLeft:'3px solid #f59e0b'}
            : isRemise ? {borderLeft:'3px solid #22c55e'} : {})
        }}>
        <div className="card-header">
          <div>
            <div className="card-title">{v.client_nom}{isVerified && <span style={{color:'#16a34a',fontWeight:900,marginLeft:6,fontSize:14}}>✓</span>}</div>
            <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>{fmtDate(v.date)}</div>
          </div>
          <div className="card-amount" style={isRemise ? {color:'#15803d'} : {}}>
            {isRemise ? `− ${fmt(v.montant_mdo)} DHS` : `${fmt(v.total_vente)} DHS`}
          </div>
        </div>
        <div className="card-meta">
          {isMdo    && <span style={{color:'#92400e',fontWeight:700,fontSize:12}}>{v.type_entree==='gasoil'?'⛽ Frais Gasoil':v.type_entree==='autre'?'📌 Autre':'🔧 Main d\'œuvre'}</span>}
          {isRemise && <span style={{background:'#dcfce7',color:'#15803d',fontWeight:700,padding:'2px 8px',borderRadius:999,fontSize:11}}>🎁 Remise</span>}
          {!isMdo && !isRemise && v.type_brique && <span>📦 {v.type_brique}</span>}
          {v.camion_plaque && <span>🚛 {v.camion_plaque}</span>}
          {!isMdo && !isRemise && <span>📏 {fmt(v.qte)} briques</span>}
          {(isMdo || isRemise) && v.description_mdo && <span style={isRemise ? {color:'#15803d'} : {color:'#92400e'}}>{v.description_mdo}</span>}
          {v.bon && <span>📄 BON {v.bon}</span>}
        </div>
        {admin && (
          <div className="card-actions">
            <button onClick={() => editVente(v)} className="btn-secondary text-xs" style={{color:'#1a5fa8',borderColor:'#1a5fa8'}}>✏️ Modifier</button>
            <button onClick={() => deleteVenteSmart(v)} className="btn-danger">✕ Supprimer</button>
          </div>
        )}
        {v.retour_client && (
          <div className="mt-2 p-2 rounded-lg text-xs" style={{background:'#f0fdf4',border:'1px solid #bbf7d0'}}>
            <span className="font-bold text-green-700">↩️ Retour:</span> {v.retour_client}
            {v.retour_montant > 0 && <> — {fmt(v.retour_montant)} DHS {v.retour_restant > 0 ? <span className="text-orange-500">(reste {fmt(v.retour_restant)} DHS)</span> : <span className="text-green-600">(payé)</span>}</>}
          </div>
        )}
      </div>
    )
  }

  // ── CLIENT VIEW ──
  function ClientView() {
    const tQ = filtered.reduce((s,v)=>s+(v.qte||0),0)
    const tV = filtered.reduce((s,v)=>s+(v.total_vente||0),0)
    const tR = filtered.reduce((s,v)=>s+(v.retour_montant||0),0)
    const tRP = filtered.reduce((s,v)=>s+(v.retour_paye||0),0)
    const tRR = filtered.reduce((s,v)=>s+(v.retour_restant||0),0)
    const hasRetour = filtered.some(v => v.retour_client)

    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-bold text-gray-900">{filtered.length} ventes</h3>
          <div className="flex gap-2">
            <button onClick={printClientView} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ PDF</button>
            <button onClick={exportXLSX} className="btn-primary text-xs px-3 py-1.5" style={{background:'#16a34a'}}>📥 Excel</button>
          </div>
        </div>

        {isMobile ? (
          <>
            {filtered.length === 0 ? (
              <div className="text-center text-gray-400 py-10">Aucune vente</div>
            ) : (
              <div className="mobile-card-list">
                {filtered.slice().reverse().map(v => <VenteCard key={v.id} v={v} />)}
              </div>
            )}
            {filtered.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400">Total briques</div>
                  <div className="text-lg font-bold text-blue-600">{fmt(tQ)}</div>
                </div>
                <div className="bg-brand-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400">Total DHS</div>
                  <div className="text-lg font-bold text-brand-600">{fmt(tV)}</div>
                </div>
                {hasRetour && (
                  <>
                    <div className="bg-green-50 rounded-xl p-3 text-center col-span-1">
                      <div className="text-xs text-gray-400">↩️ Retour total</div>
                      <div className="text-lg font-bold text-green-600">{fmt(tR)} DHS</div>
                    </div>
                    <div className="bg-orange-50 rounded-xl p-3 text-center col-span-1">
                      <div className="text-xs text-gray-400">Retour restant</div>
                      <div className="text-lg font-bold text-orange-500">{fmt(tRR)} DHS</div>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Date</th><th className="th">Client</th><th className="th">Produit</th>
                  <th className="th">Transport</th><th className="th text-right">Quantité</th>
                  <th className="th text-right">Prix/u DHS</th><th className="th text-right">Total DHS</th>
                  <th className="th">Note</th>
                  {hasRetour && <th className="th text-right">↩️ Retour</th>}
                  {admin && <th className="th"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50"
                    onClick={e => { if (e.target.closest('button') || e.target.closest('select')) return; toggleVerifyVente(v.id) }}
                    style={{cursor:'pointer', ...(verifiedVentes.has(v.id) ? {background:'#dcfce7', boxShadow:'inset 3px 0 0 #16a34a'} : ['mdo','gasoil','autre'].includes(v.type_entree) ? {background:'#fefce8'} : v.type_entree==='remise' ? {background:'#f0fdf4'} : {})}}>
                    <td className="td text-gray-500">{verifiedVentes.has(v.id) && <span style={{color:'#16a34a',fontWeight:900,marginRight:4}}>✓</span>}{fmtDate(v.date)}</td>
                    <td className="td font-semibold">{v.client_nom}</td>
                    <td className="td">
                      {v.type_entree === 'mdo'
                        ? <span className="font-bold" style={{color:'#92400e'}}>🔧 Main d'œuvre</span>
                        : v.type_entree === 'gasoil'
                        ? <span className="font-bold" style={{color:'#92400e'}}>⛽ Frais Gasoil</span>
                        : v.type_entree === 'autre'
                        ? <span className="font-bold" style={{color:'#92400e'}}>📌 Autre</span>
                        : v.type_entree === 'remise'
                        ? <span className="font-bold" style={{color:'#15803d'}}>🎁 Remise</span>
                        : <span className="badge-gray">{v.type_brique||'—'}</span>
                      }
                    </td>
                    <td className="td text-gray-500">
                      {v.camion_plaque || '—'}
                      {v.voyage_id && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 border border-blue-200" title={`Lié au voyage #${v.voyage_id}`}>V#{v.voyage_id}</span>}
                    </td>
                    <td className="td text-right">{['mdo','gasoil','autre'].includes(v.type_entree) || v.type_entree === 'remise' ? <span className="text-gray-300">—</span> : fmt(v.qte)}</td>
                    <td className="td text-right">{['mdo','gasoil','autre'].includes(v.type_entree) || v.type_entree === 'remise' ? <span className="text-gray-300">—</span> : fmtD(v.prix_vente)}</td>
                    <td className="td text-right font-bold" style={v.type_entree==='remise' ? {color:'#15803d'} : {}}>
                      {v.type_entree === 'remise' ? `− ${fmt(v.montant_mdo)}` : fmt(v.total_vente)}
                    </td>
                    <td className="td text-xs text-gray-400" style={{maxWidth:'160px',wordBreak:'break-word',whiteSpace:'pre-wrap'}}>
                      {v.type_entree === 'mdo' && v.description_mdo
                        ? <span className="text-amber-700">{v.description_mdo}</span>
                        : v.type_entree === 'remise'
                        ? <span className="text-green-600">{v.description_mdo || v.note || '—'}</span>
                        : (v.note || '—')}
                    </td>
                    {hasRetour && (
                      <td className="td text-right text-xs">
                        {v.retour_client ? (
                          <div>
                            <div className="font-semibold text-green-700">{v.retour_client}</div>
                            <div className="text-gray-500">{fmt(v.retour_montant)} DHS</div>
                            {v.retour_restant > 0
                              ? <div className="text-orange-500">reste {fmt(v.retour_restant)}</div>
                              : <div className="text-green-600">✓ payé</div>}
                          </div>
                        ) : <span className="text-gray-200">—</span>}
                      </td>
                    )}
                    {admin && <td className="td">
                      <div className="flex gap-1">
                        <button onClick={() => editVente(v)} className="btn-secondary text-xs px-2" style={{color:'#1a5fa8',borderColor:'#1a5fa8'}}>✏️</button>
                        <button onClick={() => deleteVenteSmart(v)} className="btn-danger text-xs">✕</button>
                      </div>
                    </td>}
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={hasRetour ? 10 : 9} className="td text-center text-gray-400 py-8">Aucune vente</td></tr>}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr>
                    <td className="tfoot-td" colSpan={4}>TOTAL ({filtered.length})</td>
                    <td className="tfoot-td text-right">{fmt(tQ)}</td>
                    <td className="tfoot-td"></td>
                    <td className="tfoot-td text-right">{fmt(tV)} DHS</td>
                    <td className="tfoot-td"></td>
                    {hasRetour && <td className="tfoot-td text-right text-xs">{fmt(tR)} DHS <span className="text-orange-400">({fmt(tRR)} reste)</span></td>}
                    {admin && <td className="tfoot-td"></td>}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    )
  }

  // ── FOURNISSEUR VIEW ─────────────────────────────────────────
  const [fFilterFrom, setFFilterFrom] = useState(startOfMonth())
  const [fFilterTo,   setFFilterTo]   = useState(today())
  const [fFilterFourn, setFFilterFourn] = useState('')

  const fQuick = (label) => {
    const now = new Date()
    const pad = n => String(n).padStart(2,'0')
    if (label === 'today') {
      const d = today(); setFFilterFrom(d); setFFilterTo(d)
    } else if (label === 'week') {
      const day = now.getDay() || 7
      const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      setFFilterFrom(mon.toISOString().split('T')[0])
      setFFilterTo(sun.toISOString().split('T')[0])
    } else if (label === 'month') {
      setFFilterFrom(`${now.getFullYear()}-${pad(now.getMonth()+1)}-01`)
      setFFilterTo(today())
    } else if (label === 'year') {
      setFFilterFrom(`${now.getFullYear()}-01-01`)
      setFFilterTo(`${now.getFullYear()}-12-31`)
    }
  }

  // fFiltered = old ventes with fournisseur (legacy) + new achats table (voyage-based)
  const ventesAchats = ventes
    .filter(v => v.fournisseur_id || v.fournisseur)
    .map(v => ({
      ...v,
      fournisseur:      v.fournisseur || '',
      date_fournisseur: v.date_fournisseur || v.date,
      total_achat:      v.total_achat || 0,
      prix_achat:       v.prix_achat  || 0,
      _source: 'ventes',
    }))
  const newAchats = achats.map(v => ({
    ...v,
    fournisseur:      v.fournisseur_nom || '',
    date_fournisseur: v.date,
    total_achat:      v.total_achat || 0,
    prix_achat:       v.prix_achat  || 0,
    _source: 'achats',
  }))
  const allAchats = [...ventesAchats, ...newAchats]

  const fFiltered = allAchats.filter(v => {
    const fDate = v.date_fournisseur || v.date
    if (fFilterFrom  && fDate < fFilterFrom) return false
    if (fFilterTo    && fDate > fFilterTo)   return false
    if (fFilterFourn && v.fournisseur !== fFilterFourn) return false
    return true
  }).slice().sort((a,b) => (a.date_fournisseur||a.date).localeCompare(b.date_fournisseur||b.date))

  function buildFournisseurReportHTML() {
    const byFourn = {}
    fFiltered.forEach(v => {
      const f = v.fournisseur || 'Sans fournisseur'
      if (!byFourn[f]) byFourn[f] = { ops: [], byType: {} }
      byFourn[f].ops.push(v)
      const tb = v.type_brique || 'Sans type'
      if (!byFourn[f].byType[tb]) byFourn[f].byType[tb] = { qte: 0, total: 0 }
      byFourn[f].byType[tb].qte   += v.qte || 0
      byFourn[f].byType[tb].total += v.total_achat || 0
    })

    const css = `
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      body { font-family: Arial, sans-serif; padding: 28px; font-size: 12px; color: #1e293b !important; background: #fff !important; margin: 0; }
      h1 { font-size: 18px; margin: 0 0 4px; color: #1e293b !important; }
      h2 { font-size: 15px; color: #1e293b !important; }
      .sub, .subtitle { color: #555 !important; font-size: 11px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { background: #1a5fa8 !important; color: #ffffff !important; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #1e293b !important; }
      tr:nth-child(even) td { background: #f8fafc !important; }
      tfoot td { background: #f1f5f9 !important; font-weight: 800 !important; color: #1e293b !important; border-top: 2px solid #1a5fa8 !important; font-size: 12px; }
      b, strong { color: #1e293b !important; font-weight: 800; }
      .right, [style*="text-align:right"], [style*="text-align: right"] { text-align: right; }
      .header-block { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #1a5fa8; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; background: #e2e8f0 !important; color: #1e293b !important; border: 1px solid #cbd5e1; }
      .fourn-block { margin-bottom: 24px; page-break-inside: avoid; }
      .fourn-header { background: #1a5fa8 !important; color: #ffffff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .fourn-title { font-size: 13px; font-weight: 800; color: #ffffff !important; }
      .prod-block { margin-bottom: 12px; }
      .prod-header { background: #f1f5f9 !important; border-left: 4px solid #1a5fa8; padding: 5px 10px; font-weight: 700; font-size: 11px; color: #1e293b !important; margin-bottom: 4px; border-radius: 0 4px 4px 0; }
      .grand-tfoot td { background: #e2e8f0 !important; font-weight: 900 !important; color: #1e293b !important; border-top: 3px solid #1a5fa8 !important; font-size: 13px; }
      .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #888 !important; font-size: 10px; text-align: center; }
      .camion-header { background: #1a5fa8 !important; color: #ffffff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
      .info-box { background: #f8fafc !important; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
      .info-box b { display: block; margin-bottom: 4px; color: #1e293b !important; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
      .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 50px; }
      .sig { text-align: center; border-top: 1px solid #94a3b8; padding-top: 8px; color: #555 !important; font-size: 11px; }
      @media print {
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        button, .no-print { display: none !important; }
        body { padding: 0; }
      }
`

    const sections = Object.entries(byFourn).map(([fourn, data]) => {
      const totQte   = data.ops.reduce((s,v)=>s+(v.qte||0),0)
      const totAchat = data.ops.reduce((s,v)=>s+(v.total_achat||0),0)
      const rows = data.ops
        .sort((a,b)=>(a.date_fournisseur||a.date).localeCompare(b.date_fournisseur||b.date))
        .map(v => `<tr>
          <td>${fmtDate(v.date_fournisseur || v.date)}</td>
          <td>${v.type_brique||'—'}</td>
          <td style="text-align:right">${fmt(v.qte)}</td>
          <td style="text-align:right">${fmtD(v.prix_achat)}</td>
          <td style="text-align:right"><b>${fmt(v.total_achat)}</b></td>
        </tr>`).join('')
      const typeRows = Object.entries(data.byType)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([tb,td]) => `<tr style="background:#fffbeb !important">
          <td colspan="2" style="font-weight:800;color:#92400e">📦 ${tb}</td>
          <td style="text-align:right;font-weight:800;color:#1d4ed8">${fmt(td.qte)}</td>
          <td></td>
          <td style="text-align:right;font-weight:800;color:#b45309">${fmt(td.total)} DHS</td>
        </tr>`).join('')
      return `
        <div class="fourn-block">
          <div class="fourn-header">
            <div class="fourn-title">${fourn}</div>
            <div class="fourn-sub">${data.ops.length} op. &nbsp;·&nbsp; ${fmt(totQte)} briques &nbsp;·&nbsp; ${fmt(totAchat)} DHS</div>
          </div>
          <table>
            <thead><tr>
              <th>Date</th><th>Produit</th>
              <th class="r">Quantité</th>
              <th class="r">Prix achat/u DHS</th>
              <th class="r">Total DHS</th>
            </tr></thead>
            <tbody>
              ${rows}
              <tr><td colspan="5" style="padding:4px 10px;background:#fffbeb;font-weight:700;font-size:9px;color:#92400e;text-transform:uppercase;letter-spacing:.05em">Total par type de brique</td></tr>
              ${typeRows}
            </tbody>
            <tfoot><tr>
              <td colspan="2">TOTAL GÉNÉRAL (${data.ops.length} opérations)</td>
              <td class="r">${fmt(totQte)}</td>
              <td></td>
              <td class="r">${fmt(totAchat)} DHS</td>
            </tr></tfoot>
          </table>
        </div>`
    }).join('')

    const _now = new Date()
    const _dt = _now.toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' à ' + String(_now.getHours()).padStart(2,'0') + ':' + String(_now.getMinutes()).padStart(2,'0')
    return `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Rapport Fournisseurs — DAR SADIK</title>
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
  .sec{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#475569;border-bottom:2px solid #1a3a6b;padding-bottom:4px;margin:16px 0 8px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  thead th{background:#334155 !important;color:#fff !important;padding:8px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;text-align:left}
  thead th.r{text-align:right}
  tbody td{padding:7px 10px;font-size:10px;color:#1e293b;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  tbody td.r{text-align:right;font-family:monospace}
  tbody tr:nth-child(even) td{background:#f8fafc !important}
  .num{font-weight:700;font-size:11px}
  tfoot td{background:#1e293b !important;color:#fff !important;padding:8px 10px;font-weight:700;font-size:11px;border:none !important}
  tfoot td.r{font-size:12px}
  .fourn-block{margin-bottom:20px;page-break-inside:avoid}
  .fourn-header{background:#1a3a6b !important;color:#fff !important;border-radius:6px;padding:10px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
  .fourn-title{font-size:13px;font-weight:800;color:#fff !important}
  .fourn-sub{font-size:11px;color:#bfdbfe}
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
    <div style="font-size:9px;color:#93c5fd;margin-top:3px">Généré le ${_dt}</div>
  </div>
</div>
<div class="bdy">
<div class="ttl">Rapport Fournisseurs — Achats</div>
<div class="sub">Période : ${fmtDate(fFilterFrom)} → ${fmtDate(fFilterTo)} &nbsp;·&nbsp; ${Object.keys(byFourn).length} fournisseur(s)</div>
${sections || '<p style="color:#aaa;text-align:center;padding:40px">Aucune donnée pour cette période</p>'}
<div class="foot"><span>DAR SADIK — دار صديق — Selouane, Nador</span><span>Généré le ${_dt}</span></div>
</div></body></html>`
  }

  function printFournisseurReport() {
        openPrintWindow(buildFournisseurReportHTML())

  }

  async function downloadFournisseurPDF() {
    if (!window.html2pdf) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
        s.onload = resolve; s.onerror = reject
        document.head.appendChild(s)
      })
    }
    const tmp = document.createElement('div')
    tmp.innerHTML = buildFournisseurReportHTML()
    const body = tmp.querySelector('body')
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px;background:#fff'
    container.innerHTML = body ? body.innerHTML : tmp.innerHTML
    container.querySelectorAll('.print-btn').forEach(el => el.remove())
    document.body.appendChild(container)
    await window.html2pdf().set({
      margin: [10,10,10,10],
      filename: `Fournisseurs-${fFilterFrom}-${fFilterTo}.pdf`,
      image: { type:'jpeg', quality:0.98 },
      html2canvas: { scale:2, useCORS:true },
      jsPDF: { unit:'mm', format:'a4', orientation:'portrait' },
      pagebreak: { mode:['avoid-all','css'] },
    }).from(container).save()
    document.body.removeChild(container)
  }

  function FournisseurView() {

    // ── GROUP BY PRODUIT (type_brique) ──
    // For each product: per-day quantities + total briques + total price
    const byProduit = {}
    fFiltered.forEach(v => {
      const prod = v.type_brique || 'Sans produit'
      if (!byProduit[prod]) byProduit[prod] = { days: {}, totalQte: 0, totalAchat: 0, ops: [] }
      byProduit[prod].totalQte   += v.qte || 0
      byProduit[prod].totalAchat += v.total_achat || 0
      byProduit[prod].ops.push(v)
      const day = v.date_fournisseur || v.date
      if (!byProduit[prod].days[day]) byProduit[prod].days[day] = { qte: 0, total: 0, prix: v.prix_achat || 0 }
      byProduit[prod].days[day].qte   += v.qte || 0
      byProduit[prod].days[day].total += v.total_achat || 0
    })

    // Grand totals across all products
    const grandTotalQte   = Object.values(byProduit).reduce((s, p) => s + p.totalQte, 0)
    const grandTotalAchat = Object.values(byProduit).reduce((s, p) => s + p.totalAchat, 0)

    const byFourn = {}
    fFiltered.forEach(v => {
      const f = v.fournisseur || 'Sans fournisseur'
      if (!byFourn[f]) byFourn[f] = { ops: [], totQte: 0, totAchat: 0, byType: {} }
      byFourn[f].ops.push(v)
      byFourn[f].totQte   += v.qte || 0
      byFourn[f].totAchat += v.total_achat || 0
      // group by type_brique
      const tb = v.type_brique || 'Sans type'
      if (!byFourn[f].byType[tb]) byFourn[f].byType[tb] = { qte: 0, total: 0, days: {} }
      byFourn[f].byType[tb].qte   += v.qte || 0
      byFourn[f].byType[tb].total += v.total_achat || 0
      // track per day per type
      const day = v.date_fournisseur || v.date
      if (!byFourn[f].byType[tb].days[day]) byFourn[f].byType[tb].days[day] = { qte: 0, total: 0, prix: v.prix_achat || 0 }
      byFourn[f].byType[tb].days[day].qte   += v.qte || 0
      byFourn[f].byType[tb].days[day].total += v.total_achat || 0
    })

    const quickBtns = [
      { label: "Aujourd'hui", key: 'today' },
      { label: 'Cette semaine', key: 'week' },
      { label: 'Ce mois', key: 'month' },
      { label: 'Cette année', key: 'year' },
    ]

    // ── PRODUIT VIEW (inside FournisseurView) ──
    function ProduitView() {
      return (
        <div className="space-y-4">
          {/* Grand total bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="stat-card border border-blue-100 bg-blue-50 col-span-2">
              <div className="stat-label text-blue-600">Total toutes briques</div>
              <div className="stat-value text-blue-700">{fmt(grandTotalQte)} briques</div>
              <div className="stat-sub">{Object.keys(byProduit).length} produit(s)</div>
            </div>
            <div className="stat-card border border-amber-100 bg-amber-50 col-span-2">
              <div className="stat-label text-amber-600">Total achat global</div>
              <div className="stat-value text-amber-700">{fmt(grandTotalAchat)} DHS</div>
              <div className="stat-sub">Tous produits confondus</div>
            </div>
          </div>

          {/* One card per product */}
          {Object.entries(byProduit)
            .sort((a, b) => b[1].totalQte - a[1].totalQte)
            .map(([prod, data]) => (
            <div key={prod} className="card">
              {/* Product header */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2"
                style={{background:'#1a5fa8',borderRadius:10,padding:'10px 16px',color:'#fff',margin:'-16px -16px 16px -16px'}}>
                <div>
                  <div className="font-bold text-lg">📦 {prod}</div>
                  <div className="text-xs opacity-80">{data.ops.length} opération(s)</div>
                </div>
                <div className="flex gap-4 text-sm text-right">
                  <div>
                    <div className="opacity-70 text-xs">Total briques</div>
                    <div className="font-bold text-base">{fmt(data.totalQte)}</div>
                  </div>
                  <div>
                    <div className="opacity-70 text-xs">Total achat</div>
                    <div className="font-bold text-base">{fmt(data.totalAchat)} DHS</div>
                  </div>
                </div>
              </div>

              {/* Daily breakdown table */}
              <div className="text-xs font-bold text-gray-400 uppercase mb-2">📅 Quantités journalières</div>
              {isMobile ? (
                <div className="space-y-2">
                  {Object.entries(data.days)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([day, d]) => (
                    <div key={day} className="flex items-center justify-between py-2 border-b border-gray-50">
                      <div>
                        <div className="font-semibold text-gray-900">{fmtDate(day)}</div>
                        <div className="text-xs text-gray-400">{fmtD(d.prix)} DHS/u</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-blue-700">{fmt(d.qte)} briques</div>
                        <div className="text-xs text-amber-600">{fmt(d.total)} DHS</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="th">Date</th>
                        <th className="th">Produit</th>
                        <th className="th text-right">Quantité (briques)</th>
                        <th className="th text-right">Prix achat/u DHS</th>
                        <th className="th text-right">Total DHS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.days)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([day, d]) => (
                        <tr key={day} className="hover:bg-gray-50">
                          <td className="td font-semibold text-gray-700">{fmtDate(day)}</td>
                          <td className="td"><span className="badge-blue">{prod}</span></td>
                          <td className="td text-right font-bold text-blue-700">{fmt(d.qte)}</td>
                          <td className="td text-right text-gray-500">{fmtD(d.prix)}</td>
                          <td className="td text-right font-bold text-amber-700">{fmt(d.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="tfoot-td" colSpan={2}>TOTAL {prod} ({Object.keys(data.days).length} jour(s))</td>
                        <td className="tfoot-td text-right">{fmt(data.totalQte)}</td>
                        <td className="tfoot-td"></td>
                        <td className="tfoot-td text-right">{fmt(data.totalAchat)} DHS</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ))}

          {/* Grand total footer */}
          {Object.keys(byProduit).length > 1 && (
            <div className="card" style={{background:'#fefce8',border:'2px solid #fde68a'}}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="font-bold text-amber-900 text-lg">🧾 TOTAL GÉNÉRAL — Tous produits</div>
                <div className="flex gap-6">
                  <div className="text-center">
                    <div className="text-xs text-amber-600">Total briques</div>
                    <div className="text-2xl font-bold text-amber-800">{fmt(grandTotalQte)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-amber-600">Total achat DHS</div>
                    <div className="text-2xl font-bold text-amber-800">{fmt(grandTotalAchat)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {Object.keys(byProduit).length === 0 && (
            <div className="card text-center py-10 text-gray-400">Aucune donnée pour cette période</div>
          )}
        </div>
      )
    }

    return (
      <div className="space-y-4">

        {/* Fournisseur-specific filters */}
        <div className="card">
          <div className="flex flex-wrap gap-2 mb-3">
            {quickBtns.map(q => (
              <button key={q.key} onClick={() => fQuick(q.key)}
                className="px-3 py-1.5 rounded-lg border text-xs font-bold bg-white text-gray-600 border-gray-200 hover:bg-brand-50 hover:border-brand-300 transition-all">
                {q.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div><label className="label">Du</label>
              <input type="date" className="input" value={fFilterFrom} onChange={e=>setFFilterFrom(e.target.value)} />
            </div>
            <div><label className="label">Au</label>
              <input type="date" className="input" value={fFilterTo} onChange={e=>setFFilterTo(e.target.value)} />
            </div>
            <div><label className="label">Fournisseur</label>
              <select className="input" value={fFilterFourn} onChange={e=>setFFilterFourn(e.target.value)}>
                <option value="">Tous</option>
                {uniqueFourns.map(f=><option key={f}>{f}</option>)}
              </select>
            </div>
            <button onClick={()=>{setFFilterFrom(startOfMonth());setFFilterTo(today());setFFilterFourn('')}}
              className="btn-secondary text-xs">↺ Réinitialiser</button>
          </div>
          <div className="mt-2 text-xs text-gray-400">
            {fFiltered.length} opération(s) — {fmt(fFiltered.reduce((s,v)=>s+(v.qte||0),0))} briques — {fmt(fFiltered.reduce((s,v)=>s+(v.total_achat||0),0))} DHS achat
          </div>
        </div>

        {/* Print + PDF */}
        <div className="flex gap-2 justify-end">
          <button onClick={printFournisseurReport}
            className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>
            🖨️ Imprimer
          </button>
          <button onClick={downloadFournisseurPDF}
            className="btn-primary text-xs px-3 py-1.5" style={{background:'#dc2626'}}>
            📄 Télécharger PDF
          </button>
        </div>

        {/* Sub-tabs: Par produit / Par fournisseur */}
        <div className="flex gap-2">
          {[
            { key: 'produit',      label: '📦 Par produit' },
            { key: 'fournisseur',  label: '🏭 Par fournisseur' },
          ].map(t => (
            <button key={t.key} onClick={() => setFournTab(t.key)}
              className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all ${fournTab===t.key?'bg-brand-500 text-white border-brand-500':'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {fournTab === 'produit' && <ProduitView />}

        {fournTab === 'fournisseur' && <div className="space-y-4">
        {/* Per-fournisseur tables */}
        {Object.entries(byFourn).map(([fourn, data]) => (
          <div key={fourn} className="card">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="font-bold text-lg text-brand-700">🏭 {fourn}</h3>
              <div className="flex gap-4 text-sm">
                <span className="text-gray-500">Qté: <b className="text-gray-900">{fmt(data.totQte)} briques</b></span>
                <span className="text-gray-500">Achat: <b className="text-amber-700">{fmt(data.totAchat)} DHS</b></span>
              </div>
            </div>

            {isMobile ? (
              <div className="space-y-2">
                {data.ops.map(v => (
                  <div key={v.id} className="mobile-row-card">
                    <div className="card-header">
                      <div>
                        <div className="card-title">{v.type_brique||'—'}</div>
                        <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>{fmtDate(v.date)}</div>
                      </div>
                      <div className="card-amount">{fmt(v.total_achat)} DHS</div>
                    </div>
                    <div className="card-meta">
                      <span>📏 {fmt(v.qte)} briques</span>
                      <span>💲 {fmtD(v.prix_achat)} DHS/u</span>
                    </div>
                  </div>
                ))}
                {/* Type totals on mobile */}
                <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <div className="text-xs font-bold text-amber-700 uppercase mb-2">📊 Total par type</div>
                  {Object.entries(data.byType).sort().map(([tb, td]) => (
                    <div key={tb} className="flex justify-between py-1 border-b border-amber-100 last:border-0">
                      <span className="font-semibold text-sm text-gray-800">{tb}</span>
                      <span className="text-sm"><b className="text-blue-700">{fmt(td.qte)}</b> <span className="text-gray-400">briques</span> — <b className="text-amber-700">{fmt(td.total)} DHS</b></span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                {/* Daily detail table */}
                <table className="w-full mb-4">
                  <thead>
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Produit</th>
                      <th className="th text-right">Quantité</th>
                      <th className="th text-right">Prix achat/u DHS</th>
                      <th className="th text-right">Total DHS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ops
                      .sort((a,b) => (a.date_fournisseur||a.date).localeCompare(b.date_fournisseur||b.date))
                      .map(v => (
                      <tr key={v.id} className="hover:bg-gray-50">
                        <td className="td text-gray-500">{fmtDate(v.date_fournisseur || v.date)}</td>
                        <td className="td"><span className="badge-blue">{v.type_brique||'—'}</span></td>
                        <td className="td text-right">{fmt(v.qte)}</td>
                        <td className="td text-right text-gray-500">{fmtD(v.prix_achat)}</td>
                        <td className="td text-right font-bold text-amber-700">{fmt(v.total_achat)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="tfoot-td" colSpan={2}>TOTAL ({data.ops.length} opérations)</td>
                      <td className="tfoot-td text-right">{fmt(data.totQte)}</td>
                      <td className="tfoot-td"></td>
                      <td className="tfoot-td text-right">{fmt(data.totAchat)} DHS</td>
                    </tr>
                  </tfoot>
                </table>

                {/* ── TOTAL PAR TYPE DE BRIQUE ── */}
                <div className="mt-2 p-4 rounded-xl border border-amber-200" style={{background:'#fffbeb'}}>
                  <div className="text-xs font-bold text-amber-700 uppercase mb-3">📊 Récapitulatif par type de brique</div>
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="th" style={{background:'#92400e'}}>Type</th>
                        <th className="th text-right" style={{background:'#92400e'}}>Total briques</th>
                        <th className="th text-right" style={{background:'#92400e'}}>Total achat DHS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.byType)
                        .sort(([a],[b]) => a.localeCompare(b))
                        .map(([tb, td]) => (
                        <tr key={tb} className="hover:bg-amber-50">
                          <td className="td font-bold text-gray-800">📦 {tb}</td>
                          <td className="td text-right font-bold text-blue-700">{fmt(td.qte)}</td>
                          <td className="td text-right font-bold text-amber-700">{fmt(td.total)} DHS</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="tfoot-td">TOTAL GÉNÉRAL</td>
                        <td className="tfoot-td text-right">{fmt(data.totQte)}</td>
                        <td className="tfoot-td text-right">{fmt(data.totAchat)} DHS</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        ))}
        {Object.keys(byFourn).length === 0 && <div className="card text-center py-10 text-gray-400">Aucune donnée pour cette période</div>}
        </div>}

      </div>
    )
  }

  // ── CAMION REPORT HTML (shared by print + PDF) ──────────────
  function buildCamionReportHTML() {
    const byCamion = {}
    filtered.forEach(v => {
      const p = v.camion_plaque || 'Sans camion'
      if (!byCamion[p]) byCamion[p] = { voyages: 0, qte: 0, vente: 0, chauffeur: v.chauffeur || '', types: {}, ops: [], retourTotal: 0, retourRestant: 0, retours: [] }
      byCamion[p].voyages += 1
      byCamion[p].qte    += v.qte || 0
      byCamion[p].vente  += v.total_vente || 0
      const tb = v.type_brique || 'Sans type'
      if (!byCamion[p].types[tb]) byCamion[p].types[tb] = 0
      byCamion[p].types[tb] += v.qte || 0
      byCamion[p].ops.push(v)
      if (v.retour_client) {
        byCamion[p].retourTotal   += v.retour_montant || 0
        byCamion[p].retourRestant += v.retour_restant || 0
        byCamion[p].retours.push(v)
      }
    })

    const css = `
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      body { font-family: Arial, sans-serif; padding: 28px; font-size: 12px; color: #1e293b !important; background: #fff !important; margin: 0; }
      h1 { font-size: 18px; margin: 0 0 4px; color: #1e293b !important; }
      h2 { font-size: 15px; color: #1e293b !important; }
      .sub, .subtitle { color: #555 !important; font-size: 11px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { background: #1a5fa8 !important; color: #ffffff !important; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #1e293b !important; }
      tr:nth-child(even) td { background: #f8fafc !important; }
      tfoot td { background: #f1f5f9 !important; font-weight: 800 !important; color: #1e293b !important; border-top: 2px solid #1a5fa8 !important; font-size: 12px; }
      b, strong { color: #1e293b !important; font-weight: 800; }
      .right, [style*="text-align:right"], [style*="text-align: right"] { text-align: right; }
      .header-block { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #1a5fa8; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; background: #e2e8f0 !important; color: #1e293b !important; border: 1px solid #cbd5e1; }
      .fourn-block { margin-bottom: 24px; page-break-inside: avoid; }
      .fourn-header { background: #1a5fa8 !important; color: #ffffff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .fourn-title { font-size: 13px; font-weight: 800; color: #ffffff !important; }
      .prod-block { margin-bottom: 12px; }
      .prod-header { background: #f1f5f9 !important; border-left: 4px solid #1a5fa8; padding: 5px 10px; font-weight: 700; font-size: 11px; color: #1e293b !important; margin-bottom: 4px; border-radius: 0 4px 4px 0; }
      .grand-tfoot td { background: #e2e8f0 !important; font-weight: 900 !important; color: #1e293b !important; border-top: 3px solid #1a5fa8 !important; font-size: 13px; }
      .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #888 !important; font-size: 10px; text-align: center; }
      .camion-header { background: #1a5fa8 !important; color: #ffffff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
      .info-box { background: #f8fafc !important; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
      .info-box b { display: block; margin-bottom: 4px; color: #1e293b !important; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
      .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 50px; }
      .sig { text-align: center; border-top: 1px solid #94a3b8; padding-top: 8px; color: #555 !important; font-size: 11px; }
      @media print {
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        button, .no-print { display: none !important; }
        body { padding: 0; }
      }
`

    const camionBlocks = Object.entries(byCamion)
      .sort((a, b) => b[1].qte - a[1].qte)
      .map(([plaque, data]) => {
        const opRows = data.ops
          .slice().sort((a, b) => (a.date||'').localeCompare(b.date||''))
          .map(v => `<tr>
            <td>${fmtDate(v.date)}</td>
            <td>${v.client_nom || '—'}</td>
            <td>${v.fournisseur || '—'}</td>
            <td>${v.type_brique || '—'}</td>
            <td class="r num">${fmt(v.qte)}</td>
            <td><span class="tag" style="${v.client_nom?'background:#eff6ff;color:#1d4ed8':'background:#f0fdf4;color:#15803d'}">${v.client_nom ? 'Vente' : 'Achat'}</span></td>
          </tr>`).join('')

        const productPills = Object.entries(data.types)
          .map(([tb, q]) => `<span class="product-pill">${tb} — ${fmt(q)}</span>`).join('')

        return `
          <div class="camion-block">
            <div class="camion-hdr">
              <div>
                <div class="camion-ttl">${plaque}</div>
                ${data.chauffeur ? `<div class="camion-sub-txt">${data.chauffeur}</div>` : ''}
              </div>
              <div class="camion-info">
                ${data.voyages} voyage(s) &nbsp;·&nbsp; ${fmt(data.qte)} briques &nbsp;·&nbsp; ${fmt(data.vente)} DHS
              </div>
            </div>
            <div class="kpi-g">
              <div class="kpi bl"><div class="lbl">Voyages</div><div class="val">${data.voyages}</div></div>
              <div class="kpi gn"><div class="lbl">Briques</div><div class="val">${fmt(data.qte)}</div></div>
              <div class="kpi am"><div class="lbl">Total DHS</div><div class="val">${fmt(data.vente)}</div></div>
            </div>
            <table>
              <thead><tr>
                <th>Date</th><th>Client</th><th>Fournisseur</th><th>Produit</th>
                <th class="r">Quantité</th><th>Type</th>
              </tr></thead>
              <tbody>${opRows}</tbody>
              <tfoot><tr>
                <td colspan="4">TOTAL (${data.ops.length} op.)</td>
                <td class="r">${fmt(data.qte)}</td><td></td>
              </tr></tfoot>
            </table>
            ${data.retours.length > 0 ? `
            <div class="retour-blk">
              <div class="retour-ttl">Retours Transport (${data.retours.length}) — Total: ${fmt(data.retourTotal)} DHS &nbsp;·&nbsp; Restant: ${fmt(data.retourRestant)} DHS</div>
              <table>
                <thead><tr>
                  <th>Date</th><th>Client retour</th>
                  <th class="r">Montant</th><th class="r">Payé</th><th class="r">Restant</th><th>Note</th>
                </tr></thead>
                <tbody>${data.retours.map(v=>`<tr>
                  <td>${fmtDate(v.date)}</td><td><b>${v.retour_client}</b></td>
                  <td class="r">${fmt(v.retour_montant)}</td>
                  <td class="r" style="color:#16a34a">${fmt(v.retour_paye||0)}</td>
                  <td class="r" style="color:${v.retour_restant>0?'#f97316':'#16a34a'}">${v.retour_restant>0?fmt(v.retour_restant):'Payé'}</td>
                  <td>${v.retour_note||'—'}</td>
                </tr>`).join('')}</tbody>
              </table>
            </div>` : ''}
          </div>`
      }).join('')

    const _now2 = new Date()
    const _dt2 = _now2.toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' à ' + String(_now2.getHours()).padStart(2,'0') + ':' + String(_now2.getMinutes()).padStart(2,'0')
    return `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Rapport Camions — DAR SADIK</title>
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
  .sec{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#475569;border-bottom:2px solid #1a3a6b;padding-bottom:4px;margin:16px 0 8px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  thead th{background:#334155 !important;color:#fff !important;padding:8px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;text-align:left}
  thead th.r{text-align:right}
  tbody td{padding:7px 10px;font-size:10px;color:#1e293b;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  tbody td.r{text-align:right;font-family:monospace}
  tbody tr:nth-child(even) td{background:#f8fafc !important}
  .num{font-weight:700;font-size:11px}
  .tag{background:#eff6ff;color:#1d4ed8;border-radius:4px;padding:2px 8px;font-size:9px;font-weight:700}
  tfoot td{background:#1e293b !important;color:#fff !important;padding:8px 10px;font-weight:700;font-size:11px;border:none !important}
  tfoot td.r{font-size:12px}
  .camion-block{margin-bottom:20px;page-break-inside:avoid}
  .camion-hdr{background:#1a3a6b !important;color:#fff !important;border-radius:6px;padding:10px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
  .camion-ttl{font-size:13px;font-weight:800;color:#fff !important}
  .camion-sub-txt{font-size:10px;color:#93c5fd;margin-top:2px}
  .camion-info{font-size:11px;color:#bfdbfe;text-align:right}
  .kpi-g{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px}
  .kpi{padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px;border-left:3px solid #cbd5e1}
  .lbl{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;margin-bottom:2px}
  .val{font-size:16px;font-weight:900;line-height:1}
  .kpi.bl{border-left-color:#1d4ed8}.kpi.bl .val{color:#1d4ed8}
  .kpi.gn{border-left-color:#16a34a}.kpi.gn .val{color:#16a34a}
  .kpi.am{border-left-color:#b45309}.kpi.am .val{color:#b45309}
  .retour-blk{margin-top:8px;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px}
  .retour-ttl{font-weight:800;font-size:11px;color:#15803d;margin-bottom:6px}
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
    <div style="font-size:9px;color:#93c5fd;margin-top:3px">Généré le ${_dt2}</div>
  </div>
</div>
<div class="bdy">
<div class="ttl">Rapport Camions</div>
<div class="sub">Période : ${fmtDate(filterFrom)} → ${fmtDate(filterTo)} &nbsp;·&nbsp; ${Object.keys(byCamion).length} camion(s)</div>
${camionBlocks || '<p style="color:#aaa;text-align:center;padding:40px">Aucune donnée pour cette période</p>'}
<div class="foot"><span>DAR SADIK — دار صديق — Selouane, Nador</span><span>Généré le ${_dt2}</span></div>
</div></body></html>`
  }

  function printCamionReport() {
        openPrintWindow(buildCamionReportHTML())

  }

  async function downloadCamionPDF() {
    // inject html2pdf from CDN if not already loaded
    if (!window.html2pdf) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
        s.onload = resolve
        s.onerror = reject
        document.head.appendChild(s)
      })
    }

    // build a hidden container with the report HTML
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px;background:#fff'
    container.innerHTML = buildCamionReportHTML()
    // strip the outer html/body tags — html2pdf works on a div
    const tmp = document.createElement('div')
    tmp.innerHTML = buildCamionReportHTML()
    const body = tmp.querySelector('body')
    container.innerHTML = body ? body.innerHTML : tmp.innerHTML
    // remove the print button inside
    container.querySelectorAll('.print-btn').forEach(el => el.remove())
    document.body.appendChild(container)

    const filename = `Camions-${filterFrom}-${filterTo}.pdf`
    await window.html2pdf().set({
      margin:      [10, 10, 10, 10],
      filename,
      image:       { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:   { mode: ['avoid-all', 'css'] },
    }).from(container).save()

    document.body.removeChild(container)
  }

  // ── CAMION VIEW ──
  function CamionView() {
    const byCamion = {}
    filtered.forEach(v => {
      const p = v.camion_plaque || 'Sans camion'
      if (!byCamion[p]) byCamion[p] = { voyages: 0, qte: 0, vente: 0, dates: new Set(), types: {}, chauffeur: v.chauffeur || '', retourTotal: 0, retourRestant: 0, retours: [] }
      byCamion[p].voyages += 1
      byCamion[p].qte += v.qte || 0
      byCamion[p].vente += v.total_vente || 0
      byCamion[p].dates.add(v.date)
      const tb = v.type_brique || 'Sans type'
      if (!byCamion[p].types[tb]) byCamion[p].types[tb] = 0
      byCamion[p].types[tb] += v.qte || 0
      if (v.retour_client) {
        byCamion[p].retourTotal += v.retour_montant || 0
        byCamion[p].retourRestant += v.retour_restant || 0
        byCamion[p].retours.push(v)
      }
    })

    return (
      <div className="space-y-4">
        {/* Print + PDF buttons */}
        <div className="flex gap-2 justify-end">
          <button onClick={printCamionReport}
            className="btn-primary text-xs px-3 py-1.5"
            style={{background:'#4f46e5'}}>
            🖨️ Imprimer
          </button>
          <button onClick={downloadCamionPDF}
            className="btn-primary text-xs px-3 py-1.5"
            style={{background:'#dc2626'}}>
            📄 Télécharger PDF
          </button>
        </div>
        {Object.entries(byCamion).sort((a,b) => b[1].qte - a[1].qte).map(([plaque, data]) => (
          <div key={plaque} className="card">
            <div className={`${isMobile ? 'space-y-3' : 'flex items-start justify-between'} mb-4`}>
              <div>
                <div className="text-lg font-bold text-gray-900">🚛 {plaque}</div>
                {data.chauffeur && <div className="text-sm text-gray-500 mt-1">👤 {data.chauffeur}</div>}
              </div>
              <div className={`grid grid-cols-3 gap-3 ${isMobile ? '' : 'text-center'}`}>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400">Voyages</div>
                  <div className="text-xl font-bold text-blue-600">{data.voyages}</div>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400">Briques</div>
                  <div className="text-xl font-bold text-green-600">{fmt(data.qte)}</div>
                </div>
                <div className="bg-brand-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400">DHS</div>
                  <div className="text-xl font-bold text-brand-600">{fmt(data.vente)}</div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(data.types).map(([tb, q]) => (
                <div key={tb} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <span className="font-bold">{tb}</span>
                  <span className="text-gray-400 ml-2">{fmt(q)}</span>
                </div>
              ))}
            </div>
            {!isMobile && (
              <div className="flex flex-wrap gap-1">
                {[...data.dates].sort().map(d => (
                  <span key={d} className="text-xs bg-brand-50 text-brand-700 border border-brand-200 rounded px-2 py-1">{fmtDate(d)}</span>
                ))}
              </div>
            )}
            {data.retours.length > 0 && (
              <div className="mt-3 p-3 rounded-xl border border-green-200" style={{background:'#f0fdf4'}}>
                <div className="text-xs font-bold text-green-700 uppercase mb-2">↩️ Retours Transport ({data.retours.length})</div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                  <div><span className="text-gray-400">Total retour:</span> <b className="text-green-700">{fmt(data.retourTotal)} DHS</b></div>
                  <div><span className="text-gray-400">Restant:</span> <b className="text-orange-500">{fmt(data.retourRestant)} DHS</b></div>
                </div>
                {data.retours.map(v => (
                  <div key={v.id} className="text-xs py-1 border-t border-green-100 flex justify-between">
                    <span>{fmtDate(v.date)} — <b>{v.retour_client}</b></span>
                    <span>{fmt(v.retour_montant)} DHS {v.retour_restant > 0 ? <span className="text-orange-500">(reste {fmt(v.retour_restant)})</span> : <span className="text-green-600">✓</span>}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {Object.keys(byCamion).length === 0 && <div className="card text-center py-10 text-gray-400">Aucune donnée</div>}
      </div>
    )
  }

  return (
    <Layout title="Ventes" subtitle="Gestion et analyse des ventes">

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

      {/* FILTERS */}
      {isMobile ? (
        <div className="mb-4">
          <button className="mobile-collapse-btn" onClick={() => setShowFilters(!showFilters)}>
            <span>🔍 Filtres ({fmtDate(filterFrom)} → {fmtDate(filterTo)})</span>
            <span>{showFilters ? '▲' : '▼'}</span>
          </button>
          {showFilters && (
            <div className="card mt-2 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} /></div>
                <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)} /></div>
              </div>
              <div><label className="label">Client</label>
                <select className="input" value={filterClient} onChange={e=>setFilterClient(e.target.value)}>
                  <option value="">Tous</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div><label className="label">Camion</label>
                <select className="input" value={filterCamion} onChange={e=>setFilterCamion(e.target.value)}>
                  <option value="">Tous</option>{uniqueCamions.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <button onClick={()=>{setFilterClient('');setFilterFourn('');setFilterCamion('');setFilterFrom(startOfMonth());setFilterTo(today());setShowFilters(false)}}
                className="btn-secondary w-full justify-center text-xs">↺ Réinitialiser</button>
            </div>
          )}
          <div className="text-xs text-gray-400 mt-2 px-1">{filtered.length} vente(s) — {fmt(filtered.reduce((s,v)=>s+(v.total_vente||0),0))} DHS</div>
        </div>
      ) : (
        <div className="card mb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} /></div>
            <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)} /></div>
            <div><label className="label">Client</label>
              <select className="input" value={filterClient} onChange={e=>setFilterClient(e.target.value)}>
                <option value="">Tous</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            {admin && <div><label className="label">Fournisseur</label>
              <select className="input" value={filterFourn} onChange={e=>setFilterFourn(e.target.value)}>
                <option value="">Tous</option>{uniqueFourns.map(f=><option key={f}>{f}</option>)}
              </select>
            </div>}
            <div><label className="label">Camion</label>
              <select className="input" value={filterCamion} onChange={e=>setFilterCamion(e.target.value)}>
                <option value="">Tous</option>{uniqueCamions.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <button onClick={()=>{setFilterClient('');setFilterFourn('');setFilterCamion('');setFilterFrom(startOfMonth());setFilterTo(today())}}
              className="btn-secondary text-xs">↺ Réinitialiser</button>
          </div>
          <div className="mt-2 text-xs text-gray-400">{filtered.length} vente(s) — {fmt(filtered.reduce((s,v)=>s+(v.qte||0),0))} briques — {fmt(filtered.reduce((s,v)=>s+(v.total_vente||0),0))} DHS</div>
        </div>
      )}

      {/* SAISIE FORM */}
      {view === 'saisie' && admin && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">➕ Nouvelle vente</h3>
            {isMobile && <button className="btn-secondary text-xs" onClick={() => setShowForm(!showForm)}>{showForm ? '▲' : '▼'}</button>}
          </div>
          {(!isMobile || showForm) && (
            <form onSubmit={saveVente}>
              <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4'} gap-3 mb-3`}>
                <div>
                  <label className="label">📅 Date livraison client</label>
                  <input type="date" className="input" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required />
                </div>
                <div>
                  <label className="label">🏭 Date achat fournisseur</label>
                  <input type="date" className="input" value={form.date_fournisseur} onChange={e=>setForm({...form,date_fournisseur:e.target.value})} />
                </div>
                <div><label className="label">Client</label>
                  <select className="input" value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})} required>
                    <option value="">Sélectionner...</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                <div><label className="label">Camion</label>
                  <select className="input" value={form.camion_id} onChange={e=>setForm({...form,camion_id:e.target.value})} required>
                    <option value="">Sélectionner...</option>{camions.map(c=><option key={c.id} value={c.id}>{c.plaque}{c.chauffeur?` — ${c.chauffeur}`:''}</option>)}
                  </select>
                </div>
              </div>
              <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4'} gap-3 mb-3`}>
                <div><label className="label">Fournisseur</label>
                  <select className="input" value={form.fournisseur_id} onChange={e=>setForm({...form,fournisseur_id:e.target.value})}>
                    <option value="">Sélectionner...</option>{fournisseurs.map(f=><option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select>
                </div>
              </div>
              <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'} gap-3 mb-3`}>
                <div><label className="label">Type brique</label>
                  <select className="input" value={form.type_brique_id} onChange={e=>setForm({...form,type_brique_id:e.target.value})}>
                    <option value="">Sélectionner...</option>{typeBriques.map(t=><option key={t.id} value={t.id}>{t.nom}</option>)}
                  </select>
                </div>
                <div><label className="label">Quantité</label><input type="number" className="input" placeholder="6000" value={form.qte} onChange={e=>setForm({...form,qte:e.target.value})} required /></div>
                <div><label className="label">Prix vente/u</label><input type="number" step="0.01" className="input" placeholder="1.85" value={form.prix_vente} onChange={e=>setForm({...form,prix_vente:e.target.value})} required /></div>
                <div><label className="label">Prix achat/u</label><input type="number" step="0.01" className="input" placeholder="1.30" value={form.prix_achat} onChange={e=>setForm({...form,prix_achat:e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className="label">BON N°</label><input className="input" placeholder="2849" value={form.bon} onChange={e=>setForm({...form,bon:e.target.value})} /></div>
                <div><label className="label">Note</label><input className="input" placeholder="optionnel" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} /></div>
              </div>

              {/* ── RETOUR TRANSPORT ── */}
              <div className="mb-4 rounded-xl border border-green-200 overflow-hidden">
                <button type="button"
                  onClick={() => setShowRetour(!showRetour)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-green-700"
                  style={{background:'#f0fdf4'}}>
                  <span>↩️ Retour Transport (optionnel)</span>
                  <span>{showRetour ? '▲' : '▼'}</span>
                </button>
                {showRetour && (
                  <div className="p-4 space-y-3" style={{background:'#f9fffe'}}>
                    <div className="text-xs text-gray-400 mb-2">Si le camion transporte autre chose au retour, saisir ici (lié au même voyage).</div>
                    <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                      <div><label className="label">Client / Société retour</label>
                        <input className="input" placeholder="Nom du client retour" value={form.retour_client} onChange={e=>setForm({...form,retour_client:e.target.value})} /></div>
                      <div><label className="label">Montant retour (DHS)</label>
                        <input type="number" step="0.01" className="input" placeholder="500" value={form.retour_montant} onChange={e=>setForm({...form,retour_montant:e.target.value})} /></div>
                      <div><label className="label">Montant payé (DHS)</label>
                        <input type="number" step="0.01" className="input" placeholder="500" value={form.retour_paye} onChange={e=>setForm({...form,retour_paye:e.target.value})} /></div>
                      <div><label className="label">Note retour</label>
                        <input className="input" placeholder="optionnel" value={form.retour_note} onChange={e=>setForm({...form,retour_note:e.target.value})} /></div>
                    </div>
                    {form.retour_montant && (
                      <div className="grid grid-cols-3 gap-3 bg-green-50 rounded-xl p-3 text-center">
                        <div><div className="text-xs text-gray-400">Montant</div><div className="font-bold text-green-700">{fmt(parseFloat(form.retour_montant)||0)} DHS</div></div>
                        <div><div className="text-xs text-gray-400">Payé</div><div className="font-bold text-blue-700">{fmt(parseFloat(form.retour_paye)||0)} DHS</div></div>
                        <div><div className="text-xs text-gray-400">Restant</div>
                          <div className={`font-bold ${((parseFloat(form.retour_montant)||0)-(parseFloat(form.retour_paye)||0))>0?'text-orange-500':'text-green-600'}`}>
                            {fmt(Math.max(0,(parseFloat(form.retour_montant)||0)-(parseFloat(form.retour_paye)||0)))} DHS
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {form.qte && form.prix_vente && (
                <div className="grid grid-cols-3 gap-3 bg-brand-50 rounded-xl p-4 mb-4 text-center">
                  <div><div className="text-xs text-gray-400">Total vente</div><div className="text-lg font-bold text-brand-600">{fmt(tv)} DHS</div></div>
                  <div><div className="text-xs text-gray-400">Total achat</div><div className="text-lg font-bold text-gray-500">{fmt(ta)} DHS</div></div>
                  <div><div className="text-xs text-gray-400">Marge</div><div className={`text-lg font-bold ${mg>=0?'text-green-600':'text-red-600'}`}>{fmt(mg)} DHS</div></div>
                </div>
              )}
              <button type="submit" disabled={saving} className={`btn-primary ${isMobile ? 'w-full justify-center' : ''}`}>
                {saving ? 'Enregistrement...' : '✓ Enregistrer'}
              </button>
            </form>
          )}
        </div>
      )}

      {loading ? (
        <div className="card text-center py-10 text-gray-400">Chargement...</div>
      ) : (
        <>
          {view === 'client' && ClientView()}
          {view === 'fournisseur' && FournisseurView()}
          {view === 'camion' && CamionView()}
          {view === 'mdo' && admin && (() => {
            const mdoVentes = ventes.filter(v => ['mdo','gasoil','autre'].includes(v.type_entree))
            const mdoFiltered = mdoVentes.filter(v => {
              if (filterFrom && v.date < filterFrom) return false
              if (filterTo   && v.date > filterTo)   return false
              if (filterClient && v.client_id !== parseInt(filterClient)) return false
              return true
            }).sort((a,b) => (b.date||'').localeCompare(a.date||''))
            const totalMdo = mdoFiltered.reduce((s,v) => s + (v.montant_mdo || 0), 0)

            function printMdo() {
                            const rows = mdoFiltered.map(v => `<tr>
                <td>${fmtDate(v.date)}</td>
                <td><b>${v.client_nom}</b></td>
                <td>${v.type_entree==='gasoil'?'⛽ Frais Gasoil':v.type_entree==='autre'?'📌 Autre':'🔧 Main d\'oeuvre'}</td>
                <td>${v.description_mdo || '—'}</td>
                <td>${v.camion_plaque || '—'}</td>
                <td style="text-align:right"><b>${fmt(v.montant_mdo)} DHS</b></td>
                <td>${v.note || '—'}</td>
              </tr>`).join('')
              const _mn = new Date(); const _mdt = _mn.toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'})+' à '+String(_mn.getHours()).padStart(2,'0')+':'+String(_mn.getMinutes()).padStart(2,'0')
              openPrintWindow(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Main d'oeuvre — DAR SADIK</title>
<style>
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;background:#fff}
  .hdr{background:#1a3a6b;padding:14px 24px;display:flex;justify-content:space-between;align-items:flex-start}
  .co-n{font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;line-height:1}.co-ar{font-size:12px;color:#93c5fd;direction:rtl;margin-top:2px}.co-tag{font-size:9px;color:#93c5fd;margin-top:1px}
  .co-r{text-align:right;font-size:10px;color:#bfdbfe;line-height:1.7}.co-r strong{color:#fff}
  .btn-p,.btn-d{padding:5px 12px;border:none;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;margin-right:5px}.btn-p{background:#475569;color:#fff}.btn-d{background:#16a34a;color:#fff}
  .bdy{padding:18px 24px}.ttl{font-size:16px;font-weight:800;color:#1e293b;margin-bottom:4px}.sub{font-size:11px;color:#64748b;margin-bottom:14px}
  .sec{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#475569;border-bottom:2px solid #1a3a6b;padding-bottom:4px;margin:14px 0 8px}
  table{width:100%;border-collapse:collapse}
  thead th{background:#334155 !important;color:#fff !important;padding:8px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;text-align:left}
  thead th.r{text-align:right}
  tbody td{padding:7px 10px;font-size:10px;color:#1e293b;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  tbody td.r{text-align:right;font-family:monospace}.tbody td.m{color:#94a3b8;font-size:10px}
  tbody tr:nth-child(even) td{background:#f8fafc !important}
  .num{font-weight:700;font-size:11px}
  tfoot td{background:#1e293b !important;color:#fff !important;padding:8px 10px;font-weight:700;font-size:11px;border:none !important}
  tfoot td.r{font-size:12px}
  .foot{margin-top:18px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
  @media print{.btn-p,.btn-d{display:none !important}}@page{size:A4;margin:8mm 10mm}
</style></head><body>
<div class="hdr">
  <div><div class="co-n">DAR SADIK</div><div class="co-ar">دار صديق</div><div class="co-tag">بائع جميع مواد البناء &nbsp;·&nbsp; Selouane, Nador</div></div>
  <div class="co-r">
    <div><strong>Mohamed</strong> 06 61 32 56 65 &nbsp;·&nbsp; <strong>Sadik</strong> 06 61 97 87 47 &nbsp;·&nbsp; <strong>Bureau</strong> 06 62 82 88 20</div>
    <div>Dar.sadik@hotmail.com</div>
    <div style="margin-top:6px"><button class="btn-p" onclick="window.print()">Imprimer</button><button class="btn-d" onclick="window.print()">Télécharger PDF</button></div>
    <div style="font-size:9px;color:#93c5fd;margin-top:3px">Généré le ${_mdt}</div>
  </div>
</div>
<div class="bdy">
<div class="ttl">MDO / Frais Gasoil / Autre</div>
<div class="sub">Période : ${fmtDate(filterFrom)} → ${fmtDate(filterTo)} &nbsp;·&nbsp; ${mdoFiltered.length} entrée(s) &nbsp;·&nbsp; Total : ${fmt(totalMdo)} DHS</div>
<div class="sec">Détail (${mdoFiltered.length})</div>
<table><thead><tr>
  <th>Date</th><th>Client</th><th>Type</th><th>Description</th><th>Camion</th><th class="r">Montant DHS</th><th>Note</th>
</tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="5">TOTAL (${mdoFiltered.length})</td><td class="r">${fmt(totalMdo)} DHS</td><td></td></tr></tfoot>
</table>
<div class="foot"><span>DAR SADIK — دار صديق — Selouane, Nador</span><span>Généré le ${_mdt}</span></div>
</div></body></html>`)

            }

            return (
              <div className="space-y-4">
                {/* MDO form */}
                <div className="card">
                  <h3 className="font-bold text-gray-900 mb-4">
                    {mdoForm.type==='gasoil'?'⛽ Frais Gasoil':mdoForm.type==='autre'?'📌 Autre charge':'🔧 Saisir une main d\'œuvre'}
                  </h3>
                  <form onSubmit={saveMdo}>
                    <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4'} gap-3 mb-3`}>
                      <div><label className="label">Type</label>
                        <select className="input" value={mdoForm.type} onChange={e=>setMdoForm({...mdoForm,type:e.target.value})}>
                          <option value="mdo">🔧 Main d'œuvre</option>
                          <option value="gasoil">⛽ Frais Gasoil</option>
                          <option value="autre">📌 Autre</option>
                        </select></div>
                      <div><label className="label">Date</label>
                        <input type="date" className="input" value={mdoForm.date} onChange={e=>setMdoForm({...mdoForm,date:e.target.value})} required /></div>
                      <div><label className="label">Client</label>
                        <select className="input" value={mdoForm.client_id} onChange={e=>setMdoForm({...mdoForm,client_id:e.target.value})} required>
                          <option value="">Sélectionner...</option>
                          {clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                        </select></div>
                      <div><label className="label">Montant (DHS)</label>
                        <input type="text" inputMode="decimal" className="input" placeholder="ex: 1500" value={mdoForm.montant} onChange={e=>setMdoForm({...mdoForm,montant:e.target.value})} required /></div>
                      <div><label className="label">Camion (optionnel)</label>
                        <select className="input" value={mdoForm.camion_id} onChange={e=>setMdoForm({...mdoForm,camion_id:e.target.value})}>
                          <option value="">— Sans camion —</option>
                          {camions.map(c=><option key={c.id} value={c.id}>{c.plaque}{c.chauffeur?` — ${c.chauffeur}`:''}</option>)}
                        </select></div>
                    </div>
                    {mdoForm.type !== 'gasoil' && (
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div><label className="label">{mdoForm.type === 'autre' ? 'Description' : 'Description des travaux'}</label>
                          <input className="input" placeholder={mdoForm.type === 'autre' ? 'ex: Frais divers...' : 'ex: Chargement, déchargement, pose...'} value={mdoForm.description} onChange={e=>setMdoForm({...mdoForm,description:e.target.value})} /></div>
                        <div><label className="label">Note</label>
                          <input className="input" placeholder="optionnel" value={mdoForm.note} onChange={e=>setMdoForm({...mdoForm,note:e.target.value})} /></div>
                      </div>
                    )}
                    {mdoMsg && <div className={`text-sm font-semibold p-2 rounded-lg mb-3 ${mdoMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{mdoMsg}</div>}
                    <button type="submit" disabled={mdoSaving} className={`btn-primary ${isMobile?'w-full justify-center':''}`} style={{background:'#92400e'}}>
                      {mdoSaving ? 'Enregistrement...' : mdoForm.type==='gasoil'?'⛽ Enregistrer frais gasoil':mdoForm.type==='autre'?'📌 Enregistrer charge':'🔧 Enregistrer la main d\'œuvre'}
                    </button>
                  </form>
                </div>

                {/* MDO history */}
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-gray-900">📋 Historique MDO / Gasoil / Autre</h3>
                      <div className="text-xs text-gray-400 mt-1">{mdoFiltered.length} entrée(s) — Total: <b className="text-amber-700">{fmt(totalMdo)} DHS</b></div>
                    </div>
                    <button onClick={printMdo} className="btn-primary text-xs px-3 py-1.5" style={{background:'#92400e'}}>🖨️ PDF</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="th">Date</th>
                          <th className="th">Client</th>
                          <th className="th">Type</th>
                          <th className="th">Description</th>
                          <th className="th">Camion</th>
                          <th className="th text-right">Montant DHS</th>
                          <th className="th">Note</th>
                          {admin && <th className="th"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {mdoFiltered.map(v => (
                          <tr key={v.id} className="hover:bg-amber-50">
                            <td className="td text-gray-500">{fmtDate(v.date)}</td>
                            <td className="td font-semibold">{v.client_nom}</td>
                            <td className="td">
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:'#fef08a',color:'#92400e'}}>
                                {v.type_entree==='gasoil'?'⛽ Frais Gasoil':v.type_entree==='autre'?'📌 Autre':'🔧 Main d\'œuvre'}
                              </span>
                            </td>
                            <td className="td text-amber-700">{v.type_entree === 'gasoil' ? <span className="text-gray-300">—</span> : (v.description_mdo || '—')}</td>
                            <td className="td text-gray-500">{v.camion_plaque || '—'}</td>
                            <td className="td text-right font-bold text-amber-700">{fmt(v.montant_mdo)} DHS</td>
                            <td className="td text-gray-400 text-xs">{v.type_entree === 'gasoil' ? <span className="text-gray-300">—</span> : (v.note || '—')}</td>
                            {admin && <td className="td">
                              <button onClick={() => deleteVente(v)} className="btn-danger text-xs">✕</button>
                            </td>}
                          </tr>
                        ))}
                        {mdoFiltered.length === 0 && <tr><td colSpan={8} className="td text-center text-gray-400 py-8">Aucune entrée</td></tr>}
                      </tbody>
                      {mdoFiltered.length > 0 && (
                        <tfoot>
                          <tr>
                            <td className="tfoot-td" colSpan={5}>TOTAL ({mdoFiltered.length})</td>
                            <td className="tfoot-td text-right">{fmt(totalMdo)} DHS</td>
                            <td className="tfoot-td" colSpan={admin ? 2 : 1}></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            )
          })()}
          {view === 'remise' && admin && (() => {
            const remises = ventes.filter(v => v.type_entree === 'remise')
            const remisesFiltered = remises.filter(v => {
              if (filterFrom  && v.date < filterFrom)  return false
              if (filterTo    && v.date > filterTo)    return false
              if (filterClient && v.client_id !== parseInt(filterClient)) return false
              return true
            }).sort((a,b) => (b.date||'').localeCompare(a.date||''))
            const totalRemises = remisesFiltered.reduce((s,v) => s + (v.montant_mdo||0), 0)

            function printRemises() {
                            const rows = remisesFiltered.map(v => `<tr>
                <td>${fmtDate(v.date)}</td><td><b>${v.client_nom}</b></td>
                <td style="text-align:right;color:#15803d"><b>− ${fmt(v.montant_mdo)} DHS</b></td>
                <td>${v.description_mdo||v.note||'—'}</td></tr>`).join('')
              const _rn = new Date(); const _rdt = _rn.toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'})+' à '+String(_rn.getHours()).padStart(2,'0')+':'+String(_rn.getMinutes()).padStart(2,'0')
              openPrintWindow(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Remises — DAR SADIK</title>
<style>
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;background:#fff}
  .hdr{background:#1a3a6b;padding:14px 24px;display:flex;justify-content:space-between;align-items:flex-start}
  .co-n{font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;line-height:1}.co-ar{font-size:12px;color:#93c5fd;direction:rtl;margin-top:2px}.co-tag{font-size:9px;color:#93c5fd;margin-top:1px}
  .co-r{text-align:right;font-size:10px;color:#bfdbfe;line-height:1.7}.co-r strong{color:#fff}
  .btn-p,.btn-d{padding:5px 12px;border:none;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;margin-right:5px}.btn-p{background:#475569;color:#fff}.btn-d{background:#16a34a;color:#fff}
  .bdy{padding:18px 24px}.ttl{font-size:16px;font-weight:800;color:#1e293b;margin-bottom:4px}.sub{font-size:11px;color:#64748b;margin-bottom:14px}
  .sec{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#475569;border-bottom:2px solid #1a3a6b;padding-bottom:4px;margin:14px 0 8px}
  table{width:100%;border-collapse:collapse}
  thead th{background:#334155 !important;color:#fff !important;padding:8px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;text-align:left}
  thead th.r{text-align:right}
  tbody td{padding:7px 10px;font-size:10px;color:#1e293b;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  tbody td.r{text-align:right;font-family:monospace}.tbody td.m{color:#94a3b8;font-size:10px}
  tbody tr:nth-child(even) td{background:#f8fafc !important}
  .gv{color:#16a34a;font-weight:700}.num{font-weight:700;font-size:11px}
  tfoot td{background:#1e293b !important;color:#fff !important;padding:8px 10px;font-weight:700;font-size:11px;border:none !important}
  tfoot td.r{font-size:12px}
  .foot{margin-top:18px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
  @media print{.btn-p,.btn-d{display:none !important}}@page{size:A4;margin:8mm 10mm}
</style></head><body>
<div class="hdr">
  <div><div class="co-n">DAR SADIK</div><div class="co-ar">دار صديق</div><div class="co-tag">بائع جميع مواد البناء &nbsp;·&nbsp; Selouane, Nador</div></div>
  <div class="co-r">
    <div><strong>Mohamed</strong> 06 61 32 56 65 &nbsp;·&nbsp; <strong>Sadik</strong> 06 61 97 87 47 &nbsp;·&nbsp; <strong>Bureau</strong> 06 62 82 88 20</div>
    <div>Dar.sadik@hotmail.com</div>
    <div style="margin-top:6px"><button class="btn-p" onclick="window.print()">Imprimer</button><button class="btn-d" onclick="window.print()">Télécharger PDF</button></div>
    <div style="font-size:9px;color:#93c5fd;margin-top:3px">Généré le ${_rdt}</div>
  </div>
</div>
<div class="bdy">
<div class="ttl">Remises Clients</div>
<div class="sub">Période : ${fmtDate(filterFrom)} → ${fmtDate(filterTo)} &nbsp;·&nbsp; ${remisesFiltered.length} remise(s) &nbsp;·&nbsp; Total : − ${fmt(totalRemises)} DHS</div>
<div class="sec">Détail des remises (${remisesFiltered.length})</div>
<table><thead><tr>
  <th>Date</th><th>Client</th><th class="r">Remise DHS</th><th>Note / Motif</th>
</tr></thead>
<tbody>${rows||'<tr><td colspan="4" style="text-align:center;color:#aaa;padding:14px;font-style:italic">Aucune remise</td></tr>'}</tbody>
${remisesFiltered.length > 0 ? `<tfoot><tr>
  <td colspan="2">TOTAL (${remisesFiltered.length})</td>
  <td class="r gv num">− ${fmt(totalRemises)} DHS</td><td></td>
</tr></tfoot>` : ''}
</table>
<div class="foot"><span>DAR SADIK — دار صديق — Selouane, Nador</span><span>Généré le ${_rdt}</span></div>
</div></body></html>`)

            }

            return (
              <div className="space-y-4">
                {/* Remise form */}
                <div className="card" style={{borderLeft:'4px solid #22c55e'}}>
                  <h3 className="font-bold text-gray-900 mb-4">🎁 Accorder une remise client</h3>
                  <form onSubmit={saveRemise}>
                    <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4'} gap-3 mb-3`}>
                      <div><label className="label">Date</label>
                        <input type="date" className="input" value={remiseForm.date}
                          onChange={e=>setRemiseForm({...remiseForm,date:e.target.value})} required /></div>
                      <div><label className="label">Client</label>
                        <select className="input" value={remiseForm.client_id}
                          onChange={e=>setRemiseForm({...remiseForm,client_id:e.target.value})} required>
                          <option value="">Sélectionner...</option>
                          {clients.map(c=><option key={c.id} value={c.id}>{c.nom} — solde: {fmt(c.solde||0)} DHS</option>)}
                        </select></div>
                      <div><label className="label">Montant remise (DHS)</label>
                        <input type="text" inputMode="decimal" className="input" placeholder="ex: 500"
                          value={remiseForm.montant} onChange={e=>setRemiseForm({...remiseForm,montant:e.target.value})} required /></div>
                      <div><label className="label">Note / Motif</label>
                        <input className="input" placeholder="ex: Remise fin de mois"
                          value={remiseForm.note} onChange={e=>setRemiseForm({...remiseForm,note:e.target.value})} /></div>
                    </div>
                    {remiseForm.client_id && remiseForm.montant && (() => {
                      const cl = clients.find(c => c.id === parseInt(remiseForm.client_id))
                      const montant = parseFloat(remiseForm.montant) || 0
                      const soldeApres = (cl?.solde||0) - montant
                      return (
                        <div className="grid grid-cols-3 gap-3 p-4 rounded-xl mb-3"
                          style={{background:'#f0fdf4',border:'1px solid #bbf7d0'}}>
                          <div className="text-center">
                            <div className="text-xs text-gray-400">Solde actuel</div>
                            <div className="font-bold text-gray-700">{fmt(cl?.solde||0)} DHS</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-green-500">🎁 Remise</div>
                            <div className="font-bold text-green-600">− {fmt(montant)} DHS</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-400">Solde après</div>
                            <div className="font-bold" style={{color: soldeApres > 0 ? '#92400e' : '#15803d'}}>
                              {fmt(soldeApres)} DHS
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                    {remiseMsg && (
                      <div className={`text-sm font-semibold p-2 rounded-lg mb-3 ${remiseMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {remiseMsg}
                      </div>
                    )}
                    <button type="submit" disabled={remiseSaving}
                      className={`btn-primary ${isMobile?'w-full justify-center':''}`}
                      style={{background:'#15803d'}}>
                      {remiseSaving ? 'Enregistrement...' : '🎁 Enregistrer la remise'}
                    </button>
                  </form>
                </div>

                {/* Remise history */}
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-gray-900">📋 Historique des remises</h3>
                      <div className="text-xs text-gray-400 mt-1">
                        {remisesFiltered.length} remise(s) — Total: <b className="text-green-700">− {fmt(totalRemises)} DHS</b>
                      </div>
                    </div>
                    <button onClick={printRemises} className="btn-primary text-xs px-3 py-1.5"
                      style={{background:'#15803d'}}>🖨️ PDF</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr>
                        <th className="th">Date</th>
                        <th className="th">Client</th>
                        <th className="th text-right">Remise DHS</th>
                        <th className="th">Note / Motif</th>
                        {admin && <th className="th"></th>}
                      </tr></thead>
                      <tbody>
                        {remisesFiltered.map(v => (
                          <tr key={v.id} className="hover:bg-green-50">
                            <td className="td text-gray-500">{fmtDate(v.date)}</td>
                            <td className="td font-semibold">{v.client_nom}</td>
                            <td className="td text-right font-bold text-green-700">− {fmt(v.montant_mdo)} DHS</td>
                            <td className="td text-gray-500 text-xs">{v.description_mdo||v.note||'—'}</td>
                            {admin && <td className="td">
                              <button onClick={()=>deleteVente(v)} className="btn-danger text-xs">✕</button>
                            </td>}
                          </tr>
                        ))}
                        {remisesFiltered.length === 0 && (
                          <tr><td colSpan={5} className="td text-center text-gray-400 py-8">Aucune remise pour cette période</td></tr>
                        )}
                      </tbody>
                      {remisesFiltered.length > 0 && (
                        <tfoot><tr>
                          <td className="tfoot-td" colSpan={2}>TOTAL ({remisesFiltered.length})</td>
                          <td className="tfoot-td text-right text-green-700">− {fmt(totalRemises)} DHS</td>
                          <td className="tfoot-td" colSpan={admin ? 2 : 1}></td>
                        </tr></tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            )
          })()}
        </>
      )}

      {/* ── EDIT MODAL (voyage-linked ventes — same editor as the voyage page) ── */}
      <EditTransactionModal
        editRow={voyEditRow} editForm={voyEditForm} setEditForm={setVoyEditForm}
        onSave={saveVoyEdit} onCancel={closeVoyEdit} saving={voyEditSaving}
      />

      {/* ── EDIT MODAL (manual, non-voyage ventes only) ── */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{background:'rgba(0,0,0,0.5)'}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">✏️ Modifier la vente</h2>
                <p className="text-xs text-gray-400 mt-0.5">{editRow.client_nom} · {editRow.type_brique} · {editRow.camion_plaque}</p>
              </div>
              <button onClick={() => setEditRow(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={saveEdit} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">📅 Date livraison client</label>
                  <input type="date" className="input" required
                    value={editForm.date}
                    onChange={e => setEditForm({...editForm, date: e.target.value})} />
                </div>
                <div>
                  <label className="label">🏭 Date achat fournisseur</label>
                  <input type="date" className="input"
                    value={editForm.date_fournisseur}
                    onChange={e => setEditForm({...editForm, date_fournisseur: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Quantité</label>
                  <input type="number" className="input" required
                    value={editForm.qte}
                    onChange={e => setEditForm({...editForm, qte: e.target.value})} />
                </div>
                <div>
                  <label className="label">Prix vente / u</label>
                  <input type="number" step="0.01" className="input" required
                    value={editForm.prix_vente}
                    onChange={e => setEditForm({...editForm, prix_vente: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Prix achat / u</label>
                  <input type="number" step="0.01" className="input"
                    value={editForm.prix_achat}
                    onChange={e => setEditForm({...editForm, prix_achat: e.target.value})} />
                </div>
                <div>
                  <label className="label">BON N°</label>
                  <input type="text" className="input"
                    value={editForm.bon}
                    onChange={e => setEditForm({...editForm, bon: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="label">Note</label>
                <input type="text" className="input"
                  value={editForm.note}
                  onChange={e => setEditForm({...editForm, note: e.target.value})} />
              </div>

              {/* Retour Transport in edit */}
              <div className="rounded-xl border border-green-200 overflow-hidden">
                <div className="px-4 py-2 text-sm font-bold text-green-700" style={{background:'#f0fdf4'}}>↩️ Retour Transport</div>
                <div className="p-3 space-y-2" style={{background:'#f9fffe'}}>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="label text-xs">Client retour</label>
                      <input className="input" placeholder="Nom" value={editForm.retour_client}
                        onChange={e=>setEditForm({...editForm,retour_client:e.target.value})} /></div>
                    <div><label className="label text-xs">Montant (DHS)</label>
                      <input type="number" step="0.01" className="input" value={editForm.retour_montant}
                        onChange={e=>setEditForm({...editForm,retour_montant:e.target.value})} /></div>
                    <div><label className="label text-xs">Payé (DHS)</label>
                      <input type="number" step="0.01" className="input" value={editForm.retour_paye}
                        onChange={e=>setEditForm({...editForm,retour_paye:e.target.value})} /></div>
                    <div><label className="label text-xs">Note retour</label>
                      <input className="input" value={editForm.retour_note}
                        onChange={e=>setEditForm({...editForm,retour_note:e.target.value})} /></div>
                  </div>
                </div>
              </div>
              {editForm.qte && editForm.prix_vente && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="text-blue-400">Total vente</div>
                    <div className="font-bold text-blue-700">{fmt(Math.round((parseFloat(editForm.qte)||0)*(parseFloat(editForm.prix_vente)||0)))} DHS</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Total achat</div>
                    <div className="font-bold text-gray-600">{fmt(Math.round((parseFloat(editForm.qte)||0)*(parseFloat(editForm.prix_achat)||0)))} DHS</div>
                  </div>
                  <div>
                    <div className="text-green-400">Marge</div>
                    <div className="font-bold text-green-600">{fmt(Math.round((parseFloat(editForm.qte)||0)*((parseFloat(editForm.prix_vente)||0)-(parseFloat(editForm.prix_achat)||0))))} DHS</div>
                  </div>
                </div>
              )}
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
