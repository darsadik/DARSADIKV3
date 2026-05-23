import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')

// ── Print via hidden iframe — stays on same page (PWA safe) ──
function openPrintWindow(html) {
  const old = document.getElementById('__print_overlay')
  if (old) old.remove()
  const isMobile = window.innerWidth < 768
  const overlay = document.createElement('div')
  overlay.id = '__print_overlay'
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#1e293b;display:flex;flex-direction:column'
  const bar = document.createElement('div')
  bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 16px;background:#0f172a;flex-shrink:0'
  const actionBtn = isMobile
    ? '<button onclick="document.getElementById(\'__pframe\').contentWindow.print()" style="padding:7px 18px;background:#16a34a;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">📥 Télécharger PDF</button>'
    : '<button onclick="document.getElementById(\'__pframe\').contentWindow.print()" style="padding:7px 18px;background:#1a5fa8;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">🖨️ Imprimer</button>'
  bar.innerHTML = actionBtn + '<button onclick="document.getElementById(\'__print_overlay\').remove()" style="padding:7px 18px;background:#ef4444;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">✕ Fermer</button>'
  const iframe = document.createElement('iframe')
  iframe.id = '__pframe'
  iframe.style.cssText = 'flex:1;border:none;width:100%;background:#fff'
  overlay.appendChild(bar)
  overlay.appendChild(iframe)
  document.body.appendChild(overlay)
  iframe.contentWindow.document.write(html)
  iframe.contentWindow.document.close()
}

const fmtDate = d => { if (!d) return '—'; const [y,m,j] = d.split('-'); return `${j}/${m}/${y}` }
const today = () => new Date().toISOString().split('T')[0]
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

const MODES = ['Espèce', 'Chèque', 'Virement', 'Paiement fournisseur']
const CHEQUE_STATUSES = ['pending', 'validated', 'rejected']
const CHEQUE_STATUS_LABELS = { pending: '⏳ En attente', validated: '✅ Validé', rejected: '❌ Rejeté' }
const CHEQUE_STATUS_COLORS = { pending: 'bg-amber-50 text-amber-700', validated: 'bg-green-50 text-green-700', rejected: 'bg-red-50 text-red-700' }

function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const check = () => setM(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return m
}

