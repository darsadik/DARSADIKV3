import { useState, useEffect, useMemo } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmt, fmtD, fmtDate, fmtMoney, today, startOfMonth, openPrintWindow } from '../../lib/utils'
import { DEFAULT_REMISE_CARBURANT_RATE } from '../../lib/services/profitability'
import { fetchRemiseCarburantRate } from '../../lib/services/settings'
import { previewCycleForNewPlein } from '../../lib/services/fuelCycles'
import Link from 'next/link'

const ADMIN = 'abdelhafidbaadi@gmail.com'

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
  const [voyages, setVoyages] = useState([])
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
    qte: '', prix_unitaire: '12.40', bon: '', km: '', note: '',
    adblue_qte: '', adblue_prix_unitaire: ''
  })
  const [showAdblue, setShowAdblue] = useState(false)
  const [formError, setFormError] = useState('')
  const [remiseRate, setRemiseRate] = useState(DEFAULT_REMISE_CARBURANT_RATE)
  // null = auto-detect fusion (default), true = fusionner avec le précédent, false = nouveau cycle forcé
  const [mergeChoice, setMergeChoice] = useState(null)

  const qte = parseFloat(form.qte) || 0
  const pu = parseFloat(form.prix_unitaire) || 0
  const total = Math.round(qte * pu * 100) / 100
  const adblueQte = parseFloat(form.adblue_qte) || 0
  const adbluePu = parseFloat(form.adblue_prix_unitaire) || 0
  const adblueTotal = Math.round(adblueQte * adbluePu * 100) / 100
  const hasDiesel = qte > 0 && pu > 0
  const hasAdblue = adblueQte > 0 && adbluePu > 0

  // ── PRE-SAVE PREVIEW (§13) — purely additive, saveGasoil() is unaffected ──
  const cyclePreview = useMemo(() => {
    if (!form.camion_id || !form.km) return null
    return previewCycleForNewPlein({
      camionId: form.camion_id, date: form.date, km: form.km,
      qte: form.qte, prixUnitaire: form.prix_unitaire, adblueQte: form.adblue_qte, adblueTotal,
      gasoil, voyages, camions, mergeOverride: mergeChoice,
    })
  }, [form.camion_id, form.date, form.km, form.qte, form.prix_unitaire, form.adblue_qte, adblueTotal, gasoil, voyages, camions, mergeChoice])

  // ── CONSUMPTION MONTH FILTER ──
  const currentMonth = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  }
  const [consoMonth, setConsoMonth] = useState(currentMonth())

  useEffect(() => { loadAll(); fetchRemiseCarburantRate().then(setRemiseRate) }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ca }, { data: ga }, { data: gp }, { data: vg }] = await Promise.all([
      supabase.from('camions').select('*').order('plaque'),
      // ✅ date ASC — oldest to newest
      supabase.from('gasoil').select('*').order('date', { ascending: true }),
      supabase.from('gasoil_paiements').select('*').order('date', { ascending: true }),
      supabase.from('voyages').select('id,reference,date_depart,camion_id,camion_plaque,destination,km_depart,km_arrivee').order('date_depart', { ascending: true }),
    ])
    setCamions(ca || [])
    setGasoil(ga || [])
    setGasoilPaiements(gp || [])
    setVoyages(vg || [])
    setLoading(false)
  }

  async function saveGasoil(e) {
    e.preventDefault()
    setFormError('')
    if (!form.camion_id) { setFormError('Sélectionnez un camion.'); return }
    // Diesel and AdBlue are independent — a plein can be diesel only, AdBlue
    // only (bought without fuel that day), or both.
    if (!hasDiesel && !hasAdblue) { setFormError('Renseignez au moins le gasoil ou l\'AdBlue.'); return }
    setSaving(true)
    const camion = camions.find(c => c.id === parseInt(form.camion_id))
    const { error } = await supabase.from('gasoil').insert({
      date: form.date,
      camion_id: parseInt(form.camion_id),
      camion_plaque: camion?.plaque || '',
      chauffeur: camion?.chauffeur || '',
      station: form.station,
      qte, prix_unitaire: pu, total,
      bon: form.bon,
      km: parseFloat(form.km) || null,
      note: form.note,
      adblue_qte: adblueQte,
      adblue_prix_unitaire: adbluePu,
      adblue_total: adblueTotal,
      merge_with_previous: mergeChoice,
    })
    if (error) {
      setSaving(false)
      setFormError('❌ ' + error.message)
      return
    }
    if (camion) {
      await supabase.from('camions').update({
        gasoil_dhs: (camion.gasoil_dhs || 0) + total,
        pleins: (camion.pleins || 0) + (hasDiesel ? 1 : 0),
        litres: (camion.litres || 0) + qte,
      }).eq('id', camion.id)
    }
    setSaving(false)
    setForm({ date: today(), camion_id: '', station: 'HMIDA ZAIO — Station Petrom', qte: '', prix_unitaire: '12.40', bon: '', km: '', note: '', adblue_qte: '', adblue_prix_unitaire: '' })
    setMergeChoice(null)
    setShowAdblue(false)
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
      adblue_qte: g.adblue_qte || '',
      adblue_prix_unitaire: g.adblue_prix_unitaire || '',
    })
    setEditMsg('')
  }

  async function saveEditGasoil(e) {
    e.preventDefault()
    if (!editRow) return
    const qte = parseFloat(editForm.qte) || 0
    const pu  = parseFloat(editForm.prix_unitaire) || 0
    const total = Math.round(qte * pu * 100) / 100
    const adblueQte = parseFloat(editForm.adblue_qte) || 0
    const adbluePu  = parseFloat(editForm.adblue_prix_unitaire) || 0
    const adblueTotal = Math.round(adblueQte * adbluePu * 100) / 100
    if (!(qte > 0 && pu > 0) && !(adblueQte > 0 && adbluePu > 0)) {
      setEditMsg('❌ Renseignez au moins le gasoil ou l\'AdBlue.')
      return
    }
    setEditSaving(true)

    const { error } = await supabase.from('gasoil').update({
      date: editForm.date,
      qte, prix_unitaire: pu, total,
      km: parseFloat(editForm.km) || null,
      bon: editForm.bon || null,
      station: editForm.station || null,
      note: editForm.note || null,
      adblue_qte: adblueQte,
      adblue_prix_unitaire: adbluePu,
      adblue_total: adblueTotal,
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
        pleins: Math.max(0, (camion.pleins || 0) - (qte > 0 ? 1 : 0)),
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
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  const totLitres = filtered.reduce((s, g) => s + (g.qte || 0), 0)
  const totDHS = filtered.reduce((s, g) => s + (g.total || 0), 0)
  const totAdblue = filtered.reduce((s, g) => s + (g.adblue_total || 0), 0)
  // Remise Carburant — supplier volume discount on GASOIL litres only, never AdBlue.
  const remiseCarburant = Math.round(totLitres * remiseRate * 100) / 100
  const netSupplierTotal = Math.round((totDHS + totAdblue - remiseCarburant) * 100) / 100

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
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id - b.id))

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
        const sorted = d.entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
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

  // ── FUEL CYCLES: cost per km between consecutive refills ─────────────────────
  const fuelCycles = (() => {
    const cycles = []
    const byCam = {}
    gasoil
      .filter(g => g.km)
      .sort((a, b) => (a.camion_id - b.camion_id) || parseFloat(a.km) - parseFloat(b.km))
      .forEach(g => {
        if (!byCam[g.camion_id]) byCam[g.camion_id] = []
        byCam[g.camion_id].push(g)
      })

    Object.entries(byCam).forEach(([camionId, refills]) => {
      for (let i = 0; i < refills.length - 1; i++) {
        const g1 = refills[i], g2 = refills[i + 1]
        const kmStart   = parseFloat(g1.km)
        const kmEnd     = parseFloat(g2.km)
        const cycleKm   = kmEnd - kmStart
        if (cycleKm <= 0) continue
        const dieselCost = g1.total || 0
        const adblueCost = g1.adblue_total || 0
        const fuelCost  = dieselCost + adblueCost
        const costPerKm = fuelCost / cycleKm
        const cycleVoyages = voyages.filter(v =>
          v.camion_id === parseInt(camionId) &&
          v.km_depart !== null && v.km_arrivee !== null &&
          parseFloat(v.km_depart) >= kmStart &&
          parseFloat(v.km_arrivee) <= kmEnd
        ).map(v => {
          const vKm   = parseFloat(v.km_arrivee) - parseFloat(v.km_depart)
          const alloc = Math.round(vKm * costPerKm * 100) / 100
          return { ...v, vKm, alloc }
        })
        cycles.push({
          camionId: parseInt(camionId),
          camionPlaque: g1.camion_plaque,
          g1, g2,
          kmStart, kmEnd, cycleKm,
          fuelCost, dieselCost, adblueCost,
          costPerKm,
          voyages: cycleVoyages,
          allocatedTotal: cycleVoyages.reduce((s, v) => s + v.alloc, 0),
        })
      }
    })
    return cycles
  })()

  // Stats by camion (from ALL gasoil)
  const byCamion = {}
  gasoil.forEach(g => {
    if (!byCamion[g.camion_plaque]) byCamion[g.camion_plaque] = { litres: 0, total: 0, pleins: 0 }
    byCamion[g.camion_plaque].litres += g.qte || 0
    byCamion[g.camion_plaque].total += g.total || 0
    // Plein = diesel purchase only — AdBlue-only rows (qte===0) never count.
    if ((g.qte || 0) > 0) byCamion[g.camion_plaque].pleins += 1
  })

  // ── GRAND LIVRE FOURNISSEUR (CARBURANT) — professional ERP-style ledger.
  // Chronological Débit/Crédit/Solde bookkeeping, exactly like a real supplier
  // account: the Remise Carburant is booked as its own Crédit movement (it
  // genuinely reduces what's owed), so the opening balance for any period is
  // itself computed net of every prior period's rebate — the same
  // litres × remiseRate formula used everywhere else in the app, just applied
  // cumulatively instead of only to the printed window. No other formula,
  // database write, or on-screen figure is touched by this report.
  function printGasoil() {
    const _now = new Date()
    const printDate = _now.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' à ' + String(_now.getHours()).padStart(2,'0') + ':' + String(_now.getMinutes()).padStart(2,'0')

    // Opening balance = everything before the period start, full account
    // (never scoped by the on-screen camion/search filters — there is only
    // one supplier account, payments aren't per-truck).
    const beforeGasoil    = gasoil.filter(g => g.date < filterFrom)
    const beforePaiements = gasoilPaiements.filter(p => p.date < filterFrom)
    const openingPurchases = beforeGasoil.reduce((s,g) => s + (g.total||0) + (g.adblue_total||0), 0)
    const openingPaiements = beforePaiements.reduce((s,p) => s + (p.montant||0), 0)
    const openingLitres    = beforeGasoil.reduce((s,g) => s + (g.qte||0), 0)
    const openingRemise    = Math.round(openingLitres * remiseRate * 100) / 100
    const openingBalance   = openingPurchases - openingPaiements - openingRemise

    const periodGasoil    = gasoil.filter(g => g.date >= filterFrom && g.date <= filterTo)
    const periodPaiements = gasoilPaiements.filter(p => p.date >= filterFrom && p.date <= filterTo)

    // ── real supplier name for the header — the station with the highest
    // spend this period, falling back to the form's default station ──
    const stationTotals = {}
    periodGasoil.forEach(g => {
      const st = g.station || 'HMIDA ZAIO — Station Petrom'
      stationTotals[st] = (stationTotals[st]||0) + (g.total||0) + (g.adblue_total||0)
    })
    const supplierName = Object.entries(stationTotals).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'HMIDA ZAIO — Station Petrom'

    const pTotalDiesel    = periodGasoil.reduce((s,g) => s + (g.total||0), 0)
    const pTotalAdblue    = periodGasoil.reduce((s,g) => s + (g.adblue_total||0), 0)
    const pTotalPurchases = pTotalDiesel + pTotalAdblue
    const pTotalLitres    = periodGasoil.reduce((s,g) => s + (g.qte||0), 0)
    const pRemise         = Math.round(pTotalLitres * remiseRate * 100) / 100
    const pTotalPaid      = periodPaiements.reduce((s,p) => s + (p.montant||0), 0)

    // ── chronological entries — opening balance, purchase (débit, split
    // Gasoil/AdBlue into their own rows so "Produit" always names exactly
    // one item), paiement (crédit), remise (crédit, booked once at period
    // end) — all in ONE ledger. Splitting a purchase into two rows is
    // presentation-only: both rows' débits still sum to (g.total + g.adblue_total),
    // so no total or balance changes — same pattern as expandVenteEntry() on
    // the client statement.
    const entries = []
    entries.push({
      date: filterFrom, seq: `${filterFrom}_-1_0000000000`,
      camion: '—', bon: '—', produit: "Solde d'ouverture", quantite: null, prixUnitaire: null, km: null,
      debit: 0, credit: 0,
    })
    periodGasoil.forEach(g => {
      const hasGasoil = !!g.qte
      const hasAdblue = !!g.adblue_qte
      if (hasGasoil) {
        entries.push({
          date: g.date, seq: `${g.date}_0_${String(g.id).padStart(10,'0')}_0`,
          camion: g.camion_plaque || '—', bon: g.bon || '—',
          produit: 'Gasoil', quantite: g.qte, prixUnitaire: g.prix_unitaire || null,
          km: g.km || null,
          debit: g.total || 0, credit: 0,
        })
      }
      if (hasAdblue) {
        entries.push({
          date: g.date, seq: `${g.date}_0_${String(g.id).padStart(10,'0')}_1`,
          camion: g.camion_plaque || '—', bon: g.bon || '—',
          produit: 'AdBlue', quantite: g.adblue_qte, prixUnitaire: g.adblue_prix_unitaire || null,
          km: hasGasoil ? null : (g.km || null),
          debit: g.adblue_total || 0, credit: 0,
        })
      }
      if (!hasGasoil && !hasAdblue) {
        entries.push({
          date: g.date, seq: `${g.date}_0_${String(g.id).padStart(10,'0')}_0`,
          camion: g.camion_plaque || '—', bon: g.bon || '—',
          produit: '—', quantite: null, prixUnitaire: null, km: g.km || null,
          debit: (g.total||0) + (g.adblue_total||0), credit: 0,
        })
      }
    })
    periodPaiements.forEach(p => {
      entries.push({
        date: p.date, seq: `${p.date}_1_${String(p.id).padStart(10,'0')}`,
        camion: '—', bon: '—', produit: 'Paiement Fournisseur', quantite: null, prixUnitaire: null, km: null,
        debit: 0, credit: p.montant || 0,
      })
    })
    if (pTotalLitres > 0) {
      entries.push({
        date: filterTo, seq: `${filterTo}_2_9999999999`,
        camion: '—', bon: '—', produit: 'Remise Carburant', quantite: pTotalLitres, prixUnitaire: remiseRate, km: null,
        debit: 0, credit: pRemise,
      })
    }
    entries.sort((a,b) => a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0)

    let running = openingBalance
    entries.forEach(e => { running += e.debit - e.credit; e.solde = running })
    const closingBalance = running

    // ── consommation par camion (period-scoped, sorted by litres desc) ──
    const camionStats = {}
    periodGasoil.forEach(g => {
      const k = g.camion_plaque || '—'
      if (!camionStats[k]) camionStats[k] = { pleins: 0, litres: 0, litresAdblue: 0, montant: 0 }
      // Plein = diesel purchase only — AdBlue-only rows (qte===0) never count.
      if ((g.qte || 0) > 0) camionStats[k].pleins += 1
      camionStats[k].litres       += g.qte || 0
      camionStats[k].litresAdblue += g.adblue_qte || 0
      camionStats[k].montant      += (g.total||0) + (g.adblue_total||0)
    })
    const camionStatsRows = Object.entries(camionStats).sort((a,b) => b[1].litres - a[1].litres)

    const soldeColor = v => v >= 0 ? '#16a34a' : '#dc2626'
    const soldeSign  = v => v >= 0 ? '+ ' : '− '

    const rows = entries.map(e => `<tr>
      <td class="m nowrap">${fmtDate(e.date)}</td>
      <td class="m">${e.camion}</td>
      <td class="m">${e.bon}</td>
      <td class="m">${e.produit}</td>
      <td class="r">${e.quantite !== null ? fmtD(e.quantite) : '—'}</td>
      <td class="r">${e.prixUnitaire !== null ? fmtD(e.prixUnitaire) : '—'}</td>
      <td class="r">${e.km !== null ? fmt(e.km) : '—'}</td>
      <td class="r">${e.debit ? `<span class="debit">+ ${fmtMoney(e.debit)}</span>` : '<span class="dash">—</span>'}</td>
      <td class="r">${e.credit ? `<span class="credit">− ${fmtMoney(e.credit)}</span>` : '<span class="dash">—</span>'}</td>
      <td class="r solde" style="color:${soldeColor(e.solde)}">${soldeSign(e.solde)}${fmtMoney(Math.abs(e.solde))}</td>
    </tr>`).join('')

    const camionRows = camionStatsRows.map(([plaque, d]) => `<tr>
      <td class="m"><b>${plaque}</b></td>
      <td class="r">${d.pleins}</td>
      <td class="r">${fmtD(d.litres)} L</td>
      <td class="r">${d.litresAdblue ? fmtD(d.litresAdblue) + ' L' : '—'}</td>
      <td class="r"><b>${fmtMoney(d.montant)} DHS</b></td>
    </tr>`).join('')

    openPrintWindow(`<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Grand Livre Fournisseur — Carburant — DAR SADIK</title>
<style>
  @page{margin:0mm}
  @media print{.btn-p{display:none!important} .doc-footer{position:fixed}}
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#1e293b;background:#fff}

  /* ── document header — logo left, coordonnées right, one separator ── */
  .hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:16px 26px 14px;border-bottom:1px solid #e2e8f0}
  .co-n{font-size:18px;font-weight:900;color:#1e3a5f;text-transform:uppercase;letter-spacing:0.5px;line-height:1}
  .co-tag{font-size:10.5px;color:#2563eb;font-weight:700;margin-top:2px}
  .co-addr{font-size:10.5px;color:#64748b;margin-top:6px}
  .co-r{text-align:right;flex-shrink:0}
  .btn-p{padding:4px 12px;border:none;border-radius:3px;font-size:10px;font-weight:700;cursor:pointer;background:#1e3a5f;color:#fff;margin-top:6px}

  /* ── supplier block — plain text, no box ── */
  .supplier-block{padding:20px 26px 4px}
  .supplier-name{font-size:21px;font-weight:900;color:#1e3a5f;letter-spacing:0.2px}
  .supplier-period{font-size:11.5px;color:#64748b;margin-top:5px}

  .bdy{padding:16px 26px 4px}
  .sec-title{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;color:#1e3a5f;border-bottom:1.5px solid #1e3a5f;padding-bottom:4px;margin:20px 0 8px}

  table{width:100%;border-collapse:collapse}
  thead th{background:#1e3a5f !important;color:#fff !important;padding:7px 8px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap}
  thead th.r{text-align:right}
  tbody tr{page-break-inside:avoid}
  tbody td{padding:6px 8px;font-size:11px;color:#1e293b;border-bottom:1px solid #eef1f4;vertical-align:middle}
  tbody td.r{text-align:right;font-family:'Courier New',monospace;white-space:nowrap}
  tbody td.m{color:#374151;font-weight:500;white-space:nowrap}
  tbody td.nowrap{white-space:nowrap}
  tbody tr:nth-child(even) td{background:#f8fafc !important}
  .debit{font-weight:700;color:#1e3a5f}
  .credit{font-weight:700;color:#374151}
  .solde{font-weight:800}
  .dash{color:#cbd5e1}
  .empty-row td{text-align:center;color:#94a3b8;padding:18px;font-style:italic}

  /* ── résumé comptable (single summary, printed once at the end) ── */
  .summary-table td{padding:7px 10px;font-size:11.5px;border-bottom:1px solid #e2e8f0}
  .summary-table tr:last-child td{border-bottom:none}
  .summary-table td.sl{color:#374151;font-weight:600}
  .summary-table td.sv{text-align:right;font-family:'Courier New',monospace;font-weight:700}
  .summary-table tr.final td{background:#f8fafc !important;border-top:2px solid #1e3a5f;padding-top:10px;padding-bottom:10px}
  .summary-table tr.final td.sl{font-weight:800;font-size:12px}
  .summary-table tr.final td.sv{font-weight:900;font-size:15px}

  .doc-footer{left:0;right:0;bottom:0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8;padding:6px 26px;border-top:1px solid #e2e8f0;background:#fff}
  .foot-spacer{height:34px}
</style></head><body>

<div class="hdr">
  <div>
    <div style="display:flex;align-items:center;gap:12px">
      <svg width="40" height="40" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="90" fill="#1e3a5f"/><polygon points="40,170 256,50 472,170" fill="#e8b84b"/><rect x="60" y="175" width="115" height="70" rx="12" fill="#fff" opacity=".95"/><rect x="195" y="175" width="122" height="70" rx="12" fill="#fff" opacity=".95"/><rect x="337" y="175" width="115" height="70" rx="12" fill="#fff" opacity=".95"/><rect x="60" y="260" width="85" height="70" rx="12" fill="#e8b84b" opacity=".95"/><rect x="165" y="260" width="122" height="70" rx="12" fill="#e8b84b" opacity=".95"/><rect x="307" y="260" width="145" height="70" rx="12" fill="#e8b84b" opacity=".95"/></svg>
      <div><div class="co-n">DAR SADIK</div><div class="co-tag">Grand Livre Fournisseur — Carburant</div></div>
    </div>
    <div class="co-addr">Selouane, Nador</div>
  </div>
  <div class="co-r">
    <div style="font-size:11px;color:#1e3a5f;line-height:1.85">
      <strong>Mohamed</strong> 06 61 32 56 65 &nbsp;·&nbsp; <strong>Sadik</strong> 06 61 97 87 47<br>
      <strong>Bureau</strong> 06 62 82 88 20<br>
      <span style="color:#2563eb">Dar.sadik@hotmail.com</span>
    </div>
    <div style="font-size:9.5px;color:#94a3b8;margin-top:4px">Généré le ${printDate}</div>
    <div style="margin-top:4px"><button class="btn-p" onclick="window.print()">Imprimer / PDF</button></div>
  </div>
</div>

<div class="supplier-block">
  <div class="supplier-name">${supplierName}</div>
  <div class="supplier-period">Période : ${fmtDate(filterFrom)} → ${fmtDate(filterTo)}</div>
</div>

<div class="bdy">
<table>
  <thead><tr>
    <th>Date</th><th>Camion</th><th>Bon</th><th>Produit</th>
    <th class="r">Quantité</th><th class="r">Prix unitaire</th><th class="r">KM</th>
    <th class="r">Débit (+)</th><th class="r">Crédit (−)</th><th class="r">Solde</th>
  </tr></thead>
  <tbody>
    ${rows || '<tr class="empty-row"><td colspan="10">Aucune opération pour cette période</td></tr>'}
  </tbody>
</table>

<div class="sec-title">Résumé Comptable</div>
<table class="summary-table">
  <tbody>
    <tr><td class="sl">Total Gasoil</td><td class="sv">${fmtMoney(pTotalDiesel)} DHS</td></tr>
    <tr><td class="sl">Total AdBlue</td><td class="sv">${fmtMoney(pTotalAdblue)} DHS</td></tr>
    <tr><td class="sl">Total Achats</td><td class="sv">${fmtMoney(pTotalPurchases)} DHS</td></tr>
    <tr><td class="sl">Remise Carburant</td><td class="sv">− ${fmtMoney(pRemise)} DHS</td></tr>
    <tr><td class="sl">Total Paiements</td><td class="sv">− ${fmtMoney(pTotalPaid)} DHS</td></tr>
    <tr class="final"><td class="sl">Solde Final</td><td class="sv" style="color:${soldeColor(closingBalance)}">${soldeSign(closingBalance)}${fmtMoney(Math.abs(closingBalance))} DHS</td></tr>
  </tbody>
</table>

<div class="sec-title">Consommation par Camion</div>
<table>
  <thead><tr>
    <th>Camion</th><th class="r">Nombre de pleins</th><th class="r">Litres Gasoil</th><th class="r">Litres AdBlue</th><th class="r">Montant total</th>
  </tr></thead>
  <tbody>
    ${camionRows || '<tr class="empty-row"><td colspan="5">Aucune donnée</td></tr>'}
  </tbody>
</table>

<div class="foot-spacer"></div>
</div>

<div class="doc-footer"><span>DAR SADIK — Selouane, Nador</span><span>Généré le ${printDate}</span></div>
</body></html>`)
  }

  function exportCSV() {
    let csv = `Date,Camion,Chauffeur,Station,Litres,Prix/L,Total DHS,AdBlue DHS,KM,BON\n`
    filtered.forEach(g => { csv += `${g.date},${g.camion_plaque},${g.chauffeur||''},${g.station},${g.qte||0},${g.prix_unitaire||0},${g.total||0},${g.adblue_total||0},${g.km||''},${g.bon||''}\n` })
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
        <div className="stat-card border border-cyan-100 bg-cyan-50">
          <div className="stat-label text-cyan-600">Total AdBlue</div>
          <div className="stat-value text-cyan-700">{fmt(gasoil.reduce((s,g)=>s+(g.adblue_total||0),0))} DHS</div>
          <div className="stat-sub">Toutes périodes</div>
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
                  <input className="input" type="number" placeholder="300" value={form.qte} onChange={e => setForm({...form, qte: e.target.value})} />
                </div>
                <div>
                  <label className="label">Prix/L (DHS)</label>
                  <input className="input" type="number" step="0.01" value={form.prix_unitaire} onChange={e => setForm({...form, prix_unitaire: e.target.value})} />
                </div>
              </div>
              <div className="text-[11px] text-gray-400 -mt-2">Laissez vide si vous ajoutez uniquement de l'AdBlue, sans gasoil.</div>
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

              {/* ── ADBLUE (independent — avec ou sans gasoil) ── */}
              {showAdblue ? (
                <div className="border border-cyan-100 bg-cyan-50/40 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-cyan-700">🧴 AdBlue</span>
                    <button type="button" onClick={() => { setShowAdblue(false); setForm({...form, adblue_qte: '', adblue_prix_unitaire: ''}) }} className="text-xs text-gray-400 hover:text-gray-600">✕ Retirer</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Litres AdBlue</label>
                      <input className="input" type="number" placeholder="10" value={form.adblue_qte} onChange={e => setForm({...form, adblue_qte: e.target.value})} />
                    </div>
                    <div>
                      <label className="label">Prix/L AdBlue (DHS)</label>
                      <input className="input" type="number" step="0.01" placeholder="ex: 8.50" value={form.adblue_prix_unitaire} onChange={e => setForm({...form, adblue_prix_unitaire: e.target.value})} />
                    </div>
                  </div>
                  {adblueQte > 0 && adbluePu > 0 && (
                    <div className="text-center text-xs text-cyan-700">
                      {fmtD(adblueQte)} L × {fmtD(adbluePu)} = <span className="font-bold">{fmtD(adblueTotal)} DHS</span>
                    </div>
                  )}
                </div>
              ) : (
                <button type="button" onClick={() => setShowAdblue(true)} className="btn-secondary w-full justify-center text-xs">
                  🧴 + AdBlue {hasDiesel ? '(à ce plein)' : '(seul, sans gasoil)'}
                </button>
              )}

              {/* ── APERÇU CYCLE AVANT ENREGISTREMENT (§13) ── */}
              {cyclePreview?.ready && (
                <div className="border border-purple-100 bg-purple-50/40 rounded-xl p-3 space-y-2">
                  <div className="text-xs font-semibold text-purple-700">🔮 Aperçu du cycle</div>
                  {cyclePreview.cycleClosing ? (
                    <div className="text-xs text-purple-800">
                      Ce plein clôture le cycle du <b>{fmtDate(cyclePreview.cycleClosing.dateDebut)}</b> :
                      {' '}<b>{fmt(cyclePreview.cycleClosing.distance)} km</b>
                      {cyclePreview.cycleClosing.coutKm !== null && <> · <b>{cyclePreview.cycleClosing.coutKm.toFixed(2)} DHS/km</b></>}
                      {' '}({cyclePreview.cycleClosing.nbVoyages} voyage{cyclePreview.cycleClosing.nbVoyages > 1 ? 's' : ''} concerné{cyclePreview.cycleClosing.nbVoyages > 1 ? 's' : ''})
                    </div>
                  ) : cyclePreview.extendsOpenCycle ? (
                    <div className="text-xs text-purple-800">
                      Ce plein sera <b>fusionné</b> avec le cycle en cours depuis le <b>{fmtDate(cyclePreview.thisCycle.dateDebut)}</b> (aucun voyage entre les deux).
                    </div>
                  ) : (
                    <div className="text-xs text-purple-800">Ouvre un nouveau cycle pour ce camion.</div>
                  )}
                  {cyclePreview.alerts.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-purple-100">
                      {cyclePreview.alerts.map((a, i) => (
                        <div key={i} className="text-[10px] text-amber-700">⚠ {a.message}</div>
                      ))}
                    </div>
                  )}
                  {cyclePreview.extendsOpenCycle && !cyclePreview.cycleClosing && (
                    <div className="flex gap-2 pt-1">
                      <button type="button"
                        onClick={() => setMergeChoice(mergeChoice === false ? null : false)}
                        className={`text-[10px] font-semibold px-2 py-1 rounded ${mergeChoice === false ? 'bg-purple-600 text-white' : 'bg-white border border-purple-200 text-purple-700'}`}>
                        ✂️ Forcer un nouveau cycle
                      </button>
                    </div>
                  )}
                </div>
              )}

              {formError && (
                <div className="text-xs font-semibold text-center p-2 rounded-lg bg-red-50 text-red-700">
                  {formError}
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

          {/* ── FUEL CYCLES ── */}
          <div className="card mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">⛽ Cycles carburant (coût/km)</h3>
              <Link href="/carburant" className="text-xs font-semibold text-brand-600 hover:underline">Voir les cycles détaillés →</Link>
            </div>
            {fuelCycles.length === 0 ? (
              <div className="text-center text-gray-400 text-xs py-4">
                Aucun cycle détectable — enregistrez les KM compteur sur les pleins et les KM départ/arrivée sur les voyages
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                {fuelCycles.map((c, i) => (
                  <div key={i} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <span className="font-bold text-gray-900 text-sm">{c.camionPlaque}</span>
                        <span className="ml-2 text-xs text-gray-400">
                          {c.g1.date} → {c.g2.date}
                        </span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-lg">
                          {fmt(c.cycleKm)} km
                        </span>
                        <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-lg">
                          {c.costPerKm.toFixed(2)} DHS/km
                        </span>
                        <span className="bg-red-50 text-red-600 text-xs font-bold px-2 py-0.5 rounded-lg">
                          {fmt(c.fuelCost)} DHS
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center mb-2">
                      <div className="bg-gray-50 rounded-lg p-1.5">
                        <div className="text-[10px] text-gray-400">KM début</div>
                        <div className="text-xs font-bold text-gray-700">{fmt(c.kmStart)}</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-1.5">
                        <div className="text-[10px] text-gray-400">KM fin</div>
                        <div className="text-xs font-bold text-gray-700">{fmt(c.kmEnd)}</div>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-1.5">
                        <div className="text-[10px] text-orange-400">Alloué</div>
                        <div className="text-xs font-bold text-orange-700">{fmt(c.allocatedTotal)} DHS</div>
                      </div>
                    </div>
                    {c.adblueCost > 0 && (
                      <div className="grid grid-cols-3 gap-2 text-center mb-2">
                        <div className="bg-red-50 rounded-lg p-1.5">
                          <div className="text-[10px] text-red-400">Diesel</div>
                          <div className="text-xs font-bold text-red-700">{fmt(c.dieselCost)} DHS</div>
                        </div>
                        <div className="bg-cyan-50 rounded-lg p-1.5">
                          <div className="text-[10px] text-cyan-400">AdBlue</div>
                          <div className="text-xs font-bold text-cyan-700">{fmt(c.adblueCost)} DHS</div>
                        </div>
                        <div className="bg-slate-100 rounded-lg p-1.5">
                          <div className="text-[10px] text-slate-500">Cycle Total</div>
                          <div className="text-xs font-bold text-slate-800">{fmt(c.fuelCost)} DHS</div>
                        </div>
                      </div>
                    )}
                    {c.voyages.length > 0 ? (
                      <div className="space-y-1">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">
                          Voyages dans ce cycle ({c.voyages.length})
                        </div>
                        {c.voyages.map(v => (
                          <div key={v.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-2 py-1.5 text-xs">
                            <div>
                              <span className="font-semibold text-gray-800">{v.reference || `#${v.id}`}</span>
                              <span className="text-gray-400 ml-2">{v.date_depart}</span>
                              {v.destination && <span className="text-gray-400 ml-1">→ {v.destination}</span>}
                            </div>
                            <div className="flex gap-3 text-right">
                              <span className="text-blue-600 font-semibold">{fmt(v.vKm)} km</span>
                              <span className="text-amber-600 font-bold">{fmt(v.alloc)} DHS</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-gray-400 italic">
                        Aucun voyage avec KM enregistré dans ce cycle
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400">
              Coût alloué = km voyage × (coût plein ÷ km cycle). Renseignez les KM départ/arrivée sur chaque voyage.
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
                [...gasoilPaiements].sort((a,b) => (b.date || '').localeCompare(a.date || '')).map(p => (
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
                      <th className="th text-right">AdBlue DHS</th>
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
                        <td className="td text-right font-medium">{g.qte ? fmtD(g.qte) : '—'}</td>
                        <td className="td text-right text-gray-500">{g.qte ? fmtD(g.prix_unitaire) : '—'}</td>
                        <td className="td text-right font-bold text-amber-600">{g.qte ? fmtD(g.total) : '—'}</td>
                        <td className="td text-right text-cyan-600 text-xs">
                          {g.adblue_qte ? (
                            <>
                              <div className="font-semibold">{fmtD(g.adblue_total)}</div>
                              <div className="text-[10px] text-cyan-400">{fmtD(g.adblue_qte)}L × {fmtD(g.adblue_prix_unitaire)}</div>
                            </>
                          ) : '—'}
                        </td>
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
                      <tr><td colSpan={11} className="td text-center text-gray-400 py-10">Aucune entrée trouvée</td></tr>
                    )}
                  </tbody>
                  {filtered.length > 0 && (
                    <tfoot>
                      <tr>
                        <td className="tfoot-td" colSpan={4}>TOTAL</td>
                        <td className="tfoot-td text-right">{fmtD(totLitres)} L</td>
                        <td className="tfoot-td"></td>
                        <td className="tfoot-td text-right text-amber-700">{fmt(totDHS)} DHS</td>
                        <td className="tfoot-td text-right text-cyan-700">{totAdblue ? fmt(totAdblue) + ' DHS' : '—'}</td>
                        <td className="tfoot-td" colSpan={3}></td>
                      </tr>
                      <tr>
                        <td className="tfoot-td" colSpan={6}>Remise Carburant</td>
                        <td className="tfoot-td text-right text-green-600" colSpan={2}>− {fmt(remiseCarburant)} DHS</td>
                        <td className="tfoot-td" colSpan={3}></td>
                      </tr>
                      <tr>
                        <td className="tfoot-td font-black" colSpan={6}>Net Supplier Total</td>
                        <td className="tfoot-td text-right font-black" colSpan={2}>{fmt(netSupplierTotal)} DHS</td>
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
                  <input type="number" step="0.01" className="input"
                    value={editForm.qte}
                    onChange={e => setEditForm({...editForm, qte: e.target.value})} />
                </div>
                <div>
                  <label className="label">Prix / L (DHS)</label>
                  <input type="number" step="0.01" className="input"
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
              <div className="border border-cyan-100 bg-cyan-50/40 rounded-xl p-3 space-y-2">
                <div className="text-xs font-semibold text-cyan-700">🧴 AdBlue (même plein)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Litres AdBlue</label>
                    <input type="number" className="input"
                      value={editForm.adblue_qte}
                      onChange={e => setEditForm({...editForm, adblue_qte: e.target.value})} />
                  </div>
                  <div>
                    <label className="label">Prix/L AdBlue (DHS)</label>
                    <input type="number" step="0.01" className="input"
                      value={editForm.adblue_prix_unitaire}
                      onChange={e => setEditForm({...editForm, adblue_prix_unitaire: e.target.value})} />
                  </div>
                </div>
                {editForm.adblue_qte && editForm.adblue_prix_unitaire && (
                  <div className="text-center text-xs text-cyan-700">
                    {fmtD(editForm.adblue_qte)} L × {fmtD(editForm.adblue_prix_unitaire)} = <span className="font-bold">{fmtD((parseFloat(editForm.adblue_qte)||0) * (parseFloat(editForm.adblue_prix_unitaire)||0))} DHS</span>
                  </div>
                )}
              </div>
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
