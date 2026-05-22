import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const ADMIN = 'abdelhafidbaadi@gmail.com'
const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtDate = d => { if (!d) return '—'; const [y,m,j] = d.split('-'); return `${j}/${m}/${y}` }
const fmtD = n => parseFloat(n || 0).toFixed(2)
const today = () => new Date().toISOString().split('T')[0]
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

const PRINT_CSS = `
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      body { font-family: Arial, sans-serif; padding: 28px; font-size: 12px; color: #1e293b !important; background: #fff !important; margin: 0; }
      h1 { font-size: 18px; margin: 0 0 4px; color: #1e293b !important; }
      h2 { font-size: 15px; color: #1e293b !important; }
      .sub, .subtitle { color: #555 !important; font-size: 11px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { background: #1a5fa8 !important; color: #fff !important; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #1e293b !important; }
      tr:nth-child(even) td { background: #f8fafc !important; }
      tfoot td { background: #f1f5f9 !important; font-weight: 800 !important; color: #1e293b !important; border-top: 2px solid #1a5fa8 !important; font-size: 12px; }
      b, strong { color: #1e293b !important; font-weight: 800; }
      .right, [style*="text-align:right"], [style*="text-align: right"] { text-align: right; }
      .header-block { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #1a5fa8; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; background: #e2e8f0 !important; color: #1e293b !important; border: 1px solid #cbd5e1; }
      .fourn-block { margin-bottom: 24px; page-break-inside: avoid; }
      .fourn-header { background: #1a5fa8 !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .fourn-title { font-size: 13px; font-weight: 800; color: #fff !important; }
      .prod-block { margin-bottom: 12px; }
      .prod-header { background: #f1f5f9 !important; border-left: 4px solid #1a5fa8; padding: 5px 10px; font-weight: 700; font-size: 11px; color: #1e293b !important; margin-bottom: 4px; border-radius: 0 4px 4px 0; }
      .grand-tfoot td { background: #e2e8f0 !important; font-weight: 900 !important; color: #1e293b !important; border-top: 3px solid #1a5fa8 !important; font-size: 13px; }
      .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #888 !important; font-size: 10px; text-align: center; }
      .camion-header { background: #1a5fa8 !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
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

export default function Gasoil() {
  const { user } = useAuth()
  const admin = user?.email === ADMIN
  const [editRow, setEditRow] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg, setEditMsg] = useState('')
  const [camions, setCamions] = useState([])
  const [gasoil, setGasoil] = useState([])
  const [gasoilPaiements, setGasoilPaiements] = useState([])
  const [paiForm, setPaiForm] = useState({ date: '', montant: '', note: '' })
  const [savingPai, setSavingPai] = useState(false)
  const [showPaiForm, setShowPaiForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCamion, setFilterCamion] = useState('')
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo, setFilterTo] = useState(today())
  const [form, setForm] = useState({
    date: today(), camion_id: '', station: 'HMIDA ZAIO — Station Petrom',
    qte: '', prix_unitaire: '12.40', bon: '', km: '', note: ''
  })

  const qte = parseFloat(form.qte) || 0
  const pu = parseFloat(form.prix_unitaire) || 0
  const total = Math.round(qte * pu * 100) / 100

  // ── CONSUMPTION MONTH FILTER ──
  const currentMonth = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  }
  const [consoMonth, setConsoMonth] = useState(currentMonth())

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ca }, { data: ga }, { data: gp }] = await Promise.all([
      supabase.from('camions').select('*').order('plaque'),
      // ✅ date ASC — oldest to newest
      supabase.from('gasoil').select('*').order('date', { ascending: true }),
      supabase.from('gasoil_paiements').select('*').order('date', { ascending: true }),
    ])
    setCamions(ca || [])
    setGasoil(ga || [])
    setGasoilPaiements(gp || [])
    setLoading(false)
  }

  async function saveGasoil(e) {
    e.preventDefault()
    if (!form.camion_id || !qte || !pu) return
    setSaving(true)
    const camion = camions.find(c => c.id === parseInt(form.camion_id))
    await supabase.from('gasoil').insert({
      date: form.date,
      camion_id: parseInt(form.camion_id),
      camion_plaque: camion?.plaque || '',
      chauffeur: camion?.chauffeur || '',
      station: form.station,
      qte, prix_unitaire: pu, total,
      bon: form.bon,
      km: parseFloat(form.km) || null,
      note: form.note,
    })
    if (camion) {
      await supabase.from('camions').update({
        gasoil_dhs: (camion.gasoil_dhs || 0) + total,
        pleins: (camion.pleins || 0) + 1,
        litres: (camion.litres || 0) + qte,
      }).eq('id', camion.id)
    }
    setSaving(false)
    setForm({ date: today(), camion_id: '', station: 'HMIDA ZAIO — Station Petrom', qte: '', prix_unitaire: '12.40', bon: '', km: '', note: '' })
    loadAll()
  }

  async function savePaiement(e) {
    e.preventDefault()
    const m = parseFloat(paiForm.montant)
    if (!m || !paiForm.date) return
    setSavingPai(true)
    await supabase.from('gasoil_paiements').insert({
      date: paiForm.date,
      montant: m,
      note: paiForm.note || null,
    })
    setSavingPai(false)
    setPaiForm({ date: '', montant: '', note: '' })
    setShowPaiForm(false)
    loadAll()
  }

  async function deletePaiement(id) {
    if (!confirm('Supprimer ce paiement ?')) return
    await supabase.from('gasoil_paiements').delete().eq('id', id)
    loadAll()
  }

  function openEditGasoil(g) {
    setEditRow(g)
    setEditForm({
      date: g.date || '',
      qte: g.qte || '',
      prix_unitaire: g.prix_unitaire || '',
      km: g.km || '',
      bon: g.bon || '',
      station: g.station || '',
      note: g.note || '',
    })
    setEditMsg('')
  }

  async function saveEditGasoil(e) {
    e.preventDefault()
    if (!editRow) return
    setEditSaving(true)
    const qte = parseFloat(editForm.qte) || 0
    const pu  = parseFloat(editForm.prix_unitaire) || 0
    const total = Math.round(qte * pu * 100) / 100

    const { error } = await supabase.from('gasoil').update({
      date: editForm.date,
      qte, prix_unitaire: pu, total,
      km: parseFloat(editForm.km) || null,
      bon: editForm.bon || null,
      station: editForm.station || null,
      note: editForm.note || null,
    }).eq('id', editRow.id)

    // Adjust camion totals
    if (!error) {
      const camion = camions.find(c => c.id === editRow.camion_id)
      if (camion) {
        const diff = total - (editRow.total || 0)
        const diffL = qte - (editRow.qte || 0)
        if (diff !== 0 || diffL !== 0) {
          await supabase.from('camions').update({
            gasoil_dhs: (camion.gasoil_dhs || 0) + diff,
            litres: (camion.litres || 0) + diffL,
          }).eq('id', camion.id)
        }
      }
    }

    setEditSaving(false)
    if (error) {
      setEditMsg('❌ ' + error.message)
    } else {
      setEditMsg('✅ Enregistré !')
      setTimeout(() => { setEditRow(null); setEditMsg('') }, 1000)
      loadAll()
    }
  }

  async function deleteGasoil(id, camionId, total, qte) {
    if (!confirm('Supprimer ce plein ?')) return
    const camion = camions.find(c => c.id === camionId)
    await supabase.from('gasoil').delete().eq('id', id)
    if (camion) {
      await supabase.from('camions').update({
        gasoil_dhs: Math.max(0, (camion.gasoil_dhs || 0) - total),
        pleins: Math.max(0, (camion.pleins || 0) - 1),
        litres: Math.max(0, (camion.litres || 0) - qte),
      }).eq('id', camion.id)
    }
    loadAll()
  }

  // ✅ filter + force ASC
  const filtered = gasoil
    .filter(g => {
      if (filterCamion && g.camion_id !== parseInt(filterCamion)) return false
      if (filterFrom && g.date < filterFrom) return false
      if (filterTo && g.date > filterTo) return false
      if (search && !(g.camion_plaque + g.station + (g.chauffeur || '')).toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  const totLitres = filtered.reduce((s, g) => s + (g.qte || 0), 0)
  const totDHS = filtered.reduce((s, g) => s + (g.total || 0), 0)

  // Payment totals
  const totalGasoilAll = gasoil.reduce((s, g) => s + (g.total || 0), 0)
  const totalPaiements = gasoilPaiements.reduce((s, p) => s + (p.montant || 0), 0)
  const soldeGasoil = totalGasoilAll - totalPaiements

  // ── MONTHLY CONSUMPTION PER CAMION ──
  // For each camion in selected month:
  // distance = last km - first km
  // fuel = sum of liters
  // conso = (fuel / distance) * 100
  const consoStats = (() => {
    const monthGasoil = gasoil
      .filter(g => g.date && g.date.startsWith(consoMonth) && g.km)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.id - b.id))

    const byCam = {}
    monthGasoil.forEach(g => {
      if (!byCam[g.camion_plaque]) byCam[g.camion_plaque] = { entries: [], liters: 0 }
      byCam[g.camion_plaque].entries.push(g)
    })

    // Also sum ALL liters for that month (including entries without km)
    gasoil
      .filter(g => g.date && g.date.startsWith(consoMonth))
      .forEach(g => {
        if (!byCam[g.camion_plaque]) byCam[g.camion_plaque] = { entries: [], liters: 0 }
        byCam[g.camion_plaque].liters += (g.qte || 0)
      })

    return Object.entries(byCam)
      .map(([plaque, d]) => {
        const sorted = d.entries.sort((a, b) => a.date.localeCompare(b.date))
        const firstKm = sorted.length > 0 ? parseFloat(sorted[0].km) : null
        const lastKm  = sorted.length > 1 ? parseFloat(sorted[sorted.length - 1].km) : null
        const distance = firstKm && lastKm && lastKm > firstKm ? lastKm - firstKm : null
        const liters = d.liters
        const conso = distance && liters > 0 ? ((liters / distance) * 100) : null
        return { plaque, firstKm, lastKm, distance, liters, conso, count: sorted.length }
      })
      .filter(d => d.liters > 0)
      .sort((a, b) => a.plaque.localeCompare(b.plaque))
  })()

  // Stats by camion (from ALL gasoil)
  const byCamion = {}
  gasoil.forEach(g => {
    if (!byCamion[g.camion_plaque]) byCamion[g.camion_plaque] = { litres: 0, total: 0, pleins: 0 }
    byCamion[g.camion_plaque].litres += g.qte || 0
    byCamion[g.camion_plaque].total += g.total || 0
    byCamion[g.camion_plaque].pleins += 1
  })

  function printGasoil() {
    const _now = new Date()
    const printDate = _now.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' à ' + String(_now.getHours()).padStart(2,'0') + ':' + String(_now.getMinutes()).padStart(2,'0')
    const solde = totalGasoilAll - totalPaiements

    const gasoilRows = filtered.map(g =>
      `<tr>
        <td>${g.date}</td>
        <td><b>${g.camion_plaque}</b></td>
        <td>${g.chauffeur||'—'}</td>
        <td>${g.station}</td>
        <td class="r">${fmtD(g.qte)} L</td>
        <td class="r">${fmtD(g.prix_unitaire)}</td>
        <td class="r bold">${fmt(g.total)}</td>
        <td class="r muted">${g.km ? fmt(g.km) : '—'}</td>
        <td class="muted">${g.bon||'—'}</td>
      </tr>`
    ).join('')

    const paiRows = [...gasoilPaiements]
      .sort((a,b) => a.date.localeCompare(b.date))
      .map(p => `<tr>
        <td>${fmtDate(p.date)}</td>
        <td class="r green bold">− ${fmt(p.montant)} DHS</td>
        <td class="muted">${p.note||'—'}</td>
      </tr>`).join('')

    const camionRows = Object.entries(byCamion).sort((a,b)=>b[1].total-a[1].total).map(([plaque, d]) =>
      `<tr>
        <td><b>${plaque}</b></td>
        <td class="r">${fmt(d.litres)} L</td>
        <td class="r bold">${fmt(d.total)} DHS</td>
        <td class="r muted">${d.pleins}</td>
      </tr>`
    ).join('')

    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8">
<title>Gasoil — DAR SADIK</title>
<style>
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; padding: 30px 36px; font-size: 12px; color: #1e293b; background: #fff; }

  .logo-bar { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; margin-bottom: 4px; }
  .logo-name { font-size: 26px; font-weight: 900; color: #1a3a6b; letter-spacing: -0.5px; line-height: 1.1; }
  .logo-name-ar { font-size: 15px; font-weight: 700; color: #1a5fa8; direction: rtl; }
  .logo-tagline { font-size: 11px; color: #475569; margin-top: 2px; direction: rtl; }
  .logo-sep { height: 3px; background: linear-gradient(90deg,#1a5fa8,#3b82f6); border-radius: 2px; margin-bottom: 20px; }
  .print-date { font-size: 10px; color: #94a3b8; margin-top: 6px; }
  .btn-print { padding: 7px 14px; background: #475569; color: #fff; border: none; border-radius: 5px; font-size: 12px; font-weight: 700; cursor: pointer; margin-right: 6px; }
  .btn-pdf   { padding: 7px 14px; background: #16a34a; color: #fff; border: none; border-radius: 5px; font-size: 12px; font-weight: 700; cursor: pointer; }

  .periode { display: inline-flex; align-items: center; gap: 5px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 3px 10px; font-size: 10px; font-weight: 700; color: #475569; margin-bottom: 16px; }

  /* SUMMARY 3 BOXES — like client page */
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 22px; }
  .sum-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; }
  .sum-lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 5px; }
  .sum-val { font-size: 20px; font-weight: 900; line-height: 1; }
  .c-total  { color: #d97706; }
  .c-paye   { color: #16a34a; }
  .c-solde  { color: #7c3aed; }
  .c-solde-ok { color: #16a34a; }

  .section-title { font-size: 12px; font-weight: 700; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin: 20px 0 0; }

  table { width: 100%; border-collapse: collapse; }
  th { background: #475569 !important; color: #ffffff !important; padding: 8px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; text-align: left; border: 1px solid #334155; }
  th.r { text-align: right; }
  td { padding: 8px 10px; font-size: 11px; color: #1e293b; border: 1px solid #e2e8f0; vertical-align: middle; }
  td.r { text-align: right; font-family: monospace; }
  td.muted { color: #94a3b8; font-size: 10px; }
  td.bold { font-weight: 700; }
  td.green { color: #16a34a; font-weight: 700; }
  tr:nth-child(even) td { background: #f8fafc !important; }

  tfoot td { background: #f1f5f9 !important; font-weight: 800; font-size: 12px; border: 1px solid #cbd5e1; border-top: 2px solid #475569 !important; color: #1e293b !important; }
  tfoot td.r { font-size: 13px; }

  /* SOLDE RESULT ROW */
  .solde-row td { background: #f5f3ff !important; color: #7c3aed !important; font-weight: 900; font-size: 13px; border: 2px solid #7c3aed !important; }
  .solde-row-ok td { background: #f0fdf4 !important; color: #16a34a !important; font-weight: 900; font-size: 13px; border: 2px solid #16a34a !important; }

  .empty-row td { text-align: center; color: #94a3b8; padding: 16px; font-style: italic; }
  .doc-footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }

  @media print {
    .btn-print, .btn-pdf { display: none !important; }
    body { padding: 12px 18px; }
  }
  @page { size: A4; margin: 10mm 12mm; }
</style>
</head><body>

<!-- HEADER -->
<div class="logo-bar">
  <div>
    <div class="logo-name">DAR SADIK</div>
    <div class="logo-name-ar">دار صديق</div>
    <div class="logo-tagline">بائع جميع مواد البناء</div>
  </div>
  <div style="text-align:right;padding-top:4px">
    <div style="font-size:11px;color:#334155;margin-bottom:4px;font-weight:600">📞 Mohamed: 06 61 32 56 65 &nbsp;·&nbsp; Sadik: 06 61 97 87 47 &nbsp;·&nbsp; Bureau: 06 62 82 88 20</div>
    <div style="font-size:11px;color:#334155;margin-bottom:4px">✉️ Dar.sadik@hotmail.com</div>
    <div style="font-size:11px;color:#64748b;margin-bottom:8px">📍 Selouane - Nador</div>
    <div>
      <button class="btn-print" onclick="window.print()">🖨️ Imprimer</button>
      <button class="btn-pdf" onclick="window.print()">📥 PDF</button>
    </div>
    <div class="print-date">Généré le ${printDate}</div>
  </div>
</div>
<div class="logo-sep"></div>

<div class="periode">📅 Période : ${filterFrom} → ${filterTo}</div>

<!-- SUMMARY: TOTAL GASOIL / TOTAL PAYÉ / SOLDE -->
<div class="summary">
  <div class="sum-box">
    <div class="sum-lbl">TOTAL GASOIL</div>
    <div class="sum-val c-total">${fmt(totalGasoilAll)} DHS</div>
  </div>
  <div class="sum-box">
    <div class="sum-lbl">TOTAL PAYÉ</div>
    <div class="sum-val c-paye">${fmt(totalPaiements)} DHS</div>
  </div>
  <div class="sum-box">
    <div class="sum-lbl">SOLDE RESTANT</div>
    <div class="sum-val ${solde > 0 ? 'c-solde' : 'c-solde-ok'}">${fmt(solde)} DHS</div>
  </div>
</div>

<!-- GASOIL TABLE -->
<div class="section-title">📋 Historique des pleins (${filtered.length})</div>
<table>
  <thead>
    <tr>
      <th>DATE</th><th>CAMION</th><th>CHAUFFEUR</th><th>STATION</th>
      <th class="r">LITRES</th><th class="r">PRIX/L</th>
      <th class="r">TOTAL DHS</th><th class="r">KM</th><th>BON</th>
    </tr>
  </thead>
  <tbody>
    ${gasoilRows || '<tr class="empty-row"><td colspan="9">Aucune entrée pour cette période</td></tr>'}
  </tbody>
  ${filtered.length > 0 ? `
  <tfoot>
    <tr>
      <td colspan="4"><b>TOTAL (${filtered.length} pleins)</b></td>
      <td class="r"><b>${fmtD(totLitres)} L</b></td>
      <td></td>
      <td class="r"><b>${fmt(totDHS)} DHS</b></td>
      <td colspan="2"></td>
    </tr>
  </tfoot>` : ''}
</table>

<!-- PAYMENTS TABLE -->
<div class="section-title" style="margin-top:22px">💳 Paiements fournisseur (${gasoilPaiements.length})</div>
<table>
  <thead>
    <tr>
      <th>DATE</th>
      <th class="r">MONTANT DHS</th>
      <th>NOTE</th>
    </tr>
  </thead>
  <tbody>
    ${paiRows || '<tr class="empty-row"><td colspan="3">Aucun paiement enregistré</td></tr>'}
  </tbody>
  ${gasoilPaiements.length > 0 ? `
  <tfoot>
    <tr>
      <td><b>TOTAL PAYÉ</b></td>
      <td class="r"><b>− ${fmt(totalPaiements)} DHS</b></td>
      <td></td>
    </tr>
  </tfoot>` : ''}
</table>

<!-- SOLDE RESULT — the key row like client page -->
<table style="margin-top:10px">
  <tbody>
    <tr class="${solde > 0 ? 'solde-row' : 'solde-row-ok'}">
      <td><b>${solde > 0 ? '⚠️ SOLDE RESTANT À PAYER' : '✅ COMPTE SOLDÉ'}</b></td>
      <td class="r"><b>${fmt(solde)} DHS</b></td>
    </tr>
  </tbody>
</table>

<!-- CAMION RECAP -->
<div class="section-title" style="margin-top:22px">🚛 Récapitulatif par camion</div>
<table>
  <thead>
    <tr>
      <th>CAMION</th>
      <th class="r">LITRES</th>
      <th class="r">TOTAL DHS</th>
      <th class="r">NB PLEINS</th>
    </tr>
  </thead>
  <tbody>
    ${camionRows || '<tr class="empty-row"><td colspan="4">Aucune donnée</td></tr>'}
  </tbody>
</table>

<div class="doc-footer"><span>DAR SADIK — دار صديق — Selouane, Nador</span><span>Généré le ${printDate}</span></div>
</body></html>`)
    win.document.close()
  }

  function exportCSV() {
    let csv = `Date,Camion,Chauffeur,Station,Litres,Prix/L,Total DHS,KM,BON\n`
    filtered.forEach(g => { csv += `${g.date},${g.camion_plaque},${g.chauffeur||''},${g.station},${g.qte||0},${g.prix_unitaire||0},${g.total||0},${g.km||''},${g.bon||''}\n` })
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `Gasoil-${filterFrom}-${filterTo}.csv`; a.click()
  }

  return (
    <Layout title="Gasoil" subtitle="Suivi de consommation et coûts carburant">

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <div className="stat-card border border-amber-100 bg-amber-50">
          <div className="stat-label text-amber-600">Total gasoil</div>
          <div className="stat-value text-amber-700">{fmt(totalGasoilAll)} DHS</div>
          <div className="stat-sub">Toutes périodes</div>
        </div>
        <div className="stat-card border border-blue-100 bg-blue-50">
          <div className="stat-label text-blue-600">Total litres</div>
          <div className="stat-value text-blue-700">{fmt(gasoil.reduce((s,g)=>s+(g.qte||0),0))} L</div>
          <div className="stat-sub">Consommés</div>
        </div>
        <div className="stat-card border border-gray-100">
          <div className="stat-label">Nb. pleins</div>
          <div className="stat-value text-gray-700">{gasoil.length}</div>
          <div className="stat-sub">Enregistrés</div>
        </div>
        <div className="stat-card border border-green-100 bg-green-50">
          <div className="stat-label text-green-600">Prix moyen/L</div>
          <div className="stat-value text-green-700">
            {gasoil.length > 0 ? fmtD(gasoil.reduce((s,g)=>s+(g.total||0),0) / gasoil.reduce((s,g)=>s+(g.qte||0),0)) : '0.00'} DHS
          </div>
          <div className="stat-sub">Moyenne</div>
        </div>
        <div className="stat-card border border-green-100 bg-green-50">
          <div className="stat-label text-green-600">Total payé</div>
          <div className="stat-value text-green-700">{fmt(totalPaiements)} DHS</div>
          <div className="stat-sub">Paiements fournisseur</div>
        </div>
        <div className={`stat-card border ${soldeGasoil > 0 ? 'border-purple-100 bg-purple-50' : 'border-green-100 bg-green-50'}`}>
          <div className={`stat-label ${soldeGasoil > 0 ? 'text-purple-600' : 'text-green-600'}`}>Solde restant</div>
          <div className={`stat-value ${soldeGasoil > 0 ? 'text-purple-700' : 'text-green-700'}`}>{fmt(soldeGasoil)} DHS</div>
          <div className="stat-sub">{soldeGasoil > 0 ? 'À payer' : '✓ Soldé'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* FORM */}
        <div className="lg:col-span-1">
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">⛽ Nouveau plein</h2>
            <form onSubmit={saveGasoil} className="space-y-3">
              <div>
                <label className="label">Date</label>
                <input className="input" type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} required />
              </div>
              <div>
                <label className="label">Camion</label>
                <select className="input" value={form.camion_id} onChange={e => setForm({...form, camion_id: e.target.value})} required>
                  <option value="">Sélectionner...</option>
                  {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}{c.chauffeur ? ` — ${c.chauffeur}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Station</label>
                <select className="input" value={form.station} onChange={e => setForm({...form, station: e.target.value})}>
                  <option>HMIDA ZAIO — Station Petrom</option>
                  <option>Autre station</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Litres</label>
                  <input className="input" type="number" placeholder="300" value={form.qte} onChange={e => setForm({...form, qte: e.target.value})} required />
                </div>
                <div>
                  <label className="label">Prix/L (DHS)</label>
                  <input className="input" type="number" step="0.01" value={form.prix_unitaire} onChange={e => setForm({...form, prix_unitaire: e.target.value})} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">BON N°</label>
                  <input className="input" placeholder="ex: 14650" value={form.bon} onChange={e => setForm({...form, bon: e.target.value})} />
                </div>
                <div>
                  <label className="label">KM compteur</label>
                  <input className="input" type="number" placeholder="ex: 85000" value={form.km} onChange={e => setForm({...form, km: e.target.value})} />
                </div>
              </div>
              {qte > 0 && pu > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                  <div className="text-xs text-amber-600 mb-1">Total à payer</div>
                  <div className="text-2xl font-bold text-amber-700">{fmtD(total)} DHS</div>
                  <div className="text-xs text-amber-500">{fmtD(qte)} L × {fmtD(pu)} DHS/L</div>
                </div>
              )}
              <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
                {saving ? 'Enregistrement...' : '✓ Enregistrer le plein'}
              </button>
            </form>
          </div>

          {/* BY CAMION STATS */}
          <div className="card mt-4">
            <h3 className="font-semibold text-gray-900 mb-3">🚛 Total par camion</h3>
            <div className="space-y-3">
              {Object.entries(byCamion).sort((a,b) => b[1].total - a[1].total).map(([plaque, d]) => (
                <div key={plaque} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{plaque}</div>
                    <div className="text-xs text-gray-400">{d.pleins} pleins · {fmt(d.litres)} L</div>
                  </div>
                  <div className="text-sm font-bold text-amber-600">{fmt(d.total)} DHS</div>
                </div>
              ))}
              {Object.keys(byCamion).length === 0 && <div className="text-center text-gray-400 text-sm py-4">Aucune donnée</div>}
            </div>
          </div>

          {/* ── MONTHLY CONSUMPTION L/100km ── */}
          <div className="card mt-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-semibold text-gray-900">📊 Conso. L/100km</h3>
              <input
                type="month"
                className="input text-xs"
                style={{width:'140px'}}
                value={consoMonth}
                onChange={e => setConsoMonth(e.target.value)}
              />
            </div>

            {consoStats.length === 0 ? (
              <div className="text-center text-gray-400 text-xs py-4">
                Aucune donnée KM pour {consoMonth}
              </div>
            ) : (
              <div className="space-y-3">
                {consoStats.map(d => (
                  <div key={d.plaque} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-gray-900 text-sm">{d.plaque}</span>
                      {d.conso !== null ? (
                        <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${
                          d.conso > 40 ? 'bg-red-50 text-red-600' :
                          d.conso > 30 ? 'bg-amber-50 text-amber-600' :
                          'bg-green-50 text-green-600'
                        }`}>
                          {d.conso.toFixed(1)} L/100km
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-lg">KM insuffisant</span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-center">
                      <div className="bg-gray-50 rounded-lg p-1.5">
                        <div className="text-xs text-gray-400">Distance</div>
                        <div className="text-xs font-bold text-gray-700">
                          {d.distance !== null ? `${fmt(d.distance)} km` : '—'}
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-1.5">
                        <div className="text-xs text-blue-400">Litres</div>
                        <div className="text-xs font-bold text-blue-700">{d.liters.toFixed(0)} L</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-1.5">
                        <div className="text-xs text-gray-400">KM</div>
                        <div className="text-xs font-bold text-gray-600">
                          {d.firstKm ? `${fmt(d.firstKm)}→${fmt(d.lastKm)}` : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400">
              Distance = dernier KM − premier KM du mois
            </div>
          </div>

          {/* ── GASOIL PAYMENTS ── */}
          <div className="card mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">💳 Paiements fournisseur</h3>
              <button
                onClick={() => setShowPaiForm(!showPaiForm)}
                className="btn-primary text-xs px-3 py-1.5"
              >
                {showPaiForm ? '✕ Annuler' : '+ Paiement'}
              </button>
            </div>

            {/* Solde Summary */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="text-center bg-amber-50 rounded-lg p-2">
                <div className="text-xs text-amber-600 font-semibold">Total gasoil</div>
                <div className="text-sm font-bold text-amber-700">{fmt(totalGasoilAll)}</div>
              </div>
              <div className="text-center bg-green-50 rounded-lg p-2">
                <div className="text-xs text-green-600 font-semibold">Payé</div>
                <div className="text-sm font-bold text-green-700">{fmt(totalPaiements)}</div>
              </div>
              <div className={`text-center rounded-lg p-2 ${soldeGasoil > 0 ? 'bg-purple-50' : 'bg-green-50'}`}>
                <div className={`text-xs font-semibold ${soldeGasoil > 0 ? 'text-purple-600' : 'text-green-600'}`}>Restant</div>
                <div className={`text-sm font-bold ${soldeGasoil > 0 ? 'text-purple-700' : 'text-green-700'}`}>{fmt(soldeGasoil)}</div>
              </div>
            </div>

            {/* Add Payment Form */}
            {showPaiForm && (
              <form onSubmit={savePaiement} className="bg-purple-50 border border-purple-100 rounded-xl p-3 mb-4 space-y-2">
                <div>
                  <label className="label">Date</label>
                  <input type="date" className="input" required
                    value={paiForm.date}
                    onChange={e => setPaiForm({...paiForm, date: e.target.value})} />
                </div>
                <div>
                  <label className="label">Montant (DHS)</label>
                  <input type="number" step="0.01" className="input" placeholder="ex: 15000" required
                    value={paiForm.montant}
                    onChange={e => setPaiForm({...paiForm, montant: e.target.value})} />
                </div>
                <div>
                  <label className="label">Note (optionnel)</label>
                  <input type="text" className="input" placeholder="ex: chèque n° 123"
                    value={paiForm.note}
                    onChange={e => setPaiForm({...paiForm, note: e.target.value})} />
                </div>
                <button type="submit" disabled={savingPai} className="btn-primary w-full justify-center text-xs">
                  {savingPai ? 'Enregistrement...' : '✓ Enregistrer paiement'}
                </button>
              </form>
            )}

            {/* Payments List */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {gasoilPaiements.length === 0 ? (
                <div className="text-center text-gray-400 text-xs py-4">Aucun paiement enregistré</div>
              ) : (
                [...gasoilPaiements].sort((a,b) => b.date.localeCompare(a.date)).map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="text-xs font-semibold text-gray-700">{fmt(p.montant)} DHS</div>
                      <div className="text-xs text-gray-400">{fmtDate(p.date)}{p.note ? ` · ${p.note}` : ''}</div>
                    </div>
                    <button onClick={() => deletePaiement(p.id)} className="btn-danger text-xs px-2 py-1">✕</button>
                  </div>
                ))
              )}
            </div>

            {gasoilPaiements.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-xs">
                <span className="text-gray-500">{gasoilPaiements.length} paiements</span>
                <span className="font-bold text-green-600">{fmt(totalPaiements)} DHS payés</span>
              </div>
            )}
          </div>
        </div>

        {/* HISTORY */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="font-semibold text-gray-900">
                Historique gasoil
                <span className="ml-2 text-xs font-normal text-gray-400">({filtered.length} entrées)</span>
              </h2>
              <div className="flex gap-2 flex-wrap">
                <button onClick={printGasoil} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ Imprimer / PDF</button>
                <button onClick={exportCSV} className="btn-primary text-xs px-3 py-1.5" style={{background:'#16a34a'}}>📥 CSV</button>
              </div>
            </div>

            {/* FILTERS */}
            <div className="flex flex-wrap gap-3 mb-4 items-end">
              <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} /></div>
              <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)} /></div>
              <div><label className="label">Camion</label>
                <select className="input" value={filterCamion} onChange={e=>setFilterCamion(e.target.value)} style={{minWidth:'150px'}}>
                  <option value="">Tous</option>
                  {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}</option>)}
                </select>
              </div>
              <div><input className="input" placeholder="Rechercher..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:'130px'}} /></div>
              <button onClick={()=>{setFilterCamion('');setFilterFrom(startOfMonth());setFilterTo(today());setSearch('')}} className="btn-secondary text-xs">↺</button>
            </div>

            {loading ? (
              <div className="text-center text-gray-400 py-10">Chargement...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Camion</th>
                      <th className="th">Chauffeur</th>
                      <th className="th">Station</th>
                      <th className="th text-right">Litres</th>
                      <th className="th text-right">Prix/L</th>
                      <th className="th text-right">Total DHS</th>
                      <th className="th text-right">KM</th>
                      <th className="th">BON</th>
                      <th className="th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(g => (
                      <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                        <td className="td text-gray-500">{g.date}</td>
                        <td className="td font-semibold text-gray-900">{g.camion_plaque}</td>
                        <td className="td text-gray-500">{g.chauffeur || '—'}</td>
                        <td className="td text-xs text-gray-500">{g.station}</td>
                        <td className="td text-right font-medium">{fmtD(g.qte)}</td>
                        <td className="td text-right text-gray-500">{fmtD(g.prix_unitaire)}</td>
                        <td className="td text-right font-bold text-amber-600">{fmtD(g.total)}</td>
                        <td className="td text-right text-gray-400 text-xs">{g.km ? fmt(g.km) : '—'}</td>
                        <td className="td text-gray-400 text-xs">{g.bon || '—'}</td>
                        <td className="td">
                          <div className="flex gap-1">
                          {admin && <button onClick={() => openEditGasoil(g)} className="btn-secondary text-xs px-2" style={{color:'#1a5fa8',borderColor:'#1a5fa8'}}>✏️</button>}
                          <button className="btn-danger" onClick={() => deleteGasoil(g.id, g.camion_id, g.total, g.qte)}>✕</button>
                        </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={10} className="td text-center text-gray-400 py-10">Aucune entrée trouvée</td></tr>
                    )}
                  </tbody>
                  {filtered.length > 0 && (
                    <tfoot>
                      <tr>
                        <td className="tfoot-td" colSpan={4}>TOTAL</td>
                        <td className="tfoot-td text-right">{fmtD(totLitres)} L</td>
                        <td className="tfoot-td"></td>
                        <td className="tfoot-td text-right text-amber-700">{fmt(totDHS)} DHS</td>
                        <td className="tfoot-td" colSpan={3}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── GASOIL EDIT MODAL ── */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{background:'rgba(0,0,0,0.5)'}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">✏️ Modifier le plein</h2>
                <p className="text-xs text-gray-400 mt-0.5">{editRow.camion_plaque} · {fmtDate(editRow.date)}</p>
              </div>
              <button onClick={() => setEditRow(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={saveEditGasoil} className="p-5 space-y-3">
              <div>
                <label className="label">Date</label>
                <input type="date" className="input" required
                  value={editForm.date}
                  onChange={e => setEditForm({...editForm, date: e.target.value})} />
              </div>
              <div>
                <label className="label">Station</label>
                <input type="text" className="input"
                  value={editForm.station}
                  onChange={e => setEditForm({...editForm, station: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Litres</label>
                  <input type="number" step="0.01" className="input" required
                    value={editForm.qte}
                    onChange={e => setEditForm({...editForm, qte: e.target.value})} />
                </div>
                <div>
                  <label className="label">Prix / L (DHS)</label>
                  <input type="number" step="0.01" className="input" required
                    value={editForm.prix_unitaire}
                    onChange={e => setEditForm({...editForm, prix_unitaire: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">KM compteur</label>
                  <input type="number" className="input"
                    value={editForm.km}
                    onChange={e => setEditForm({...editForm, km: e.target.value})} />
                </div>
                <div>
                  <label className="label">BON N°</label>
                  <input type="text" className="input"
                    value={editForm.bon}
                    onChange={e => setEditForm({...editForm, bon: e.target.value})} />
                </div>
              </div>
              {editForm.qte && editForm.prix_unitaire && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                  <div className="text-xs text-amber-600 mb-1">Total calculé</div>
                  <div className="text-xl font-bold text-amber-700">
                    {fmtD((parseFloat(editForm.qte)||0) * (parseFloat(editForm.prix_unitaire)||0))} DHS
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