const emptyForm = () => ({
  date: today(),
  client_id: '',
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
  const [editingPmt, setEditingPmt] = useState(null) // { id, montant }
  const [editingGrignonPmt, setEditingGrignonPmt] = useState(null)

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

  // ── FORM ──
  const [form, setForm] = useState(emptyForm())

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: cl }, { data: pa }, { data: ca }, { data: fo }, { data: gc }, { data: gp }] = await Promise.all([
      supabase.from('clients').select('*').order('nom'),
      supabase.from('paiements').select('*').order('date', { ascending: true }),
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('fournisseurs').select('*').order('nom'),
      supabase.from('grignon_clients').select('*').order('nom'),
      supabase.from('grignon_paiements').select('*').order('date', { ascending: true }),
    ])
    setClients(cl || [])
    setPaiements(pa || [])
    setCamions(ca || [])
    setFournisseurs(fo || [])
    setGrignonClients(gc || [])
    setGrignonPaiements(gp || [])
    setLoading(false)
  }

  const selectedClient = clients.find(c => c.id === parseInt(form.client_id))
  const montant = parseFloat(form.montant) || 0
  const soldeApres = (selectedClient?.solde || 0) - montant
  const isCheque = form.mode === 'Chèque'
  const isFournisseurMode = ['Chèque', 'Virement', 'Paiement fournisseur'].includes(form.mode)

  // ── SAVE ──
  async function savePaiement(e) {
    e.preventDefault()
    if (!form.client_id || !montant) return
    setSaving(true)

    const client = selectedClient
    const camion = camions.find(c => c.id === parseInt(form.camion_id))
    const fournisseur = fournisseurs.find(f => f.id === parseInt(form.fournisseur_id))

    await supabase.from('paiements').insert({
      date: form.date,
      client_id: parseInt(form.client_id),
      client_nom: client?.nom || '',
      mode: form.mode,
      montant,
      note: form.note,
      camion_id: form.camion_id ? parseInt(form.camion_id) : null,
      camion_plaque: camion?.plaque || null,
      // cheque fields — only stored when mode = Chèque
      cheque_number: isCheque ? (form.cheque_number || null) : null,
      cheque_bank:   isCheque ? (form.cheque_bank   || null) : null,
      cheque_status: isCheque ? form.cheque_status           : null,
      // supplier-directed — payment stays in client accounting
      fournisseur_id:  form.fournisseur_id ? parseInt(form.fournisseur_id) : null,
      fournisseur_nom: fournisseur?.nom || null,
    })

    // Update client balance — no clamp: negative balance = avance/crédit
    if (client) {
      await supabase.from('clients').update({ solde: (client.solde || 0) - montant }).eq('id', client.id)
    }

    setSaving(false)
    setForm(emptyForm())
    setShowForm(false)
    loadAll()
  }

  // ── DELETE ──
  async function deletePaiement(id, clientId, m) {
    if (!confirm('Supprimer ce paiement ?')) return
    const client = clients.find(c => c.id === clientId)
    await supabase.from('paiements').delete().eq('id', id)
    if (client) await supabase.from('clients').update({ solde: (client.solde || 0) + m }).eq('id', clientId)
    loadAll()
  }

  // ── GRIGNON SAVE ──
  async function saveGrignonPaiement(e) {
    e.preventDefault()
    const montantG = parseFloat(grignonForm.montant) || 0
    if (!grignonForm.client_id || !montantG) return
    setSavingGrignon(true)
    const cl = grignonClients.find(c => c.id === parseInt(grignonForm.client_id))
    await supabase.from('grignon_paiements').insert({
      date: grignonForm.date,
      client_id: parseInt(grignonForm.client_id),
      client_nom: cl?.nom || '',
      mode: grignonForm.mode,
      montant: montantG,
      note: grignonForm.note || null,
    })
    if (cl) await supabase.from('grignon_clients').update({ solde: (cl.solde || 0) - montantG }).eq('id', cl.id)
    setSavingGrignon(false)
    setGrignonForm(emptyGrignonForm())
    setShowGrignonForm(false)
    loadAll()
  }

  async function deleteGrignonPaiement(id, clientId, m) {
    if (!confirm('Supprimer ce paiement grignon ?')) return
    const cl = grignonClients.find(c => c.id === clientId)
    await supabase.from('grignon_paiements').delete().eq('id', id)
    if (cl) await supabase.from('grignon_clients').update({ solde: (cl.solde || 0) + m }).eq('id', clientId)
    loadAll()
  }

  // ── UPDATE MONTANT ──
  async function updatePaiementMontant(id, oldMontant, clientId, newMontant) {
    if (!newMontant || newMontant === oldMontant) { setEditingPmt(null); return }
    const diff = newMontant - oldMontant
    await supabase.from('paiements').update({ montant: newMontant }).eq('id', id)
    const client = clients.find(c => c.id === clientId)
    if (client && diff !== 0) {
      await supabase.from('clients').update({ solde: (client.solde || 0) - diff }).eq('id', clientId)
    }
    setEditingPmt(null)
    loadAll()
  }

  async function updateGrignonPaiementMontant(id, oldMontant, clientId, newMontant) {
    if (!newMontant || newMontant === oldMontant) { setEditingGrignonPmt(null); return }
    const diff = newMontant - oldMontant
    await supabase.from('grignon_paiements').update({ montant: newMontant }).eq('id', id)
    const cl = grignonClients.find(c => c.id === clientId)
    if (cl && diff !== 0) {
      await supabase.from('grignon_clients').update({ solde: (cl.solde || 0) - diff }).eq('id', clientId)
    }
    setEditingGrignonPmt(null)
    loadAll()
  }

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
  <th>Date</th><th>Client</th><th>Mode</th><th>N° Chèque</th><th>Banque</th><th>Statut</th><th>Fournisseur</th><th class="r">Montant DHS</th><th>Note</th>
