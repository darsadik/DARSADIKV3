import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmt, fmtDate, today, startOfMonth, openPrintWindow } from '../../lib/utils'

const fmtMois   = d => { if (!d) return ''; const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']; const [y,m] = d.split('-'); return `${months[parseInt(m)-1]} ${y}` }
const startOfWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().split('T')[0] }


export default function Clients() {
  const { user } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [clientVentes, setClientVentes] = useState([])
  const [clientPaiements, setClientPaiements] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nom: '', depot: 'EL HAJEB', tel: '', solde: 0, opening_balance: 0 })
  const [openingModal, setOpeningModal] = useState(null) // client being edited
  const [openingForm, setOpeningForm] = useState({ montant: '', date: '', note: '' })
  const [openingSaving, setOpeningSaving] = useState(false)
  const [showCustomDepot, setShowCustomDepot] = useState(false)
  const [customDepotValue, setCustomDepotValue] = useState('')
  const DEFAULT_DEPOTS = ['EL HAJEB', 'BERKANE', 'AHFIR', 'TAOUIMA', 'ZAIO']
  const getAllDepots = () => {
    const fromClients = clients.map(c => c.depot).filter(Boolean)
    return [...new Set([...DEFAULT_DEPOTS, ...fromClients])].sort()
  }
  const [saving, setSaving] = useState(false)

  const [editClientModal, setEditClientModal] = useState(null) // null | client
  const [editClientForm, setEditClientForm] = useState({ nom: '', depot: '', tel: '' })
  const [editClientSaving, setEditClientSaving] = useState(false)

  const [clientRemises, setClientRemises] = useState([])
  const [remiseModal, setRemiseModal] = useState(null) // null | 'new' | remise object
  const [remiseForm, setRemiseForm] = useState({ date: today(), montant: '', type_remise: 'Commerciale', motif: '' })
  const [remiseSaving, setRemiseSaving] = useState(false)
  const [remiseError, setRemiseError] = useState('')

  // MOBILE — controls whether detail panel is shown on small screens
  const [showDetail, setShowDetail] = useState(false)

  // DATE FILTER STATE
  const [filterType, setFilterType] = useState('all')
  const [filterDate, setFilterDate] = useState(today())
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo, setFilterTo] = useState(today())

  useEffect(() => { loadClients() }, [])

  async function loadClients() {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').order('solde', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  async function selectClient(client) {
    setSelected(client)
    setShowDetail(true)
    setLoadingDetail(true)
    const [{ data: ventes }, { data: paiements }, { data: remises }] = await Promise.all([
      supabase.from('ventes').select('*').eq('client_id', client.id).order('date', { ascending: true }),
      supabase.from('paiements').select('*').eq('client_id', client.id).order('date', { ascending: true }),
      supabase.from('remises').select('*').eq('client_id', client.id).order('date', { ascending: true }),
    ])
    setClientVentes(ventes || [])
    setClientPaiements(paiements || [])
    setClientRemises(remises || [])
    setLoadingDetail(false)
  }

  async function addClient(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('clients').insert({ ...form, solde: parseFloat(form.solde) || 0 })
    setSaving(false)
    setShowForm(false)
    setForm({ nom: '', depot: 'EL HAJEB', tel: '', solde: 0 })
    loadClients()
  }

  async function deleteClient(id) {
    if (!confirm('Supprimer ce client ?')) return
    await supabase.from('clients').delete().eq('id', id)
    if (selected?.id === id) { setSelected(null); setShowDetail(false) }
    loadClients()
  }

  function openEditClient(client) {
    setEditClientForm({ nom: client.nom || '', depot: client.depot || '', tel: client.tel || '' })
    setEditClientModal(client)
  }

  async function saveEditClient(e) {
    e.preventDefault()
    if (!editClientModal) return
    setEditClientSaving(true)
    const { nom, depot, tel } = editClientForm
    await supabase.from('clients').update({ nom: nom.trim(), depot: depot.trim(), tel: tel.trim() }).eq('id', editClientModal.id)
    setEditClientSaving(false)
    setEditClientModal(null)
    loadClients()
    if (selected?.id === editClientModal.id) {
      setSelected({ ...selected, nom: nom.trim(), depot: depot.trim(), tel: tel.trim() })
    }
  }

  async function editSolde(client) {
    const v = prompt(`Modifier le solde de ${client.nom} (actuel: ${fmt(client.solde)} DHS) :`, client.solde || 0)
    if (v === null) return
    const n = parseFloat(v)
    if (isNaN(n)) return
    await supabase.from('clients').update({ solde: n }).eq('id', client.id)
    loadClients()
    if (selected?.id === client.id) setSelected({ ...selected, solde: n })
  }

  function editOpeningBalance(client) {
    setOpeningModal(client)
    setOpeningForm({
      montant: String(client.opening_balance || ''),
      date:    client.opening_date || '',
      note:    client.opening_note || '',
    })
  }

  async function saveOpeningBalance(e) {
    e.preventDefault()
    if (!openingModal) return
    setOpeningSaving(true)
    const n = parseFloat(openingForm.montant) || 0
    const totalV = clientVentes.reduce((s, v2) => s + (v2.total_vente || 0), 0)
    const totalP = clientPaiements.reduce((s, p) => s + (p.montant || 0), 0)
    const totalR = clientRemises.reduce((s, r) => s + (r.montant || 0), 0)
    const newSolde = n + totalV - totalP - totalR
    await supabase.from('clients').update({
      opening_balance: n,
      opening_date:    openingForm.date || null,
      opening_note:    openingForm.note || null,
      solde:           newSolde,
    }).eq('id', openingModal.id)
    setOpeningSaving(false)
    setOpeningModal(null)
    loadClients()
    if (selected?.id === openingModal.id) {
      setSelected({ ...selected, opening_balance: n, opening_date: openingForm.date, opening_note: openingForm.note, solde: newSolde })
    }
  }

  // ---- DATE FILTER LOGIC ----
  function getDateRange() {
    if (filterType === 'all') return { from: null, to: null }
    if (filterType === 'day') return { from: filterDate, to: filterDate }
    if (filterType === 'week') return { from: startOfWeek(), to: today() }
    if (filterType === 'month') return { from: startOfMonth(), to: today() }
    if (filterType === 'custom') return { from: filterFrom, to: filterTo }
    return { from: null, to: null }
  }

  function filterByDate(items) {
    const { from, to } = getDateRange()
    if (!from && !to) return items
    return items.filter(item => {
      const d = item.date
      return (!from || d >= from) && (!to || d <= to)
    })
  }

  function getFilterLabel() {
    const { from, to } = getDateRange()
    if (!from) return 'Toutes les dates'
    if (filterType === 'day') return `Jour: ${filterDate}`
    if (filterType === 'week') return `Cette semaine`
    if (filterType === 'month') return `Ce mois`
    return `Du ${from} au ${to}`
  }

  const filteredVentes = filterByDate(clientVentes)
  const filteredPaiements = filterByDate(clientPaiements)
  const filteredRemises = filterByDate(clientRemises)
  const totalRemisesClient = filteredRemises.reduce((s, r) => s + (r.montant || 0), 0)

  // ── MONTHLY CARRY-OVER LOGIC ──
  // Computes: what did this client owe at the START of the filtered period?
  // = opening_balance + all ventes BEFORE period start - all payments BEFORE period start
  function getCarryOver() {
    const { from } = getDateRange()
    if (!from || filterType === 'all') return null  // no carry-over for "all time"
    const openingBal = selected?.opening_balance || 0
    const ventesBefore    = clientVentes.filter(v => v.date < from).reduce((s, v) => s + (v.total_vente || 0), 0)
    const paiementsBefore = clientPaiements.filter(p => p.date < from).reduce((s, p) => s + (p.montant || 0), 0)
    const remisesBefore   = clientRemises.filter(r => r.date < from).reduce((s, r) => s + (r.montant || 0), 0)
    return openingBal + ventesBefore - paiementsBefore - remisesBefore
  }

  function getPeriodLabel() {
    const { from } = getDateRange()
    if (!from) return null
    // e.g. "Avril 2025", "Mars 2025"
    const d = new Date(from)
    return d.toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' })
  }

  const carryOver    = selected ? getCarryOver() : null
  const periodLabel  = selected ? getPeriodLabel() : null

  // ---- PRINT ----
  function printClient() {
    const totalVentes = filteredVentes.reduce((s, v) => s + (v.total_vente || 0), 0)
    const totalPaiements = filteredPaiements.reduce((s, p) => s + (p.montant || 0), 0)
    const totalRemises = filteredRemises.reduce((s, r) => s + (r.montant || 0), 0)
    const _now = new Date()
    const date = _now.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' à ' + String(_now.getHours()).padStart(2,'0') + ':' + String(_now.getMinutes()).padStart(2,'0')
    const periode = getFilterLabel()
    const soldeFinPeriode = carryOver !== null
      ? carryOver + totalVentes - totalPaiements - totalRemises
      : (selected.solde || 0)

    const pLedger = buildLedger()

    function pMv(e) {
      const abs = Math.abs(e.delta)
      const isPos = e.delta >= 0
      const color = isPos ? '#1d4ed8' : '#16a34a'
      return `<span style="font-weight:800;color:${color}">${isPos ? '+ ' : '− '}${fmt(abs)}</span>`
    }
    function pDetail(e) {
      if (e.type === 'vente')         return [e.label !== '—' ? e.label : null, e.detail].filter(Boolean).join(' · ') || '—'
      if (e.type === 'mdo')           return e.note || "Main d'œuvre"
      if (e.type === 'remise-voyage') return e.note || 'Remise voyage'
      if (e.type === 'paiement')      return [e.label, e.note].filter(Boolean).join(' · ') || '—'
      if (e.type === 'remise')        return e.note || e.raw?.type_remise || 'Remise'
      return '—'
    }
    const ancienSoldeVal = carryOver !== null ? carryOver : (selected.opening_balance || 0)
    const showAncienSolde = ancienSoldeVal > 0

    openPrintWindow(`<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Fiche Client — ${selected.nom}</title>
<style>
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:13px;color:#1e293b;background:#fff;border-top:4px solid #1e3a5f}
  /* ── HEADER ── */
  .hdr{padding:14px 24px 10px;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e2e8f0}
  .co-left{display:flex;align-items:center;gap:11px}
  .co-logo{width:42px;height:42px;flex-shrink:0}
  .co-n{font-size:17px;font-weight:900;color:#1e3a5f;text-transform:uppercase;letter-spacing:0.5px;line-height:1.1}
  .co-tag{font-size:10px;color:#64748b;margin-top:2px;font-weight:600}
  .co-addr{font-size:9.5px;color:#94a3b8;margin-top:1px}
  .co-r{text-align:right}
  .doc-title{font-size:10.5px;font-weight:800;color:#1e3a5f;text-transform:uppercase;letter-spacing:0.14em;padding-bottom:4px;border-bottom:2px solid #e8b84b;display:inline-block;margin-bottom:6px}
  .co-contact{font-size:10px;color:#64748b;line-height:1.75}
  .co-contact strong{color:#374151}
  .co-email{font-size:9.5px;color:#94a3b8}
  .btn-p,.btn-d{padding:4px 10px;border:none;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;margin-left:4px}
  .btn-p{background:#475569;color:#fff}.btn-d{background:#16a34a;color:#fff}
  /* ── INFO BAR ── */
  .info-bar{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px 24px;background:#f8fafc;border-bottom:2px solid #e2e8f0}
  .icard{background:#fff;border:1px solid #e2e8f0;border-radius:7px;padding:8px 12px;border-left:3px solid #2563eb}
  .icard.period{border-left-color:#d97706}
  .icard-lbl{font-size:8.5px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px}
  .icard-main{font-size:14px;font-weight:800;color:#0f172a}
  .icard-sub{font-size:10px;color:#64748b;margin-top:2px}
  /* ── TABLE ── */
  .bdy{padding:10px 24px}
  table{width:100%;border-collapse:collapse}
  thead th{background:#eff6ff !important;color:#1d4ed8 !important;padding:9px 12px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;text-align:left;border-bottom:2px solid #bfdbfe;white-space:nowrap}
  thead th.r{text-align:right}
  tbody tr{page-break-inside:avoid}
  tbody td{padding:9px 12px;font-size:12.5px;color:#1e293b;border-bottom:1px solid #f1f5f9;vertical-align:middle;line-height:1.45}
  tbody td.r{text-align:right;font-family:'Courier New',monospace}
  tbody td.m{color:#94a3b8;font-size:11px}
  tbody tr:nth-child(even) td{background:#f9fafb !important}
  .tag{display:inline-block;padding:2px 7px;border-radius:3px;font-size:9.5px;font-weight:700;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;letter-spacing:0.03em;white-space:nowrap}
  /* ── TOTALS ── */
  .totals-row{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#eff6ff;border-top:2px solid #bfdbfe;border-bottom:1px solid #bfdbfe;font-weight:700;font-size:12px;color:#1d4ed8}
  /* ── FINAL BALANCE ── */
  .solde-final{background:#f0fdf4;border:2px solid #86efac;border-radius:12px;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;margin-top:14px}
  .sf-lbl{font-size:14px;font-weight:700;color:#166534;letter-spacing:0.01em}
  .sf-amt{font-size:32px;font-weight:900;color:#15803d;line-height:1;letter-spacing:-0.5px}
  .sf-unit{font-size:14px;font-weight:600;color:#4ade80;margin-left:4px}
  .sf-sub{font-size:11px;color:#86efac;margin-top:4px;font-weight:500}
  .foot{margin-top:12px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9.5px;color:#94a3b8}
  @media print{.btn-p,.btn-d{display:none !important}}
  @page{size:A4;margin:7mm 10mm}
</style>
</head><body>
<div class="hdr">
  <div class="co-left">
    <svg class="co-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <rect width="512" height="512" rx="90" fill="#1e3a5f"/>
      <polygon points="40,170 256,50 472,170" fill="#e8b84b"/>
      <rect x="60" y="175" width="115" height="70" rx="12" fill="#ffffff" opacity="0.95"/>
      <rect x="195" y="175" width="122" height="70" rx="12" fill="#ffffff" opacity="0.95"/>
      <rect x="337" y="175" width="115" height="70" rx="12" fill="#ffffff" opacity="0.95"/>
      <rect x="60" y="260" width="85" height="70" rx="12" fill="#e8b84b" opacity="0.95"/>
      <rect x="165" y="260" width="122" height="70" rx="12" fill="#e8b84b" opacity="0.95"/>
      <rect x="307" y="260" width="145" height="70" rx="12" fill="#e8b84b" opacity="0.95"/>
      <rect x="60" y="345" width="115" height="70" rx="12" fill="#ffffff" opacity="0.85"/>
      <rect x="195" y="345" width="122" height="70" rx="12" fill="#ffffff" opacity="0.85"/>
      <rect x="337" y="345" width="115" height="70" rx="12" fill="#ffffff" opacity="0.85"/>
      <rect x="40" y="425" width="432" height="14" rx="7" fill="#e8b84b" opacity="0.5"/>
    </svg>
    <div>
      <div class="co-n">DAR SADIK</div>
      <div class="co-tag">Matériaux de Construction</div>
      <div class="co-addr">Selouane, Nador</div>
    </div>
  </div>
  <div class="co-r">
    <div class="doc-title">Relevé de Compte Client</div>
    <div class="co-contact">
      <div><strong>Mohamed</strong> 06 61 32 56 65 &nbsp;·&nbsp; <strong>Sadik</strong> 06 61 97 87 47</div>
      <div><strong>Bureau</strong> 06 62 82 88 20</div>
      <div class="co-email">Dar.sadik@hotmail.com</div>
    </div>
    <div style="margin-top:6px"><button class="btn-p" onclick="window.print()">Imprimer</button><button class="btn-d" onclick="window.print()">Télécharger PDF</button></div>
    <div style="font-size:9.5px;color:#94a3b8;margin-top:3px">Généré le ${date}</div>
  </div>
</div>
<div class="info-bar">
  <div class="icard">
    <div class="icard-lbl">Client</div>
    <div class="icard-main">${selected.nom}</div>
    <div class="icard-sub">Dépôt : ${selected.depot||'—'}${selected.tel?' &nbsp;·&nbsp; '+selected.tel:''}</div>
  </div>
  <div class="icard period">
    <div class="icard-lbl">Période</div>
    <div class="icard-main" style="font-size:12px">${periode}</div>
    <div class="icard-sub">Généré le ${date}</div>
  </div>
</div>
<div class="bdy">
<table>
  <thead><tr><th>Date</th><th>Camion</th><th>Opération</th><th>Type</th><th class="r">Qté</th><th class="r">Prix/u</th><th class="r">Total DHS</th><th class="r">Solde</th><th>Note</th></tr></thead>
  <tbody>
    <tr style="background:#fffbeb !important">
      <td style="color:#92400e;font-size:11.5px;white-space:nowrap">${carryOver !== null ? `Avant ${periodLabel}` : (selected.opening_date ? fmtDate(selected.opening_date) : '—')}</td>
      <td class="m">—</td>
      <td style="font-weight:700;color:#92400e;font-size:11.5px;white-space:nowrap">${carryOver !== null ? 'Report' : 'Solde initial'}</td>
      <td class="m">—</td>
      <td class="r m">—</td><td class="r m">—</td><td class="r m">—</td>
      <td class="r" style="color:#d97706;font-weight:800;font-size:13.5px;white-space:nowrap">+ ${fmt(pLedger.startBalance)}</td>
      <td class="m">${carryOver !== null ? `Début de ${periodLabel}` : (selected.opening_note || 'Solde de départ')}</td>
    </tr>
    ${pLedger.entries.length === 0
      ? '<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:18px;font-style:italic">Aucune opération pour cette période</td></tr>'
      : pLedger.entries.map(e => {
          const abs = Math.abs(e.delta)
          const isPos = e.delta >= 0
          const mvColor = isPos ? '#1d4ed8' : '#16a34a'
          const isVente = e.src === 'vente'
          const v = e.raw
          const rowBg = (e.type === 'remise' || e.type === 'remise-voyage' || e.type === 'paiement') ? '#f0fdf4'
            : e.type === 'mdo' ? '#fffbeb' : ''
          const soldeColor = e.solde > 0 ? '#d97706' : '#16a34a'
          const typeBadge = e.type === 'vente'
            ? `<span class="tag">${e.label}</span>`
            : e.type === 'mdo'
            ? `<span class="tag" style="background:#fef9c3;color:#92400e;border-color:#fde68a">M.O.</span>`
            : `<span class="tag" style="background:#dcfce7;color:#15803d;border-color:#bbf7d0">${e.type === 'paiement' ? e.label : 'Remise'}</span>`
          return `<tr style="${rowBg ? `background:${rowBg} !important` : ''}">
            <td style="color:#64748b;font-size:11.5px;white-space:nowrap">${fmtDate(e.date)}</td>
            <td class="m" style="white-space:nowrap">${e.detail || '—'}</td>
            <td style="font-size:11.5px;font-weight:600;color:#374151;white-space:nowrap">${e.operation}</td>
            <td style="white-space:nowrap">${typeBadge}</td>
            <td class="r" style="font-weight:400;color:#374151;font-size:12px">${isVente && e.type !== 'remise-voyage' && e.type !== 'mdo' ? fmt(v.qte) : '<span style="color:#cbd5e1">—</span>'}</td>
            <td class="r" style="font-weight:500;color:#64748b;font-size:12px">${isVente && e.type !== 'remise-voyage' && e.type !== 'mdo' ? parseFloat(v.prix_vente||0).toFixed(2) : '<span style="color:#cbd5e1">—</span>'}</td>
            <td class="r" style="font-size:13px"><span style="font-weight:800;color:${mvColor}">${isPos ? '+ ' : '− '}${fmt(abs)}</span></td>
            <td class="r" style="font-weight:800;font-size:13.5px;color:${soldeColor};white-space:nowrap">${e.solde >= 0 ? '+ ' + fmt(e.solde) : '− ' + fmt(Math.abs(e.solde))}</td>
            <td class="m" style="font-size:11px;max-width:120px">${e.note || '—'}</td>
          </tr>`
        }).join('')}
  </tbody>
</table>
${pLedger.entries.length > 0 ? `<div class="totals-row">
  <span>Total — ${pLedger.entries.length} opération${pLedger.entries.length !== 1 ? 's' : ''}</span>
  <span style="font-size:13px;font-weight:800;font-family:'Courier New',monospace">${fmt(pLedger.finalBalance)} DHS</span>
</div>` : ''}
<div class="solde-final">
  <div>
    <div class="sf-lbl">Solde actuel à payer</div>
    <div class="sf-sub">${periode}</div>
  </div>
  <div style="text-align:right">
    <div style="line-height:1"><span class="sf-amt">${fmt(pLedger.finalBalance)}</span><span class="sf-unit">DHS</span></div>
  </div>
</div>
<div class="foot"><span>DAR SADIK — Matériaux de Construction — Selouane, Nador</span><span>Généré le ${date}</span></div>
</div></body></html>`)
  }

  // ---- EXPORT CSV ----
  function exportClientExcel() {
    const totalVentes = filteredVentes.reduce((s, v) => s + (v.total_vente || 0), 0)
    const totalPaiements = filteredPaiements.reduce((s, p) => s + (p.montant || 0), 0)
    const periode = getFilterLabel()

    let csv = `FICHE CLIENT — DAR SADIK\n`
    csv += `Nom,${selected.nom}\nDépôt,${selected.depot||''}\nTéléphone,${selected.tel||''}\nSolde DHS,${selected.solde||0}\nPériode,${periode}\nTotal Ventes DHS,${totalVentes}\nTotal Paiements DHS,${totalPaiements}\n\n`
    csv += `VENTES\nDate,Transport,Type,Quantité,Prix Vente/u,Total DHS\n`
    filteredVentes.forEach(v => {
      csv += `${fmtDate(v.date)},${v.camion_plaque},${v.type_brique||''},${v.qte||0},${v.prix_vente||0},${v.total_vente||0}\n`
    })
    csv += `\nPAIEMENTS\nDate,Mode,Montant DHS,Note\n`
    filteredPaiements.forEach(p => {
      csv += `${fmtDate(p.date)},${p.mode},${p.montant||0},${p.note||''}\n`
    })

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Client-${selected.nom}-${periode.replace(/[^a-zA-Z0-9]/g,'-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = clients.filter(c => !search || (c.nom + c.depot).toLowerCase().includes(search.toLowerCase()))
  const totalCreances = filtered.reduce((s, c) => s + (c.solde || 0), 0)
  const totalVentesClient = filteredVentes.reduce((s, v) => s + (v.total_vente || 0), 0)
  const totalPaiementsClient = filteredPaiements.reduce((s, p) => s + (p.montant || 0), 0)
  const ledger = selected && !loadingDetail ? buildLedger() : { entries: [], startBalance: 0, finalBalance: 0 }

  // ── RECONCILIATION — computed vs stored solde ───────────────────────────────
  const computedSolde = selected && !loadingDetail
    ? (selected.opening_balance || 0)
      + clientVentes.reduce((s, v) => s + (v.total_vente || 0), 0)
      - clientPaiements.reduce((s, p) => s + (p.montant || 0), 0)
      - clientRemises.reduce((s, r) => s + (r.montant || 0), 0)
    : null
  const soldeGap = computedSolde !== null ? Math.abs(computedSolde - (selected?.solde || 0)) : 0
  const hasDiscrepancy = soldeGap > 1

  async function fixSolde() {
    if (!selected || computedSolde === null) return
    if (!confirm(`Corriger le solde de ${selected.nom} ?\n${fmt(selected.solde)} DHS → ${fmt(computedSolde)} DHS`)) return
    await supabase.from('clients').update({ solde: computedSolde }).eq('id', selected.id)
    loadClients()
    setSelected({ ...selected, solde: computedSolde })
  }

  function buildLedger() {
    const startBalance = carryOver !== null ? carryOver : (selected?.opening_balance || 0)
    const entries = []

    function opLabel(type, typeRemise) {
      if (type === 'vente')         return 'Livraison'
      if (type === 'mdo')           return "Main d'œuvre"
      if (type === 'remise-voyage') return 'Remise'
      if (type === 'paiement')      return 'Paiement'
      if (type === 'remise') {
        if (typeRemise === 'Fidélité')    return 'Remise fidélité'
        if (typeRemise === 'Commerciale') return 'Remise commerciale'
        if (typeRemise === 'Correction')  return 'Correction'
        return 'Remise'
      }
      return 'Autre'
    }

    function makeRef(type, raw) {
      if (type === 'paiement') {
        const mode = (raw.mode || '').trim()
        const pre = mode.startsWith('Chèque') ? 'CHQ'
          : mode.startsWith('Virement') ? 'VIR'
          : mode.startsWith('Espèce')   ? 'ESP'
          : mode.startsWith('Traite')   ? 'TRT'
          : mode.substring(0,3).toUpperCase() || 'PMT'
        return `${pre}-${(raw.date||'').replace(/-/g,'')}`
      }
      return raw.bon || ''
    }

    filteredVentes.forEach(v => {
      const isRemiseVoyage = v.type_entree === 'remise'
      const isMdo = v.type_entree === 'mdo'
      const type = isRemiseVoyage ? 'remise-voyage' : isMdo ? 'mdo' : 'vente'
      entries.push({
        date: v.date,
        created_at: v.created_at || '',
        type,
        label: isRemiseVoyage ? 'Remise' : isMdo ? "Main d'œuvre" : (v.type_brique || '—'),
        detail: v.camion_plaque || '',
        note: isRemiseVoyage ? (v.description_mdo || v.note || '') : isMdo ? (v.description_mdo || '') : (v.note || ''),
        operation: opLabel(type, null),
        reference: makeRef(type, v),
        delta: v.total_vente || 0,
        src: 'vente',
        raw: v,
      })
    })

    filteredPaiements.forEach(p => entries.push({
      date: p.date,
      created_at: p.created_at || '',
      type: 'paiement',
      label: p.mode || 'Paiement',
      detail: p.camion_plaque || '',
      note: p.note || '',
      operation: 'Paiement',
      reference: makeRef('paiement', p),
      delta: -(p.montant || 0),
      src: 'paiement',
      raw: p,
    }))

    filteredRemises.forEach(r => entries.push({
      date: r.date,
      created_at: r.created_at || '',
      type: 'remise',
      label: r.type_remise || 'Remise',
      detail: '',
      note: r.motif || '',
      operation: opLabel('remise', r.type_remise),
      reference: '',
      delta: -(r.montant || 0),
      src: 'remise',
      raw: r,
    }))

    entries.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      return a.created_at < b.created_at ? -1 : 1
    })

    let balance = startBalance
    entries.forEach(e => { balance += e.delta; e.solde = balance })

    return { entries, startBalance, finalBalance: balance }
  }

  async function reloadRemises() {
    const { data } = await supabase.from('remises').select('*').eq('client_id', selected.id).order('date', { ascending: true })
    setClientRemises(data || [])
  }

  async function saveRemise(e) {
    e.preventDefault()
    setRemiseSaving(true)
    setRemiseError('')
    const montant = parseFloat(remiseForm.montant) || 0
    if (remiseModal === 'new') {
      const { error } = await supabase.from('remises').insert({
        date: remiseForm.date,
        client_id: selected.id,
        client_nom: selected.nom,
        montant,
        type_remise: remiseForm.type_remise,
        motif: remiseForm.motif || null,
        created_by: user?.email || null,
      })
      if (error) { setRemiseError(error.message); setRemiseSaving(false); return }
      const newSolde = (selected.solde || 0) - montant
      await supabase.from('clients').update({ solde: newSolde }).eq('id', selected.id)
      setSelected({ ...selected, solde: newSolde })
    } else {
      const delta = montant - (remiseModal.montant || 0)
      const { error } = await supabase.from('remises').update({
        date: remiseForm.date,
        montant,
        type_remise: remiseForm.type_remise,
        motif: remiseForm.motif || null,
      }).eq('id', remiseModal.id)
      if (error) { setRemiseError(error.message); setRemiseSaving(false); return }
      const newSolde = (selected.solde || 0) - delta
      await supabase.from('clients').update({ solde: newSolde }).eq('id', selected.id)
      setSelected({ ...selected, solde: newSolde })
    }
    setRemiseSaving(false)
    setRemiseModal(null)
    setRemiseError('')
    loadClients()
    await reloadRemises()
  }

  async function deleteRemise(r) {
    if (!confirm(`Supprimer la remise de ${fmt(r.montant)} DHS ?`)) return
    await supabase.from('remises').delete().eq('id', r.id)
    const newSolde = (selected.solde || 0) + (r.montant || 0)
    await supabase.from('clients').update({ solde: newSolde }).eq('id', selected.id)
    setSelected({ ...selected, solde: newSolde })
    loadClients()
    setClientRemises(clientRemises.filter(x => x.id !== r.id))
  }

  const handleBack = () => { setShowDetail(false) }

  function exportClientExcel() {
    if (!selected) return
    const header = ['Date','Type','Camion','Produit','Qte','Prix','Total DHS','BON','Note']
    const venteRows = filteredVentes.map(v => [
      fmtDate(v.date),
      v.type_entree === 'remise' ? 'Remise' : v.type_entree === 'mdo' ? 'Charge' : 'Vente',
      v.camion_plaque || '', v.type_brique || '',
      v.type_entree === 'brique' ? (v.qte || 0) : '',
      v.type_entree === 'brique' ? (v.prix_vente || 0) : '',
      v.type_entree === 'remise' ? -(v.montant_mdo || 0) : (v.total_vente || 0),
      v.bon || '', v.note || ''
    ])
    const pHeader = ['Date','Mode','Camion','Montant DHS','Note']
    const pRows = filteredPaiements.map(p => [fmtDate(p.date), p.mode, p.camion_plaque || '', p.montant || 0, p.note || ''])
    const all = [header, ...venteRows, [], pHeader, ...pRows]
    const csv = all.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (selected.nom || 'Client') + '-' + today() + '.csv'
    a.click()
  }


  return (
    <Layout title="Clients Briques" subtitle="Gestion des clients et suivi des comptes">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* CLIENT LIST — hidden on mobile when detail is open */}
        <div className={`lg:col-span-1 ${showDetail ? 'hidden lg:block' : 'block'}`}>
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Liste clients</h2>
              <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs px-3 py-1.5">+ Nouveau</button>
            </div>

            {showForm && (
              <form onSubmit={addClient} className="bg-blue-50 rounded-xl p-4 mb-4 space-y-3">
                <div>
                  <label className="label">Nom complet</label>
                  <input className="input" placeholder="Nom du client" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Dépôt</label>
                    {!showCustomDepot ? (
                      <div className="flex gap-1">
                        <select className="input flex-1" value={form.depot} onChange={e => setForm({...form, depot: e.target.value})}>
                          {getAllDepots().map(d => <option key={d}>{d}</option>)}
                        </select>
                        <button type="button" title="Ajouter un nouveau dépôt"
                          onClick={() => setShowCustomDepot(true)}
                          className="btn-secondary text-xs px-2">+ Nouveau</button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <input className="input flex-1" placeholder="Nom du dépôt..." value={customDepotValue}
                          onChange={e => setCustomDepotValue(e.target.value.toUpperCase())} />
                        <button type="button" className="btn-primary text-xs px-2"
                          onClick={() => { if(customDepotValue.trim()) { setForm({...form, depot: customDepotValue.trim()}); setShowCustomDepot(false) } }}>
                          ✓
                        </button>
                        <button type="button" className="btn-secondary text-xs px-2"
                          onClick={() => setShowCustomDepot(false)}>✕</button>
                      </div>
                    )}
                    {showCustomDepot && <div className="text-xs text-gray-400 mt-1">Tapez le nom du nouveau dépôt</div>}
                  </div>
                  <div>
                    <label className="label">Téléphone</label>
                    <input className="input" placeholder="06 ..." value={form.tel} onChange={e => setForm({...form, tel: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="label">Solde d'ouverture (ancien solde DHS)</label>
                  <input className="input" type="number" placeholder="0" value={form.opening_balance} onChange={e => setForm({...form, opening_balance: e.target.value, solde: e.target.value})} />
                  <div className="text-xs text-gray-400 mt-1">Montant dû par ce client avant cette app</div>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={saving} className="btn-primary text-xs">{saving ? 'Enregistrement...' : '✓ Enregistrer'}</button>
                  <button type="button" className="btn-secondary text-xs" onClick={() => setShowForm(false)}>Annuler</button>
                </div>
              </form>
            )}

            <input className="input mb-3" placeholder="Rechercher un client..." value={search} onChange={e => setSearch(e.target.value)} />

            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {loading ? (
                <div className="text-center text-gray-400 py-6">Chargement...</div>
              ) : filtered.map(c => {
                const s = c.solde || 0
                const isActive = selected?.id === c.id
                return (
                  <div
                    key={c.id}
                    onClick={() => selectClient(c)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && selectClient(c)}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border select-none
                      ${isActive ? 'bg-brand-50 border-brand-200' : 'bg-gray-50 border-gray-100 hover:bg-gray-100 active:bg-blue-50'}`}
                    style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-sm truncate ${isActive ? 'text-brand-700' : 'text-gray-900'}`}>{c.nom}</div>
                      <div className="text-xs text-gray-400">{c.depot}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`text-xs font-bold ${s >= 100000 ? 'text-red-600' : s >= 30000 ? 'text-amber-600' : s > 0 ? 'text-blue-600' : 'text-green-600'}`}>
                        {fmt(s)} DHS
                      </div>
                      <span className="text-gray-300 lg:hidden">›</span>
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && <div className="text-center text-gray-400 py-6">Aucun client</div>}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-sm">
              <span className="text-gray-500 font-medium">Total créances</span>
              <span className="font-bold text-red-600">{fmt(totalCreances)} DHS</span>
            </div>
          </div>
        </div>

        {/* CLIENT DETAIL — shown on mobile only when showDetail=true */}
        <div className={`lg:col-span-2 ${showDetail ? 'block' : 'hidden lg:block'}`}>
          {!selected ? (
            <div className="card flex flex-col items-center justify-center py-20 text-center">
              <div className="text-4xl mb-4">👈</div>
              <div className="text-gray-500 font-medium">Sélectionnez un client</div>
              <div className="text-gray-400 text-sm mt-1">pour voir son historique complet</div>
            </div>
          ) : (
            <div className="space-y-4">

              {/* CLIENT HEADER */}
              <div className="card">
                {/* MOBILE BACK BUTTON */}
                <button
                  onClick={handleBack}
                  className="lg:hidden flex items-center gap-2 text-blue-600 text-sm font-semibold mb-4 active:opacity-70"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  ← Retour à la liste
                </button>

                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-brand-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                      <span className="text-brand-700 font-black text-xl">{selected.nom[0]}</span>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selected.nom}</h2>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="badge-gray">{selected.depot}</span>
                        {selected.tel && <span className="text-sm text-gray-500">📞 {selected.tel}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div style={{display:'flex',gap:'6px'}}>
                    <button onClick={printClient} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ PDF</button>
                    <button onClick={exportClientExcel} className="btn-primary text-xs px-3 py-1.5" style={{background:'#16a34a'}}>📊 Excel</button>
                  </div>
                    <button onClick={exportClientExcel} className="btn-primary text-xs px-3 py-1.5" style={{background:'#16a34a'}}>📥 Excel</button>
                    <button onClick={() => openEditClient(selected)} className="btn-secondary text-xs">✎ Client</button>
                    <button onClick={() => editSolde(selected)} className="btn-secondary text-xs">✎ Solde</button>
                    <button onClick={() => editOpeningBalance(selected)} className="btn-secondary text-xs" style={{background:'#fef3c7',color:'#92400e',borderColor:'#fde68a'}}>🏦 Solde initial</button>
                    <button onClick={() => deleteClient(selected.id)} className="btn-danger">✕</button>
                  </div>
                </div>

                {/* DATE FILTER BAR */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">📅 Filtrer par période</div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {[
                      { key: 'all', label: 'Tout' },
                      { key: 'day', label: 'Jour' },
                      { key: 'week', label: 'Semaine' },
                      { key: 'month', label: 'Mois' },
                      { key: 'custom', label: 'Personnalisé' },
                    ].map(f => (
                      <button key={f.key} onClick={() => setFilterType(f.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all
                          ${filterType === f.key ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {filterType === 'day' && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Date:</label>
                      <input type="date" className="input text-xs" style={{width:'160px'}} value={filterDate} onChange={e => setFilterDate(e.target.value)} />
                    </div>
                  )}
                  {filterType === 'custom' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-xs text-gray-500">Du:</label>
                      <input type="date" className="input text-xs" style={{width:'150px'}} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
                      <label className="text-xs text-gray-500">Au:</label>
                      <input type="date" className="input text-xs" style={{width:'150px'}} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
                    </div>
                  )}
                  {filterType !== 'all' && (
                    <div className="mt-2 text-xs text-brand-600 font-semibold">
                      📅 Période affichée: {getFilterLabel()}
                    </div>
                  )}
                </div>

                {/* SOLDE ACTUEL À PAYER */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Solde actuel</span>
                    {((selected.opening_balance || 0) > 0 || carryOver !== null) && (
                      <span className="text-xs text-gray-400">· Report: {fmt(carryOver !== null ? carryOver : (selected.opening_balance || 0))} DHS</span>
                    )}
                  </div>
                  <span className="text-xl font-black" style={{color:(selected.solde||0)>0?'#d97706':'#16a34a'}}>
                    {fmt(selected.solde || 0)} <span className="text-sm font-semibold text-gray-400">DHS</span>
                  </span>
                </div>

                {/* RECONCILIATION BADGE — shown only when detail is loaded */}
                {!loadingDetail && computedSolde !== null && (
                  hasDiscrepancy ? (
                    <div className="mt-3 p-3 rounded-xl text-xs flex items-center justify-between gap-3 flex-wrap"
                      style={{background:'#fffbeb', border:'1px solid #fde68a'}}>
                      <div>
                        <div className="font-bold text-amber-700 mb-1">⚠️ Solde incohérent détecté</div>
                        <div className="text-amber-600">
                          Solde enregistré: <strong>{fmt(selected.solde)} DHS</strong>
                          {' '}· Solde calculé (base transactionnelle): <strong>{fmt(computedSolde)} DHS</strong>
                          {' '}· Écart: <strong>{fmt(soldeGap)} DHS</strong>
                        </div>
                        <div className="text-amber-500 mt-1">
                          Calcul: Solde initial ({fmt(selected.opening_balance || 0)}) + Ventes ({fmt(clientVentes.reduce((s,v)=>s+(v.total_vente||0),0))}) − Paiements ({fmt(clientPaiements.reduce((s,p)=>s+(p.montant||0),0))}) − Remises ({fmt(clientRemises.reduce((s,r)=>s+(r.montant||0),0))})
                        </div>
                      </div>
                      <button onClick={fixSolde}
                        className="flex-shrink-0 bg-amber-500 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-amber-600 transition">
                        Corriger → {fmt(computedSolde)} DHS
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 px-3 py-2 rounded-xl text-xs flex items-center gap-2"
                      style={{background:'#f0fdf4', border:'1px solid #bbf7d0'}}>
                      <span className="text-green-600 font-bold">✓ Solde vérifié</span>
                      <span className="text-green-500">Le solde enregistré correspond aux transactions ({fmt(computedSolde)} DHS)</span>
                    </div>
                  )
                )}
              </div>

              {loadingDetail ? (
                <div className="card text-center py-10 text-gray-400">Chargement...</div>
              ) : (
                <>
                  {/* ── UNIFIED ACCOUNT LEDGER ── */}
                  <div className="card">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <h3 className="font-semibold text-gray-900">
                        📋 Historique du compte <span className="text-gray-400 font-normal text-sm">({ledger.entries.length} opération{ledger.entries.length !== 1 ? 's' : ''})</span>
                      </h3>
                      <button
                        onClick={() => { setRemiseForm({ date: today(), montant: '', type_remise: 'Commerciale', motif: '' }); setRemiseError(''); setRemiseModal('new') }}
                        className="btn-primary text-xs px-3 py-1.5" style={{background:'#7c3aed'}}>
                        + Remise
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            {['Date','Camion','Opération','Type','Qté','Prix/u','Total DHS','Solde','Note',''].map((h,i) => (
                              <th key={i} className={`th${[4,5,6,7].includes(i)?' text-right':''}`}
                                style={{background:'#eff6ff',color:'#1d4ed8',borderBottom:'2px solid #bfdbfe',whiteSpace:'nowrap'}}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {/* Opening balance / carry-over row */}
                          <tr style={{background:'#fffbeb'}}>
                            <td className="td text-xs" style={{border:'1px solid #fde68a',color:'#92400e',whiteSpace:'nowrap',padding:'10px 14px'}}>
                              {carryOver !== null ? `Avant ${periodLabel}` : (selected.opening_date ? fmtDate(selected.opening_date) : '—')}
                            </td>
                            <td className="td text-center text-gray-300" style={{border:'1px solid #fde68a',padding:'10px 14px'}}>—</td>
                            <td className="td text-xs text-amber-700 font-semibold" style={{border:'1px solid #fde68a',padding:'10px 14px'}}>
                              {carryOver !== null ? 'Report' : 'Solde initial'}
                            </td>
                            <td className="td text-center text-gray-300" style={{border:'1px solid #fde68a',padding:'10px 14px'}}>—</td>
                            {[0,1,2].map(k => <td key={k} className="td text-center text-gray-200" style={{border:'1px solid #fde68a',padding:'10px 14px'}}>—</td>)}
                            <td className="td text-right font-black" style={{border:'1px solid #fde68a',color:'#b45309',fontSize:15,whiteSpace:'nowrap',padding:'10px 16px',letterSpacing:'-0.2px'}}>
                              {fmt(ledger.startBalance)}
                            </td>
                            <td className="td text-xs text-gray-400" style={{border:'1px solid #fde68a',padding:'10px 14px'}}>
                              {carryOver !== null ? `Début de ${periodLabel}` : (selected.opening_note || 'Solde de départ')}
                            </td>
                            <td className="td" style={{border:'1px solid #fde68a',padding:'10px 14px'}}></td>
                          </tr>

                          {ledger.entries.length === 0 && (
                            <tr>
                              <td colSpan={11} className="td text-center text-gray-400 py-8" style={{border:'1px solid #e2e8f0'}}>
                                Aucune opération pour cette période
                              </td>
                            </tr>
                          )}

                          {ledger.entries.map((e, i) => {
                            const isVente = e.src === 'vente'
                            const isPos = e.delta >= 0
                            const absAmt = Math.abs(e.delta)
                            const bgRow = (e.type === 'remise' || e.type === 'remise-voyage' || e.type === 'paiement') ? '#f0fdf4'
                              : e.type === 'mdo' ? '#fefce8'
                              : undefined
                            const amtColor = isPos ? '#1d4ed8' : '#16a34a'
                            const v = e.raw
                            return (
                              <tr key={`${e.src}-${v?.id}-${i}`}
                                className="transition-all duration-100 hover:brightness-95"
                                style={bgRow ? {background:bgRow} : (i % 2 === 1 ? {background:'#f9fafb'} : {})}>
                                <td className="td text-xs" style={{border:'1px solid #f1f5f9',color:'#64748b',whiteSpace:'nowrap',padding:'10px 14px'}}>{fmtDate(e.date)}</td>
                                <td className="td text-xs" style={{border:'1px solid #f1f5f9',whiteSpace:'nowrap',color:'#374151',padding:'10px 14px'}}>
                                  {e.detail || <span className="text-gray-200">—</span>}
                                </td>
                                <td className="td text-xs font-semibold" style={{border:'1px solid #f1f5f9',whiteSpace:'nowrap',color:'#374151',padding:'10px 14px'}}>
                                  {e.operation}
                                </td>
                                <td className="td" style={{border:'1px solid #f1f5f9',whiteSpace:'nowrap',padding:'10px 14px'}}>
                                  {e.type === 'vente'
                                    ? <span style={{background:'#eff6ff',color:'#1d4ed8',fontWeight:700,fontSize:10,padding:'2px 7px',borderRadius:3,letterSpacing:'0.03em',border:'1px solid #bfdbfe',whiteSpace:'nowrap'}}>{e.label}</span>
                                    : e.type === 'mdo'
                                    ? <span style={{background:'#fef9c3',color:'#92400e',fontWeight:700,fontSize:10,padding:'2px 7px',borderRadius:3,letterSpacing:'0.03em',border:'1px solid #fde68a',whiteSpace:'nowrap'}}>M.O.</span>
                                    : <span style={{background:'#dcfce7',color:'#15803d',fontWeight:700,fontSize:10,padding:'2px 7px',borderRadius:3,letterSpacing:'0.03em',border:'1px solid #bbf7d0',whiteSpace:'nowrap'}}>
                                        {e.type === 'paiement' ? e.label : 'Remise'}
                                      </span>}
                                </td>
                                <td className="td text-right" style={{border:'1px solid #f1f5f9',whiteSpace:'nowrap',padding:'10px 14px',fontWeight:400,color:'#374151',fontSize:13}}>
                                  {isVente && e.type !== 'remise-voyage' && e.type !== 'mdo' ? fmt(v.qte) : <span className="text-gray-200">—</span>}
                                </td>
                                <td className="td text-right" style={{border:'1px solid #f1f5f9',whiteSpace:'nowrap',padding:'10px 14px',fontWeight:500,color:'#64748b',fontSize:12}}>
                                  {isVente && e.type !== 'remise-voyage' && e.type !== 'mdo' ? parseFloat(v.prix_vente||0).toFixed(2) : <span className="text-gray-200">—</span>}
                                </td>
                                <td className="td text-right" style={{border:'1px solid #f1f5f9',fontSize:14,fontWeight:700,whiteSpace:'nowrap',padding:'10px 14px',color:amtColor}}>
                                  {isPos ? `+ ${fmt(absAmt)}` : `− ${fmt(absAmt)}`}
                                </td>
                                <td className="td text-right" style={{border:'1px solid #f1f5f9',fontSize:15,fontWeight:900,whiteSpace:'nowrap',padding:'10px 16px',
                                  color: e.solde > 0 ? '#d97706' : '#16a34a',letterSpacing:'-0.2px'}}>
                                  {e.solde >= 0 ? `+ ${fmt(e.solde)}` : `− ${fmt(Math.abs(e.solde))}`}
                                </td>
                                <td className="td text-xs text-gray-400" style={{border:'1px solid #f1f5f9',maxWidth:'150px',wordBreak:'break-word',padding:'10px 14px'}}>
                                  {e.note || '—'}
                                </td>
                                <td className="td" style={{border:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>
                                  {e.src === 'remise' && (
                                    <div className="flex gap-1 justify-center">
                                      <button onClick={() => { setRemiseForm({ date: v.date, montant: String(v.montant), type_remise: v.type_remise||'Commerciale', motif: v.motif||'' }); setRemiseError(''); setRemiseModal(v) }}
                                        className="btn-secondary" style={{fontSize:10,padding:'2px 6px'}}>✎</button>
                                      <button onClick={() => deleteRemise(v)}
                                        className="btn-danger" style={{fontSize:10,padding:'2px 6px'}}>✕</button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        {ledger.entries.length > 0 && (() => {
                          const last = ledger.entries[ledger.entries.length - 1]
                          return (
                            <tfoot>
                              <tr>
                                <td colSpan={7} style={{padding:'11px 14px',background:'#f8fafc',color:'#374151',fontWeight:700,fontSize:13,borderTop:'2px solid #cbd5e1',borderBottom:'1px solid #e2e8f0'}}>Total — {ledger.entries.length} opération{ledger.entries.length !== 1 ? 's' : ''}</td>
                                <td style={{padding:'11px 16px',background:'#f8fafc',fontSize:15,fontWeight:900,color:'#d97706',textAlign:'right',borderTop:'2px solid #cbd5e1',borderBottom:'1px solid #e2e8f0',letterSpacing:'-0.2px'}}>
                                  {fmt(last.solde)} <span style={{fontSize:12,fontWeight:600,color:'#94a3b8'}}>DHS</span>
                                </td>
                                <td colSpan={2} style={{background:'#f8fafc',borderTop:'2px solid #cbd5e1',borderBottom:'1px solid #e2e8f0'}}></td>
                              </tr>
                            </tfoot>
                          )
                        })()}
                      </table>
                    </div>
                  </div>
                  {/* ── SOLDE FINAL ── */}
                  <div className="flex items-center justify-between rounded-2xl"
                    style={{background:'#f0fdf4',border:'2px solid #86efac',padding:'20px 24px',
                      boxShadow:'0 4px 20px rgba(134,239,172,0.25)'}}>
                    <div>
                      <div className="font-bold tracking-wide" style={{color:'#166534',fontSize:15}}>Solde actuel à payer</div>
                      <div className="mt-1" style={{color:'#4ade80',fontSize:12}}>{getFilterLabel()}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div className="font-black" style={{fontSize:32,color:ledger.finalBalance>0?'#15803d':'#16a34a',lineHeight:1,letterSpacing:'-0.5px'}}>
                        {fmt(ledger.finalBalance)}
                      </div>
                      <div style={{fontSize:13,fontWeight:600,color:'#86efac',marginTop:3}}>DHS</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── REMISE MODAL ── */}
      {remiseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">🎁 {remiseModal === 'new' ? 'Nouvelle Remise' : 'Modifier Remise'}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selected?.nom}</p>
              </div>
              <button onClick={() => { setRemiseModal(null); setRemiseError('') }} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={saveRemise} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date</label>
                  <input type="date" className="input" value={remiseForm.date}
                    onChange={e => setRemiseForm({...remiseForm, date: e.target.value})} required />
                </div>
                <div>
                  <label className="label">Montant (DHS)</label>
                  <input type="number" inputMode="decimal" className="input" placeholder="ex: 2500" step="0.01" min="0"
                    value={remiseForm.montant}
                    onChange={e => setRemiseForm({...remiseForm, montant: e.target.value})}
                    required autoFocus />
                </div>
              </div>
              <div>
                <label className="label">Type de remise</label>
                <select className="input" value={remiseForm.type_remise}
                  onChange={e => setRemiseForm({...remiseForm, type_remise: e.target.value})}>
                  <option>Commerciale</option>
                  <option>Fidélité</option>
                  <option>Correction</option>
                  <option>Autre</option>
                </select>
              </div>
              <div>
                <label className="label">Motif</label>
                <input type="text" className="input" placeholder="ex: Remise fin de mois mai 2026"
                  value={remiseForm.motif}
                  onChange={e => setRemiseForm({...remiseForm, motif: e.target.value})} />
              </div>
              {remiseForm.montant && (
                <div className="p-3 rounded-xl text-sm" style={{background:'#faf5ff', border:'1px solid #e9d5ff'}}>
                  <div className="font-bold text-purple-700 mb-1">🎁 Aperçu</div>
                  <div className="text-gray-700">{selected?.nom}</div>
                  <div className="text-xl font-bold text-purple-700">− {fmt(parseFloat(remiseForm.montant)||0)} DHS</div>
                  {remiseForm.motif && <div className="text-xs text-gray-500 italic mt-1">{remiseForm.motif}</div>}
                  <div className="text-xs text-gray-400 mt-1">
                    Nouveau solde: {fmt((selected?.solde || 0) - (parseFloat(remiseForm.montant)||0) + (remiseModal !== 'new' ? (remiseModal.montant || 0) : 0))} DHS
                  </div>
                </div>
              )}
              {remiseError && (
                <div className="p-3 rounded-xl text-sm flex items-start gap-2" style={{background:'#fef2f2', border:'1px solid #fecaca'}}>
                  <span className="text-red-500 flex-shrink-0 mt-0.5">⚠️</span>
                  <div>
                    <div className="font-semibold text-red-700 mb-0.5">Impossible d'enregistrer</div>
                    <div className="text-red-600 text-xs">{remiseError}</div>
                    {remiseError.includes('security') && (
                      <div className="text-red-500 text-xs mt-1">
                        Exécutez dans Supabase SQL Editor :<br/>
                        <code className="bg-red-50 px-1 rounded font-mono">ALTER TABLE remises DISABLE ROW LEVEL SECURITY;</code>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={remiseSaving}
                  className="btn-primary flex-1 justify-center" style={{background:'#7c3aed'}}>
                  {remiseSaving ? 'Enregistrement...' : '✓ Enregistrer'}
                </button>
                <button type="button" onClick={() => { setRemiseModal(null); setRemiseError('') }} className="btn-secondary">Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT CLIENT MODAL ── */}
      {editClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">✎ Modifier le client</h2>
                <p className="text-xs text-gray-400 mt-0.5">{editClientModal.nom}</p>
              </div>
              <button onClick={() => setEditClientModal(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={saveEditClient} className="p-5 space-y-4">
              <div>
                <label className="label">Nom complet</label>
                <input type="text" className="input" placeholder="Nom du client" required autoFocus
                  value={editClientForm.nom}
                  onChange={e => setEditClientForm({...editClientForm, nom: e.target.value})} />
              </div>
              <div>
                <label className="label">Dépôt</label>
                <select className="input" value={editClientForm.depot}
                  onChange={e => setEditClientForm({...editClientForm, depot: e.target.value})}>
                  {getAllDepots().map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Téléphone</label>
                <input type="text" className="input" placeholder="06 ..."
                  value={editClientForm.tel}
                  onChange={e => setEditClientForm({...editClientForm, tel: e.target.value})} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={editClientSaving}
                  className="btn-primary flex-1 justify-center">
                  {editClientSaving ? 'Enregistrement...' : '✓ Enregistrer'}
                </button>
                <button type="button" onClick={() => setEditClientModal(null)} className="btn-secondary">Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── SOLDE REPORTÉ MODAL ── */}
      {openingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{background:'rgba(0,0,0,0.5)'}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">📂 Solde Reporté</h2>
                <p className="text-xs text-gray-400 mt-0.5">{openingModal.nom}</p>
              </div>
              <button onClick={() => setOpeningModal(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={saveOpeningBalance} className="p-5 space-y-4">
              <div>
                <label className="label">Montant (DHS)</label>
                <input type="text" inputMode="decimal" className="input" placeholder="ex: 45000"
                  value={openingForm.montant}
                  onChange={e => setOpeningForm({...openingForm, montant: e.target.value})}
                  required autoFocus />
                <p className="text-xs text-gray-400 mt-1">Le total dû par ce client avant cette app</p>
              </div>
              <div>
                <label className="label">Date de référence</label>
                <input type="date" className="input"
                  value={openingForm.date}
                  onChange={e => setOpeningForm({...openingForm, date: e.target.value})} />
                <p className="text-xs text-gray-400 mt-1">ex: 30/04/2026 — s'affichera comme « Solde au avril 2026 »</p>
              </div>
              <div>
                <label className="label">Note / Origine</label>
                <input type="text" className="input"
                  placeholder="ex: Solde Excel avril 2026, Factures Q1..."
                  value={openingForm.note}
                  onChange={e => setOpeningForm({...openingForm, note: e.target.value})} />
              </div>
              {openingForm.montant && (
                <div className="p-3 rounded-xl text-sm" style={{background:'#fffbeb', border:'1px solid #fde68a'}}>
                  <div className="font-bold text-amber-700 mb-1">📂 Solde Reporté</div>
                  <div className="text-gray-700">{openingModal.nom}</div>
                  <div className="text-xl font-bold text-amber-700">{fmt(parseFloat(openingForm.montant)||0)} DHS</div>
                  {openingForm.date && <div className="text-xs text-amber-600 mt-1">au {fmtMois(openingForm.date)}</div>}
                  {openingForm.note && <div className="text-xs text-gray-500 italic mt-0.5">{openingForm.note}</div>}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={openingSaving}
                  className="btn-primary flex-1 justify-center" style={{background:'#92400e'}}>
                  {openingSaving ? 'Enregistrement...' : '✓ Enregistrer'}
                </button>
                <button type="button" onClick={() => setOpeningModal(null)} className="btn-secondary">Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
