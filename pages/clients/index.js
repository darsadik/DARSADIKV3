import { useState, useEffect, useRef, Fragment } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmt, fmtDate, today, startOfMonth, openPrintWindow } from '../../lib/utils'

const fmtMois = d => { if (!d) return ''; const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']; const [y,m] = d.split('-'); return `${months[parseInt(m)-1]} ${y}` }
const startOfWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().split('T')[0] }

export default function Clients() {
  const { user } = useAuth()

  // ── CLIENT STATE ──
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [clientVentes, setClientVentes] = useState([])
  const [clientPaiements, setClientPaiements] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nom: '', depot: 'EL HAJEB', tel: '', solde: 0, opening_balance: 0 })
  const [openingModal, setOpeningModal] = useState(null)
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
  const [editClientModal, setEditClientModal] = useState(null)
  const [editClientForm, setEditClientForm] = useState({ nom: '', depot: '', tel: '' })
  const [editClientSaving, setEditClientSaving] = useState(false)
  const [clientRemises, setClientRemises] = useState([])
  const [clientFraisMap, setClientFraisMap] = useState({})
  const [clientLivNoteMap, setClientLivNoteMap] = useState({})
  const [remiseModal, setRemiseModal] = useState(null)
  const [remiseForm, setRemiseForm] = useState({ date: today(), montant: '', type_remise: 'Commerciale', motif: '' })
  const [remiseSaving, setRemiseSaving] = useState(false)
  const [remiseError, setRemiseError] = useState('')
  const [showDetail, setShowDetail] = useState(false)

  // ── STATEMENT MODE ──
  const [stmtMode, setStmtMode] = useState('chrono') // 'chrono' | 'presentation'

  // ── PRESENTATION ORDER (stored in clients.presentation_order JSONB) ──
  // Structure: { "vente:123": { p: "2026-05", s: 1748736000000 }, ... }
  const [presentationOrder, setPresentationOrder] = useState({})
  const [presHistory, setPresHistory] = useState([])   // undo stack, max 20 snapshots
  const [presDragFrom, setPresDragFrom] = useState(null)
  const [presDragOver, setPresDragOver] = useState(null)
  const [presSelectedRows, setPresSelectedRows] = useState(new Set())
  const [presLastClickedIdx, setPresLastClickedIdx] = useState(null)

  // ── DRAG-SELECT STATE (mouse drag across rows to multi-select) ──
  const [presDragSelectStart, setPresDragSelectStart] = useState(null)
  const [presDragSelectActive, setPresDragSelectActive] = useState(false)
  const presSelectInitRef = useRef(null) // selection snapshot at mousedown

  // ── CHRONO HIGHLIGHT (localStorage, never touches accounting) ──
  const [chronoHighlights, setChronoHighlights] = useState(new Set())

  // ── PRESENTATION SAVES (localStorage) ──
  const [presentations, setPresentations] = useState([])
  const [activePresName, setActivePresName] = useState(null)
  const [showSavePresModal, setShowSavePresModal] = useState(false)
  const [savePresName, setSavePresName] = useState('')
  const [showPresLibrary, setShowPresLibrary] = useState(false)

  // ── DATE FILTER STATE ──
  const [filterType, setFilterType] = useState('all')
  const [filterDate, setFilterDate] = useState(today())
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo, setFilterTo] = useState(today())

  // ── REPORT PERIOD FILTER (Créance Client list) ──
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')
  const [reportPeriodActive, setReportPeriodActive] = useState(false)
  const [reportBalances, setReportBalances] = useState({})
  const [reportLoading, setReportLoading] = useState(false)

  // ── CLIENT LIST MULTI-SELECTION ──
  const [selectedClientIds, setSelectedClientIds] = useState(new Set())
  const [lastClickedClientIdx, setLastClickedClientIdx] = useState(null)

  useEffect(() => { loadClients() }, [])

  // Reset presentation state when client changes
  useEffect(() => {
    if (!selected?.id) return
    setPresentationOrder(selected.presentation_order || {})
    setPresHistory([])
    setPresSelectedRows(new Set())
    setPresLastClickedIdx(null)
    setStmtMode('chrono')
    try {
      const hl = localStorage.getItem(`chrono_hl_${selected.id}`)
      setChronoHighlights(hl ? new Set(JSON.parse(hl)) : new Set())
      const pres = localStorage.getItem(`presentations_${selected.id}`)
      setPresentations(pres ? JSON.parse(pres) : [])
      setActivePresName(null)
    } catch (_) {}
  }, [selected?.id])

  // End drag-selection on mouse-up anywhere on the page
  useEffect(() => {
    const up = () => { setPresDragSelectStart(null); setPresDragSelectActive(false) }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  async function loadClients() {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').order('solde', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  async function loadPeriodBalances(clientList) {
    if (!reportTo) return
    setReportLoading(true)
    const cl = clientList || clients
    const [{ data: ventes }, { data: paiements }, { data: remises }] = await Promise.all([
      supabase.from('ventes').select('client_id,total_vente').lte('date', reportTo),
      supabase.from('paiements').select('client_id,montant').lte('date', reportTo),
      supabase.from('remises').select('client_id,montant').lte('date', reportTo),
    ])
    const balances = {}
    cl.forEach(c => {
      const cv = (ventes || []).filter(v => v.client_id === c.id).reduce((s, v) => s + (v.total_vente || 0), 0)
      const cp = (paiements || []).filter(p => p.client_id === c.id).reduce((s, p) => s + (p.montant || 0), 0)
      const cr = (remises || []).filter(r => r.client_id === c.id).reduce((s, r) => s + (r.montant || 0), 0)
      balances[c.id] = (c.opening_balance || 0) + cv - cp - cr
    })
    setReportBalances(balances)
    setReportLoading(false)
  }

  async function selectClient(client) {
    setSelected(client)
    setShowDetail(true)
    setLoadingDetail(true)
    setClientFraisMap({})
    setClientLivNoteMap({})
    const [{ data: ventes }, { data: paiements }, { data: remises }] = await Promise.all([
      supabase.from('ventes').select('*').eq('client_id', client.id).order('date', { ascending: true }),
      supabase.from('paiements').select('*').eq('client_id', client.id).order('date', { ascending: true }),
      supabase.from('remises').select('*').eq('client_id', client.id).order('date', { ascending: true }),
    ])
    setClientVentes(ventes || [])
    setClientPaiements(paiements || [])
    setClientRemises(remises || [])

    // Load frais per livraison
    try {
      const { data: livs } = await supabase
        .from('voyage_livraisons').select('id,vente_id,note')
        .eq('client_id', client.id).not('vente_id', 'is', null)
      if (livs?.length) {
        const noteMap = {}
        livs.forEach(l => { if (l.note && l.vente_id) noteMap[l.vente_id] = l.note })
        setClientLivNoteMap(noteMap)
        const livIds = livs.map(l => l.id)
        const { data: fraisData, error: fraisErr } = await supabase
          .from('voyage_livraison_frais').select('*').in('livraison_id', livIds)
        if (fraisErr) {
          // Don't hide this: if it fails, charges/déductions silently vanish from the
          // statement while the balance (computed independently) still reflects them.
          console.error('Erreur chargement frais/déductions (voyage_livraison_frais):', fraisErr)
        } else if (fraisData?.length) {
          const map = {}
          livs.forEach(l => {
            const frs = fraisData.filter(f => f.livraison_id === l.id)
            if (frs.length) map[l.vente_id] = frs
          })
          setClientFraisMap(map)
        }
      }
    } catch (err) {
      console.error('Erreur chargement frais/déductions:', err)
    }

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
    setOpeningForm({ montant: String(client.opening_balance || ''), date: client.opening_date || '', note: client.opening_note || '' })
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
      opening_balance: n, opening_date: openingForm.date || null,
      opening_note: openingForm.note || null, solde: newSolde,
    }).eq('id', openingModal.id)
    setOpeningSaving(false)
    setOpeningModal(null)
    loadClients()
    if (selected?.id === openingModal.id) {
      setSelected({ ...selected, opening_balance: n, opening_date: openingForm.date, opening_note: openingForm.note, solde: newSolde })
    }
  }

  // ── DATE FILTER LOGIC ──
  function getDateRange() {
    if (filterType === 'all')    return { from: null, to: null }
    if (filterType === 'day')    return { from: filterDate, to: filterDate }
    if (filterType === 'week')   return { from: startOfWeek(), to: today() }
    if (filterType === 'month')  return { from: startOfMonth(), to: today() }
    if (filterType === 'custom') return { from: filterFrom, to: filterTo }
    return { from: null, to: null }
  }

  function filterByDate(items) {
    const { from, to } = getDateRange()
    if (!from && !to) return items
    return items.filter(item => { const d = item.date; return (!from || d >= from) && (!to || d <= to) })
  }

  function getFilterLabel() {
    const { from, to } = getDateRange()
    if (!from) return 'Toutes les dates'
    if (filterType === 'day') return `Jour: ${filterDate}`
    if (filterType === 'week') return 'Cette semaine'
    if (filterType === 'month') return 'Ce mois'
    return `Du ${from} au ${to}`
  }

  const filteredVentes    = filterByDate(clientVentes)
  const filteredPaiements = filterByDate(clientPaiements)
  const filteredRemises   = filterByDate(clientRemises)

  function getCarryOver() {
    const { from } = getDateRange()
    if (!from || filterType === 'all') return null
    const openingBal       = selected?.opening_balance || 0
    const ventesBefore     = clientVentes.filter(v => v.date < from).reduce((s, v) => s + (v.total_vente || 0), 0)
    const paiementsBefore  = clientPaiements.filter(p => p.date < from).reduce((s, p) => s + (p.montant || 0), 0)
    const remisesBefore    = clientRemises.filter(r => r.date < from).reduce((s, r) => s + (r.montant || 0), 0)
    return openingBal + ventesBefore - paiementsBefore - remisesBefore
  }

  function getPeriodLabel() {
    const { from } = getDateRange()
    if (!from) return null
    const d = new Date(from)
    return d.toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' })
  }

  const carryOver   = selected ? getCarryOver() : null
  const periodLabel = selected ? getPeriodLabel() : null

  // ── ENTRY KEY ──
  function eKey(e) { return `${e.src}:${e.raw?.id ?? e.date}` }

  // ── PRESENTATION HELPERS ──
  function getEffectivePeriod(e) {
    return presentationOrder[eKey(e)]?.p ?? e.date.slice(0, 7)
  }

  function getEffectiveSeq(e) {
    return presentationOrder[eKey(e)]?.s ?? new Date((e.created_at || e.date + 'T00:00:00')).getTime()
  }

  // ── PRINT: CHRONOLOGICAL ──
  function printClient() {
    if (stmtMode === 'presentation') { printPresentationClient(); return }
    const _now = new Date()
    const date = _now.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' à ' + String(_now.getHours()).padStart(2,'0') + ':' + String(_now.getMinutes()).padStart(2,'0')
    const periode = getFilterLabel()
    const pLedger = buildLedger()
    const pDisplayEntries = pLedger.entries
    const pFinalBalance = pLedger.finalBalance

    function pMv(e) {
      const abs = Math.abs(e.delta); const isPos = e.delta >= 0
      return `<span style="font-weight:800;color:${isPos?'#1d4ed8':'#16a34a'}">${isPos?'+ ':'− '}${fmt(abs)}</span>`
    }
    function pDetail(e) {
      if (e.type === 'vente')         return [e.label !== '—' ? e.label : null, e.detail, e.raw?.frais_note].filter(Boolean).join(' · ') || '—'
      if (e.type === 'mdo')           return e.note || "Main d'œuvre"
      if (e.type === 'remise-voyage') return e.note || 'Remise voyage'
      if (e.type === 'paiement')      return [e.label, e.note].filter(Boolean).join(' · ') || '—'
      if (e.type === 'remise')        return e.note || e.raw?.type_remise || 'Remise'
      return '—'
    }
    const ancienSoldeVal = carryOver !== null ? carryOver : (selected.opening_balance || 0)
    const showAncienSolde = ancienSoldeVal > 0

    openPrintWindow(`<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Relevé — ${selected.nom}</title>
<style>
  @page{margin:0mm}
  @media print{.btn-p{display:none!important}}
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:13.5px;color:#1e293b;background:#fff;border-top:4px solid #1e3a5f}
  .hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:12px 24px 10px;border-bottom:1px solid #e2e8f0}
  .co-n{font-size:20px;font-weight:900;color:#1e3a5f;text-transform:uppercase;letter-spacing:0.5px;line-height:1}
  .co-tag{font-size:11px;color:#2563eb;font-weight:700;margin-top:2px}
  .co-addr{font-size:11px;color:#475569;margin-top:5px}
  .co-r{text-align:right;flex-shrink:0}
  .btn-p{padding:4px 10px;border:none;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;background:#475569;color:#fff}
  .cli-section{padding:12px 24px 14px;border-bottom:2px solid #e2e8f0}
  .cli-card{display:flex;align-items:center;gap:18px;background:#f0f7ff;border:1.5px solid #bfdbfe;border-left:5px solid #1e3a5f;border-radius:10px;padding:14px 22px}
  .cli-avatar{width:58px;height:58px;border-radius:50%;background:#1e3a5f;color:#fff;font-size:26px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0;letter-spacing:-1px}
  .cli-name{font-size:26px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;line-height:1}
  .cli-meta{font-size:12px;color:#374151;margin-top:7px;line-height:1.8}
  .bdy{padding:10px 24px}
  table{width:100%;border-collapse:collapse}
  thead th{background:#1e3a5f !important;color:#ffffff !important;padding:10px 12px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;text-align:left;white-space:nowrap}
  thead th.r{text-align:right}
  tbody tr{page-break-inside:avoid}
  tbody td{padding:9.5px 12px;font-size:13.5px;color:#1e293b;border-bottom:1px solid #e8ecf0;vertical-align:middle;line-height:1.45}
  tbody td.r{text-align:right;font-family:'Courier New',monospace;white-space:nowrap}
  tbody td.m{color:#374151;font-size:12.5px;font-weight:500;white-space:nowrap}
  tbody tr:nth-child(even) td{background:#f8fafc !important}
  .tag{display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;letter-spacing:0.03em;white-space:nowrap}
  .totals-row{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#eff6ff;border-top:3px solid #1e3a5f;border-bottom:2px solid #bfdbfe;font-weight:800;font-size:14px;color:#1e3a5f}
  .solde-final{background:#f0fdf4;border:2px solid #86efac;border-radius:10px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-top:12px}
  .sf-lbl{font-size:12px;font-weight:700;color:#166534;letter-spacing:0.01em}
  .sf-amt{font-size:30px;font-weight:900;color:#15803d;line-height:1;letter-spacing:-0.5px}
  .sf-unit{font-size:12px;font-weight:600;color:#4ade80;margin-left:4px}
  .sf-sub{font-size:10px;color:#86efac;margin-top:2px}
  .foot{display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0}
</style></head><body>
<div class="hdr">
  <div>
    <div style="display:flex;align-items:center;gap:12px">
      <svg width="44" height="44" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="90" fill="#1e3a5f"/><polygon points="40,170 256,50 472,170" fill="#e8b84b"/><rect x="60" y="175" width="115" height="70" rx="12" fill="#fff" opacity=".95"/><rect x="195" y="175" width="122" height="70" rx="12" fill="#fff" opacity=".95"/><rect x="337" y="175" width="115" height="70" rx="12" fill="#fff" opacity=".95"/><rect x="60" y="260" width="85" height="70" rx="12" fill="#e8b84b" opacity=".95"/><rect x="165" y="260" width="122" height="70" rx="12" fill="#e8b84b" opacity=".95"/><rect x="307" y="260" width="145" height="70" rx="12" fill="#e8b84b" opacity=".95"/></svg>
      <div><div class="co-n">DAR SADIK</div><div class="co-tag">Matériaux de Construction</div></div>
    </div>
    <div class="co-addr">Selouane, Nador</div>
  </div>
  <div class="co-r">
    <div style="font-size:11px;color:#1e3a5f;line-height:1.85">
      <strong>Mohamed</strong> 06 61 32 56 65 &nbsp;·&nbsp; <strong>Sadik</strong> 06 61 97 87 47<br>
      <strong>Bureau</strong> 06 62 82 88 20<br>
      <span style="color:#2563eb">Dar.sadik@hotmail.com</span>
    </div>
    <div style="font-size:9.5px;color:#94a3b8;margin-top:3px">Généré le ${date}</div>
    <div style="margin-top:4px"><button class="btn-p" onclick="window.print()">Imprimer / PDF</button></div>
  </div>
</div>
<div class="cli-section">
  <div class="cli-card">
    <div class="cli-avatar">${selected.nom.charAt(0).toUpperCase()}</div>
    <div>
      <div class="cli-name">${selected.nom}</div>
      <div class="cli-meta"><strong>Dépôt:</strong> ${selected.depot||'—'}${selected.tel?' &nbsp;·&nbsp; <strong>Tél:</strong> '+selected.tel:''} &nbsp;·&nbsp; <strong>Période:</strong> ${periode}</div>
    </div>
  </div>
</div>
<div class="bdy">
<table>
  <thead><tr>
    <th>Date</th><th>Camion</th><th>Opération</th><th>Type</th>
    <th class="r">Qté</th><th class="r">Prix/u</th><th class="r">Total DHS</th><th class="r">Solde</th><th>Note</th>
  </tr></thead>
  <tbody>
    ${showAncienSolde ? `<tr style="background:#fffbeb"><td class="m" style="white-space:nowrap">${carryOver !== null ? `Avant ${periodLabel}` : (selected.opening_date ? fmtDate(selected.opening_date) : '—')}</td><td class="m">—</td><td style="font-size:12px;font-weight:600;color:#92400e">${carryOver !== null ? 'Report' : 'Solde initial'}</td><td></td><td class="r" style="color:#9ca3af">—</td><td class="r" style="color:#9ca3af">—</td><td class="r" style="color:#9ca3af">—</td><td class="r" style="font-weight:900;font-size:15px;color:#b45309;white-space:nowrap;letter-spacing:-0.3px">${fmt(ancienSoldeVal)}</td><td class="m">${carryOver !== null ? '' : (selected.opening_note||'Solde de départ')}</td></tr>` : ''}
    ${pDisplayEntries.map(e => {
      const isVente = e.src === 'vente'; const v = e.raw
      const isPos = e.delta >= 0; const abs = Math.abs(e.delta)
      const mvColor = isPos ? '#1d4ed8' : '#16a34a'
      const soldeColor = e.solde > 0 ? '#1e3a5f' : '#16a34a'
      const noteDisplay = e.note || '—'
      const typeTag = e.type === 'vente' || e.type === 'frais-charge'
        ? `<span class="tag">${e.label}</span>`
        : e.type === 'mdo'
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;background:#fef9c3;color:#92400e;border:1px solid #fde68a">M.O.</span>`
        : `<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;background:#dcfce7;color:#15803d;border:1px solid #bbf7d0">${e.type==='paiement'||e.type==='frais-deduction'?e.label:'Remise'}</span>`
      return `<tr>
        <td class="m" style="white-space:nowrap">${fmtDate(e.date)}</td>
        <td class="m">${e.detail||'—'}</td>
        <td style="font-size:12px;font-weight:600;color:#1e293b">${e.operation}</td>
        <td>${typeTag}</td>
        <td class="r" style="font-weight:700;color:#0f172a;font-size:13.5px">${isVente&&e.type!=='remise-voyage'&&e.type!=='mdo'?fmt(v.qte):'<span style="color:#9ca3af">—</span>'}</td>
        <td class="r" style="font-weight:700;color:#0f172a;font-size:13.5px">${isVente&&e.type!=='remise-voyage'&&e.type!=='mdo'?parseFloat(v.prix_vente||0).toFixed(2):'<span style="color:#9ca3af">—</span>'}</td>
        <td class="r" style="font-size:14.5px;white-space:nowrap"><span style="font-weight:800;color:${mvColor};white-space:nowrap">${isPos?'+ ':'− '}${fmt(abs)}</span></td>
        <td class="r" style="font-weight:900;font-size:15.5px;color:${soldeColor};white-space:nowrap;letter-spacing:-0.3px">${e.solde>=0?'+ '+fmt(e.solde):'− '+fmt(Math.abs(e.solde))}</td>
        <td class="m" style="white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis;font-weight:${e.note?600:400};color:${e.note?'#374151':'#9ca3af'}">${noteDisplay}</td>
      </tr>`
    }).join('')}
  </tbody>
