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

function openPrintWindow(html, filename) {
  if (window.innerWidth < 768) {
    ;(async () => {
      if (!window.html2pdf) {
        await new Promise((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
          s.onload = res; s.onerror = rej
          document.head.appendChild(s)
        })
      }
      const tmp = document.createElement('div')
      tmp.innerHTML = html
      const bodyEl = tmp.querySelector('body')
      const el = document.createElement('div')
      el.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;font-family:Arial,sans-serif;background:#fff;padding:20px'
      el.innerHTML = bodyEl ? bodyEl.innerHTML : tmp.innerHTML
      el.querySelectorAll('.btn-print,.btn-pdf').forEach(e => e.remove())
      document.body.appendChild(el)
      await window.html2pdf().set({
        margin:[8,8,8,8], filename: filename||'DAR-SADIK.pdf',
        image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2,useCORS:true},
        jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}, pagebreak:{mode:['avoid-all','css']},
      }).from(el).save()
      document.body.removeChild(el)
    })()
    return
  }
  const old = document.getElementById('__print_overlay')
  if (old) old.remove()
  const overlay = document.createElement('div')
  overlay.id = '__print_overlay'
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#1e293b;display:flex;flex-direction:column'
  const bar = document.createElement('div')
  bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 16px;background:#0f172a;flex-shrink:0'
  bar.innerHTML = '<button onclick="document.getElementById(\'__pframe\').contentWindow.print()" style="padding:7px 18px;background:#1a5fa8;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">🖨️ Imprimer</button><button onclick="document.getElementById(\'__print_overlay\').remove()" style="padding:7px 18px;background:#ef4444;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">✕ Fermer</button>'
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
    const [{ data: ventes }, { data: paiements }] = await Promise.all([
      supabase.from('ventes').select('*').eq('client_id', client.id).order('date', { ascending: true }),
      supabase.from('paiements').select('*').eq('client_id', client.id).order('date', { ascending: true }),
    ])
    setClientVentes(ventes || [])
    setClientPaiements(paiements || [])
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
    const newSolde = n + totalV - totalP
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

  // ── MONTHLY CARRY-OVER LOGIC ──
  // Computes: what did this client owe at the START of the filtered period?
  // = opening_balance + all ventes BEFORE period start - all payments BEFORE period start
  function getCarryOver() {
    const { from } = getDateRange()
    if (!from || filterType === 'all') return null  // no carry-over for "all time"
    const openingBal = selected?.opening_balance || 0
    const ventesBefore   = clientVentes.filter(v => v.date < from).reduce((s, v) => s + (v.total_vente || 0), 0)
    const paiementsBefore = clientPaiements.filter(p => p.date < from).reduce((s, p) => s + (p.montant || 0), 0)
    return openingBal + ventesBefore - paiementsBefore
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
    const _now = new Date()
    const date = _now.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' à ' + String(_now.getHours()).padStart(2,'0') + ':' + String(_now.getMinutes()).padStart(2,'0')
    const periode = getFilterLabel()
    const soldeFinPeriode = carryOver !== null
      ? carryOver + totalVentes - totalPaiements
      : (selected.solde || 0)

    const carryOverBlock = carryOver !== null ? `
      <div style="margin-bottom:16px;padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:11px">
        <div style="font-weight:800;color:#166534;margin-bottom:8px">📊 Calcul du solde — ${periodLabel}</div>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:4px 8px;border:1px solid #bbf7d0;background:#fff">
              <div style="font-size:9px;color:#6b7280;text-transform:uppercase;font-weight:700">Solde mois précédent</div>
              <div style="font-weight:800;color:#b45309">${fmt(carryOver)} DHS</div>
            </td>
            <td style="padding:4px 8px;border:1px solid #bbf7d0;background:#fff">
              <div style="font-size:9px;color:#6b7280;text-transform:uppercase;font-weight:700">+ Ventes période</div>
              <div style="font-weight:800;color:#1d4ed8">+ ${fmt(totalVentes)} DHS</div>
            </td>
            <td style="padding:4px 8px;border:1px solid #bbf7d0;background:#fff">
              <div style="font-size:9px;color:#6b7280;text-transform:uppercase;font-weight:700">− Paiements période</div>
              <div style="font-weight:800;color:#16a34a">− ${fmt(totalPaiements)} DHS</div>
            </td>
            <td style="padding:4px 8px;border:2px solid #c4b5fd;background:#faf5ff">
              <div style="font-size:9px;color:#6b7280;text-transform:uppercase;font-weight:700">= Solde fin période</div>
              <div style="font-weight:800;color:#7c3aed">${fmt(soldeFinPeriode)} DHS</div>
            </td>
          </tr>
        </table>
      </div>` : ''

    openPrintWindow(`<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8">
<title>Fiche Client — ${selected.nom}</title>
<style>
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; padding: 30px 36px; font-size: 12px; color: #1e293b; background: #fff; }

  .logo-bar { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; margin-bottom: 4px; }
  .logo-left {}
  .logo-name { font-size: 26px; font-weight: 900; color: #1a3a6b; letter-spacing: -0.5px; line-height: 1.1; }
  .logo-name-ar { font-size: 15px; font-weight: 700; color: #1a5fa8; direction: rtl; }
  .logo-tagline { font-size: 11px; color: #475569; margin-top: 2px; direction: rtl; }
  .logo-right { text-align: right; padding-top: 4px; }
  .logo-phones { font-size: 11px; color: #334155; margin-bottom: 4px; font-weight: 600; }
  .logo-email { font-size: 11px; color: #334155; margin-bottom: 4px; }
  .logo-city { font-size: 11px; color: #64748b; }
  .logo-sep { height: 3px; background: linear-gradient(90deg,#1a5fa8,#3b82f6); border-radius: 2px; margin-bottom: 20px; }
  .print-date { font-size: 10px; color: #94a3b8; margin-top: 8px; }
  .btn-print { padding: 7px 16px; background: #475569; color: #fff; border: none; border-radius: 5px; font-size: 12px; font-weight: 700; cursor: pointer; }

  .client-row { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
  .client-avatar { width: 44px; height: 44px; border-radius: 8px; background: #f1f5f9; border: 2px solid #cbd5e1; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; color: #475569; flex-shrink: 0; }
  .client-name { font-size: 17px; font-weight: 800; color: #1e293b; }
  .client-meta { font-size: 10px; color: #64748b; margin-top: 2px; }

  .periode { display: inline-flex; align-items: center; gap: 5px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 3px 10px; font-size: 10px; font-weight: 700; color: #475569; margin-bottom: 16px; }

  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
  .sum-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 11px 14px; }
  .sum-lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 5px; }
  .sum-val { font-size: 20px; font-weight: 900; line-height: 1; }
  .c-solde  { color: #7c3aed; }
  .c-ventes { color: #1e40af; }
  .c-paye   { color: #16a34a; }

  .section-title { font-size: 12px; font-weight: 700; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin: 18px 0 0; }

  table { width: 100%; border-collapse: collapse; margin-top: 0; }
  th {
    background: #475569 !important;
    color: #ffffff !important;
    padding: 9px 12px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    text-align: left;
    border: 1px solid #334155;
  }
  th.r { text-align: right; }
  td {
    padding: 9px 12px;
    font-size: 12px;
    color: #1e293b;
    border: 1px solid #e2e8f0;
    vertical-align: middle;
  }
  td.r { text-align: right; font-family: monospace; font-size: 13px; }
  td.muted { color: #94a3b8; font-size: 11px; }
  tr:nth-child(even) td { background: #f8fafc !important; }
  .num { font-weight: 700; font-size: 13px; }
  .green { color: #16a34a; font-weight: 700; }
  .type-tag { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; border-radius: 3px; padding: 2px 7px; font-size: 10px; font-weight: 700; }

  tfoot td {
    background: #f1f5f9 !important;
    color: #1e293b !important;
    font-weight: 800;
    font-size: 12px;
    border: 1px solid #cbd5e1;
    border-top: 2px solid #475569 !important;
  }
  tfoot td.r { font-size: 14px; color: #1e293b !important; }

  .empty-row td { text-align: center; color: #94a3b8; padding: 18px; font-style: italic; border: 1px solid #e2e8f0; }
  .doc-footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }

  @media print {
    .btn-print { display: none !important; }
    .btn-pdf { display: none !important; }
    body { padding: 12px 18px; }
  }
  @page { size: A4; margin: 10mm 12mm; }
</style>
</head><body>

<div class="logo-bar">
  <div class="logo-left">
    <div class="logo-name">DAR SADIK</div>
    <div class="logo-name-ar">دار صديق</div>
    <div class="logo-tagline">بائع جميع مواد البناء</div>
  </div>
  <div class="logo-right">
    <div class="logo-phones">📞 Mohamed: 06 61 32 56 65 &nbsp;·&nbsp; Sadik: 06 61 97 87 47 &nbsp;·&nbsp; Bureau: 06 62 82 88 20</div>
    <div class="logo-email">✉️ Dar.sadik@hotmail.com</div>
    <div class="logo-city">📍 Selouane - Nador</div>
    <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:8px">
      <button class="btn-print" onclick="window.print()">🖨️ Imprimer</button>
      <button class="btn-pdf" onclick="window.print()" style="padding:7px 16px;background:#16a34a;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">📥 PDF</button>
    </div>
    <div class="print-date">Généré le ${date}</div>
  </div>
</div>
<div class="logo-sep"></div>

<div class="client-row">
  <div class="client-avatar">${selected.nom[0].toUpperCase()}</div>
  <div>
    <div class="client-name">${selected.nom}</div>
    <div class="client-meta">Dépôt: ${selected.depot || '—'}${selected.tel ? '  |  📞 ' + selected.tel : ''}</div>
  </div>
</div>

<div class="periode">📅 Période: ${periode}</div>

<div class="summary">
  <div class="sum-box">
    <div class="sum-lbl">${carryOver !== null ? 'SOLDE MOIS PRÉCÉDENT' : 'SOLDE REPORTÉ'}</div>
    <div class="sum-val c-solde">${fmt(carryOver !== null ? carryOver : (selected.opening_balance || 0))} DHS</div>
    ${!carryOver && selected.opening_date ? `<div style="font-size:10px;color:#b45309;margin-top:2px">${`Solde au ${fmtMois(selected.opening_date)}`}</div>` : ''}
    ${!carryOver && selected.opening_note ? `<div style="font-size:10px;color:#92400e;font-style:italic">${selected.opening_note}</div>` : ''}
  </div>
  <div class="sum-box">
    <div class="sum-lbl">VENTES ${filterType !== 'all' ? '(PÉRIODE)' : ''}</div>
    <div class="sum-val c-ventes">${fmt(totalVentes)} DHS</div>
  </div>
  <div class="sum-box">
    <div class="sum-lbl">TOTAL PAYÉ ${filterType !== 'all' ? '(PÉRIODE)' : ''}</div>
    <div class="sum-val c-paye">${fmt(totalPaiements)} DHS</div>
  </div>
</div>

${carryOverBlock}

<div class="section-title">📦 Ventes (${filteredVentes.length})</div>
<table>
  <thead>
    <tr>
      <th>DATE</th>
      <th>CAMION</th>
      <th>TYPE</th>
      <th class="r">QTÉ</th>
      <th class="r">PRIX/U DHS</th>
      <th class="r">TOTAL DHS</th>
      <th>BON</th>
      <th>NOTE</th>
    </tr>
  </thead>
  <tbody>
    ${filteredVentes.length === 0
      ? '<tr class="empty-row"><td colspan="8">Aucune vente pour cette période</td></tr>'
      : filteredVentes.map(v => `
        <tr style="${v.type_entree==='remise' ? 'background:#f0fdf4 !important' : v.type_entree==='mdo' ? 'background:#fffbeb !important' : ''}">
          <td>${fmtDate(v.date)}</td>
          <td>${v.camion_plaque || '—'}</td>
          <td><span class="type-tag">${v.type_entree==='remise' ? '🎁 Remise' : v.type_entree==='mdo' ? '🔧 Main d\'oeuvre' : (v.type_brique || '—')}</span></td>
          <td class="r num">${v.type_entree==='remise'||v.type_entree==='mdo' ? '—' : fmt(v.qte)}</td>
          <td class="r">${v.type_entree==='remise'||v.type_entree==='mdo' ? '—' : parseFloat(v.prix_vente || 0).toFixed(2)}</td>
          <td class="r num" style="${v.type_entree==='remise' ? 'color:#15803d' : ''}">${v.type_entree==='remise' ? '− '+fmt(v.montant_mdo) : fmt(v.total_vente)}</td>
          <td class="muted">${v.bon || '—'}</td>
          <td class="muted">${v.type_entree==='remise' ? (v.description_mdo||v.note||'—') : v.type_entree==='mdo' ? (v.description_mdo||'—') : (v.note || '—')}</td>
        </tr>`).join('')
    }
  </tbody>
  ${filteredVentes.length > 0 ? `
  <tfoot>
    <tr>
      <td colspan="3"><b>TOTAL (${filteredVentes.length} ventes)</b></td>
      <td class="r"><b>${fmt(filteredVentes.reduce((s,v) => s + (v.qte||0), 0))}</b></td>
      <td></td>
      <td class="r"><b>${fmt(totalVentes)} DHS</b></td>
      <td colspan="2"></td>
    </tr>
  </tfoot>` : ''}
</table>

<div class="section-title" style="margin-top:22px">💰 Paiements (${filteredPaiements.length})</div>
<table>
  <thead>
    <tr>
      <th>DATE</th>
      <th>MODE</th>
      <th class="r">MONTANT DHS</th>
      <th>NOTE</th>
    </tr>
  </thead>
  <tbody>
    ${filteredPaiements.length === 0
      ? '<tr class="empty-row"><td colspan="4">Aucun paiement pour cette période</td></tr>'
      : filteredPaiements.map(p => `
        <tr>
          <td>${fmtDate(p.date)}</td>
          <td>${p.mode || '—'}</td>
          <td class="r green num">− ${fmt(p.montant)}</td>
          <td class="muted">${p.note || '—'}</td>
        </tr>`).join('')
    }
  </tbody>
  ${filteredPaiements.length > 0 ? `
  <tfoot>
    <tr>
      <td colspan="2"><b>TOTAL REÇU</b></td>
      <td class="r"><b>− ${fmt(totalPaiements)} DHS</b></td>
      <td></td>
    </tr>
  </tfoot>` : ''}
</table>

<div class="doc-footer"><span>DAR SADIK — دار صديق — Selouane, Nador</span><span>Généré le ${date}</span></div>
</body></html>`, `Client-${selected.nom}.pdf`)
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

  const handleBack = () => { setShowDetail(false) }

  function exportClientExcel() {
    if (!selected) return
    const header = ['Date','Type','Camion','Fournisseur','Produit','Qte','Prix','Total DHS','BON','Note']
    const venteRows = filteredVentes.map(v => [
      fmtDate(v.date),
      v.type_entree === 'remise' ? 'Remise' : v.type_entree === 'mdo' ? 'Charge' : 'Vente',
      v.camion_plaque || '', v.fournisseur || '', v.type_brique || '',
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
    <Layout title="Clients" subtitle="Gestion des clients et suivi des comptes">
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
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
                    <div className="text-xs text-green-600 font-semibold mb-1">💰 Payé {filterType !== 'all' ? '(période)' : ''}</div>
                    <div className="text-xl font-bold text-green-600">{fmt(totalPaiementsClient)} DHS</div>
                  </div>
                  {/* SOLDE DÛ — with carry-over if period active */}
                  <div className="text-center p-3 rounded-xl border-2" style={{background:'#faf5ff', borderColor:'#e9d5ff'}}>
                    <div className="text-xs font-semibold mb-1" style={{color:'#7c3aed'}}>⚠️ Solde dû {carryOver !== null ? '(période)' : 'final'}</div>
                    <div className="text-xl font-bold" style={{color: (carryOver !== null ? (carryOver + totalVentesClient - totalPaiementsClient) : (selected.solde || 0)) > 0 ? '#7c3aed' : '#16a34a'}}>
                      {fmt(carryOver !== null
                        ? carryOver + totalVentesClient - totalPaiementsClient
                        : (selected.solde || 0)
                      )} DHS
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {carryOver !== null ? 'Report + Ventes − Paiements' : 'Initial + Ventes − Paiements'}
                    </div>
                  </div>
                </div>

                {/* CARRY-OVER BREAKDOWN — shown when period is active */}
                {carryOver !== null && (
                  <div className="mt-3 p-3 rounded-xl text-xs" style={{background:'#f0fdf4', border:'1px solid #bbf7d0'}}>
                    <div className="font-bold text-green-800 mb-2">📊 Calcul du solde — {periodLabel}</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
                      <div className="text-center p-2 rounded-lg border-2 border-purple-200" style={{background:'#faf5ff'}}>
                        <div className="text-gray-400 uppercase font-semibold" style={{fontSize:9,letterSpacing:'0.05em'}}>= Solde fin période</div>
                        <div className="font-bold mt-1" style={{color:'#7c3aed'}}>{fmt(carryOver + totalVentesClient - totalPaiementsClient)} DHS</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {loadingDetail ? (
                <div className="card text-center py-10 text-gray-400">Chargement...</div>
              ) : (
                <>
                  {/* VENTES TABLE — screen: WITH fournisseur + note */}
                  <div className="card">
                    <h3 className="font-semibold text-gray-900 mb-3">📦 Ventes ({filteredVentes.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th className="th" style={{background:'#475569',color:'#fff',border:'1px solid #334155'}}>Date</th>
                            <th className="th" style={{background:'#475569',color:'#fff',border:'1px solid #334155'}}>Camion</th>
                            <th className="th" style={{background:'#475569',color:'#fff',border:'1px solid #334155'}}>Fournisseur</th>
                            <th className="th" style={{background:'#475569',color:'#fff',border:'1px solid #334155'}}>Type</th>
                            <th className="th text-right" style={{background:'#475569',color:'#fff',border:'1px solid #334155'}}>Qté</th>
                            <th className="th text-right" style={{background:'#475569',color:'#fff',border:'1px solid #334155'}}>Prix/u</th>
                            <th className="th text-right" style={{background:'#475569',color:'#fff',border:'1px solid #334155'}}>Total DHS</th>
                            <th className="th" style={{background:'#475569',color:'#fff',border:'1px solid #334155',minWidth:'120px'}}>Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredVentes.map(v => (
                            <tr key={v.id} className="hover:bg-gray-50"
                              style={v.type_entree==='remise' ? {background:'#f0fdf4'} : v.type_entree==='mdo' ? {background:'#fefce8'} : {}}>
                              <td className="td" style={{border:'1px solid #e2e8f0',color:'#64748b',whiteSpace:'nowrap'}}>{fmtDate(v.date)}</td>
                              <td className="td" style={{border:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>{v.camion_plaque || '—'}</td>
                              <td className="td" style={{border:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>{v.fournisseur || '—'}</td>
                              <td className="td" style={{border:'1px solid #e2e8f0'}}>
                                {v.type_entree === 'remise'
                                  ? <span style={{background:'#dcfce7',color:'#15803d',fontWeight:700,fontSize:11,padding:'2px 8px',borderRadius:999}}>🎁 Remise</span>
                                  : v.type_entree === 'mdo'
                                  ? <span style={{background:'#fef08a',color:'#92400e',fontWeight:700,fontSize:11,padding:'2px 8px',borderRadius:999}}>🔧 Main d'œuvre</span>
                                  : <span className="badge-gray">{v.type_brique || '—'}</span>}
                              </td>
                              <td className="td text-right font-semibold" style={{border:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>
                                {v.type_entree==='remise'||v.type_entree==='mdo' ? '—' : fmt(v.qte)}
                              </td>
                              <td className="td text-right" style={{border:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>
                                {v.type_entree==='remise'||v.type_entree==='mdo' ? '—' : parseFloat(v.prix_vente||0).toFixed(2)}
                              </td>
                              <td className="td text-right font-bold" style={{border:'1px solid #e2e8f0',fontSize:'14px',whiteSpace:'nowrap',
                                color: v.type_entree==='remise' ? '#15803d' : 'inherit'}}>
                                {v.type_entree==='remise' ? `− ${fmt(v.montant_mdo)}` : fmt(v.total_vente)}
                              </td>
                              <td className="td text-xs text-gray-400" style={{border:'1px solid #e2e8f0',maxWidth:'160px',wordBreak:'break-word',whiteSpace:'pre-wrap'}}>
                                {v.type_entree==='remise'
                                  ? <span style={{color:'#15803d'}}>{v.description_mdo||v.note||'—'}</span>
                                  : v.type_entree==='mdo'
                                  ? <span style={{color:'#92400e'}}>{v.description_mdo||v.note||'—'}</span>
                                  : (v.note||'—')}
                              </td>
                            </tr>
                          ))}
                          {filteredVentes.length === 0 && (
                            <tr><td colSpan={8} className="td text-center text-gray-400 py-6" style={{border:'1px solid #e2e8f0'}}>Aucune vente pour cette période</td></tr>
                          )}
                        </tbody>
                        {filteredVentes.length > 0 && (
                          <tfoot>
                            <tr>
                              <td className="tfoot-td" colSpan={4} style={{border:'1px solid #cbd5e1'}}>TOTAL</td>
                              <td className="tfoot-td text-right" style={{border:'1px solid #cbd5e1',fontSize:'14px'}}>{fmt(filteredVentes.reduce((s,v)=>s+(v.qte||0),0))}</td>
                              <td className="tfoot-td" style={{border:'1px solid #cbd5e1'}}></td>
                              <td className="tfoot-td text-right" style={{border:'1px solid #cbd5e1',fontSize:'14px'}}>{fmt(totalVentesClient)} DHS</td>
                              <td className="tfoot-td" style={{border:'1px solid #cbd5e1'}}></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  {/* PAIEMENTS TABLE */}
                  <div className="card">
                    <h3 className="font-semibold text-gray-900 mb-3">💰 Paiements ({filteredPaiements.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th className="th" style={{background:'#475569',color:'#fff',border:'1px solid #334155'}}>Date</th>
                            <th className="th" style={{background:'#475569',color:'#fff',border:'1px solid #334155'}}>Mode</th>
                            <th className="th text-right" style={{background:'#475569',color:'#fff',border:'1px solid #334155'}}>Montant DHS</th>
                            <th className="th" style={{background:'#475569',color:'#fff',border:'1px solid #334155'}}>Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPaiements.map(p => (
                            <tr key={p.id} className="hover:bg-gray-50">
                              <td className="td" style={{border:'1px solid #e2e8f0', color:'#64748b'}}>{fmtDate(p.date)}</td>
                              <td className="td" style={{border:'1px solid #e2e8f0'}}><span className="badge-green">{p.mode}</span></td>
                              <td className="td text-right font-bold text-green-600" style={{border:'1px solid #e2e8f0', fontSize:'14px'}}>− {fmt(p.montant)}</td>
                              <td className="td text-gray-400 text-xs" style={{border:'1px solid #e2e8f0'}}>{p.note || '—'}</td>
                            </tr>
                          ))}
                          {filteredPaiements.length === 0 && (
                            <tr><td colSpan={4} className="td text-center text-gray-400 py-6" style={{border:'1px solid #e2e8f0'}}>Aucun paiement pour cette période</td></tr>
                          )}
                        </tbody>
                        {filteredPaiements.length > 0 && (
                          <tfoot>
                            <tr>
                              <td className="tfoot-td" colSpan={2} style={{border:'1px solid #cbd5e1'}}>TOTAL REÇU</td>
                              <td className="tfoot-td text-right text-green-700" style={{border:'1px solid #cbd5e1', fontSize:'14px'}}>− {fmt(totalPaiementsClient)} DHS</td>
                              <td className="tfoot-td" style={{border:'1px solid #cbd5e1'}}></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

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
