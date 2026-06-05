import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtDate   = d => { if (!d) return '—'; const [y,m,j] = d.split('-'); return `${j}/${m}/${y}` }
const fmtMois   = d => { if (!d) return ''; const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']; const [y,m] = d.split('-'); return `${months[parseInt(m)-1]} ${y}` }
const today = () => new Date().toISOString().split('T')[0]
const startOfWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().split('T')[0] }
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

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

  const [clientRemises, setClientRemises] = useState([])
  const [remiseModal, setRemiseModal] = useState(null) // null | 'new' | remise object
  const [remiseForm, setRemiseForm] = useState({ date: today(), montant: '', type_remise: 'Commerciale', motif: '' })
  const [remiseSaving, setRemiseSaving] = useState(false)

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

    const kpiCols = totalRemises > 0 ? 4 : 3
    const remisesColCount = totalRemises > 0 ? 5 : 4
    const carryOverBlock = carryOver !== null ? `
      <div class="calc-block">
        <div class="calc-ttl">Calcul du solde — ${periodLabel}</div>
        <div class="calc-g" style="grid-template-columns:repeat(${remisesColCount},1fr)">
          <div class="calc-c"><div class="clbl">Solde mois précédent</div><div class="cval c-am">${fmt(carryOver)} DHS</div></div>
          <div class="calc-c"><div class="clbl">+ Ventes période</div><div class="cval c-bl">+ ${fmt(totalVentes)} DHS</div></div>
          <div class="calc-c"><div class="clbl">− Paiements période</div><div class="cval c-gn">− ${fmt(totalPaiements)} DHS</div></div>
          ${totalRemises > 0 ? `<div class="calc-c"><div class="clbl">− Remises période</div><div class="cval" style="color:#7c3aed">− ${fmt(totalRemises)} DHS</div></div>` : ''}
          <div class="calc-c res"><div class="clbl">= Solde fin période</div><div class="cval c-pr">${fmt(soldeFinPeriode)} DHS</div></div>
        </div>
      </div>` : ''

    function pBadge(e) {
      if (e.type === 'vente')         return `<span class="tag" style="background:#dbeafe;color:#1d4ed8;border-color:#bfdbfe">📦 ${e.label}</span>`
      if (e.type === 'mdo')           return `<span class="tag" style="background:#fef9c3;color:#92400e;border-color:#fde68a">🔧 M.O.</span>`
      if (e.type === 'remise-voyage') return `<span class="tag" style="background:#dcfce7;color:#15803d;border-color:#bbf7d0">🎁 Remise</span>`
      if (e.type === 'paiement')      return `<span class="tag" style="background:#dcfce7;color:#15803d;border-color:#bbf7d0">💰 ${e.label}</span>`
      return                                  `<span class="tag" style="background:#ede9fe;color:#6d28d9;border-color:#d8b4fe">🎁 ${e.label}</span>`
    }
    function pMv(e) {
      const abs = Math.abs(e.delta)
      const isPos = e.delta >= 0
      const color = isPos ? '#1d4ed8' : e.type === 'remise' ? '#7c3aed' : '#16a34a'
      return `<span style="font-weight:800;color:${color}">${isPos ? '+ ' : '− '}${fmt(abs)}</span>`
    }

    openPrintWindow(`<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Fiche Client — ${selected.nom}</title>
<style>
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:13px;color:#1e293b;background:#fff}
  .hdr{background:linear-gradient(135deg,#0f2444 0%,#1a3a6b 60%,#1e4080 100%);padding:18px 28px;display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #e8b84b}
  .co-left{display:flex;align-items:center;gap:16px}
  .co-logo{width:62px;height:62px;flex-shrink:0}
  .co-n{font-size:26px;font-weight:900;color:#fff;letter-spacing:1px;line-height:1;text-transform:uppercase}
  .co-tag{font-size:12px;color:#e8b84b;margin-top:4px;font-weight:600;letter-spacing:0.5px}
  .co-addr{font-size:11px;color:#93c5fd;margin-top:3px}
  .co-r{text-align:right;font-size:12px;color:#bfdbfe;line-height:2}
  .co-r strong{color:#e8b84b;font-size:13px}
  .co-email{font-size:11px;color:#93c5fd}
  .btn-p,.btn-d{padding:6px 14px;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer;margin-right:5px}
  .btn-p{background:#475569;color:#fff}.btn-d{background:#16a34a;color:#fff}
  .bdy{padding:20px 28px}
  .client-card{display:flex;align-items:center;gap:14px;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;border-left:4px solid #1a3a6b;margin-bottom:12px}
  .cli-ini{width:42px;height:42px;background:#1a3a6b;color:#fff;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;flex-shrink:0}
  .cli-n{font-size:16px;font-weight:800}.cli-m{font-size:12px;color:#64748b;margin-top:2px}
  .pbadge{display:inline-flex;background:#eff6ff;border:1px solid #bfdbfe;border-radius:4px;padding:4px 12px;font-size:12px;font-weight:700;color:#1d4ed8;margin-bottom:14px}
  .kpi-g{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
  .kpi{padding:12px 14px;border:1px solid #e2e8f0;border-radius:6px;border-left:3px solid #cbd5e1}
  .lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;margin-bottom:4px}
  .val{font-size:20px;font-weight:900;line-height:1}
  .kpi.pr{border-left-color:#7c3aed}.kpi.pr .val{color:#7c3aed}
  .kpi.bl{border-left-color:#1d4ed8}.kpi.bl .val{color:#1d4ed8}
  .kpi.gn{border-left-color:#16a34a}.kpi.gn .val{color:#16a34a}
  .kpi-sub{font-size:10px;color:#b45309;margin-top:3px}
  .calc-block{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px 16px;margin-bottom:16px}
  .calc-ttl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#166534;margin-bottom:9px}
  .calc-g{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
  .calc-c{padding:7px 9px;background:#fff;border:1px solid #bbf7d0;border-radius:4px}
  .calc-c.res{border:2px solid #c4b5fd;background:#faf5ff}
  .clbl{font-size:10px;text-transform:uppercase;font-weight:700;color:#6b7280;margin-bottom:3px}
  .cval{font-weight:800;font-size:13px}
  .c-am{color:#b45309}.c-bl{color:#1d4ed8}.c-gn{color:#16a34a}.c-pr{color:#7c3aed}
  .sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#0f2444;border-bottom:2px solid #e8b84b;padding-bottom:5px;margin:18px 0 0}
  table{width:100%;border-collapse:collapse}
  thead th{background:#0f2444 !important;color:#fff !important;padding:9px 11px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;text-align:left}
  thead th.r{text-align:right}
  tbody td{padding:8px 11px;font-size:12px;color:#1e293b;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  tbody td.r{text-align:right;font-family:monospace}
  tbody td.m{color:#94a3b8;font-size:11px}
  tbody tr:nth-child(even) td{background:#f8fafc !important}
  .num{font-weight:700;font-size:12px}.gv{color:#16a34a;font-weight:700}
  .tag{background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:3px;padding:2px 7px;font-size:10px;font-weight:700}
  .remise-row td{background:#f0fdf4 !important}.mdo-row td{background:#fffbeb !important}
  tfoot td{background:#0f2444 !important;color:#fff !important;padding:9px 11px;font-weight:700;font-size:12px;border:none !important}
  tfoot td.r{font-size:13px}
  .foot{margin-top:20px;padding-top:9px;border-top:2px solid #e8b84b;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8}
  @media print{.btn-p,.btn-d{display:none !important}}
  @page{size:A4;margin:8mm 10mm}
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
    <div><strong>Mohamed</strong> 06 61 32 56 65 &nbsp;·&nbsp; <strong>Sadik</strong> 06 61 97 87 47</div>
    <div><strong>Bureau</strong> 06 62 82 88 20</div>
    <div class="co-email">Dar.sadik@hotmail.com</div>
    <div style="margin-top:8px"><button class="btn-p" onclick="window.print()">Imprimer</button><button class="btn-d" onclick="window.print()">Télécharger PDF</button></div>
    <div style="font-size:10px;color:#93c5fd;margin-top:4px">Généré le ${date}</div>
  </div>
</div>
<div class="bdy">
<div class="client-card">
  <div class="cli-ini">${selected.nom[0].toUpperCase()}</div>
  <div><div class="cli-n">${selected.nom}</div><div class="cli-m">Dépôt : ${selected.depot||'—'}${selected.tel?' &nbsp;·&nbsp; '+selected.tel:''}</div></div>
</div>
<div class="pbadge">Période : ${periode}</div>
<div class="kpi-g" style="grid-template-columns:repeat(${kpiCols},1fr)">
  <div class="kpi pr">
    <div class="lbl">${carryOver !== null ? 'Solde mois précédent' : 'Solde reporté'}</div>
    <div class="val">${fmt(carryOver !== null ? carryOver : (selected.opening_balance || 0))} DHS</div>
    ${!carryOver && selected.opening_date ? `<div class="kpi-sub">Solde au ${fmtMois(selected.opening_date)}</div>` : ''}
  </div>
  <div class="kpi bl"><div class="lbl">+ Ventes ${filterType !== 'all' ? '(période)' : ''}</div><div class="val">${fmt(totalVentes)} DHS</div></div>
  <div class="kpi gn"><div class="lbl">− Paiements ${filterType !== 'all' ? '(période)' : ''}</div><div class="val">${fmt(totalPaiements)} DHS</div></div>
  ${totalRemises > 0 ? `<div class="kpi" style="border-left-color:#7c3aed"><div class="lbl">− Remises ${filterType !== 'all' ? '(période)' : ''}</div><div class="val" style="color:#7c3aed">${fmt(totalRemises)} DHS</div></div>` : ''}
</div>
${carryOverBlock}
<div class="sec">Mouvements du compte (${pLedger.entries.length} opérations)</div>
<table>
  <thead><tr><th>Date</th><th>Type</th><th>Détails / Motif</th><th class="r">Mouvement</th><th class="r">Solde DHS</th></tr></thead>
  <tbody>
    <tr style="background:#fffbeb !important">
      <td style="color:#92400e;font-size:11px">${carryOver !== null ? `Avant ${periodLabel}` : (selected.opening_date ? fmtDate(selected.opening_date) : '—')}</td>
      <td><span class="tag" style="background:#fef3c7;color:#92400e;border-color:#fde68a">📂 ${carryOver !== null ? 'Report' : 'Solde initial'}</span></td>
      <td class="m">${carryOver !== null ? `Report au début de ${periodLabel}` : (selected.opening_note || 'Solde de départ')}</td>
      <td class="r" style="color:#cbd5e1">—</td>
      <td class="r num" style="color:#b45309;font-weight:800">${fmt(pLedger.startBalance)}</td>
    </tr>
    ${pLedger.entries.length === 0
      ? '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:14px;font-style:italic">Aucune opération pour cette période</td></tr>'
      : pLedger.entries.map(e => {
          const rowBg = e.type === 'remise' ? '#faf5ff'
            : e.type === 'paiement' ? '#f0fdf4'
            : e.type === 'remise-voyage' ? '#f0fdf4'
            : e.type === 'mdo' ? '#fffbeb'
            : ''
          const soldeColor = e.solde > 0 ? '#7c3aed' : '#16a34a'
          return `<tr style="${rowBg ? `background:${rowBg} !important` : ''}">
            <td>${fmtDate(e.date)}</td>
            <td>${pBadge(e)}</td>
            <td class="m">${e.detail ? `<strong>${e.detail}</strong> ` : ''}${e.note || '—'}</td>
            <td class="r">${pMv(e)}</td>
            <td class="r num" style="font-weight:800;color:${soldeColor}">${fmt(e.solde)}</td>
          </tr>`
        }).join('')}
  </tbody>
  ${pLedger.entries.length > 0 ? `<tfoot>
    <tr>
      <td colspan="2">Solde fin de période</td>
      <td style="font-size:10px;color:#94a3b8">Ventes ${fmt(totalVentes)} · Paiements ${fmt(totalPaiements)}${totalRemises > 0 ? ` · Remises ${fmt(totalRemises)}` : ''}</td>
      <td></td>
      <td class="r">${fmt(pLedger.finalBalance)} DHS</td>
    </tr>
  </tfoot>` : ''}
</table>
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

    filteredVentes.forEach(v => {
      const isRemiseVoyage = v.type_entree === 'remise'
      const isMdo = v.type_entree === 'mdo'
      entries.push({
        date: v.date,
        created_at: v.created_at || '',
        type: isRemiseVoyage ? 'remise-voyage' : isMdo ? 'mdo' : 'vente',
        label: isRemiseVoyage ? 'Remise' : isMdo ? "Main d'œuvre" : (v.type_brique || '—'),
        detail: v.camion_plaque || '',
        note: isRemiseVoyage ? (v.description_mdo || v.note || '') : isMdo ? (v.description_mdo || '') : (v.note || ''),
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
      detail: '',
      note: p.note || '',
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
      if (error) { alert('Erreur lors de l\'enregistrement : ' + error.message); setRemiseSaving(false); return }
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
      if (error) { alert('Erreur lors de la modification : ' + error.message); setRemiseSaving(false); return }
      const newSolde = (selected.solde || 0) - delta
      await supabase.from('clients').update({ solde: newSolde }).eq('id', selected.id)
      setSelected({ ...selected, solde: newSolde })
    }
    setRemiseSaving(false)
    setRemiseModal(null)
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

                {/* TOTALS */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4 pt-4 border-t border-gray-100">
                  {/* If period is active: show carry-over, else show opening balance */}
                  {carryOver !== null ? (
                    <div className="text-center p-3 rounded-xl border-2" style={{background:'#fffbeb', borderColor:'#fde68a'}}>
                      <div className="text-xs font-semibold mb-1 text-amber-700">📅 Solde mois précédent</div>
                      <div className="text-xl font-bold text-amber-700">{fmt(carryOver)} DHS</div>
                      <div className="text-xs text-gray-400 mt-1">Avant {periodLabel}</div>
                    </div>
                  ) : (
                    <div className="text-center p-3 bg-amber-50 rounded-xl" style={{cursor:'pointer'}} onClick={() => editOpeningBalance(selected)}>
                      <div className="text-xs text-amber-600 font-semibold mb-1">📂 Solde Reporté</div>
                      <div className="text-xl font-bold text-amber-700">{fmt(selected.opening_balance || 0)} DHS</div>
                      {selected.opening_date && (
                        <div className="text-xs text-amber-600 mt-1 font-semibold">{`Solde au ${fmtMois(selected.opening_date)}`}</div>
                      )}
                      {selected.opening_note && (
                        <div className="text-xs text-gray-500 mt-0.5 italic">{selected.opening_note}</div>
                      )}
                      {!selected.opening_date && !selected.opening_note && (
                        <div className="text-xs text-gray-400 mt-1">Cliquer pour ajouter détails</div>
                      )}
                    </div>
                  )}
                  <div className="text-center p-3 bg-blue-50 rounded-xl">
                    <div className="text-xs text-blue-600 font-semibold mb-1">📦 Ventes {filterType !== 'all' ? '(période)' : ''}</div>
                    <div className="text-xl font-bold text-blue-700">{fmt(totalVentesClient)} DHS</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-xl">
                    <div className="text-xs text-green-600 font-semibold mb-1">💰 Paiements {filterType !== 'all' ? '(période)' : ''}</div>
                    <div className="text-xl font-bold text-green-600">{fmt(totalPaiementsClient)} DHS</div>
                  </div>
                  <div className="text-center p-3 rounded-xl" style={{background:'#faf5ff',border:'1px solid #e9d5ff'}}>
                    <div className="text-xs font-semibold mb-1" style={{color:'#7c3aed'}}>🎁 Remises {filterType !== 'all' ? '(période)' : ''}</div>
                    <div className="text-xl font-bold" style={{color:'#7c3aed'}}>{fmt(totalRemisesClient)} DHS</div>
                  </div>
                  {/* SOLDE DÛ — with carry-over if period active */}
                  <div className="text-center p-3 rounded-xl border-2" style={{background:'#faf5ff', borderColor:'#e9d5ff'}}>
                    <div className="text-xs font-semibold mb-1" style={{color:'#7c3aed'}}>⚠️ Solde dû {carryOver !== null ? '(période)' : 'final'}</div>
                    <div className="text-xl font-bold" style={{color: (carryOver !== null ? (carryOver + totalVentesClient - totalPaiementsClient - totalRemisesClient) : (selected.solde || 0)) > 0 ? '#7c3aed' : '#16a34a'}}>
                      {fmt(carryOver !== null
                        ? carryOver + totalVentesClient - totalPaiementsClient - totalRemisesClient
                        : (selected.solde || 0)
                      )} DHS
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {carryOver !== null ? 'Report + Ventes − Paiements − Remises' : 'Initial + Ventes − Paiements − Remises'}
                    </div>
                  </div>
                </div>

                {/* CARRY-OVER BREAKDOWN — shown when period is active */}
                {carryOver !== null && (
                  <div className="mt-3 p-3 rounded-xl text-xs" style={{background:'#f0fdf4', border:'1px solid #bbf7d0'}}>
                    <div className="font-bold text-green-800 mb-2">📊 Calcul du solde — {periodLabel}</div>
                    <div className={`grid grid-cols-2 gap-2 ${totalRemisesClient > 0 ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
                      <div className="text-center p-2 bg-white rounded-lg border border-green-100">
                        <div className="text-gray-400 uppercase font-semibold" style={{fontSize:9,letterSpacing:'0.05em'}}>Report mois préc.</div>
                        <div className="font-bold text-amber-700 mt-1">{fmt(carryOver)} DHS</div>
                      </div>
                      <div className="text-center p-2 bg-white rounded-lg border border-green-100">
                        <div className="text-gray-400 uppercase font-semibold" style={{fontSize:9,letterSpacing:'0.05em'}}>+ Ventes période</div>
                        <div className="font-bold text-blue-700 mt-1">+ {fmt(totalVentesClient)} DHS</div>
                      </div>
                      <div className="text-center p-2 bg-white rounded-lg border border-green-100">
                        <div className="text-gray-400 uppercase font-semibold" style={{fontSize:9,letterSpacing:'0.05em'}}>− Paiements période</div>
                        <div className="font-bold text-green-700 mt-1">− {fmt(totalPaiementsClient)} DHS</div>
                      </div>
                      {totalRemisesClient > 0 && (
                        <div className="text-center p-2 bg-white rounded-lg border border-green-100">
                          <div className="text-gray-400 uppercase font-semibold" style={{fontSize:9,letterSpacing:'0.05em'}}>− Remises période</div>
                          <div className="font-bold mt-1" style={{color:'#7c3aed'}}>− {fmt(totalRemisesClient)} DHS</div>
                        </div>
                      )}
                      <div className="text-center p-2 rounded-lg border-2 border-purple-200" style={{background:'#faf5ff'}}>
                        <div className="text-gray-400 uppercase font-semibold" style={{fontSize:9,letterSpacing:'0.05em'}}>= Solde fin période</div>
                        <div className="font-bold mt-1" style={{color:'#7c3aed'}}>{fmt(carryOver + totalVentesClient - totalPaiementsClient - totalRemisesClient)} DHS</div>
                      </div>
                    </div>
                  </div>
                )}

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
                  {/* UNIFIED ACCOUNT LEDGER */}
                  <div className="card">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <h3 className="font-semibold text-gray-900">
                        📋 Historique du compte <span className="text-gray-400 font-normal text-sm">({ledger.entries.length} opération{ledger.entries.length !== 1 ? 's' : ''})</span>
                      </h3>
                      <button
                        onClick={() => { setRemiseForm({ date: today(), montant: '', type_remise: 'Commerciale', motif: '' }); setRemiseModal('new') }}
                        className="btn-primary text-xs px-3 py-1.5" style={{background:'#7c3aed'}}>
                        + Remise
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th className="th" style={{background:'#0f2444',color:'#fff',border:'1px solid #1e3a5f',whiteSpace:'nowrap'}}>Date</th>
                            <th className="th" style={{background:'#0f2444',color:'#fff',border:'1px solid #1e3a5f'}}>Type</th>
                            <th className="th" style={{background:'#0f2444',color:'#fff',border:'1px solid #1e3a5f'}}>Détails / Motif</th>
                            <th className="th text-right" style={{background:'#0f2444',color:'#fff',border:'1px solid #1e3a5f',whiteSpace:'nowrap'}}>Mouvement</th>
                            <th className="th text-right" style={{background:'#0f2444',color:'#fff',border:'1px solid #1e3a5f',minWidth:'110px',whiteSpace:'nowrap'}}>Solde DHS</th>
                            <th className="th" style={{background:'#0f2444',color:'#fff',border:'1px solid #1e3a5f',width:'60px'}}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Opening balance / carry-over row */}
                          <tr style={{background:'#fffbeb'}}>
                            <td className="td text-xs" style={{border:'1px solid #e2e8f0',color:'#92400e',whiteSpace:'nowrap'}}>
                              {carryOver !== null ? `Avant ${periodLabel}` : (selected.opening_date ? fmtDate(selected.opening_date) : '—')}
                            </td>
                            <td className="td" style={{border:'1px solid #e2e8f0'}}>
                              <span style={{background:'#fef3c7',color:'#92400e',fontWeight:700,fontSize:11,padding:'2px 8px',borderRadius:999}}>
                                📂 {carryOver !== null ? 'Report' : 'Solde initial'}
                              </span>
                            </td>
                            <td className="td text-xs text-gray-400" style={{border:'1px solid #e2e8f0'}}>
                              {carryOver !== null ? `Report au début de ${periodLabel}` : (selected.opening_note || 'Solde de départ')}
                            </td>
                            <td className="td text-right text-gray-300" style={{border:'1px solid #e2e8f0'}}>—</td>
                            <td className="td text-right font-bold" style={{border:'1px solid #e2e8f0',color:'#b45309',fontSize:'15px',whiteSpace:'nowrap'}}>
                              {fmt(ledger.startBalance)}
                            </td>
                            <td className="td" style={{border:'1px solid #e2e8f0'}}></td>
                          </tr>

                          {ledger.entries.length === 0 && (
                            <tr>
                              <td colSpan={6} className="td text-center text-gray-400 py-8" style={{border:'1px solid #e2e8f0'}}>
                                Aucune opération pour cette période
                              </td>
                            </tr>
                          )}

                          {ledger.entries.map((e, i) => {
                            const isPos = e.delta >= 0
                            const absAmt = Math.abs(e.delta)
                            const bgRow = e.type === 'remise' ? '#faf5ff'
                              : e.type === 'paiement' ? '#f0fdf4'
                              : e.type === 'remise-voyage' ? '#f0fdf4'
                              : e.type === 'mdo' ? '#fefce8'
                              : undefined
                            const mvColor = isPos ? '#1d4ed8' : e.type === 'remise' ? '#7c3aed' : '#16a34a'
                            return (
                              <tr key={`${e.src}-${e.raw?.id}-${i}`} style={bgRow ? {background: bgRow} : {}}>
                                <td className="td text-xs" style={{border:'1px solid #e2e8f0',color:'#64748b',whiteSpace:'nowrap'}}>{fmtDate(e.date)}</td>
                                <td className="td" style={{border:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>
                                  {e.type === 'vente'
                                    ? <span style={{background:'#dbeafe',color:'#1d4ed8',fontWeight:700,fontSize:11,padding:'2px 8px',borderRadius:999}}>📦 {e.label}</span>
                                    : e.type === 'mdo'
                                    ? <span style={{background:'#fef08a',color:'#92400e',fontWeight:700,fontSize:11,padding:'2px 8px',borderRadius:999}}>🔧 M.O.</span>
                                    : e.type === 'remise-voyage'
                                    ? <span style={{background:'#dcfce7',color:'#15803d',fontWeight:700,fontSize:11,padding:'2px 8px',borderRadius:999}}>🎁 Remise</span>
                                    : e.type === 'paiement'
                                    ? <span style={{background:'#dcfce7',color:'#15803d',fontWeight:700,fontSize:11,padding:'2px 8px',borderRadius:999}}>💰 {e.label}</span>
                                    : <span style={{background:'#ede9fe',color:'#6d28d9',fontWeight:700,fontSize:11,padding:'2px 8px',borderRadius:999}}>🎁 {e.label}</span>}
                                </td>
                                <td className="td text-xs" style={{border:'1px solid #e2e8f0',color:'#64748b',maxWidth:'180px',wordBreak:'break-word'}}>
                                  {e.detail ? <span className="font-semibold text-gray-700 mr-1">{e.detail}</span> : null}
                                  <span>{e.note || '—'}</span>
                                </td>
                                <td className="td text-right font-bold" style={{border:'1px solid #e2e8f0',fontSize:'13px',whiteSpace:'nowrap',color:mvColor}}>
                                  {isPos ? `+ ${fmt(absAmt)}` : `− ${fmt(absAmt)}`}
                                </td>
                                <td className="td text-right font-bold" style={{border:'1px solid #e2e8f0',fontSize:'14px',whiteSpace:'nowrap',
                                  color: e.solde > 0 ? '#7c3aed' : '#16a34a'}}>
                                  {fmt(e.solde)}
                                </td>
                                <td className="td" style={{border:'1px solid #e2e8f0'}}>
                                  {e.src === 'remise' && (
                                    <div className="flex gap-1 justify-center">
                                      <button onClick={() => { setRemiseForm({ date: e.raw.date, montant: String(e.raw.montant), type_remise: e.raw.type_remise || 'Commerciale', motif: e.raw.motif || '' }); setRemiseModal(e.raw) }}
                                        className="btn-secondary" style={{fontSize:10,padding:'2px 7px',lineHeight:'1.4'}}>✎</button>
                                      <button onClick={() => deleteRemise(e.raw)}
                                        className="btn-danger" style={{fontSize:10,padding:'2px 7px',lineHeight:'1.4'}}>✕</button>
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
                                <td className="tfoot-td" colSpan={2} style={{border:'1px solid #cbd5e1'}}>SOLDE FIN DE PÉRIODE</td>
                                <td className="tfoot-td text-xs" style={{border:'1px solid #cbd5e1',color:'#94a3b8'}}>
                                  Ventes {fmt(totalVentesClient)} · Paiements {fmt(totalPaiementsClient)}{totalRemisesClient > 0 ? ` · Remises ${fmt(totalRemisesClient)}` : ''}
                                </td>
                                <td className="tfoot-td" style={{border:'1px solid #cbd5e1'}}></td>
                                <td className="tfoot-td text-right" style={{border:'1px solid #cbd5e1',fontSize:'15px',color:'#c4b5fd'}}>
                                  {fmt(last.solde)} DHS
                                </td>
                                <td className="tfoot-td" style={{border:'1px solid #cbd5e1'}}></td>
                              </tr>
                            </tfoot>
                          )
                        })()}
                      </table>
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
              <button onClick={() => setRemiseModal(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
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
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={remiseSaving}
                  className="btn-primary flex-1 justify-center" style={{background:'#7c3aed'}}>
                  {remiseSaving ? 'Enregistrement...' : '✓ Enregistrer'}
                </button>
                <button type="button" onClick={() => setRemiseModal(null)} className="btn-secondary">Annuler</button>
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