</table>
${pDisplayEntries.length > 0 ? `<div class="totals-row">
  <span>Total — ${pDisplayEntries.length} opération${pDisplayEntries.length !== 1 ? 's' : ''}</span>
  <span style="font-size:14px;font-weight:900;font-family:'Courier New',monospace">${fmt(pFinalBalance)} DHS</span>
</div>` : ''}
<div class="solde-final">
  <div><div class="sf-lbl">Solde actuel à payer</div><div class="sf-sub">${periode}</div></div>
  <div style="text-align:right"><div style="line-height:1"><span class="sf-amt">${fmt(pFinalBalance)}</span><span class="sf-unit">DHS</span></div></div>
</div>
<div class="foot"><span>DAR SADIK — Matériaux de Construction — Selouane, Nador</span><span>Généré le ${date}</span></div>
</div></body></html>`)
  }

  // ── PRINT: PRESENTATION MODE ──
  function printPresentationClient() {
    const pLedger = buildPresentationLedger()
    const isSelectionPrint = presSelectedRows.size > 0
    const pEntries = isSelectionPrint
      ? pLedger.entries.filter(e => presSelectedRows.has(eKey(e)))
      : pLedger.entries
    const pFinalBalance = pEntries.length > 0 ? pEntries[pEntries.length - 1].solde : pLedger.finalBalance

    let selectionCarryForward = null
    if (isSelectionPrint && pLedger.entries.length > 0) {
      const firstSelIdxInFull = pLedger.entries.findIndex(e => presSelectedRows.has(eKey(e)))
      if (firstSelIdxInFull > 0) {
        selectionCarryForward = pLedger.entries[firstSelIdxInFull - 1].solde
      }
    }
    const reportRowHtml = selectionCarryForward !== null ? (() => {
      const cfSign = selectionCarryForward >= 0 ? '+ ' : '− '
      const cfAmt = fmt(Math.abs(selectionCarryForward))
      return `<tr style="background:#fef3c7"><td class="m" style="white-space:nowrap;color:#92400e">—</td><td class="m">—</td><td style="font-size:12px;font-weight:700;color:#92400e">Report</td><td><span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;background:#fef3c7;color:#92400e;border:1px solid #fde68a">Report</span></td><td class="r" style="color:#9ca3af">—</td><td class="r" style="color:#9ca3af">—</td><td class="r" style="color:#9ca3af">—</td><td class="r" style="font-weight:900;font-size:15.5px;color:#b45309;white-space:nowrap;letter-spacing:-0.3px">${cfSign}${cfAmt}</td><td class="m"></td></tr>`
    })() : ''

    const _now = new Date()
    const date = _now.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' à ' + String(_now.getHours()).padStart(2,'0') + ':' + String(_now.getMinutes()).padStart(2,'0')

    const rows = reportRowHtml + pEntries.map(e => {
      // ── Opening balance row ──
      if (e.type === 'opening') {
        const soldeAmber = e.solde >= 0 ? `+ ${fmt(e.solde)}` : `− ${fmt(Math.abs(e.solde))}`
        return `<tr style="background:#fffbeb !important">
          <td class="m" style="color:#92400e;white-space:nowrap">${e.date ? fmtDate(e.date) : '—'}</td>
          <td class="m">—</td>
          <td style="font-size:12px;font-weight:600;color:#92400e">Solde initial</td>
          <td><span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;background:#fef3c7;color:#92400e;border:1px solid #fde68a">Solde initial</span></td>
          <td class="r" style="color:#9ca3af">—</td>
          <td class="r" style="color:#9ca3af">—</td>
          <td class="r" style="color:#9ca3af">—</td>
          <td class="r" style="font-weight:900;font-size:15.5px;color:#b45309;white-space:nowrap;letter-spacing:-0.3px">${soldeAmber}</td>
          <td class="m" style="color:#92400e;font-style:italic">${e.note || 'Solde de départ'}</td>
        </tr>`
      }
      const isPos = e.delta >= 0; const abs = Math.abs(e.delta)
      const mvColor = isPos ? '#1d4ed8' : '#16a34a'
      const soldeColor = e.solde > 0 ? '#1e3a5f' : '#16a34a'
      const isMoved = !!presentationOrder[eKey(e)]
      const v = e.raw
      const isVenteLine = e.src === 'vente' && e.type !== 'remise-voyage' && e.type !== 'mdo'
      const dash = '<span style="color:#9ca3af">—</span>'
      const qteCell  = isVenteLine ? `<span style="font-weight:700;color:#374151">${fmt(v.qte)}</span>` : dash
      const prixCell = isVenteLine ? `<span style="font-weight:600;color:#374151">${parseFloat(v.prix_vente||0).toFixed(2)}</span>` : dash
      const typeTag = e.type === 'vente' || e.type === 'frais-charge'
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe">${e.label}</span>`
        : e.type === 'mdo'
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;background:#fef9c3;color:#92400e;border:1px solid #fde68a">M.O.</span>`
        : `<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;background:#dcfce7;color:#15803d;border:1px solid #bbf7d0">${e.type==='paiement'||e.type==='frais-deduction'?e.label:'Remise'}</span>`
      return `<tr>
        <td class="m" style="white-space:nowrap">${fmtDate(e.date)}${isMoved?`<br><span style="font-size:9px;font-weight:700;color:#7c3aed">↕ Déplacé</span>`:''}</td>
        <td class="m">${e.detail||'—'}</td>
        <td style="font-size:12px;font-weight:600;color:#1e293b">${e.operation}</td>
        <td>${typeTag}</td>
        <td class="r">${qteCell}</td>
        <td class="r">${prixCell}</td>
        <td class="r" style="font-size:14.5px;white-space:nowrap"><span style="font-weight:800;color:${mvColor}">${isPos?'+ ':'− '}${fmt(abs)}</span></td>
        <td class="r" style="font-weight:900;font-size:15.5px;color:${soldeColor};white-space:nowrap;letter-spacing:-0.3px">${e.solde>=0?'+ '+fmt(e.solde):'− '+fmt(Math.abs(e.solde))}</td>
        <td class="m" style="font-weight:${e.note?600:400};color:${e.note?'#374151':'#9ca3af'}">${e.note||'—'}</td>
      </tr>`
    }).join('')

    openPrintWindow(`<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Relevé Présentation — ${selected.nom}</title>
<style>
  @page{margin:0mm}
  @media print{.btn-p{display:none!important}}
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:13.5px;color:#1e293b;background:#fff;border-top:4px solid #7c3aed}
  .hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:12px 24px 10px;border-bottom:1px solid #e2e8f0}
  .co-n{font-size:20px;font-weight:900;color:#1e3a5f;text-transform:uppercase;letter-spacing:0.5px;line-height:1}
  .co-tag{font-size:11px;color:#2563eb;font-weight:700;margin-top:2px}
  .co-addr{font-size:11px;color:#475569;margin-top:5px}
  .co-r{text-align:right;flex-shrink:0}
  .mode-badge{display:inline-block;background:#ede9fe;color:#7c3aed;font-weight:700;font-size:11px;padding:3px 10px;border-radius:20px;border:1px solid #ddd6fe;margin-bottom:6px}
  .btn-p{padding:4px 10px;border:none;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;background:#475569;color:#fff}
  .cli-section{padding:12px 24px 14px;border-bottom:2px solid #e2e8f0}
  .cli-card{display:flex;align-items:center;gap:18px;background:#faf5ff;border:1.5px solid #ddd6fe;border-left:5px solid #7c3aed;border-radius:10px;padding:14px 22px}
  .cli-avatar{width:58px;height:58px;border-radius:50%;background:#7c3aed;color:#fff;font-size:26px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .cli-name{font-size:26px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;line-height:1}
  .cli-meta{font-size:12px;color:#374151;margin-top:7px;line-height:1.8}
  .bdy{padding:10px 24px}
  table{width:100%;border-collapse:collapse}
  thead th{background:#7c3aed !important;color:#fff !important;padding:10px 12px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;text-align:left;white-space:nowrap}
  thead th.r{text-align:right}
  tbody tr{page-break-inside:avoid}
  tbody td{padding:9.5px 12px;font-size:13.5px;color:#1e293b;border-bottom:1px solid #e8ecf0;vertical-align:middle;line-height:1.45}
  tbody td.r{text-align:right;font-family:'Courier New',monospace;white-space:nowrap}
  tbody td.m{color:#374151;font-size:12.5px;font-weight:500;white-space:nowrap}
  tbody tr:nth-child(even) td{background:#f8fafc !important}
  .totals-row{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#ede9fe;border-top:3px solid #7c3aed;font-weight:800;font-size:14px;color:#5b21b6}
  .solde-final{background:#f0fdf4;border:2px solid #86efac;border-radius:10px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-top:12px}
  .sf-lbl{font-size:12px;font-weight:700;color:#166534}
  .sf-amt{font-size:30px;font-weight:900;color:#15803d;line-height:1;letter-spacing:-0.5px}
  .sf-unit{font-size:12px;font-weight:600;color:#4ade80;margin-left:4px}
  .sf-sub{font-size:10px;color:#86efac;margin-top:2px}
  .foot{display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0}
</style></head><body>
<div class="hdr">
  <div>
    <div style="display:flex;align-items:center;gap:12px">
      <svg width="44" height="44" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="90" fill="#1e3a5f"/><polygon points="40,170 256,50 472,170" fill="#e8b84b"/><rect x="60" y="175" width="115" height="70" rx="12" fill="#fff" opacity=".95"/><rect x="195" y="175" width="122" height="70" rx="12" fill="#fff" opacity=".95"/><rect x="337" y="175" width="115" height="70" rx="12" fill="#fff" opacity=".95"/><rect x="60" y="260" width="85" height="70" rx="12" fill="#e8b84b" opacity=".95"/><rect x="165" y="260" width="122" height="70" rx="12" fill="#e8b84b" opacity=".95"/><rect x="307" y="260" width="145" height="70" rx="12" fill="#e8b84b" opacity=".95"/></svg>
      <div><div class="co-n">DAR SADIK</div><div class="co-tag">Matériaux de Construction</div></div>
    </div>
    <div class="co-addr">Selouane, Nador</div>
  </div>
  <div class="co-r">
    <div style="font-size:11px;color:#1e3a5f;line-height:1.85">
      <strong>Mohamed</strong> 06 61 32 56 65 &nbsp;·&nbsp; <strong>Sadik</strong> 06 61 97 87 47<br>
      <strong>Bureau</strong> 06 62 82 88 20<br>
      <span style="color:#2563eb">Dar.sadik@hotmail.com</span>
    </div>
    <div style="margin-top:5px"><div class="mode-badge">↕ Vue Présentation</div></div>
    <div style="font-size:9.5px;color:#94a3b8">Généré le ${date}</div>
    <div style="margin-top:4px"><button class="btn-p" onclick="window.print()">Imprimer / PDF</button></div>
  </div>
</div>
<div class="cli-section">
  <div class="cli-card">
    <div class="cli-avatar">${selected.nom.charAt(0).toUpperCase()}</div>
    <div>
      <div class="cli-name">${selected.nom}</div>
      <div class="cli-meta"><strong>Dépôt:</strong> ${selected.depot||'—'}${selected.tel?' &nbsp;·&nbsp; <strong>Tél:</strong> '+selected.tel:''}</div>
    </div>
  </div>
</div>
<div class="bdy">
<table>
  <thead><tr>
    <th>Date</th><th>Camion</th><th>Opération</th><th>Type</th>
    <th class="r">Qté</th><th class="r">Prix/u</th><th class="r">Total DHS</th><th class="r">Solde</th><th>Note</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
${pEntries.length > 0 ? `<div class="totals-row">
  <span>Total — ${pEntries.length} opération${pEntries.length!==1?'s':''}</span>
  <span style="font-size:14px;font-weight:900;font-family:'Courier New',monospace">${fmt(pFinalBalance)} DHS</span>
</div>` : ''}
<div class="solde-final">
  <div><div class="sf-lbl">Solde à payer</div><div class="sf-sub">${isSelectionPrint ? `${pEntries.length} opération${pEntries.length!==1?'s':''} sélectionnée${pEntries.length!==1?'s':''}` : 'Vue Présentation'}</div></div>
  <div style="text-align:right"><div style="line-height:1"><span class="sf-amt">${fmt(pFinalBalance)}</span><span class="sf-unit">DHS</span></div></div>
</div>
<div class="foot"><span>DAR SADIK — Matériaux de Construction — Selouane, Nador</span><span>Généré le ${date}</span></div>
</div></body></html>`)
  }

  // ── EXPORT CSV ──
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
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (selected.nom || 'Client') + '-' + today() + '.csv'
    a.click()
  }

  // ── COMPUTED VALUES ──
  const filtered = clients.filter(c => !search || (c.nom + c.depot).toLowerCase().includes(search.toLowerCase()))
  const totalCreances = reportPeriodActive
    ? filtered.reduce((s, c) => s + ((reportBalances[c.id] ?? c.solde) || 0), 0)
    : filtered.reduce((s, c) => s + (c.solde || 0), 0)
  const selectedCreancesTotal = filtered
    .filter(c => selectedClientIds.has(c.id))
    .reduce((s, c) => s + (reportPeriodActive ? ((reportBalances[c.id] ?? c.solde) || 0) : (c.solde || 0)), 0)
  const totalVentesClient    = filteredVentes.reduce((s, v) => s + (v.total_vente || 0), 0)
  const totalPaiementsClient = filteredPaiements.reduce((s, p) => s + (p.montant || 0), 0)
  const ledger = selected && !loadingDetail ? buildLedger() : { entries: [], startBalance: 0, finalBalance: 0 }

  const computedSolde = selected && !loadingDetail
    ? (selected.opening_balance || 0) + clientVentes.reduce((s, v) => s + (v.total_vente || 0), 0)
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

  // ── EXPAND A VENTE ROW INTO ITS OWN LEDGER ENTRIES ──────────────────────────
  // A livraison's attached frais/déductions are billed as part of the same
  // ventes.total_vente — presentation-only: split that one accounting value
  // back into a "Livraison" movement + one movement per frais/déduction item.
  // The split deltas always sum back to v.total_vente exactly, so balances,
  // totals and the running-balance reduce below are all untouched.
  function expandVenteEntry(base) {
    const v = base.raw
    const fraisItems = base.type === 'vente' ? (clientFraisMap[v.id] || []) : []
    if (fraisItems.length === 0) return [base]

    const signedFraisTotal = fraisItems.reduce((s, f) => {
      const amt = f.montant || 0
      return s + (f.kind === 'deduction' ? -amt : amt)
    }, 0)

    const livraisonEntry = { ...base, delta: (base.delta || 0) - signedFraisTotal }

    const fraisEntries = fraisItems.map(f => {
      const isDed = f.kind === 'deduction'
      return {
        date: v.date, created_at: f.created_at || v.created_at || '',
        type: isDed ? 'frais-deduction' : 'frais-charge',
        label: isDed ? 'Déduction' : 'Frais',
        detail: v.camion_plaque || '', note: f.note || '',
        operation: f.label, delta: isDed ? -(f.montant || 0) : (f.montant || 0),
        src: 'frais', raw: f,
      }
    })

    return [livraisonEntry, ...fraisEntries]
  }

  // ── BUILD LEDGER (chronological, accounting source of truth) ──
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

    filteredVentes.forEach(v => {
      const isRemiseVoyage = v.type_entree === 'remise'
      const isMdo = v.type_entree === 'mdo'
      const type = isRemiseVoyage ? 'remise-voyage' : isMdo ? 'mdo' : 'vente'
      const deliveryNote = isRemiseVoyage ? (v.description_mdo || v.note || '') : isMdo ? (v.description_mdo || '') : (v.note || clientLivNoteMap[v.id] || '')
      const baseEntry = {
        date: v.date, created_at: v.created_at || '', type,
        label: isRemiseVoyage ? 'Remise' : isMdo ? "Main d'œuvre" : (v.type_brique || '—'),
        detail: v.camion_plaque || '', note: deliveryNote,
        operation: opLabel(type, null), delta: v.total_vente || 0, src: 'vente', raw: v,
      }
      entries.push(...expandVenteEntry(baseEntry))
    })

    filteredPaiements.forEach(p => entries.push({
      date: p.date, created_at: p.created_at || '', type: 'paiement',
      label: p.mode || 'Paiement', detail: p.camion_plaque || '', note: p.note || '',
      operation: 'Paiement', delta: -(p.montant || 0), src: 'paiement', raw: p,
    }))

    filteredRemises.forEach(r => entries.push({
      date: r.date, created_at: r.created_at || '', type: 'remise',
      label: r.type_remise || 'Remise', detail: '', note: r.motif || '',
      operation: opLabel('remise', r.type_remise), delta: -(r.montant || 0), src: 'remise', raw: r,
    }))

    entries.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
    })

    let balance = startBalance
    entries.forEach(e => { balance += e.delta; e.solde = balance })
    return { entries, startBalance, finalBalance: balance }
  }

  // ── BUILD PRESENTATION LEDGER (sorted by effectivePeriod/effectiveSeq) ──
  function buildPresentationLedger() {
    const startBal = selected?.opening_balance || 0
    const allEntries = []

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

    clientVentes.forEach(v => {
      const isRemiseVoyage = v.type_entree === 'remise'
      const isMdo = v.type_entree === 'mdo'
      const type = isRemiseVoyage ? 'remise-voyage' : isMdo ? 'mdo' : 'vente'
      const baseEntry = {
        date: v.date, created_at: v.created_at || '', type,
        label: isRemiseVoyage ? 'Remise' : isMdo ? "Main d'œuvre" : (v.type_brique || '—'),
        detail: v.camion_plaque || '', note: isRemiseVoyage ? (v.description_mdo||v.note||'') : isMdo ? (v.description_mdo||'') : (v.note||clientLivNoteMap[v.id]||''),
        operation: opLabel(type, null), delta: v.total_vente || 0, src: 'vente', raw: v,
      }
      expandVenteEntry(baseEntry).forEach(entry => {
        entry.effectivePeriod = getEffectivePeriod(entry)
        entry.effectiveSeq    = getEffectiveSeq(entry)
        allEntries.push(entry)
      })
    })

    clientPaiements.forEach(p => {
      const entry = {
        date: p.date, created_at: p.created_at || '', type: 'paiement',
        label: p.mode || 'Paiement', detail: p.camion_plaque || '', note: p.note || '',
        operation: 'Paiement', delta: -(p.montant || 0), src: 'paiement', raw: p,
      }
      entry.effectivePeriod = getEffectivePeriod(entry)
      entry.effectiveSeq    = getEffectiveSeq(entry)
      allEntries.push(entry)
    })

    clientRemises.forEach(r => {
      const entry = {
        date: r.date, created_at: r.created_at || '', type: 'remise',
        label: r.type_remise || 'Remise', detail: '', note: r.motif || '',
        operation: opLabel('remise', r.type_remise), delta: -(r.montant || 0), src: 'remise', raw: r,
      }
      entry.effectivePeriod = getEffectivePeriod(entry)
      entry.effectiveSeq    = getEffectiveSeq(entry)
      allEntries.push(entry)
    })

    // When no override exists: match chrono sort exactly (date asc, then created_at asc)
    // When at least one entry has an override: use effectivePeriod/effectiveSeq
    allEntries.sort((a, b) => {
      const aO = presentationOrder[eKey(a)], bO = presentationOrder[eKey(b)]
      if (!aO && !bO) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1
        const ac = a.created_at || a.date + 'T00:00:00', bc = b.created_at || b.date + 'T00:00:00'
        return ac < bc ? -1 : ac > bc ? 1 : 0
      }
      if (a.effectivePeriod !== b.effectivePeriod) return a.effectivePeriod < b.effectivePeriod ? -1 : 1
      return a.effectiveSeq - b.effectiveSeq
    })

    let balance = startBal
    allEntries.forEach(e => { balance += e.delta; e.solde = balance })

    // Opening balance row — always prepended first, selectable in Presentation view
    const openingEntry = {
      date: selected.opening_date || '', created_at: '',
      type: 'opening', src: 'opening', raw: { id: 'opening' },
      label: 'Solde initial', detail: '', note: selected.opening_note || 'Solde de départ',
      operation: 'Solde initial', delta: 0, solde: startBal,
      effectivePeriod: '', effectiveSeq: -Infinity,
    }
    return { entries: [openingEntry, ...allEntries], startBalance: startBal, finalBalance: balance }
  }

  // ── PRESENTATION ORDER PERSISTENCE ──
  async function savePresentationOrder(newOrder) {
    setPresentationOrder(newOrder)
    if (!selected?.id) return
    await supabase.from('clients').update({ presentation_order: newOrder }).eq('id', selected.id)
  }

  function handlePresentationReorder(fromIdx, toIdx, displayEntries) {
    if (fromIdx === null || fromIdx === toIdx) return
    if (displayEntries[fromIdx]?.type === 'opening') return // can't move opening row
    if (displayEntries[toIdx]?.type === 'opening') return   // can't drop before opening row

    const draggedKey = eKey(displayEntries[fromIdx])
    const isDragSelected = presSelectedRows.has(draggedKey)
    const toMoveKeys = isDragSelected && presSelectedRows.size > 1
      ? new Set(presSelectedRows)
      : new Set([draggedKey])

    // Save snapshot for undo
    setPresHistory(h => [...h.slice(-19), JSON.parse(JSON.stringify(presentationOrder))])

    const newOrder = { ...presentationOrder }
    const staticEntries = displayEntries.filter(e => !toMoveKeys.has(eKey(e)))
    const movingEntries  = displayEntries.filter(e =>  toMoveKeys.has(eKey(e)))

    // Find insertion point in static array
    const targetKey  = eKey(displayEntries[toIdx])
    let anchorIdx    = staticEntries.findIndex(e => eKey(e) === targetKey)
    if (anchorIdx === -1) anchorIdx = staticEntries.length
    const insertIdx  = fromIdx > toIdx ? anchorIdx : anchorIdx + 1

    // Target period from the static context at drop position
    const prevStatic = insertIdx > 0 ? staticEntries[insertIdx - 1] : null
    const nextStatic = insertIdx < staticEntries.length ? staticEntries[insertIdx] : null
    const targetPeriod = prevStatic?.effectivePeriod ?? nextStatic?.effectivePeriod ?? movingEntries[0].effectivePeriod

    // Distribute moving entries evenly between prev and next seq
    const seqBefore = prevStatic?.effectiveSeq ?? ((nextStatic?.effectiveSeq ?? Date.now()) - movingEntries.length * 2000000)
    const seqAfter  = nextStatic?.effectiveSeq ?? (seqBefore + movingEntries.length * 2000000)
    const gap = (seqAfter - seqBefore) / (movingEntries.length + 1)

    movingEntries.forEach((e, i) => {
      newOrder[eKey(e)] = { p: targetPeriod, s: Math.round(seqBefore + gap * (i + 1)) }
    })

    setPresSelectedRows(new Set())
    savePresentationOrder(newOrder)
  }

  function undoPresentation() {
    if (!presHistory.length) return
    const prev = presHistory[presHistory.length - 1]
    setPresHistory(h => h.slice(0, -1))
    savePresentationOrder(prev)
  }

  function resetPresentation() {
    setPresHistory([])
    savePresentationOrder({})
  }

  // ── CHRONO HIGHLIGHT ──
  function toggleHighlight(key) {
    const ns = new Set(chronoHighlights)
    ns.has(key) ? ns.delete(key) : ns.add(key)
    setChronoHighlights(ns)
    try { localStorage.setItem(`chrono_hl_${selected.id}`, JSON.stringify([...ns])) } catch (_) {}
  }

  // ── PRESENTATION SAVES ──
  function savePresentation(name) {
    if (!name.trim()) return
    const pres = {
      id: Date.now().toString(),
      name: name.trim(),
      selectedKeys: [...presSelectedRows],
      order: { ...presentationOrder },
      savedAt: new Date().toISOString(),
    }
    const updated = [...presentations.filter(p => p.name !== name.trim()), pres]
    setPresentations(updated)
    setActivePresName(name.trim())
    try { localStorage.setItem(`presentations_${selected.id}`, JSON.stringify(updated)) } catch (_) {}
    setShowSavePresModal(false)
    setSavePresName('')
  }

  function loadPresentation(pres) {
    savePresentationOrder(pres.order)
    setPresSelectedRows(new Set(pres.selectedKeys))
    setPresHistory([])
    setActivePresName(pres.name)
    setShowPresLibrary(false)
  }

  function deletePresentation(id) {
    const updated = presentations.filter(p => p.id !== id)
    setPresentations(updated)
    try { localStorage.setItem(`presentations_${selected.id}`, JSON.stringify(updated)) } catch (_) {}
  }

  // ── REMISE FUNCTIONS ──
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
        date: remiseForm.date, client_id: selected.id, client_nom: selected.nom,
        montant, type_remise: remiseForm.type_remise, motif: remiseForm.motif || null,
        created_by: user?.email || null,
      })
      if (error) { setRemiseError(error.message); setRemiseSaving(false); return }
      const newSolde = (selected.solde || 0) - montant
      await supabase.from('clients').update({ solde: newSolde }).eq('id', selected.id)
      setSelected({ ...selected, solde: newSolde })
    } else {
      const delta = montant - (remiseModal.montant || 0)
      const { error } = await supabase.from('remises').update({
        date: remiseForm.date, montant, type_remise: remiseForm.type_remise, motif: remiseForm.motif || null,
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

  function handleClientCheck(clientId, idx, ev) {
    const ns = new Set(selectedClientIds)
    if (ev.shiftKey && lastClickedClientIdx !== null) {
      const lo = Math.min(lastClickedClientIdx, idx), hi = Math.max(lastClickedClientIdx, idx)
      filtered.slice(lo, hi + 1).forEach(c => ns.add(c.id))
    } else {
      ns.has(clientId) ? ns.delete(clientId) : ns.add(clientId)
    }
    setSelectedClientIds(ns)
    setLastClickedClientIdx(idx)
  }

  function printSelectedClients() {
    const selClients = filtered.filter(function(c) { return selectedClientIds.has(c.id) })
    if (!selClients.length) return
    const _now = new Date()
    const hh = String(_now.getHours()).padStart(2, '0')
    const mm = String(_now.getMinutes()).padStart(2, '0')
    const dateStr = _now.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' à ' + hh + ':' + mm
    const n = selClients.length
    const suf = n !== 1 ? 's' : ''
    const clientsFullLabel = n + ' client' + suf + ' sélectionné' + suf
    const clientsShortLabel = n + ' client' + suf
    let periodeLabel
    if (reportPeriodActive && reportTo) {
      periodeLabel = 'Du ' + (reportFrom ? fmtDate(reportFrom) : 'début') + ' au ' + fmtDate(reportTo)
    } else {
      periodeLabel = 'Toutes les dates'
    }
    const totalSolde = selClients.reduce(function(s, c) { return s + (reportPeriodActive ? (reportBalances[c.id] != null ? reportBalances[c.id] : c.solde || 0) : (c.solde || 0)) }, 0)
    const totalColor = totalSolde > 0 ? '#dc2626' : '#16a34a'
    const totalSoldeStr = fmt(totalSolde)
    const p = 'padding:10px 14px;border-bottom:1px solid #e8ecf0'
    let rows = ''
    for (let i = 0; i < selClients.length; i++) {
      const c = selClients[i]
      const solde = reportPeriodActive ? (reportBalances[c.id] != null ? reportBalances[c.id] : c.solde || 0) : (c.solde || 0)
      const soldeColor = solde >= 100000 ? '#dc2626' : solde >= 30000 ? '#d97706' : solde > 0 ? '#1d4ed8' : '#16a34a'
      const rowBg = i % 2 === 1 ? ' style="background:#f8fafc"' : ''
      rows += '<tr' + rowBg + '>'
        + '<td style="' + p + ';font-size:13px;color:#374151">' + (i + 1) + '</td>'
        + '<td style="' + p + ';font-size:14px;font-weight:700;color:#0f172a;text-transform:uppercase">' + c.nom + '</td>'
        + '<td style="' + p + ';font-size:13px;color:#475569">' + (c.depot || '—') + '</td>'
        + '<td style="' + p + ';font-size:13px;color:#475569">' + (c.tel || '—') + '</td>'
        + '<td style="' + p + ';text-align:right;font-size:15px;font-weight:900;color:' + soldeColor + ';white-space:nowrap;font-family:monospace;letter-spacing:-0.3px">' + fmt(solde) + ' DHS</td>'
        + '</tr>'
    }
    const css = '@page{margin:12mm} @media print{.btn-p{display:none!important}} *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;box-sizing:border-box;margin:0;padding:0} body{font-family:Arial,sans-serif;font-size:13px;color:#1e293b;background:#fff;border-top:4px solid #1e3a5f} table{width:100%;border-collapse:collapse} thead th{background:#1e3a5f;color:#fff;padding:10px 14px;font-size:10.5px;font-weight:700;text-transform:uppercase;text-align:left;white-space:nowrap} .btn-p{padding:4px 10px;border:none;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;background:#475569;color:#fff}'
    const svg = '<svg width="44" height="44" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="90" fill="#1e3a5f"/><polygon points="40,170 256,50 472,170" fill="#e8b84b"/><rect x="60" y="175" width="115" height="70" rx="12" fill="#fff" opacity=".95"/><rect x="195" y="175" width="122" height="70" rx="12" fill="#fff" opacity=".95"/><rect x="337" y="175" width="115" height="70" rx="12" fill="#fff" opacity=".95"/><rect x="60" y="260" width="85" height="70" rx="12" fill="#e8b84b" opacity=".95"/><rect x="165" y="260" width="122" height="70" rx="12" fill="#e8b84b" opacity=".95"/><rect x="307" y="260" width="145" height="70" rx="12" fill="#e8b84b" opacity=".95"/></svg>'
    const html = '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Créances Clients</title><style>' + css + '</style></head><body>'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:12px 24px 10px;border-bottom:1px solid #e2e8f0">'
      + '<div><div style="display:flex;align-items:center;gap:12px">' + svg
      + '<div><div style="font-size:20px;font-weight:900;color:#1e3a5f;text-transform:uppercase">DAR SADIK</div>'
      + '<div style="font-size:11px;color:#2563eb;font-weight:700">Matériaux de Construction</div></div></div>'
      + '<div style="font-size:11px;color:#475569;margin-top:5px">Selouane, Nador</div></div>'
      + '<div style="text-align:right"><div style="font-size:11px;color:#1e3a5f;line-height:1.85"><strong>Mohamed</strong> 06 61 32 56 65 &nbsp;&middot;&nbsp; <strong>Sadik</strong> 06 61 97 87 47<br><strong>Bureau</strong> 06 62 82 88 20</div>'
      + '<div style="font-size:9.5px;color:#94a3b8;margin-top:3px">Généré le ' + dateStr + '</div>'
      + '<div style="margin-top:4px"><button class="btn-p" onclick="window.print()">Imprimer / PDF</button></div></div></div>'
      + '<div style="padding:12px 24px">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
      + '<div><div style="font-size:17px;font-weight:900;color:#1e3a5f;text-transform:uppercase">Rapport Créances Clients</div>'
      + '<div style="font-size:11px;color:#2563eb;font-weight:700;margin-top:3px">Période : ' + periodeLabel + '</div></div>'
      + '<div style="font-size:12px;color:#475569;font-weight:600">' + clientsFullLabel + '</div></div>'
      + '<table><thead><tr>'
      + '<th style="width:40px">#</th><th>Client</th><th>Dépôt</th><th>Téléphone</th>'
      + '<th style="text-align:right">Créance (DHS)</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#eff6ff;border-top:3px solid #1e3a5f;font-weight:800;font-size:14px;color:#1e3a5f">'
      + '<span>Total — ' + clientsFullLabel + '</span>'
      + '<span style="font-size:15px;font-weight:900;font-family:monospace">' + totalSoldeStr + ' DHS</span></div>'
      + '<div style="background:#f0fdf4;border:2px solid #86efac;border-radius:10px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-top:12px">'
      + '<div><div style="font-size:12px;font-weight:700;color:#166534">Total créances sélectionnées</div>'
      + '<div style="font-size:10px;color:#86efac;margin-top:2px">' + clientsShortLabel + ' · ' + periodeLabel + '</div></div>'
      + '<div style="text-align:right"><div style="font-size:30px;font-weight:900;color:' + totalColor + ';line-height:1;letter-spacing:-0.5px">' + totalSoldeStr + '</div>'
      + '<div style="font-size:12px;font-weight:600;color:#4ade80;margin-top:2px">DHS</div></div></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0">'
      + '<span>DAR SADIK — Matériaux de Construction — Selouane, Nador</span>'
      + '<span>Généré le ' + dateStr + '</span></div>'
      + '</div></body></html>'
    openPrintWindow(html)
  }

  const handleBack = () => { setShowDetail(false) }

  // ── RENDER: PRESENTATION TABLE ──
  function renderPresentationTable() {
    const presLedger     = buildPresentationLedger()
    const displayEntries = presLedger.entries
    const thS = { background:'#ede9fe', color:'#5b21b6', borderBottom:'2px solid #ddd6fe', whiteSpace:'nowrap', padding:'9px 12px', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', userSelect:'none' }
    const bdr = { border:'1px solid #f1f5f9' }

    // Selection totals for floating toolbar
    const selectedEntries = displayEntries.filter(e => presSelectedRows.has(eKey(e)))
    const selectedTotal   = selectedEntries.reduce((s, e) => s + e.delta, 0)
    const selectedSolde   = selectedEntries.length > 0 ? selectedEntries[selectedEntries.length - 1].solde : presLedger.finalBalance

    const firstSelIdx = presSelectedRows.size > 0
      ? displayEntries.findIndex(e => presSelectedRows.has(eKey(e)))
      : -1
    const carryForwardBalance = firstSelIdx > 0 ? displayEntries[firstSelIdx - 1].solde : null

    if (displayEntries.length === 0) {
      return <div style={{padding:'24px',textAlign:'center',color:'#94a3b8',fontStyle:'italic'}}>Aucune opération</div>
    }

    return (
      <div>
        {/* STATIC TOOLBAR — drag hint + undo/reset + library */}
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 16px',borderBottom:'1px solid #f1f5f9',background:'#faf5ff',flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:'#7c3aed',flex:1,minWidth:0}}>
            ↕ Glissez les lignes pour réorganiser · Cliquez pour sélectionner · Maj+Clic pour une plage
          </span>
          {presentations.length > 0 && (
            <button onClick={() => setShowPresLibrary(true)}
              style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:5,border:'1px solid #ddd6fe',background:'#ede9fe',color:'#5b21b6',cursor:'pointer'}}>
              📁 Mes présentations ({presentations.length})
            </button>
          )}
          {presHistory.length > 0 && (
            <button onClick={undoPresentation}
              style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:5,border:'1px solid #bfdbfe',background:'#eff6ff',color:'#1d4ed8',cursor:'pointer'}}>
              ↩ Annuler
            </button>
          )}
          {Object.keys(presentationOrder).length > 0 && (
            <button onClick={resetPresentation}
              style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:5,border:'1px solid #fde68a',background:'#fffbeb',color:'#92400e',cursor:'pointer'}}>
              ↺ Réinitialiser
            </button>
          )}
        </div>

        {/* FLOATING ACTION TOOLBAR — appears only when rows are selected */}
        {presSelectedRows.size > 0 && (
          <div style={{background:'#1e3a5f',color:'#fff',padding:'10px 16px',display:'flex',alignItems:'center',flexWrap:'wrap',gap:10,boxShadow:'0 4px 16px rgba(30,58,95,0.35)'}}>
            <div style={{flex:1,minWidth:180}}>
              <div style={{fontWeight:700,fontSize:13,lineHeight:1.3}}>
                {presSelectedRows.size} opération{presSelectedRows.size > 1 ? 's' : ''} sélectionnée{presSelectedRows.size > 1 ? 's' : ''}
              </div>
              <div style={{fontSize:12,opacity:0.85,marginTop:3,display:'flex',gap:16}}>
                <span>Total : <strong>{selectedTotal >= 0 ? '+' : '−'} {fmt(Math.abs(selectedTotal))} DHS</strong></span>
                <span>Solde : <strong>{fmt(selectedSolde)} DHS</strong></span>
              </div>
            </div>
            <button onClick={() => { printPresentationClient(); setPresSelectedRows(new Set()) }}
              style={{padding:'5px 12px',borderRadius:6,border:'none',background:'#fff',color:'#1e3a5f',fontWeight:700,fontSize:11,cursor:'pointer',whiteSpace:'nowrap'}}>
              🖨️ Imprimer
            </button>
            <button onClick={() => { printPresentationClient(); setPresSelectedRows(new Set()) }}
              style={{padding:'5px 12px',borderRadius:6,border:'none',background:'#c7d2fe',color:'#1e40af',fontWeight:700,fontSize:11,cursor:'pointer',whiteSpace:'nowrap'}}>
              📄 PDF
            </button>
            <button onClick={() => { setSavePresName(activePresName || ''); setShowSavePresModal(true) }}
              style={{padding:'5px 12px',borderRadius:6,border:'1px solid rgba(255,255,255,0.35)',background:'transparent',color:'#fff',fontWeight:700,fontSize:11,cursor:'pointer',whiteSpace:'nowrap'}}>
              💾 Enregistrer la présentation
            </button>
            <button onClick={() => setPresSelectedRows(new Set())}
              style={{padding:'5px 12px',borderRadius:6,border:'1px solid rgba(255,255,255,0.25)',background:'transparent',color:'#fca5a5',fontWeight:700,fontSize:11,cursor:'pointer',whiteSpace:'nowrap'}}>
              ✕ Annuler
            </button>
          </div>
        )}

        <div className="overflow-x-auto" style={{userSelect:'none'}}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {/* Select-all checkbox */}
                <th style={{...thS,width:36,padding:'9px 6px',textAlign:'center'}}>
                  <input type="checkbox"
                    checked={displayEntries.length > 0 && displayEntries.every(e => presSelectedRows.has(eKey(e)))}
                    onChange={ev => setPresSelectedRows(ev.target.checked ? new Set(displayEntries.map(eKey)) : new Set())}
                    style={{width:13,height:13,cursor:'pointer',accentColor:'#7c3aed'}} />
                </th>
                {/* Drag handle col */}
                <th style={{...thS,width:20,padding:'9px 4px'}}></th>
                {[
                  {l:'Date',r:false},{l:'Camion',r:false},{l:'Opération',r:false},{l:'Type',r:false},
                  {l:'Qté',r:true},{l:'Prix/u',r:true},{l:'Total DHS',r:true},{l:'Solde',r:true},{l:'Note',r:false}
                ].map((col,ci) => (
                  <th key={ci} style={{...thS,textAlign:col.r?'right':'left'}}>{col.l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayEntries.map((e, i) => {
                // ── Opening balance row ──
                if (e.type === 'opening') {
                  const isSelected = presSelectedRows.has(eKey(e))
                  const amber = '#fde68a'
                  const bdrA = { border: `1px solid ${amber}` }
                  return (
                    <tr key="opening:opening"
                      onClick={() => {
                        const key = eKey(e); const ns = new Set(presSelectedRows)
                        ns.has(key) ? ns.delete(key) : ns.add(key)
                        setPresSelectedRows(ns); setPresLastClickedIdx(i); presSelectInitRef.current = new Set(ns)
                      }}
                      style={{ background: isSelected ? '#fef3c7' : '#fffbeb', cursor: 'pointer',
                        borderLeft: isSelected ? '3px solid #f59e0b' : undefined }}>
                      <td style={{ width:36, padding:'0 6px', textAlign:'center', ...bdrA }} onClick={ev => ev.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => {
                          const ns = new Set(presSelectedRows); const key = eKey(e)
                          ns.has(key) ? ns.delete(key) : ns.add(key)
                          setPresSelectedRows(ns); setPresLastClickedIdx(i); presSelectInitRef.current = new Set(ns)
                        }} style={{ width:13, height:13, cursor:'pointer', accentColor:'#f59e0b' }} />
                      </td>
                      <td style={{ width:20, textAlign:'center', color:'#fde68a', fontSize:17, userSelect:'none', ...bdrA }}>—</td>
                      <td className="td text-xs" style={{ ...bdrA, color:'#92400e', whiteSpace:'nowrap', padding:'10px 12px' }}>
                        {e.date ? fmtDate(e.date) : '—'}
                      </td>
                      <td className="td text-center text-gray-300" style={{ ...bdrA, padding:'10px 12px' }}>—</td>
                      <td className="td text-xs font-semibold" style={{ ...bdrA, color:'#92400e', whiteSpace:'nowrap', padding:'10px 12px' }}>
                        Solde initial
                      </td>
                      <td style={{ ...bdrA, padding:'10px 12px' }}>
                        <span style={{ background:'#fef3c7', color:'#92400e', fontWeight:700, fontSize:10, padding:'2px 7px', borderRadius:3, border:`1px solid ${amber}`, whiteSpace:'nowrap' }}>
                          Solde initial
                        </span>
                      </td>
                      {[0,1,2].map(k => <td key={k} className="td text-center text-gray-200" style={{ ...bdrA, padding:'10px 12px' }}>—</td>)}
                      <td className="td text-right font-black" style={{ ...bdrA, color:'#b45309', fontSize:15, whiteSpace:'nowrap', padding:'10px 14px', letterSpacing:'-0.2px' }}>
                        {e.solde >= 0 ? `+ ${fmt(e.solde)}` : `− ${fmt(Math.abs(e.solde))}`}
                      </td>
                      <td className="td text-xs" style={{ ...bdrA, padding:'10px 12px', color:'#92400e', fontStyle:'italic' }}>
                        {e.note || 'Solde de départ'}
                      </td>
                    </tr>
                  )
                }

                const isVente    = e.src === 'vente'
                const v          = e.raw
                const isPos      = e.delta >= 0
                const absAmt     = Math.abs(e.delta)
                const amtColor   = isPos ? '#1d4ed8' : '#16a34a'
                const isSelected = presSelectedRows.has(eKey(e))
                const isDragging = presDragFrom === i
                const isDropTarget = presDragOver === i && presDragFrom !== null && presDragFrom !== i
                const isMoved    = !!presentationOrder[eKey(e)]
                const typeRowBg  = (e.type === 'remise' || e.type === 'remise-voyage' || e.type === 'paiement' || e.type === 'frais-deduction') ? '#f0fdf4'
                  : e.type === 'mdo' ? '#fefce8' : undefined
                const rowBg = isSelected ? '#ede9fe' : typeRowBg || (i % 2 === 1 ? '#f9fafb' : undefined)

                const rowEl = (
                  <tr key={eKey(e)}
                    /* ── Drop zone (for row reorder) ── */
                    onDragOver={ev => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; setPresDragOver(i) }}
                    onDrop={ev => { ev.preventDefault(); handlePresentationReorder(presDragFrom, i, displayEntries) }}
                    onDragEnd={() => { setPresDragFrom(null); setPresDragOver(null) }}
                    /* ── ERP-style toggle click ── */
                    onClick={ev => {
                      if (presDragSelectActive) return // was a drag, not a click
                      const key = eKey(e)
                      if (ev.shiftKey && presLastClickedIdx !== null) {
                        const lo = Math.min(presLastClickedIdx, i), hi = Math.max(presLastClickedIdx, i)
                        const ns = new Set(presSelectInitRef.current ?? presSelectedRows)
                        for (let j = lo; j <= hi; j++) ns.add(eKey(displayEntries[j]))
                        setPresSelectedRows(ns)
                      } else {
                        // Plain click or Ctrl/Cmd+Click: toggle this row
                        const ns = new Set(presSelectedRows)
                        ns.has(key) ? ns.delete(key) : ns.add(key)
                        setPresSelectedRows(ns)
                        setPresLastClickedIdx(i)
                        presSelectInitRef.current = new Set(ns)
                      }
                    }}
                    /* ── Drag-select (mousedown → mouseenter) ── */
                    onMouseDown={ev => {
                      if (ev.button !== 0) return
                      setPresDragSelectStart(i)
                      setPresDragSelectActive(false)
                      presSelectInitRef.current = new Set(presSelectedRows)
                    }}
                    onMouseEnter={ev => {
                      if (presDragSelectStart === null || !(ev.buttons & 1) || presDragFrom !== null) return
                      setPresDragSelectActive(true)
                      const lo = Math.min(presDragSelectStart, i), hi = Math.max(presDragSelectStart, i)
                      const ns = new Set(presSelectInitRef.current ?? presSelectedRows)
                      for (let j = lo; j <= hi; j++) ns.add(eKey(displayEntries[j]))
                      setPresSelectedRows(ns)
                      setPresLastClickedIdx(i)
                    }}
                    style={{
                      background: rowBg,
                      opacity: isDragging ? 0.4 : 1,
                      borderTop: isDropTarget ? '2px solid #7c3aed' : undefined,
                      borderLeft: isSelected ? '3px solid #7c3aed' : undefined,
                      cursor: 'pointer',
                    }}
                  >
                    {/* CHECKBOX — still visible but clicking anywhere on row works */}
                    <td style={{width:36,padding:'0 6px',textAlign:'center',...bdr}} onClick={ev => ev.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => {
                        const ns = new Set(presSelectedRows)
                        ns.has(eKey(e)) ? ns.delete(eKey(e)) : ns.add(eKey(e))
                        setPresSelectedRows(ns); setPresLastClickedIdx(i)
                        presSelectInitRef.current = new Set(ns)
                      }}
                        style={{width:13,height:13,cursor:'pointer',accentColor:'#7c3aed'}} />
                    </td>
                    {/* DRAG HANDLE — only this initiates row reorder */}
                    <td
                      draggable
                      onDragStart={ev => { ev.dataTransfer.effectAllowed = 'move'; setPresDragFrom(i) }}
                      onClick={ev => ev.stopPropagation()}
                      style={{width:20,textAlign:'center',color:'#9ca3af',fontSize:17,userSelect:'none',cursor:'grab',...bdr}}>
                      ⠿
                    </td>
                    {/* DATE + MOVED INDICATOR */}
                    <td className="td text-xs" style={{...bdr,color:'#374151',fontWeight:500,whiteSpace:'nowrap',padding:'10px 12px'}}>
                      <div>{fmtDate(e.date)}</div>
                      {isMoved && (
                        <div style={{fontSize:9,marginTop:2}}>
                          <span style={{background:'#ede9fe',color:'#7c3aed',fontWeight:700,padding:'1px 4px',borderRadius:3}}>↕ Déplacé</span>
                        </div>
                      )}
                    </td>
                    {/* CAMION */}
                    <td className="td text-xs" style={{...bdr,whiteSpace:'nowrap',color:'#64748b',padding:'10px 12px'}}>
                      {e.detail || <span className="text-gray-400">—</span>}
                    </td>
                    {/* OPÉRATION */}
                    <td className="td text-xs font-semibold" style={{...bdr,whiteSpace:'nowrap',color:'#1e293b',padding:'10px 12px'}}>
                      {e.operation}
                    </td>
                    {/* TYPE BADGE */}
                    <td className="td" style={{...bdr,whiteSpace:'nowrap',padding:'10px 12px'}}>
                      {e.type === 'vente' || e.type === 'frais-charge'
                        ? <span style={{background:'#eff6ff',color:'#1d4ed8',fontWeight:700,fontSize:10,padding:'2px 7px',borderRadius:3,border:'1px solid #bfdbfe',whiteSpace:'nowrap'}}>{e.label}</span>
                        : e.type === 'mdo'
                        ? <span style={{background:'#fef9c3',color:'#92400e',fontWeight:700,fontSize:10,padding:'2px 7px',borderRadius:3,border:'1px solid #fde68a',whiteSpace:'nowrap'}}>M.O.</span>
                        : <span style={{background:'#dcfce7',color:'#15803d',fontWeight:700,fontSize:10,padding:'2px 7px',borderRadius:3,border:'1px solid #bbf7d0',whiteSpace:'nowrap'}}>
                            {e.type === 'paiement' || e.type === 'frais-deduction' ? e.label : 'Remise'}
                          </span>}
                    </td>
                    {/* QTÉ */}
                    <td className="td text-right" style={{...bdr,whiteSpace:'nowrap',padding:'10px 12px',fontWeight:600,color:'#374151',fontSize:13}}>
                      {isVente && e.type !== 'remise-voyage' && e.type !== 'mdo' ? fmt(v.qte) : <span className="text-gray-400">—</span>}
                    </td>
                    {/* PRIX/U */}
                    <td className="td text-right" style={{...bdr,whiteSpace:'nowrap',padding:'10px 12px',fontWeight:600,color:'#374151',fontSize:12}}>
                      {isVente && e.type !== 'remise-voyage' && e.type !== 'mdo' ? parseFloat(v.prix_vente||0).toFixed(2) : <span className="text-gray-400">—</span>}
                    </td>
                    {/* TOTAL */}
                    <td className="td text-right" style={{...bdr,fontSize:14,fontWeight:700,whiteSpace:'nowrap',padding:'10px 12px',color:amtColor}}>
                      {isPos ? `+ ${fmt(absAmt)}` : `− ${fmt(absAmt)}`}
                    </td>
                    {/* SOLDE */}
                    <td className="td text-right" style={{...bdr,fontSize:15,fontWeight:900,whiteSpace:'nowrap',padding:'10px 14px',
                      color: e.solde > 0 ? '#1e3a5f' : '#16a34a', letterSpacing:'-0.2px'}}>
                      {e.solde >= 0 ? `+ ${fmt(e.solde)}` : `− ${fmt(Math.abs(e.solde))}`}
                    </td>
                    {/* NOTE */}
                    <td className="td text-xs" style={{...bdr,maxWidth:'150px',wordBreak:'break-word',padding:'10px 12px',
                      color: e.note ? '#374151' : '#9ca3af', fontStyle: e.note ? 'normal' : 'italic', fontWeight: e.note ? 600 : 400}}>
                      {e.note || '—'}
                    </td>
                  </tr>
                )
                if (i === firstSelIdx && carryForwardBalance !== null) {
                  const cfSign = carryForwardBalance >= 0 ? '+ ' : '− '
                  const cfAmt = fmt(Math.abs(carryForwardBalance))
                  return (
                    <Fragment key={`rf-${eKey(e)}`}>
                      <tr style={{background:'#fef3c7',cursor:'default'}}>
                        <td style={{width:36,padding:'0 6px',textAlign:'center',border:'1px solid #fde68a'}}></td>
                        <td style={{width:20,textAlign:'center',color:'#fde68a',fontSize:17,userSelect:'none',border:'1px solid #fde68a'}}>—</td>
                        <td className="td text-xs" style={{border:'1px solid #fde68a',color:'#92400e',whiteSpace:'nowrap',padding:'10px 12px'}}>—</td>
                        <td className="td text-center text-gray-300" style={{border:'1px solid #fde68a',padding:'10px 12px'}}>—</td>
                        <td className="td text-xs font-semibold" style={{border:'1px solid #fde68a',color:'#92400e',whiteSpace:'nowrap',padding:'10px 12px'}}>Report</td>
                        <td style={{border:'1px solid #fde68a',padding:'10px 12px'}}>
                          <span style={{background:'#fef3c7',color:'#92400e',fontWeight:700,fontSize:10,padding:'2px 7px',borderRadius:3,border:'1px solid #fde68a',whiteSpace:'nowrap'}}>Report</span>
                        </td>
                        {[0,1,2].map(k => <td key={k} className="td text-center text-gray-300" style={{border:'1px solid #fde68a',padding:'10px 12px'}}>—</td>)}
                        <td className="td text-right font-black" style={{border:'1px solid #fde68a',color:'#b45309',fontSize:15,whiteSpace:'nowrap',padding:'10px 14px',letterSpacing:'-0.2px'}}>
                          {cfSign}{cfAmt}
                        </td>
                        <td className="td text-xs" style={{border:'1px solid #fde68a',padding:'10px 12px'}}></td>
                      </tr>
                      {rowEl}
                    </Fragment>
                  )
                }
                return rowEl
              })}
            </tbody>
            {displayEntries.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={9} style={{padding:'11px 12px',background:'#ede9fe',color:'#5b21b6',fontWeight:700,fontSize:13,borderTop:'2px solid #ddd6fe'}}>
                    Total — {displayEntries.length} opération{displayEntries.length !== 1 ? 's' : ''}
                  </td>
                  <td style={{padding:'11px 14px',background:'#ede9fe',fontSize:15,fontWeight:900,color:'#1e3a5f',textAlign:'right',borderTop:'2px solid #ddd6fe',letterSpacing:'-0.2px'}}>
                    {fmt(presLedger.finalBalance)} <span style={{fontSize:12,fontWeight:600,color:'#a78bfa'}}>DHS</span>
                  </td>
                  <td style={{background:'#ede9fe',borderTop:'2px solid #ddd6fe'}}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════
  // JSX
  // ═══════════════════════════════════════════════════════
  return (
    <Layout title="Clients Briques" subtitle="Gestion des clients et suivi des comptes">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* CLIENT LIST */}
        <div className={`lg:col-span-1 ${showDetail ? 'hidden lg:block' : 'block'}`}>
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <input type="checkbox"
                  checked={filtered.length > 0 && filtered.every(c => selectedClientIds.has(c.id))}
                  onChange={ev => { setSelectedClientIds(ev.target.checked ? new Set(filtered.map(c => c.id)) : new Set()); setLastClickedClientIdx(null) }}
                  style={{width:14,height:14,cursor:'pointer',accentColor:'#1e3a5f',flexShrink:0}} />
                <h2 className="font-semibold text-gray-900">Liste clients</h2>
              </div>
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
                        <button type="button" onClick={() => setShowCustomDepot(true)} className="btn-secondary text-xs px-2">+ Nouveau</button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <input className="input flex-1" placeholder="Nom du dépôt..." value={customDepotValue}
                          onChange={e => setCustomDepotValue(e.target.value.toUpperCase())} />
                        <button type="button" className="btn-primary text-xs px-2"
                          onClick={() => { if(customDepotValue.trim()) { setForm({...form, depot: customDepotValue.trim()}); setShowCustomDepot(false) } }}>✓</button>
                        <button type="button" className="btn-secondary text-xs px-2" onClick={() => setShowCustomDepot(false)}>✕</button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="label">Téléphone</label>
                    <input className="input" placeholder="06 ..." value={form.tel} onChange={e => setForm({...form, tel: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="label">Solde d'ouverture (DHS)</label>
                  <input className="input" type="number" placeholder="0" value={form.opening_balance}
                    onChange={e => setForm({...form, opening_balance: e.target.value, solde: e.target.value})} />
                  <div className="text-xs text-gray-400 mt-1">Montant dû avant cette app</div>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={saving} className="btn-primary text-xs">{saving ? 'Enregistrement...' : '✓ Enregistrer'}</button>
                  <button type="button" className="btn-secondary text-xs" onClick={() => setShowForm(false)}>Annuler</button>
                </div>
              </form>
            )}

            {/* PERIOD FILTER FOR CRÉANCE REPORT */}
            <div className="mb-3 p-3 rounded-xl border border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">📅 Créances par période</div>
                {reportPeriodActive && (
                  <button onClick={() => { setReportPeriodActive(false); setReportBalances({}); setReportFrom(''); setReportTo('') }}
                    className="text-xs text-red-500 font-semibold hover:text-red-700">✕ Effacer</button>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center gap-1">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Du:</label>
                  <input type="date" className="input text-xs" style={{width:'130px',padding:'4px 6px'}}
                    value={reportFrom} onChange={e => setReportFrom(e.target.value)} />
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Au:</label>
                  <input type="date" className="input text-xs" style={{width:'130px',padding:'4px 6px'}}
                    value={reportTo} onChange={e => setReportTo(e.target.value)} />
                </div>
                <button
                  onClick={() => { if (reportTo) { setReportPeriodActive(true); loadPeriodBalances(clients) } }}
                  disabled={!reportTo || reportLoading}
                  className="btn-primary text-xs px-3 py-1.5 flex-shrink-0" style={{background:'#1e3a5f'}}>
                  {reportLoading ? 'Calcul...' : 'Calculer'}
                </button>
              </div>
              {reportPeriodActive && !reportLoading && (
                <div className="mt-2 text-xs font-semibold" style={{color:'#1d4ed8'}}>
                  ✓ Soldes calculés au {fmtDate(reportTo)}{reportFrom ? ` — depuis le ${fmtDate(reportFrom)}` : ''}
                </div>
              )}
            </div>

            <input className="input mb-3" placeholder="Rechercher un client..." value={search} onChange={e => setSearch(e.target.value)} />

            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {loading ? (
                <div className="text-center text-gray-400 py-6">Chargement...</div>
              ) : filtered.map((c, idx) => {
                const s = c.solde || 0
                const displayBalance = reportPeriodActive ? (reportBalances[c.id] ?? s) : s
                const isActive = selected?.id === c.id
                const isChecked = selectedClientIds.has(c.id)
                const balColor = displayBalance >= 100000 ? 'text-red-600' : displayBalance >= 30000 ? 'text-amber-600' : displayBalance > 0 ? 'text-blue-600' : 'text-green-600'
                return (
                  <div key={c.id}
                    className={`flex items-center gap-2 p-3 rounded-xl transition-all border select-none
                      ${isActive ? 'bg-brand-50 border-brand-200' : isChecked ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'}`}
                    style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
                    {/* Checkbox — click stops propagation so row click still opens detail */}
                    <div
                      onClick={ev => { ev.stopPropagation(); handleClientCheck(c.id, idx, ev) }}
                      style={{flexShrink:0,cursor:'pointer',padding:'2px 0'}}>
                      <input type="checkbox" checked={isChecked} readOnly
                        style={{width:14,height:14,cursor:'pointer',accentColor:'#1e3a5f',pointerEvents:'none'}} />
                    </div>
                    {/* Main row — click opens detail */}
                    <div className="flex-1 min-w-0 flex items-center justify-between cursor-pointer"
                      onClick={() => selectClient(c)} role="button" tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && selectClient(c)}>
                      <div className="min-w-0">
                        <div className={`font-semibold text-sm truncate ${isActive ? 'text-brand-700' : 'text-gray-900'}`}>{c.nom}</div>
                        <div className="text-xs text-gray-400">{c.depot}</div>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <div className={`text-xs font-bold ${balColor}`}>
                          {reportLoading ? '...' : `${fmt(displayBalance)} DHS`}
                        </div>
                        <span className="text-gray-300 lg:hidden">›</span>
                      </div>
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && <div className="text-center text-gray-400 py-6">Aucun client</div>}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-sm">
              <span className="text-gray-500 font-medium">
                Total créances{reportPeriodActive ? <span className="text-blue-500 text-xs ml-1">(période)</span> : ''}
              </span>
              <span className="font-bold text-red-600">{reportLoading ? '...' : `${fmt(totalCreances)} DHS`}</span>
            </div>
          </div>
        </div>

        {/* CLIENT DETAIL */}
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
                <button onClick={handleBack} className="lg:hidden flex items-center gap-2 text-blue-600 text-sm font-semibold mb-4 active:opacity-70"
                  style={{ WebkitTapHighlightColor: 'transparent' }}>
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
                    <button onClick={printClient} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ PDF</button>
                    <button onClick={exportClientExcel} className="btn-primary text-xs px-3 py-1.5" style={{background:'#16a34a'}}>📊 Excel</button>
                    <button onClick={() => openEditClient(selected)} className="btn-secondary text-xs">✎ Client</button>
                    <button onClick={() => editSolde(selected)} className="btn-secondary text-xs">✎ Solde</button>
                    <button onClick={() => editOpeningBalance(selected)} className="btn-secondary text-xs" style={{background:'#fef3c7',color:'#92400e',borderColor:'#fde68a'}}>🏦 Solde initial</button>
                    <button onClick={() => deleteClient(selected.id)} className="btn-danger">✕</button>
                  </div>
                </div>

                {/* DATE FILTER */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">📅 Filtrer par période</div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {[{key:'all',label:'Tout'},{key:'day',label:'Jour'},{key:'week',label:'Semaine'},{key:'month',label:'Mois'},{key:'custom',label:'Personnalisé'}].map(f => (
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
                    <div className="mt-2 text-xs text-brand-600 font-semibold">📅 Période affichée: {getFilterLabel()}</div>
                  )}
                </div>

                {/* SOLDE ACTUEL */}
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

                {/* RECONCILIATION */}
                {!loadingDetail && computedSolde !== null && (
                  hasDiscrepancy ? (
                    <div className="mt-3 p-3 rounded-xl text-xs flex items-center justify-between gap-3 flex-wrap"
                      style={{background:'#fffbeb', border:'1px solid #fde68a'}}>
                      <div>
                        <div className="font-bold text-amber-700 mb-1">⚠️ Solde incohérent détecté</div>
                        <div className="text-amber-600">
                          Solde enregistré: <strong>{fmt(selected.solde)} DHS</strong>
                          {' '}· Solde calculé: <strong>{fmt(computedSolde)} DHS</strong>
                          {' '}· Écart: <strong>{fmt(soldeGap)} DHS</strong>
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
                      <span className="text-green-500">Le solde correspond aux transactions ({fmt(computedSolde)} DHS)</span>
                    </div>
                  )
                )}
              </div>

              {loadingDetail ? (
                <div className="card text-center py-10 text-gray-400">Chargement...</div>
              ) : (
                <>
                  {/* LEDGER CARD */}
                  {(() => {
                    const displayEntries = ledger.entries
                    const finalEntry = displayEntries.length ? displayEntries[displayEntries.length - 1] : null
                    const thS = {background:'#eff6ff',color:'#1d4ed8',borderBottom:'2px solid #bfdbfe',whiteSpace:'nowrap',padding:'9px 12px',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',userSelect:'none'}
                    const bdr = {border:'1px solid #f1f5f9'}
                    return (
                      <div className="card" style={{padding:0,overflow:'hidden'}}>
                        {/* TOOLBAR */}
                        <div className="flex items-center justify-between flex-wrap gap-2" style={{padding:'10px 16px',borderBottom:'1px solid #f1f5f9'}}>
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="font-semibold text-gray-900" style={{fontSize:14}}>
                              Historique du compte
                              <span className="text-gray-400 font-normal text-sm ml-2">
                                ({stmtMode === 'presentation'
                                  ? buildPresentationLedger().entries.length
                                  : displayEntries.length} opération{displayEntries.length !== 1 ? 's' : ''})
                              </span>
                            </h3>
                            {/* MODE TOGGLE */}
                            <div style={{display:'flex',borderRadius:6,overflow:'hidden',border:'1px solid #e2e8f0',flexShrink:0}}>
                              <button
                                onClick={ev => { ev.stopPropagation(); setStmtMode('chrono') }}
                                style={{padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer',border:'none',
                                  background: stmtMode === 'chrono' ? '#2563eb' : '#f8fafc',
                                  color: stmtMode === 'chrono' ? '#fff' : '#64748b', transition:'all 0.15s'}}>
                                Chronologique
                              </button>
                              <button
                                onClick={ev => { ev.stopPropagation(); setStmtMode('presentation') }}
                                style={{padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer',border:'none',borderLeft:'1px solid #e2e8f0',
                                  background: stmtMode === 'presentation' ? '#7c3aed' : '#f8fafc',
                                  color: stmtMode === 'presentation' ? '#fff' : '#64748b', transition:'all 0.15s'}}>
                                ↕ Présentation
                              </button>
                            </div>
                            {/* Legend (chrono only) */}
                            {stmtMode === 'chrono' && (
                              <div className="flex items-center gap-3 text-xs" style={{color:'#94a3b8'}}>
                                <span className="flex items-center gap-1">
                                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{background:'#dbeafe',border:'1px solid #bfdbfe'}}></span>
                                  Livraison
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{background:'#dcfce7',border:'1px solid #bbf7d0'}}></span>
                                  Paiement
                                </span>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => { setRemiseForm({ date: today(), montant: '', type_remise: 'Commerciale', motif: '' }); setRemiseError(''); setRemiseModal('new') }}
                            className="btn-primary text-xs px-3 py-1.5 flex-shrink-0" style={{background:'#7c3aed'}}>
                            + Remise
                          </button>
                        </div>

                        {/* TABLE BODY — switch between modes */}
                        {stmtMode === 'presentation' ? renderPresentationTable() : (
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr>
                                  {[
                                    {l:'Date',r:false},{l:'Camion',r:false},{l:'Opération',r:false},{l:'Type',r:false},
                                    {l:'Qté',r:true},{l:'Prix/u',r:true},{l:'Total DHS',r:true},{l:'Solde',r:true},
                                    {l:'Note',r:false},{l:'',r:false}
                                  ].map((col,i) => (
                                    <th key={i} style={{...thS,textAlign:col.r?'right':'left'}}>{col.l}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {/* Opening balance / carry-over row */}
                                <tr style={{background:'#fffbeb'}}>
                                  <td className="td text-xs" style={{border:'1px solid #fde68a',color:'#92400e',whiteSpace:'nowrap',padding:'10px 12px'}}>
                                    {carryOver !== null ? `Avant ${periodLabel}` : (selected.opening_date ? fmtDate(selected.opening_date) : '—')}
                                  </td>
                                  <td className="td text-center text-gray-300" style={{border:'1px solid #fde68a',padding:'10px 12px'}}>—</td>
                                  <td className="td text-xs text-amber-700 font-semibold" style={{border:'1px solid #fde68a',padding:'10px 12px'}}>
                                    {carryOver !== null ? 'Report' : 'Solde initial'}
                                  </td>
                                  <td className="td text-center text-gray-300" style={{border:'1px solid #fde68a',padding:'10px 12px'}}>—</td>
                                  {[0,1,2].map(k => <td key={k} className="td text-center text-gray-200" style={{border:'1px solid #fde68a',padding:'10px 12px'}}>—</td>)}
                                  <td className="td text-right font-black" style={{border:'1px solid #fde68a',color:'#b45309',fontSize:15,whiteSpace:'nowrap',padding:'10px 14px',letterSpacing:'-0.2px'}}>
                                    {fmt(ledger.startBalance)}
                                  </td>
                                  <td className="td text-xs text-gray-400" style={{border:'1px solid #fde68a',padding:'10px 12px'}}>
                                    {carryOver !== null ? '' : (selected.opening_note || 'Solde de départ')}
                                  </td>
                                  <td style={{border:'1px solid #fde68a',padding:'10px 12px'}}></td>
                                </tr>

                                {displayEntries.length === 0 && (
                                  <tr>
                                    <td colSpan={10} className="td text-center text-gray-400 py-8" style={{border:'1px solid #e2e8f0'}}>
                                      Aucune opération pour cette période
                                    </td>
                                  </tr>
                                )}

                                {displayEntries.map((e, i) => {
                                  const isVente = e.src === 'vente'
                                  const isPos = e.delta >= 0
                                  const absAmt = Math.abs(e.delta)
                                  const amtColor = isPos ? '#1d4ed8' : '#16a34a'
                                  const v = e.raw
                                  const isHighlighted = chronoHighlights.has(eKey(e))
                                  const typeRowBg = (e.type === 'remise' || e.type === 'remise-voyage' || e.type === 'paiement' || e.type === 'frais-deduction') ? '#f0fdf4'
                                    : e.type === 'mdo' ? '#fefce8' : undefined
                                  const rowBg = isHighlighted ? '#fef9c3' : (typeRowBg || (i % 2 === 1 ? '#f9fafb' : undefined))
                                  const noteDisplay = e.note || '—'
                                  return (
                                    <Fragment key={eKey(e)}>
                                      <tr style={{ background: rowBg, cursor: 'pointer', transition: 'background 0.1s' }}
                                        onClick={() => toggleHighlight(eKey(e))}>
                                        {/* DATE */}
                                        <td className="td text-xs" style={{...bdr,color:'#374151',fontWeight:500,whiteSpace:'nowrap',padding:'10px 12px'}}>{fmtDate(e.date)}</td>
                                        {/* CAMION */}
                                        <td className="td text-xs" style={{...bdr,whiteSpace:'nowrap',color:'#64748b',padding:'10px 12px'}}>
                                          {e.detail || <span className="text-gray-400">—</span>}
                                        </td>
                                        {/* OPÉRATION */}
                                        <td className="td text-xs font-semibold" style={{...bdr,whiteSpace:'nowrap',color:'#1e293b',padding:'10px 12px'}}>
                                          {e.operation}
                                        </td>
                                        {/* TYPE BADGE */}
                                        <td className="td" style={{...bdr,whiteSpace:'nowrap',padding:'10px 12px'}}>
                                          {e.type === 'vente' || e.type === 'frais-charge'
                                            ? <span style={{background:'#eff6ff',color:'#1d4ed8',fontWeight:700,fontSize:10,padding:'2px 7px',borderRadius:3,letterSpacing:'0.03em',border:'1px solid #bfdbfe',whiteSpace:'nowrap'}}>{e.label}</span>
                                            : e.type === 'mdo'
                                            ? <span style={{background:'#fef9c3',color:'#92400e',fontWeight:700,fontSize:10,padding:'2px 7px',borderRadius:3,letterSpacing:'0.03em',border:'1px solid #fde68a',whiteSpace:'nowrap'}}>M.O.</span>
                                            : <span style={{background:'#dcfce7',color:'#15803d',fontWeight:700,fontSize:10,padding:'2px 7px',borderRadius:3,letterSpacing:'0.03em',border:'1px solid #bbf7d0',whiteSpace:'nowrap'}}>
                                                {e.type === 'paiement' || e.type === 'frais-deduction' ? e.label : 'Remise'}
                                              </span>}
                                        </td>
                                        {/* QTÉ */}
                                        <td className="td text-right" style={{...bdr,whiteSpace:'nowrap',padding:'10px 12px',fontWeight:600,color:'#374151',fontSize:13}}>
                                          {isVente && e.type !== 'remise-voyage' && e.type !== 'mdo' ? fmt(v.qte) : <span className="text-gray-400">—</span>}
                                        </td>
                                        {/* PRIX */}
                                        <td className="td text-right" style={{...bdr,whiteSpace:'nowrap',padding:'10px 12px',fontWeight:600,color:'#374151',fontSize:12}}>
                                          {isVente && e.type !== 'remise-voyage' && e.type !== 'mdo' ? parseFloat(v.prix_vente||0).toFixed(2) : <span className="text-gray-400">—</span>}
                                        </td>
                                        {/* TOTAL */}
                                        <td className="td text-right" style={{...bdr,fontSize:14,fontWeight:700,whiteSpace:'nowrap',padding:'10px 12px',color:amtColor}}>
                                          {isPos ? `+ ${fmt(absAmt)}` : `− ${fmt(absAmt)}`}
                                        </td>
                                        {/* SOLDE */}
                                        <td className="td text-right" style={{...bdr,fontSize:15,fontWeight:900,whiteSpace:'nowrap',padding:'10px 14px',
                                          color: e.solde > 0 ? '#1e3a5f' : '#16a34a', letterSpacing:'-0.2px'}}>
                                          {e.solde >= 0 ? `+ ${fmt(e.solde)}` : `− ${fmt(Math.abs(e.solde))}`}
                                        </td>
                                        {/* NOTE */}
                                        <td className="td text-xs" style={{...bdr,maxWidth:'150px',wordBreak:'break-word',padding:'10px 12px',
                                          color: e.note ? '#374151' : '#9ca3af', fontStyle: e.note ? 'normal' : 'italic', fontWeight: e.note ? 600 : 400}}>
                                          {noteDisplay}
                                        </td>
                                        {/* ACTIONS — remise edit/delete only */}
                                        <td className="td" style={{...bdr,padding:'6px 8px',whiteSpace:'nowrap'}} onClick={ev => ev.stopPropagation()}>
                                          {e.src === 'remise' && (
                                            <div className="flex items-center gap-1">
                                              <button onClick={() => { setRemiseForm({ date: v.date, montant: String(v.montant), type_remise: v.type_remise||'Commerciale', motif: v.motif||'' }); setRemiseError(''); setRemiseModal(v) }}
                                                className="btn-secondary" style={{fontSize:10,padding:'2px 5px'}}>✎</button>
                                              <button onClick={() => deleteRemise(v)}
                                                className="btn-danger" style={{fontSize:10,padding:'2px 5px'}}>✕</button>
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    </Fragment>
                                  )
                                })}
                              </tbody>
                              {displayEntries.length > 0 && finalEntry && (
                                <tfoot>
                                  <tr>
                                    <td colSpan={7} style={{padding:'11px 12px',background:'#eff6ff',color:'#1d4ed8',fontWeight:700,fontSize:13,borderTop:'2px solid #bfdbfe'}}>
                                      Total — {displayEntries.length} opération{displayEntries.length !== 1 ? 's' : ''}
                                    </td>
                                    <td style={{padding:'11px 14px',background:'#eff6ff',fontSize:15,fontWeight:900,color:'#1e3a5f',textAlign:'right',borderTop:'2px solid #bfdbfe',letterSpacing:'-0.2px'}}>
                                      {fmt(finalEntry.solde)} <span style={{fontSize:12,fontWeight:600,color:'#94a3b8'}}>DHS</span>
                                    </td>
                                    <td colSpan={2} style={{background:'#eff6ff',borderTop:'2px solid #bfdbfe'}}></td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* SOLDE FINAL */}
                  <div className="flex items-center justify-between rounded-2xl"
                    style={{background:'#f0fdf4',border:'2px solid #86efac',padding:'20px 24px',boxShadow:'0 4px 20px rgba(134,239,172,0.25)'}}>
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

      {/* REMISE MODAL */}
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
                    value={remiseForm.montant} onChange={e => setRemiseForm({...remiseForm, montant: e.target.value})}
                    required autoFocus />
                </div>
              </div>
              <div>
                <label className="label">Type de remise</label>
                <select className="input" value={remiseForm.type_remise} onChange={e => setRemiseForm({...remiseForm, type_remise: e.target.value})}>
                  <option>Commerciale</option><option>Fidélité</option><option>Correction</option><option>Autre</option>
                </select>
              </div>
              <div>
                <label className="label">Motif</label>
                <input type="text" className="input" placeholder="ex: Remise fin de mois mai 2026"
                  value={remiseForm.motif} onChange={e => setRemiseForm({...remiseForm, motif: e.target.value})} />
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
                <button type="submit" disabled={remiseSaving} className="btn-primary flex-1 justify-center" style={{background:'#7c3aed'}}>
                  {remiseSaving ? 'Enregistrement...' : '✓ Enregistrer'}
                </button>
                <button type="button" onClick={() => { setRemiseModal(null); setRemiseError('') }} className="btn-secondary">Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CLIENT MODAL */}
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
                  value={editClientForm.nom} onChange={e => setEditClientForm({...editClientForm, nom: e.target.value})} />
              </div>
              <div>
                <label className="label">Dépôt</label>
                <select className="input" value={editClientForm.depot} onChange={e => setEditClientForm({...editClientForm, depot: e.target.value})}>
                  {getAllDepots().map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Téléphone</label>
                <input type="text" className="input" placeholder="06 ..."
                  value={editClientForm.tel} onChange={e => setEditClientForm({...editClientForm, tel: e.target.value})} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={editClientSaving} className="btn-primary flex-1 justify-center">
                  {editClientSaving ? 'Enregistrement...' : '✓ Enregistrer'}
                </button>
                <button type="button" onClick={() => setEditClientModal(null)} className="btn-secondary">Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OPENING BALANCE MODAL */}
      {openingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}}>
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
                  value={openingForm.montant} onChange={e => setOpeningForm({...openingForm, montant: e.target.value})}
                  required autoFocus />
                <p className="text-xs text-gray-400 mt-1">Le total dû avant cette app</p>
              </div>
              <div>
                <label className="label">Date de référence</label>
                <input type="date" className="input" value={openingForm.date}
                  onChange={e => setOpeningForm({...openingForm, date: e.target.value})} />
                <p className="text-xs text-gray-400 mt-1">ex: 30/04/2026 — « Solde au avril 2026 »</p>
              </div>
              <div>
                <label className="label">Note / Origine</label>
                <input type="text" className="input" placeholder="ex: Solde Excel avril 2026"
                  value={openingForm.note} onChange={e => setOpeningForm({...openingForm, note: e.target.value})} />
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
                <button type="submit" disabled={openingSaving} className="btn-primary flex-1 justify-center" style={{background:'#92400e'}}>
                  {openingSaving ? 'Enregistrement...' : '✓ Enregistrer'}
                </button>
                <button type="button" onClick={() => setOpeningModal(null)} className="btn-secondary">Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SAVE PRESENTATION MODAL */}
      {showSavePresModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">💾 Enregistrer la présentation</h2>
                <p className="text-xs text-gray-400 mt-0.5">{presSelectedRows.size} opération{presSelectedRows.size!==1?'s':''} sélectionnée{presSelectedRows.size!==1?'s':''}</p>
              </div>
              <button onClick={() => setShowSavePresModal(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Nom de la présentation</label>
                <input className="input" autoFocus placeholder="ex: Mai 2026, Réunion Client, Chantier Oujda…"
                  value={savePresName}
                  onChange={e => setSavePresName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') savePresentation(savePresName) }} />
              </div>
              <div className="flex flex-wrap gap-2">
                {['Mai 2026','Juin 2026','Paiements en retard','Réunion Client'].map(n => (
                  <button key={n} onClick={() => setSavePresName(n)}
                    style={{padding:'3px 9px',borderRadius:20,border:'1px solid #e2e8f0',background:'#f8fafc',color:'#475569',fontSize:11,cursor:'pointer',fontWeight:600}}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => savePresentation(savePresName)} disabled={!savePresName.trim()}
                  className="btn-primary flex-1 justify-center" style={{background:'#1e3a5f'}}>
                  ✓ Enregistrer
                </button>
                <button onClick={() => setShowSavePresModal(false)} className="btn-secondary">Annuler</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING MULTI-SELECTION TOOLBAR */}
      {selectedClientIds.size > 0 && (
        <div style={{position:'fixed',bottom:0,left:0,right:0,zIndex:200,background:'#1e3a5f',color:'#fff',
          padding:'12px 24px',display:'flex',alignItems:'center',flexWrap:'wrap',gap:10,
          boxShadow:'0 -4px 24px rgba(30,58,95,0.45)'}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontWeight:700,fontSize:14,lineHeight:1.3}}>
              {selectedClientIds.size} client{selectedClientIds.size > 1 ? 's' : ''} sélectionné{selectedClientIds.size > 1 ? 's' : ''}
            </div>
            <div style={{fontSize:12,opacity:0.85,marginTop:3}}>
              Total créances : <strong>{fmt(selectedCreancesTotal)} DHS</strong>
              {reportPeriodActive && reportTo && <span style={{opacity:0.7,marginLeft:6}}>· au {fmtDate(reportTo)}</span>}
            </div>
          </div>
          <button onClick={printSelectedClients}
            style={{padding:'6px 14px',borderRadius:6,border:'none',background:'#fff',color:'#1e3a5f',
              fontWeight:700,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
            🖨️ Imprimer
          </button>
          <button onClick={printSelectedClients}
            style={{padding:'6px 14px',borderRadius:6,border:'none',background:'#c7d2fe',color:'#1e40af',
              fontWeight:700,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
            📄 Export PDF
          </button>
          <button onClick={() => { setSelectedClientIds(new Set()); setLastClickedClientIdx(null) }}
            style={{padding:'6px 14px',borderRadius:6,border:'1px solid rgba(255,255,255,0.3)',background:'transparent',
              color:'#fca5a5',fontWeight:700,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
            ✕ Annuler
          </button>
        </div>
      )}

      {/* PRESENTATION LIBRARY MODAL */}
      {showPresLibrary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">📁 Mes présentations</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selected?.nom}</p>
              </div>
              <button onClick={() => setShowPresLibrary(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <div className="p-5">
              {presentations.length === 0 ? (
                <div className="text-center text-gray-400 py-8 italic">Aucune présentation sauvegardée</div>
              ) : (
                <div className="space-y-2">
                  {presentations.map(p => (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 text-sm">{p.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {p.selectedKeys?.length ?? 0} opération{(p.selectedKeys?.length ?? 0)!==1?'s':''} sélectionnée{(p.selectedKeys?.length ?? 0)!==1?'s':''}
                          {p.savedAt ? ` · ${new Date(p.savedAt).toLocaleDateString('fr-MA')}` : ''}
                        </div>
                      </div>
                      <button onClick={() => loadPresentation(p)}
                        style={{padding:'4px 12px',borderRadius:6,border:'none',background:'#1e3a5f',color:'#fff',fontWeight:700,fontSize:11,cursor:'pointer'}}>
                        Ouvrir
                      </button>
                      <button onClick={() => { if(confirm(`Supprimer "${p.name}" ?`)) deletePresentation(p.id) }}
                        style={{padding:'4px 8px',borderRadius:6,border:'1px solid #fecaca',background:'#fef2f2',color:'#dc2626',fontWeight:700,fontSize:11,cursor:'pointer'}}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <button onClick={() => setShowPresLibrary(false)} className="btn-secondary w-full">Fermer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