</tr></thead><tbody>
${filtered.map(p => {
  const bc = p.mode==='Espèce'?'b-esp':p.mode==='Chèque'?'b-chq':p.mode==='Virement'?'b-vir':'b-fou'
  const sl = p.cheque_status ? {pending:'En attente',validated:'Validé',rejected:'Rejeté'}[p.cheque_status] : '—'
  const sc = p.cheque_status ? `s-${p.cheque_status}` : ''
  return `<tr class="${p.cheque_status==='rejected'?'rej':''}">
    <td>${fmtDate(p.date)}</td><td><b>${p.client_nom}</b></td>
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
  <td colspan="7">TOTAL (${filtered.length})</td>
  <td class="r">− ${fmt(total)} DHS</td><td></td>
</tr></tfoot></table>
<div class="foot"><span>DAR SADIK — دار صديق — Selouane, Nador</span><span>Généré le ${printDateTime}</span></div>
</div></body></html>`)
  }

  // ── CSV ──
  function exportCSV() {
    let csv = `Date,Client,Mode,N° Chèque,Banque,Statut Chèque,Fournisseur,Montant DHS,Note\n`
    filtered.forEach(p => {
      csv += `${fmtDate(p.date)},${p.client_nom},${p.mode},${p.cheque_number||''},${p.cheque_bank||''},${p.cheque_status||''},${p.fournisseur_nom||''},${p.montant||0},"${p.note||''}"\n`
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

      <button type="submit" disabled={saving} className="btn-success w-full justify-center">
        {saving ? 'Enregistrement...' : '✓ Enregistrer le paiement'}
      </button>
    </form>
  )

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <Layout title="Paiements" subtitle="Suivi professionnel des paiements, chèques et virements fournisseurs">

      {isMobile ? (
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

          <button onClick={() => setShowForm(!showForm)}
            className="w-full mb-4 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all">
            {showForm ? '▲ Fermer' : '💰 + Nouveau paiement'}
          </button>
          {showForm && <div className="card mb-4">{FormContent}</div>}

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
              <div className="flex gap-2">
                <button onClick={() => { setFilterClient(''); setFilterMode(''); setFilterFrom(startOfMonth()); setFilterTo(today()); setFilterChequeStatus(''); setFilterFournisseur(''); setSearchCheque('') }}
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
                    {editingGrignonPmt?.id === p.id && (
                      <div className="flex items-center gap-2 mt-2 px-1" onClick={e => e.stopPropagation()}>
                        <input type="number" autoFocus className="input font-bold flex-1" placeholder="Nouveau montant"
                          value={editingGrignonPmt.montant}
                          onChange={e => setEditingGrignonPmt({...editingGrignonPmt, montant: e.target.value})}
                          onKeyDown={e => {
                            if (e.key === 'Enter') updateGrignonPaiementMontant(p.id, p.montant, p.client_id, parseFloat(editingGrignonPmt.montant)||0)
                            if (e.key === 'Escape') setEditingGrignonPmt(null)
                          }} />
                        <button className="btn-success text-xs px-3" onClick={() => updateGrignonPaiementMontant(p.id, p.montant, p.client_id, parseFloat(editingGrignonPmt.montant)||0)}>✓</button>
                        <button className="btn-secondary text-xs px-3" onClick={() => setEditingGrignonPmt(null)}>✕</button>
                      </div>
                    )}
                    <div className="card-meta">
                      <span>{p.mode}</span>
                      {p.note && <span>{p.note}</span>}
                    </div>
                    <div className="card-actions">
                      <button className="btn-secondary text-xs" onClick={e => { e.stopPropagation(); setEditingGrignonPmt({id: p.id, montant: p.montant}) }}>✎ Modifier</button>
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
                  {editingPmt?.id === p.id && (
                    <div className="flex items-center gap-2 mt-2 px-1" onClick={e => e.stopPropagation()}>
                      <input type="number" autoFocus className="input font-bold flex-1" placeholder="Nouveau montant"
                        value={editingPmt.montant}
                        onChange={e => setEditingPmt({...editingPmt, montant: e.target.value})}
                        onKeyDown={e => {
                          if (e.key === 'Enter') updatePaiementMontant(p.id, p.montant, p.client_id, parseFloat(editingPmt.montant)||0)
                          if (e.key === 'Escape') setEditingPmt(null)
                        }} />
                      <button className="btn-success text-xs px-3" onClick={() => updatePaiementMontant(p.id, p.montant, p.client_id, parseFloat(editingPmt.montant)||0)}>✓</button>
                      <button className="btn-secondary text-xs px-3" onClick={() => setEditingPmt(null)}>✕</button>
                    </div>
                  )}
                  <div className="card-meta">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${modeBadgeColor(p.mode)}`}>{p.mode}</span>
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
                    <button className="btn-secondary text-xs" onClick={e => { e.stopPropagation(); setEditingPmt({id: p.id, montant: p.montant}) }}>✎ Modifier</button>
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
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">💰 Nouveau paiement</h2>
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
                <button onClick={() => { setFilterClient(''); setFilterMode(''); setFilterFrom(startOfMonth()); setFilterTo(today()); setFilterChequeStatus(''); setFilterFournisseur(''); setSearchCheque('') }}
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
                            <td className="td text-right">
                              {editingGrignonPmt?.id === p.id ? (
                                <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                                  <input type="number" autoFocus
                                    className="input text-right font-bold" style={{width:100}}
                                    value={editingGrignonPmt.montant}
                                    onChange={e => setEditingGrignonPmt({...editingGrignonPmt, montant: e.target.value})}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') updateGrignonPaiementMontant(p.id, p.montant, p.client_id, parseFloat(editingGrignonPmt.montant)||0)
                                      if (e.key === 'Escape') setEditingGrignonPmt(null)
                                    }} />
                                  <button className="text-green-600 font-bold text-xs" onClick={() => updateGrignonPaiementMontant(p.id, p.montant, p.client_id, parseFloat(editingGrignonPmt.montant)||0)}>✓</button>
                                  <button className="text-gray-400 text-xs" onClick={() => setEditingGrignonPmt(null)}>✕</button>
                                </div>
                              ) : (
                                <span className="font-bold text-green-600 cursor-pointer hover:underline"
                                  title="Cliquer pour modifier"
                                  onClick={e => { e.stopPropagation(); setEditingGrignonPmt({id: p.id, montant: p.montant}) }}>
                                  − {fmt(p.montant)}
                                </span>
                              )}
                            </td>
                            <td className="td text-gray-400 text-xs">{p.note || '—'}</td>
                            <td className="td"><button className="btn-danger" onClick={() => deleteGrignonPaiement(p.id, p.client_id, p.montant)}>✕</button></td>
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
                          <td className="td text-right">
                            {editingPmt?.id === p.id ? (
                              <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                                <input type="number" autoFocus
                                  className="input text-right font-bold" style={{width:100}}
                                  value={editingPmt.montant}
                                  onChange={e => setEditingPmt({...editingPmt, montant: e.target.value})}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') updatePaiementMontant(p.id, p.montant, p.client_id, parseFloat(editingPmt.montant)||0)
                                    if (e.key === 'Escape') setEditingPmt(null)
                                  }} />
                                <button className="text-green-600 font-bold text-xs" onClick={() => updatePaiementMontant(p.id, p.montant, p.client_id, parseFloat(editingPmt.montant)||0)}>✓</button>
                                <button className="text-gray-400 text-xs" onClick={() => setEditingPmt(null)}>✕</button>
                              </div>
                            ) : (
                              <span className="font-bold text-green-600 cursor-pointer hover:underline"
                                title="Cliquer pour modifier"
                                onClick={e => { e.stopPropagation(); setEditingPmt({id: p.id, montant: p.montant}) }}>
                                − {fmt(p.montant)}
                              </span>
                            )}
                          </td>
                          <td className="td text-gray-400 text-xs">{p.note || '—'}</td>
                          <td className="td">
                            <button className="btn-danger" onClick={() => deletePaiement(p.id, p.client_id, p.montant)}>✕</button>
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr><td colSpan={9} className="td text-center text-gray-400 py-10">Aucun paiement pour cette sélection</td></tr>
                      )}
                    </tbody>
                    {filtered.length > 0 && (
                      <tfoot><tr>
                        <td className="tfoot-td" colSpan={6}>TOTAL REÇU ({filtered.length})</td>
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
