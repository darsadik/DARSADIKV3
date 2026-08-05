import { useState, useEffect, useRef, Fragment } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmt, fmtD, fmtMoney, fmtDate, today, startOfMonth, useIsMobile, openPrintWindow } from '../../lib/utils'
import { printBaseCss, printHeader, printGeneratedDate, entityCard, printFooter } from '../../lib/printLayout'
import { fetchRemiseCarburantRate } from '../../lib/services/settings'
import { DEFAULT_REMISE_CARBURANT_RATE } from '../../lib/services/profitability'

const ADMIN = 'abdelhafidbaadi@gmail.com'

// One merged chronological ledger per supplier — every Fuel Purchase (Plein)
// linked via gasoil.fournisseur_id is a DEBIT, every Payment linked via
// paiements.gasoil_fourn_id (type_compte='gasoil') is a CREDIT. The running
// balance is never stored separately here — it's always replayed from these
// two sources, exactly like a Client/Supplier statement (§6 of the spec).
export default function FournisseursGasoil() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const admin    = user?.email === ADMIN

  const [fournisseurs, setFournisseurs] = useState([])
  const [selected,     setSelected]     = useState(null)
  const [achats,       setAchats]       = useState([])
  const [paiements,    setPaiements]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [loadingDetail,setLoadingDetail]= useState(false)
  const [search,       setSearch]       = useState('')
  const [filterFrom,   setFilterFrom]   = useState(startOfMonth())
  const [filterTo,     setFilterTo]     = useState(today())
  const [filterType,   setFilterType]   = useState('all')
  const [showAdd,      setShowAdd]      = useState(false)
  const [newNom,       setNewNom]       = useState('')
  const [remiseRate,   setRemiseRate]   = useState(DEFAULT_REMISE_CARBURANT_RATE)

  // ── OPENING BALANCE (single source of truth: gasoil_fournisseurs.opening_balance,
  // sql/21) — distinct from the global app_settings.fuel_opening_balance edited
  // on /parametres (that one is a whole-module figure, not per-supplier; see
  // sql/21 header comment). Edited here, read live everywhere below. ──
  const [openingModal,  setOpeningModal]  = useState(null)
  const [openingInput,  setOpeningInput]  = useState('')
  const [openingSaving, setOpeningSaving] = useState(false)

  // ── STATEMENT MODE (Chronologique / Présentation) — same architecture,
  // components and UX as the Brick Client Statement (pages/clients/index.js).
  // Presentation mode is a pure visual reordering layer: it never touches
  // debit/credit/solde math, accounting dates, or database chronology.
  const [stmtMode, setStmtMode] = useState('chrono') // 'chrono' | 'presentation'

  // ── PRESENTATION ORDER (stored in gasoil_fournisseurs.presentation_order
  // JSONB, mirrors clients.presentation_order) ──
  // Structure: { "<entryId>": { p: "2026-05", s: 1748736000000 }, ... }
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

  useEffect(() => { loadFournisseurs(); fetchRemiseCarburantRate().then(setRemiseRate) }, [])

  // Reset presentation state when supplier changes
  useEffect(() => {
    if (!selected?.id) return
    setPresentationOrder(selected.presentation_order || {})
    setPresHistory([])
    setPresSelectedRows(new Set())
    setPresLastClickedIdx(null)
    setStmtMode('chrono')
  }, [selected?.id])

  // End drag-selection on mouse-up anywhere on the page
  useEffect(() => {
    const up = () => { setPresDragSelectStart(null); setPresDragSelectActive(false) }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  async function loadFournisseurs() {
    setLoading(true)
    const { data } = await supabase.from('gasoil_fournisseurs').select('*').order('solde', { ascending: false })
    setFournisseurs(data || [])
    setLoading(false)
  }

  async function selectFournisseur(f) {
    setSelected(f)
    setLoadingDetail(true)
    const [{ data: ac }, { data: pa }] = await Promise.all([
      supabase.from('gasoil').select('*').eq('fournisseur_id', f.id).order('date', { ascending: true }),
      supabase.from('paiements').select('*').eq('gasoil_fourn_id', f.id).eq('type_compte', 'gasoil').order('date', { ascending: true }),
    ])
    setAchats(ac || [])
    setPaiements(pa || [])
    setLoadingDetail(false)
  }

  async function addFournisseur(e) {
    e.preventDefault()
    if (!newNom.trim()) return
    await supabase.from('gasoil_fournisseurs').insert({ nom: newNom.trim(), solde: 0 })
    setNewNom(''); setShowAdd(false)
    loadFournisseurs()
  }

  async function deleteFournisseur(id) {
    if (!admin || !confirm('Supprimer ce fournisseur carburant ?')) return
    await supabase.from('gasoil_fournisseurs').delete().eq('id', id)
    if (selected?.id === id) setSelected(null)
    loadFournisseurs()
  }

  function openOpeningBalance(f) {
    setOpeningInput(String(f.opening_balance || ''))
    setOpeningModal(f)
  }

  // Recomputes .solde from scratch (opening_balance + all-time purchases −
  // all-time payments) so the stored balance — read everywhere else on this
  // page (list, KPI cards, PDF) — never drifts from the new opening balance.
  // Single write path: no other place stores or duplicates this figure.
  async function saveOpeningBalance(e) {
    e.preventDefault()
    if (!openingModal) return
    setOpeningSaving(true)
    const n = parseFloat(openingInput) || 0
    const totalAchatsAll    = achats.reduce((s, a) => s + (a.total || 0) + (a.adblue_total || 0), 0)
    const totalPaiementsAll = paiements.reduce((s, p) => s + (p.montant || 0), 0)
    const newSolde = n + totalAchatsAll - totalPaiementsAll
    await supabase.from('gasoil_fournisseurs').update({ opening_balance: n, solde: newSolde }).eq('id', openingModal.id)
    setOpeningSaving(false)
    setOpeningModal(null)
    loadFournisseurs()
    if (selected?.id === openingModal.id) setSelected({ ...selected, opening_balance: n, solde: newSolde })
  }

  function getDateRange() {
    if (filterType === 'all') return { from: null, to: null }
    if (filterType === 'month') {
      const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0')
      return { from: `${y}-${m}-01`, to: today() }
    }
    return { from: filterFrom, to: filterTo }
  }
  const { from, to } = getDateRange()

  // ── ONE MERGED CHRONOLOGICAL LEDGER (accounting source of truth — unchanged) ──
  const allEntries = [
    ...achats.map(a => ({
      id: `p-${a.id}`, date: a.date, seq: `${a.date}_0_${String(a.id).padStart(10,'0')}`,
      type: 'purchase', label: a.adblue_qte ? 'Achat Carburant + AdBlue' : 'Achat Carburant',
      debit: (a.total || 0) + (a.adblue_total || 0), credit: 0,
      camion: a.camion_plaque || '—', bon: a.bon || '—', note: a.note || '',
      // Presentation-only enrichment (§ Unit Price / Liters) — never read by
      // the debit/credit/solde math above, so the ledger stays identical.
      qte: a.qte || 0, prixUnitaire: a.prix_unitaire || 0,
      adblueQte: a.adblue_qte || 0, adbluePrixUnitaire: a.adblue_prix_unitaire || 0,
      fuelAmount: a.total || 0, adblueAmount: a.adblue_total || 0,
    })),
    ...paiements.map(p => ({
      id: `c-${p.id}`, date: p.date, seq: `${p.date}_1_${String(p.id).padStart(10,'0')}`,
      type: 'payment', label: 'Paiement',
      debit: 0, credit: p.montant || 0,
      camion: '—', bon: p.mode || '—', note: p.note || '',
    })),
  ].sort((a, b) => a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0)

  // Opening balance = the supplier's own opening_balance (single source of
  // truth — sql/21, read live from `selected`) plus every entry before the
  // period start, so the displayed running balance stays correct no matter
  // which period is selected — same approach as getCarryOver() on the Brick
  // Client Statement and the Grand Livre Fournisseur report on /gasoil.
  const beforeEntries = from ? allEntries.filter(e => e.date < from) : []
  const openingBalance = (selected?.opening_balance || 0) + beforeEntries.reduce((s, e) => s + e.debit - e.credit, 0)
  const periodEntries = allEntries.filter(e => (!from || e.date >= from) && (!to || e.date <= to))

  let running = openingBalance
  const ledger = periodEntries.map(e => { running += e.debit - e.credit; return { ...e, solde: running } })
  const closingBalance = running

  // ── DISPLAY LEDGER — presentation-only split of a combined Fuel+AdBlue
  // purchase into two single-product rows (Achat Carburant / Achat AdBlue),
  // so the merged "Litres"/"Prix U." columns are never ambiguous (every row
  // shows exactly one product). Derived purely from `ledger`, whose solde is
  // already correct: the split row's own solde is back-derived algebraically
  // (e.solde − e.adblueAmount) rather than recomputed, so this can never
  // disagree with the real running balance above — no new math, same debit
  // total (fuelAmount + adblueAmount === e.debit), same final balance. Used
  // ONLY for rendering the chronological table (screen + PDF) below;
  // `ledger`/`closingBalance`/totals/truckSummary above stay untouched, and
  // Presentation Mode keeps reading the original, unsplit `allEntries`.
  function splitLedgerRow(e) {
    if (e.type !== 'purchase') return [e]
    const hasFuel = e.qte > 0, hasAdblue = e.adblueQte > 0
    if (hasFuel && hasAdblue) {
      return [
        { ...e, id: `${e.id}-f`, label: 'Achat Carburant', debit: e.fuelAmount, solde: e.solde - e.adblueAmount },
        { ...e, id: `${e.id}-a`, label: 'Achat AdBlue', debit: e.adblueAmount, qte: e.adblueQte, prixUnitaire: e.adbluePrixUnitaire },
      ]
    }
    if (hasAdblue) return [{ ...e, label: 'Achat AdBlue', qte: e.adblueQte, prixUnitaire: e.adbluePrixUnitaire }]
    return [{ ...e, label: 'Achat Carburant' }]
  }
  const displayLedger = ledger.flatMap(splitLedgerRow)

  const totalAchats    = periodEntries.reduce((s, e) => s + e.debit, 0)
  const totalPaiements = periodEntries.reduce((s, e) => s + e.credit, 0)

  // ── FUEL DISCOUNT — informational only, exactly like /gasoil's own Grand
  // Livre report: litres × remiseRate, gasoil only (never AdBlue). Restored
  // here as a presentation figure; it does NOT feed into the ledger's
  // debit/credit/solde columns or into gasoil_fournisseurs.solde above.
  const totalFuelLitres   = periodEntries.reduce((s, e) => s + (e.qte || 0), 0)
  const totalAdblueLitres = periodEntries.reduce((s, e) => s + (e.adblueQte || 0), 0)
  const fuelDiscount      = Math.round(totalFuelLitres * remiseRate * 100) / 100

  // ── ANCIEN SOLDE — just a clearer label for openingBalance (defined
  // above, untouched) in the Résumé breakdown: the ledger's own opening
  // balance for the period. Not discount-adjusted — the ledger never nets
  // the fuel discount, and that stays exactly as-is. ──
  const ancienSolde = openingBalance

  // ── SOLDE À PAYER — the chronological ledger IS the accounting source of
  // truth: this is always exactly closingBalance (defined above, untouched),
  // the ledger's own final running balance, never computed independently.
  // The Résumé's breakdown below (Ancien Solde + Achats − Paiements)
  // reproduces the exact same arithmetic that already produces
  // closingBalance, so the two can never disagree — there is only ever one
  // balance calculation. Remise Carburant is shown in the Résumé purely as
  // informational context: it is not a ledger line item, so it does not
  // enter this sum (exactly like totalAchats/fuelDiscount/totalPaiements/
  // soldeDuNet above, none of which are touched). ──
  const soldeAPayer = closingBalance

  // ── SOLDE DÛ (BALANCE DUE) — single source of truth for "how much this
  // supplier is currently owed": opening balance + ALL-TIME purchases −
  // ALL-TIME payments − ALL-TIME fuel discount (never period-filtered, since
  // "amount owed right now" isn't scoped to whatever date filter is active —
  // same reasoning as gasoil_fournisseurs.solde itself). The discount is a
  // real reduction of what's owed, exactly like it nets into ancienSolde/
  // soldeAPayer above — soldeDuNet is the all-time balance shown in the
  // header/KPI card, soldeAPayer is the selected period's own breakdown.
  // Computed once here and reused everywhere "Solde dû" is shown (KPI card,
  // PDF) so there is only ever one number. This does NOT rewrite
  // gasoil_fournisseurs.solde (still the gross, stored figure used by the
  // supplier list and by /gasoil, /paiements elsewhere in the app) and does
  // NOT touch the ledger's own per-row/period totals below, which stay
  // exactly as recorded — only the all-time balance-due figure is corrected.
  const totalAchatsAllTime     = allEntries.reduce((s, e) => s + e.debit, 0)
  const totalPaiementsAllTime  = allEntries.reduce((s, e) => s + e.credit, 0)
  const totalFuelLitresAllTime = allEntries.reduce((s, e) => s + (e.qte || 0), 0)
  const totalDiscountAllTime   = Math.round(totalFuelLitresAllTime * remiseRate * 100) / 100
  const soldeDuNet = (selected?.opening_balance || 0) + totalAchatsAllTime - totalPaiementsAllTime - totalDiscountAllTime

  // ── TRUCK CONSUMPTION SUMMARY — purchases only (period-filtered, same as
  // the figures above), grouped by camion. Purely additive reporting; never
  // read by debit/credit/solde math or gasoil_fournisseurs.solde. fuelCount/
  // adblueCount are simple fill-up counts (one purchase row can carry both
  // a fuel and an AdBlue fill, counted independently). ──
  const truckSummaryMap = {}
  periodEntries.filter(e => e.type === 'purchase').forEach(e => {
    const key = e.camion || '—'
    if (!truckSummaryMap[key]) truckSummaryMap[key] = { camion: key, fuelCount: 0, fuelLitres: 0, fuelAmount: 0, adblueCount: 0, adblueLitres: 0, adblueAmount: 0 }
    if (e.qte > 0) truckSummaryMap[key].fuelCount++
    truckSummaryMap[key].fuelLitres   += e.qte || 0
    truckSummaryMap[key].fuelAmount   += e.fuelAmount || 0
    if (e.adblueQte > 0) truckSummaryMap[key].adblueCount++
    truckSummaryMap[key].adblueLitres += e.adblueQte || 0
    truckSummaryMap[key].adblueAmount += e.adblueAmount || 0
  })
  const truckSummary = Object.values(truckSummaryMap).sort((a, b) => a.camion.localeCompare(b.camion))
  const truckSummaryTotals = truckSummary.reduce((acc, t) => ({
    fuelCount: acc.fuelCount + t.fuelCount,
    fuelLitres: acc.fuelLitres + t.fuelLitres,
    fuelAmount: acc.fuelAmount + t.fuelAmount,
    adblueCount: acc.adblueCount + t.adblueCount,
    adblueLitres: acc.adblueLitres + t.adblueLitres,
    adblueAmount: acc.adblueAmount + t.adblueAmount,
  }), { fuelCount: 0, fuelLitres: 0, fuelAmount: 0, adblueCount: 0, adblueLitres: 0, adblueAmount: 0 })

  // ── PRESENTATION HELPERS — same shape as pages/clients/index.js ──
  function eKey(e) { return e.id }
  function getEffectivePeriod(e) { return presentationOrder[eKey(e)]?.p ?? e.date.slice(0, 7) }
  function getEffectiveSeq(e) { return presentationOrder[eKey(e)]?.s ?? new Date(e.date + 'T00:00:00').getTime() }

  // ── BUILD PRESENTATION LEDGER — full supplier history (not date-filtered),
  // sorted by effectivePeriod/effectiveSeq when a custom order exists,
  // otherwise falls back exactly to chronological (seq) order. ──
  function buildPresentationLedger() {
    const entries = allEntries.map(e => ({ ...e }))
    entries.forEach(e => { e.effectivePeriod = getEffectivePeriod(e); e.effectiveSeq = getEffectiveSeq(e) })

    entries.sort((a, b) => {
      const aO = presentationOrder[eKey(a)], bO = presentationOrder[eKey(b)]
      if (!aO && !bO) return a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0
      if (a.effectivePeriod !== b.effectivePeriod) return a.effectivePeriod < b.effectivePeriod ? -1 : 1
      return a.effectiveSeq - b.effectiveSeq
    })

    // Same opening_balance starting point as the chronological ledger (single
    // source of truth) — otherwise Presentation Mode's running Solde would
    // silently disagree with Chronological Mode's for any supplier with a
    // nonzero opening balance. UI/interactions here are unchanged.
    let balance = selected?.opening_balance || 0
    entries.forEach(e => { balance += e.debit - e.credit; e.solde = balance })
    return { entries, finalBalance: balance }
  }

  // ── PRESENTATION ORDER PERSISTENCE ──
  async function savePresentationOrder(newOrder) {
    setPresentationOrder(newOrder)
    if (!selected?.id) return
    await supabase.from('gasoil_fournisseurs').update({ presentation_order: newOrder }).eq('id', selected.id)
  }

  function handlePresentationReorder(fromIdx, toIdx, displayEntries) {
    if (fromIdx === null || fromIdx === toIdx) return

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

  // ── PRINT: ROUTER (chrono vs presentation, same pattern as printClient) ──
  function printFournisseur() {
    if (stmtMode === 'presentation') { printPresentationFournisseur(); return }
    if (!selected) return
    const accent = '#f97316'
    const printDate = printGeneratedDate()
    const periode = filterType === 'all' ? 'Toutes dates' : `${fmtDate(from)} → ${fmtDate(to)}`
    const rows = (openingBalance !== 0 ? [{
      date: from, type: 'opening', label: "Ancien Solde", debit: 0, credit: 0, camion: '—', bon: '—', note: '', solde: openingBalance,
    }] : []).concat(displayLedger).map(e => {
      const isPurchase = e.type === 'purchase'
      const isOpening = e.type === 'opening'
      return `<tr${isOpening ? ' style="background:#fafafa"' : ''}>
      <td class="m2" style="white-space:nowrap">${isOpening ? '—' : fmtDate(e.date)}</td>
      <td class="opn"${isOpening ? ' style="font-style:italic"' : ''}>${e.label}</td>
      <td class="m2">${e.camion}</td>
      <td class="m2">${e.bon}</td>
      <td class="r" style="color:#0f172a;font-size:14.5px">${isPurchase && e.qte ? `<b>${fmtD(e.qte)} L</b>` : '—'}</td>
      <td class="r" style="color:#0f172a;font-size:14.5px">${isPurchase && e.qte ? `<b>${fmtMoney(e.prixUnitaire)} DH</b>` : '—'}</td>
      <td class="r" style="color:${accent}">${e.debit ? `<b>+ ${fmtMoney(e.debit)}</b>` : '—'}</td>
      <td class="r" style="color:#16a34a">${e.credit ? `<b>− ${fmtMoney(e.credit)}</b>` : '—'}</td>
      <td class="r" style="font-weight:800;color:${e.solde>=0?'#dc2626':'#16a34a'}">${e.solde>=0?'+ ':'− '}${fmtMoney(Math.abs(e.solde))}</td>
    </tr>`
    }).join('')

    const truckRows = truckSummary.map(t => `<tr>
      <td class="m">${t.camion}</td>
      <td class="r">${t.fuelCount || '—'}</td>
      <td class="r">${fmtD(t.fuelLitres)} L</td>
      <td class="r">${fmtMoney(t.fuelAmount)} DH</td>
      <td class="r">${t.adblueCount || '—'}</td>
      <td class="r">${t.adblueLitres > 0 ? `${fmtD(t.adblueLitres)} L` : '—'}</td>
      <td class="r">${t.adblueAmount > 0 ? `${fmtMoney(t.adblueAmount)} DH` : '—'}</td>
    </tr>`).join('')

    openPrintWindow(`<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Fournisseur Carburant — ${selected.nom}</title>
<style>
${printBaseCss(accent)}
/* ── Tighter horizontal spacing + heavier, darker text for the ledger
   table only — makes better use of page width and improves readability
   without touching printBaseCss (shared by every other statement page). ── */
.bdy table td, .bdy table th { padding-left: 9px; padding-right: 9px; }
.m2 { color: #1e293b; font-size: 13.5px; font-weight: 600; }
.opn { font-size: 13.5px; font-weight: 700; color: #1e293b; }
</style></head><body>
${printHeader({ date: printDate })}
${entityCard({
  avatarText: '⛽',
  name: selected.nom,
  metaHtml: `<strong>Fournisseur Carburant</strong> &nbsp;·&nbsp; <strong>Solde dû:</strong> ${fmtMoney(soldeDuNet)} DHS &nbsp;·&nbsp; <strong>Période:</strong> ${periode}`,
})}
<div class="bdy">
<div class="sec-title">Relevé Chronologique</div>
<table>
  <thead><tr><th>Date</th><th>Opération</th><th>Camion</th><th>N° BON</th><th class="r">Litres</th><th class="r">Prix U.</th><th class="r">Débit (+)</th><th class="r">Crédit (−)</th><th class="r">Solde</th></tr></thead>
  <tbody>${rows||'<tr><td colspan="9" style="text-align:center;color:#aaa">Aucune opération</td></tr>'}</tbody>
</table>
<div class="sec-title" style="margin-top:20px">Résumé</div>
<table style="width:100%;border-collapse:collapse">
  <tbody>
    <tr><td style="padding:6px 4px;font-size:12px;color:#374151">Total Litres Gasoil</td><td style="padding:6px 4px;text-align:right;font-family:'Courier New',monospace;font-weight:700">${fmt(totalFuelLitres)} L</td></tr>
    ${totalAdblueLitres > 0 ? `<tr><td style="padding:6px 4px;font-size:12px;color:#374151">Total Litres AdBlue</td><td style="padding:6px 4px;text-align:right;font-family:'Courier New',monospace;font-weight:700">${fmt(totalAdblueLitres)} L</td></tr>` : ''}
  </tbody>
</table>
<div class="sec-title" style="margin-top:16px">Calcul du Solde à Payer</div>
<table style="width:100%;border-collapse:collapse">
  <tbody>
    <tr><td style="padding:6px 4px;font-size:12px;color:#374151">Ancien Solde <span style="color:#94a3b8">(avant la période)</span></td><td style="padding:6px 4px;text-align:right;font-family:'Courier New',monospace;font-weight:700">${ancienSolde>=0?'+ ':'− '}${fmtMoney(Math.abs(ancienSolde))} DHS</td></tr>
    <tr><td style="padding:6px 4px;font-size:12px;color:#374151">Achats de la période</td><td style="padding:6px 4px;text-align:right;font-family:'Courier New',monospace;font-weight:700;color:${accent}">+ ${fmtMoney(totalAchats)} DHS</td></tr>
    <tr style="border-bottom:1.5px solid #cbd5e1"><td style="padding:6px 4px;font-size:12px;color:#374151">Paiements de la période</td><td style="padding:6px 4px;text-align:right;font-family:'Courier New',monospace;font-weight:700;color:#16a34a">− ${fmtMoney(totalPaiements)} DHS</td></tr>
  </tbody>
</table>
${fuelDiscount > 0 ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:7px 12px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:6px">
  <span style="font-size:10.5px;color:#64748b;font-style:italic">ℹ Remise Carburant (période) — indicatif, non déduite du solde</span>
  <span style="font-size:12px;color:#64748b;font-family:'Courier New',monospace;font-weight:700">${fmtMoney(fuelDiscount)} DHS</span>
</div>` : ''}
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding:11px 18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px">
  <div>
    <div style="font-size:11.5px;font-weight:700;color:#9a3412">= SOLDE À PAYER</div>
    <div style="font-size:9.5px;color:#c2703d;margin-top:2px">${periode}</div>
  </div>
  <div style="font-size:21px;font-weight:900;color:${accent};line-height:1">${fmtMoney(soldeAPayer)}<span style="font-size:11px;font-weight:600;margin-left:3px;color:#9a3412">DHS</span></div>
</div>
<div class="sec-title" style="margin-top:20px">Résumé Consommation par Camion</div>
<table>
  <thead><tr><th>Camion</th><th class="r">Nb. Pleins Gasoil</th><th class="r">Litres Gasoil</th><th class="r">Montant Gasoil</th><th class="r">Nb. Pleins AdBlue</th><th class="r">Litres AdBlue</th><th class="r">Montant AdBlue</th></tr></thead>
  <tbody>${truckRows||'<tr><td colspan="7" style="text-align:center;color:#aaa">Aucune opération</td></tr>'}</tbody>
  <tfoot><tr>
    <td>TOTAL</td>
    <td style="text-align:right">${truckSummaryTotals.fuelCount || '—'}</td>
    <td style="text-align:right">${fmtD(truckSummaryTotals.fuelLitres)} L</td>
    <td style="text-align:right">${fmtMoney(truckSummaryTotals.fuelAmount)} DH</td>
    <td style="text-align:right">${truckSummaryTotals.adblueCount || '—'}</td>
    <td style="text-align:right">${truckSummaryTotals.adblueLitres > 0 ? `${fmtD(truckSummaryTotals.adblueLitres)} L` : '—'}</td>
    <td style="text-align:right">${truckSummaryTotals.adblueAmount > 0 ? `${fmtMoney(truckSummaryTotals.adblueAmount)} DH` : '—'}</td>
  </tr></tfoot>
</table>
${printFooter(printDate)}
</div></body></html>`)
  }

  // ── PRINT: PRESENTATION MODE — visually identical to the chronological
  // print (same accent, header, cards, table style, typography, footer):
  // the only differences are (1) it prints only the presentation selection
  // (or the full presentation order when nothing is selected) and (2) it
  // keeps a Report carry-forward row when the selection doesn't start at
  // the top. The final SOLDE À PAYER (selectedSoldeAPayer, below) is always
  // exactly the last printed row's own solde from buildPresentationLedger
  // (untouched) — never computed independently. The Résumé's breakdown
  // (Ancien Solde + Achats − Paiements) reproduces that same arithmetic, so
  // the two can never disagree; Remise is shown purely as context. ──
  function printPresentationFournisseur() {
    if (!selected) return
    const pLedger = buildPresentationLedger()
    const isSelectionPrint = presSelectedRows.size > 0
    const firstSelIdxInFull = isSelectionPrint ? pLedger.entries.findIndex(e => presSelectedRows.has(eKey(e))) : 0
    const pEntries = isSelectionPrint
      ? pLedger.entries.filter(e => presSelectedRows.has(eKey(e)))
      : pLedger.entries

    let selectionCarryForward = null
    if (isSelectionPrint && firstSelIdxInFull > 0) {
      selectionCarryForward = pLedger.entries[firstSelIdxInFull - 1].solde
    }

    const accent = '#f97316'
    const printDate = printGeneratedDate()

    // ── Fuel Discount summary — purchase rows only, payments contribute 0,
    // same litres × remiseRate formula used everywhere else in the app.
    const selectedAchats       = pEntries.reduce((s, e) => s + (e.debit || 0), 0)
    const selectedPaiements    = pEntries.reduce((s, e) => s + (e.credit || 0), 0)
    const selectedFuelLitres   = pEntries.filter(e => e.type === 'purchase').reduce((s, e) => s + (e.qte || 0), 0)
    const selectedFuelDiscount = Math.round(selectedFuelLitres * remiseRate * 100) / 100

    // ── ANCIEN SOLDE — the true balance immediately before the printed rows
    // (in presentation order): the account's opening_balance when printing
    // from the top, or selectionCarryForward's own raw solde when printing
    // a partial selection that doesn't start at the top. Not discount-
    // adjusted — the ledger never nets the fuel discount, so neither does
    // this. ──
    const ancienSolde = firstSelIdxInFull > 0 ? selectionCarryForward : (selected?.opening_balance || 0)

    // ── SOLDE À PAYER — the ledger IS the source of truth: always exactly
    // the last printed row's own solde (via buildPresentationLedger,
    // untouched), never computed independently. ──
    const selectedSoldeAPayer = pEntries.length > 0 ? pEntries[pEntries.length - 1].solde : pLedger.finalBalance

    const reportRowHtml = selectionCarryForward !== null ? (() => {
      const cfSign = selectionCarryForward >= 0 ? '+ ' : '− '
      const cfAmt = fmtMoney(Math.abs(selectionCarryForward))
      return `<tr style="background:#fffbeb"><td class="m" style="white-space:nowrap;color:#92400e">—</td><td style="font-size:12px;font-weight:600;color:#92400e">Report</td><td class="m">—</td><td class="m">—</td><td class="r" style="color:#9ca3af">—</td><td class="r" style="color:#9ca3af">—</td><td class="r" style="color:#9ca3af">—</td><td class="r" style="color:#9ca3af">—</td><td class="r" style="color:#9ca3af">—</td><td class="r" style="color:#9ca3af">—</td><td class="r" style="font-weight:900;font-size:15.5px;color:#b45309;white-space:nowrap">${cfSign}${cfAmt}</td></tr>`
    })() : ''

    const rows = reportRowHtml + pEntries.map(e => {
      const isPurchase = e.type === 'purchase'
      const isMoved = !!presentationOrder[eKey(e)]
      return `<tr>
      <td class="m" style="white-space:nowrap">${fmtDate(e.date)}${isMoved?`<br><span style="font-size:9px;font-weight:700;color:${accent}">↕ Déplacé</span>`:''}</td>
      <td>${e.label}</td>
      <td class="m">${e.camion}</td>
      <td class="m">${e.bon}</td>
      <td class="r" style="color:#0f172a;font-size:14px">${isPurchase && e.qte ? `<b>${fmtD(e.qte)} L</b>` : '—'}</td>
      <td class="r" style="color:#0f172a;font-size:14px">${isPurchase && e.qte ? `<b>${fmtMoney(e.prixUnitaire)} DH</b>` : '—'}</td>
      <td class="r" style="color:#0f172a;font-size:14px">${isPurchase && e.adblueQte ? `<b>${fmtD(e.adblueQte)} L</b>` : '—'}</td>
      <td class="r" style="color:#0f172a;font-size:14px">${isPurchase && e.adblueQte ? `<b>${fmtMoney(e.adbluePrixUnitaire)} DH</b>` : '—'}</td>
      <td class="r" style="color:${accent}">${e.debit ? `<b>+ ${fmtMoney(e.debit)}</b>` : '—'}</td>
      <td class="r" style="color:#16a34a">${e.credit ? `<b>− ${fmtMoney(e.credit)}</b>` : '—'}</td>
      <td class="r" style="font-weight:800;color:${e.solde>=0?'#dc2626':'#16a34a'}">${e.solde>=0?'+ ':'− '}${fmtMoney(Math.abs(e.solde))}</td>
    </tr>`
    }).join('')

    openPrintWindow(`<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Relevé Présentation — ${selected.nom}</title>
<style>
${printBaseCss(accent)}
</style></head><body>
${printHeader({ date: printDate })}
${entityCard({
  avatarText: '⛽',
  name: selected.nom,
  metaHtml: `<strong>Fournisseur Carburant</strong> &nbsp;·&nbsp; <strong>Vue:</strong> Présentation${isSelectionPrint ? ` — Sélection (${pEntries.length})` : ''}`,
})}
<div class="bdy">
<div class="sec-title">Relevé Présentation${isSelectionPrint ? ` — Sélection (${pEntries.length})` : ''}</div>
<table>
  <thead><tr><th>Date</th><th>Opération</th><th>Camion</th><th>N° BON</th><th class="r">Litres Gasoil</th><th class="r">Prix U. Gasoil</th><th class="r">Litres AdBlue</th><th class="r">Prix U. AdBlue</th><th class="r">Débit (+)</th><th class="r">Crédit (−)</th><th class="r">Solde</th></tr></thead>
  <tbody>${rows||'<tr><td colspan="11" style="text-align:center;color:#aaa">Aucune opération</td></tr>'}</tbody>
</table>
<div class="sec-title" style="margin-top:20px">Calcul du Solde à Payer</div>
<table style="width:100%;border-collapse:collapse">
  <tbody>
    <tr><td style="padding:6px 4px;font-size:12px;color:#374151">Ancien Solde <span style="color:#94a3b8">(avant la sélection)</span></td><td style="padding:6px 4px;text-align:right;font-family:'Courier New',monospace;font-weight:700">${ancienSolde>=0?'+ ':'− '}${fmtMoney(Math.abs(ancienSolde))} DHS</td></tr>
    <tr><td style="padding:6px 4px;font-size:12px;color:#374151">Achats</td><td style="padding:6px 4px;text-align:right;font-family:'Courier New',monospace;font-weight:700;color:${accent}">+ ${fmtMoney(selectedAchats)} DHS</td></tr>
    <tr style="border-bottom:1.5px solid #cbd5e1"><td style="padding:6px 4px;font-size:12px;color:#374151">Paiements</td><td style="padding:6px 4px;text-align:right;font-family:'Courier New',monospace;font-weight:700;color:#16a34a">− ${fmtMoney(selectedPaiements)} DHS</td></tr>
  </tbody>
</table>
${selectedFuelDiscount > 0 ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:7px 12px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:6px">
  <span style="font-size:10.5px;color:#64748b;font-style:italic">ℹ Remise Carburant — indicatif, non déduite du solde</span>
  <span style="font-size:12px;color:#64748b;font-family:'Courier New',monospace;font-weight:700">${fmtMoney(selectedFuelDiscount)} DHS</span>
</div>` : ''}
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding:11px 18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px">
  <div>
    <div style="font-size:11.5px;font-weight:700;color:#9a3412">= SOLDE À PAYER</div>
    <div style="font-size:9.5px;color:#c2703d;margin-top:2px">${isSelectionPrint ? `${pEntries.length} opération${pEntries.length!==1?'s':''} sélectionnée${pEntries.length!==1?'s':''}` : 'Vue Présentation'}</div>
  </div>
  <div style="font-size:21px;font-weight:900;color:${accent};line-height:1">${fmtMoney(selectedSoldeAPayer)}<span style="font-size:11px;font-weight:600;margin-left:3px;color:#9a3412">DHS</span></div>
</div>
${printFooter(printDate)}
</div></body></html>`)
  }

  // ── RENDER: PRESENTATION TABLE — same interaction model as
  // renderPresentationTable() in pages/clients/index.js: drag handle reorder,
  // click/shift-click/drag-select multi-select, floating action toolbar,
  // undo/reset. Adapted columns: Débit/Crédit instead of Qté/Prix, no
  // voyage-group rowspan merging (fuel ledger rows are already flat). ──
  function renderPresentationTable() {
    const presLedger     = buildPresentationLedger()
    const displayEntries = presLedger.entries
    const thS = { background:'#ede9fe', color:'#5b21b6', borderBottom:'2px solid #ddd6fe', whiteSpace:'nowrap', padding:'9px 12px', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', userSelect:'none' }

    const selectedEntries = displayEntries.filter(e => presSelectedRows.has(eKey(e)))
    const selectedTotal   = selectedEntries.reduce((s, e) => s + (e.debit - e.credit), 0)
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
        {/* STATIC TOOLBAR — drag hint + undo/reset */}
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 16px',borderBottom:'1px solid #f1f5f9',background:'#faf5ff',flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:'#7c3aed',flex:1,minWidth:0}}>
            ↕ Glissez les lignes pour réorganiser · Cliquez pour sélectionner · Maj+Clic pour une plage
          </span>
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
                <span>Total : <strong>{selectedTotal >= 0 ? '+' : '−'} {fmtMoney(Math.abs(selectedTotal))} DHS</strong></span>
                <span>Solde : <strong>{fmtMoney(selectedSolde)} DHS</strong></span>
              </div>
            </div>
            <button onClick={() => { printPresentationFournisseur(); setPresSelectedRows(new Set()) }}
              style={{padding:'5px 12px',borderRadius:6,border:'none',background:'#fff',color:'#1e3a5f',fontWeight:700,fontSize:11,cursor:'pointer',whiteSpace:'nowrap'}}>
              🖨️ Imprimer
            </button>
            <button onClick={() => { printPresentationFournisseur(); setPresSelectedRows(new Set()) }}
              style={{padding:'5px 12px',borderRadius:6,border:'none',background:'#c7d2fe',color:'#1e40af',fontWeight:700,fontSize:11,cursor:'pointer',whiteSpace:'nowrap'}}>
              📄 PDF
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
                  {l:'Date',r:false},{l:'Opération',r:false},{l:'Camion',r:false},{l:'Bon / Mode',r:false},
                  {l:'Note',r:false},{l:'Débit (+)',r:true},{l:'Crédit (−)',r:true},{l:'Solde',r:true}
                ].map((col,ci) => (
                  <th key={ci} style={{...thS,textAlign:col.r?'right':'left'}}>{col.l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayEntries.map((e, i) => {
                const isSelected   = presSelectedRows.has(eKey(e))
                const isDragging   = presDragFrom === i
                const isDropTarget = presDragOver === i && presDragFrom !== null && presDragFrom !== i
                const isMoved      = !!presentationOrder[eKey(e)]
                const typeRowBg    = e.type === 'payment' ? '#f0fdf4' : undefined
                const bandBg       = i % 2 === 1 ? '#f7f9fb' : '#ffffff'
                const rowBg        = isSelected ? '#ede9fe' : typeRowBg || bandBg
                const bdr          = { border:'1px solid #f1f5f9' }

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
                    {/* OPÉRATION */}
                    <td className="td" style={{...bdr,padding:'10px 12px'}}>
                      <span style={{
                        background: e.type==='purchase' ? '#fff7ed' : '#dcfce7',
                        color: e.type==='purchase' ? '#c2410c' : '#15803d',
                        fontWeight:700,fontSize:10,padding:'2px 7px',borderRadius:3,
                        border:`1px solid ${e.type==='purchase' ? '#fed7aa' : '#bbf7d0'}`,whiteSpace:'nowrap',
                      }}>
                        {e.type==='purchase' ? '⛽' : '💸'} {e.label}
                      </span>
                      {e.type === 'purchase' && (e.qte > 0 || e.adblueQte > 0) && (
                        <div style={{fontSize:10,color:'#9ca3af',marginTop:3,lineHeight:1.3}}>
                          {e.qte > 0 && <div>{fmtD(e.qte)} L × {fmtMoney(e.prixUnitaire)} DH/L</div>}
                          {e.adblueQte > 0 && <div>AdBlue: {fmtD(e.adblueQte)} L × {fmtMoney(e.adbluePrixUnitaire)} DH/L</div>}
                        </div>
                      )}
                    </td>
                    {/* CAMION */}
                    <td className="td text-xs" style={{...bdr,color:'#64748b',whiteSpace:'nowrap',padding:'10px 12px'}}>{e.camion}</td>
                    {/* BON / MODE */}
                    <td className="td text-xs" style={{...bdr,color:'#64748b',whiteSpace:'nowrap',padding:'10px 12px'}}>{e.bon}</td>
                    {/* NOTE */}
                    <td className="td text-xs" style={{...bdr,maxWidth:'150px',wordBreak:'break-word',padding:'10px 12px',
                      color: e.note ? '#374151' : '#9ca3af', fontStyle: e.note ? 'normal' : 'italic', fontWeight: e.note ? 600 : 400}}>
                      {e.note || '—'}
                    </td>
                    {/* DÉBIT */}
                    <td className="td text-right" style={{...bdr,fontSize:13,fontWeight:700,whiteSpace:'nowrap',padding:'10px 12px',color:'#c2410c'}}>
                      {e.debit ? `+ ${fmtMoney(e.debit)}` : <span style={{color:'#9ca3af'}}>—</span>}
                    </td>
                    {/* CRÉDIT */}
                    <td className="td text-right" style={{...bdr,fontSize:13,fontWeight:700,whiteSpace:'nowrap',padding:'10px 12px',color:'#16a34a'}}>
                      {e.credit ? `− ${fmtMoney(e.credit)}` : <span style={{color:'#9ca3af'}}>—</span>}
                    </td>
                    {/* SOLDE */}
                    <td className="td text-right" style={{...bdr,fontSize:15,fontWeight:900,whiteSpace:'nowrap',padding:'10px 14px',
                      color: e.solde >= 0 ? '#dc2626' : '#16a34a', letterSpacing:'-0.2px'}}>
                      {e.solde >= 0 ? `+ ${fmtMoney(e.solde)}` : `− ${fmtMoney(Math.abs(e.solde))}`}
                    </td>
                  </tr>
                )
                if (i === firstSelIdx && carryForwardBalance !== null) {
                  const cfSign = carryForwardBalance >= 0 ? '+ ' : '− '
                  const cfAmt = fmtMoney(Math.abs(carryForwardBalance))
                  return (
                    <Fragment key={`rf-${eKey(e)}`}>
                      <tr style={{background:'#fef3c7',cursor:'default'}}>
                        <td colSpan={9} style={{border:'1px solid #fde68a',padding:'10px 12px',color:'#92400e',fontWeight:700,fontSize:12}}>
                          <span style={{background:'#fef3c7',color:'#92400e',fontWeight:700,fontSize:10,padding:'2px 7px',borderRadius:3,border:'1px solid #fde68a',marginRight:8}}>Report</span>
                          Solde reporté avant la sélection
                        </td>
                        <td className="td text-right font-black" style={{border:'1px solid #fde68a',color:'#b45309',fontSize:15,whiteSpace:'nowrap',padding:'10px 14px'}}>
                          {cfSign}{cfAmt}
                        </td>
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
                  <td colSpan={9} style={{padding:'11px 12px',background:'#f5f3ff',color:'#5b21b6',fontWeight:700,fontSize:13,borderTop:'1px solid #ddd6fe',borderBottom:'1px solid #ddd6fe',borderLeft:'1px solid #ddd6fe',borderRadius:'0 0 0 8px'}}>
                    Solde final
                  </td>
                  <td style={{padding:'11px 14px',background:'#f5f3ff',fontSize:17,fontWeight:700,color: presLedger.finalBalance >= 0 ? '#dc2626' : '#16a34a',textAlign:'right',borderTop:'1px solid #ddd6fe',borderBottom:'1px solid #ddd6fe',borderRight:'1px solid #ddd6fe',borderRadius:'0 0 8px 0',letterSpacing:'-0.2px'}}>
                    {presLedger.finalBalance >= 0 ? '+ ' : '− '}{fmtMoney(Math.abs(presLedger.finalBalance))} <span style={{fontSize:12,fontWeight:600}}>DHS</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    )
  }

  const filtered    = fournisseurs.filter(f => !search || f.nom.toLowerCase().includes(search.toLowerCase()))
  const totalDettes = filtered.reduce((s, f) => s + (f.solde || 0), 0)

  return (
    <Layout title="Fournisseurs Carburant" subtitle="Achats et paiements fournisseurs carburant (Petrom, Afriquia, Winxo, Shell...)">
      <div className={`${isMobile ? '' : 'grid grid-cols-3 gap-6'}`}>

        {/* LEFT */}
        <div className="col-span-1">
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-bold text-gray-900">⛽ Fournisseurs Carburant</div>
                <div className="text-xs text-red-500 mt-0.5">Total dû: <b>{fmtMoney(totalDettes)} DHS</b></div>
              </div>
              {admin && <button onClick={()=>setShowAdd(!showAdd)} className="btn-primary text-xs px-3 py-1.5" style={{background:'#f97316'}}>+ Fournisseur</button>}
            </div>
            {showAdd && (
              <form onSubmit={addFournisseur} className="flex gap-2 mb-3">
                <input className="input flex-1 text-xs" placeholder="ex: Petrom, Afriquia, Winxo..." value={newNom} onChange={e=>setNewNom(e.target.value)} required autoFocus />
                <button type="submit" className="btn-primary text-xs px-3" style={{background:'#f97316'}}>✓</button>
                <button type="button" onClick={()=>setShowAdd(false)} className="btn-secondary text-xs px-2">✕</button>
              </form>
            )}
            <input className="input text-sm mb-3" placeholder="🔍 Rechercher..." value={search} onChange={e=>setSearch(e.target.value)} />
            {loading ? <div className="text-center py-6 text-gray-400 text-sm">Chargement...</div> : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {filtered.map(f => (
                  <div key={f.id} onClick={()=>selectFournisseur(f)}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${selected?.id===f.id?'bg-orange-50 border border-orange-200':'hover:bg-gray-50 border border-transparent'}`}>
                    <div className="font-semibold text-sm text-gray-900">{f.nom}</div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${(f.solde||0)>0?'text-red-600':'text-green-600'}`}>{fmtMoney(f.solde||0)} DHS</span>
                      {admin && <button onClick={e=>{e.stopPropagation();deleteFournisseur(f.id)}} className="text-red-300 hover:text-red-500 text-xs">✕</button>}
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && <div className="text-center py-6 text-gray-400 text-sm">Aucun fournisseur carburant</div>}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="col-span-2">
          {!selected ? (
            <div className="card text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">⛽</div>
              <div className="font-semibold">Sélectionnez un fournisseur</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="card">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-black" style={{background:'#f97316'}}>
                      {selected.nom[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-xl text-gray-900">{selected.nom}</div>
                      <div className="text-xs text-orange-700 font-semibold mt-0.5">Fournisseur Carburant</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {admin && (
                      <button onClick={() => openOpeningBalance(selected)} className="btn-secondary text-xs" style={{background:'#fef3c7',color:'#92400e',borderColor:'#fde68a'}}>
                        🏦 Solde initial
                      </button>
                    )}
                    <button onClick={printFournisseur} className="btn-primary text-xs px-3 py-1.5" style={{background:'#f97316'}}>🖨️ PDF</button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="text-center p-3 rounded-xl bg-orange-50 border border-orange-100">
                    <div className="text-xs text-orange-600 font-semibold">Achats période</div>
                    <div className="font-bold text-orange-700 text-lg">{fmtMoney(totalAchats)} DHS</div>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-green-50 border border-green-100">
                    <div className="text-xs text-green-600 font-semibold">Payé période</div>
                    <div className="font-bold text-green-700 text-lg">{fmtMoney(totalPaiements)} DHS</div>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-red-50 border border-red-100">
                    <div className="text-xs text-red-600 font-semibold">Solde dû total</div>
                    <div className="font-bold text-red-700 text-lg">{fmtMoney(soldeDuNet)} DHS</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4 flex-wrap">
                  {['all','month','custom'].map(t => (
                    <button key={t} onClick={()=>setFilterType(t)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold border ${filterType===t?'text-white border-transparent':'bg-white text-gray-600 border-gray-200'}`}
                      style={filterType===t?{background:'#f97316'}:{}}>
                      {t==='all'?'Tout':t==='month'?'Ce mois':'Personnalisé'}
                    </button>
                  ))}
                  {filterType === 'custom' && (
                    <div className="flex gap-2 items-center">
                      <input type="date" className="input text-xs" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} />
                      <span className="text-gray-400 text-xs">→</span>
                      <input type="date" className="input text-xs" value={filterTo} onChange={e=>setFilterTo(e.target.value)} />
                    </div>
                  )}
                </div>
              </div>

              {loadingDetail ? <div className="card text-center py-8 text-gray-400">Chargement...</div> : (
                <div className="card" style={{padding:0,overflow:'hidden'}}>
                  {/* TOOLBAR — title + Chronologique/Présentation mode toggle */}
                  <div className="flex items-center justify-between flex-wrap gap-2" style={{padding:'14px 16px 10px'}}>
                    <h3 className="font-bold text-gray-900" style={{fontSize:14}}>
                      {stmtMode === 'presentation' ? '↕ Relevé Présentation' : '📒 Relevé Chronologique'}
                      <span className="text-gray-400 font-normal text-sm ml-2">
                        ({stmtMode === 'presentation' ? buildPresentationLedger().entries.length : displayLedger.length})
                      </span>
                    </h3>
                    <div style={{display:'flex',borderRadius:6,overflow:'hidden',border:'1px solid #e2e8f0',flexShrink:0}}>
                      <button
                        onClick={()=>setStmtMode('chrono')}
                        style={{padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer',border:'none',
                          background: stmtMode==='chrono' ? '#f97316' : '#f8fafc',
                          color: stmtMode==='chrono' ? '#fff' : '#64748b', transition:'all 0.15s'}}>
                        Chronologique
                      </button>
                      <button
                        onClick={()=>setStmtMode('presentation')}
                        style={{padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer',border:'none',borderLeft:'1px solid #e2e8f0',
                          background: stmtMode==='presentation' ? '#7c3aed' : '#f8fafc',
                          color: stmtMode==='presentation' ? '#fff' : '#64748b', transition:'all 0.15s'}}>
                        ↕ Présentation
                      </button>
                    </div>
                  </div>

                  {stmtMode === 'presentation' ? renderPresentationTable() : (
                    <div style={{padding:'0 16px 16px'}}>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead><tr>
                            <th className="th">Date</th>
                            <th className="th">Opération</th>
                            <th className="th">Camion</th>
                            <th className="th">N° BON</th>
                            <th className="th text-right">Litres</th>
                            <th className="th text-right">Prix U.</th>
                            <th className="th text-right">Débit (+)</th>
                            <th className="th text-right">Crédit (−)</th>
                            <th className="th text-right">Solde</th>
                          </tr></thead>
                          <tbody>
                            {openingBalance !== 0 && (
                              <tr className="bg-gray-50">
                                <td className="td text-sm font-semibold text-gray-400">—</td>
                                <td className="td text-sm font-bold text-gray-700 italic">Ancien Solde</td>
                                <td className="td text-gray-400">—</td>
                                <td className="td text-gray-400">—</td>
                                <td className="td text-right text-gray-400">—</td>
                                <td className="td text-right text-gray-400">—</td>
                                <td className="td text-right text-gray-400">—</td>
                                <td className="td text-right text-gray-400">—</td>
                                <td className={`td text-right font-bold ${openingBalance>=0?'text-red-600':'text-green-600'}`}>
                                  {openingBalance>=0?'+ ':'− '}{fmtMoney(Math.abs(openingBalance))}
                                </td>
                              </tr>
                            )}
                            {displayLedger.map(e => (
                              <tr key={e.id} className={e.type==='purchase' ? 'hover:bg-orange-50' : 'hover:bg-green-50'}>
                                <td className="td text-sm font-semibold text-gray-700">{fmtDate(e.date)}</td>
                                <td className="td">
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${e.type==='purchase'?'bg-orange-100 text-orange-700':'bg-green-100 text-green-700'}`}>
                                    {e.type==='purchase' ? '⛽' : '💸'} {e.label}
                                  </span>
                                </td>
                                <td className="td text-sm font-medium text-gray-700">{e.camion}</td>
                                <td className="td text-sm font-medium text-gray-700">{e.bon}</td>
                                <td className="td text-right text-sm font-semibold text-gray-900">{e.type==='purchase' && e.qte ? `${fmtD(e.qte)} L` : <span className="text-gray-300 font-normal">—</span>}</td>
                                <td className="td text-right text-sm font-semibold text-gray-900">{e.type==='purchase' && e.qte ? `${fmtMoney(e.prixUnitaire)} DH` : <span className="text-gray-300 font-normal">—</span>}</td>
                                <td className="td text-right text-sm font-bold text-orange-700">{e.debit ? `+ ${fmtMoney(e.debit)}` : '—'}</td>
                                <td className="td text-right text-sm font-bold text-green-600">{e.credit ? `− ${fmtMoney(e.credit)}` : '—'}</td>
                                <td className={`td text-right font-bold ${e.solde>=0?'text-red-600':'text-green-600'}`}>
                                  {e.solde>=0?'+ ':'− '}{fmtMoney(Math.abs(e.solde))}
                                </td>
                              </tr>
                            ))}
                            {displayLedger.length === 0 && <tr><td colSpan={9} className="td text-center text-gray-400 py-8">Aucune opération pour cette période</td></tr>}
                          </tbody>
                          {displayLedger.length > 0 && (
                            <tfoot><tr>
                              <td className="tfoot-td" colSpan={6}>TOTAL période</td>
                              <td className="tfoot-td text-right text-orange-700">+ {fmtMoney(totalAchats)} DHS</td>
                              <td className="tfoot-td text-right text-green-700">− {fmtMoney(totalPaiements)} DHS</td>
                              <td className={`tfoot-td text-right ${closingBalance>=0?'text-red-600':'text-green-600'}`}>
                                {closingBalance>=0?'+ ':'− '}{fmtMoney(Math.abs(closingBalance))}
                              </td>
                            </tr></tfoot>
                          )}
                        </table>
                      </div>
                      {truckSummary.length > 0 && (
                        <div className="mt-5 pt-4 border-t border-gray-100">
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">🚚 Résumé Consommation par Camion</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead><tr>
                                <th className="th">Camion</th>
                                <th className="th text-right">Litres Gasoil</th>
                                <th className="th text-right">Montant Gasoil</th>
                                <th className="th text-right">Litres AdBlue</th>
                                <th className="th text-right">Montant AdBlue</th>
                              </tr></thead>
                              <tbody>
                                {truckSummary.map(t => (
                                  <tr key={t.camion}>
                                    <td className="td text-gray-700 font-semibold">{t.camion}</td>
                                    <td className="td text-right">{fmtD(t.fuelLitres)} L</td>
                                    <td className="td text-right font-bold text-orange-700">{fmtMoney(t.fuelAmount)} DHS</td>
                                    <td className="td text-right">{t.adblueLitres > 0 ? `${fmtD(t.adblueLitres)} L` : <span className="text-gray-300">—</span>}</td>
                                    <td className="td text-right font-bold text-blue-700">{t.adblueAmount > 0 ? `${fmtMoney(t.adblueAmount)} DHS` : <span className="text-gray-300">—</span>}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot><tr>
                                <td className="tfoot-td">TOTAL</td>
                                <td className="tfoot-td text-right">{fmtD(truckSummaryTotals.fuelLitres)} L</td>
                                <td className="tfoot-td text-right text-orange-700">{fmtMoney(truckSummaryTotals.fuelAmount)} DHS</td>
                                <td className="tfoot-td text-right">{truckSummaryTotals.adblueLitres > 0 ? `${fmtD(truckSummaryTotals.adblueLitres)} L` : '—'}</td>
                                <td className="tfoot-td text-right text-blue-700">{truckSummaryTotals.adblueAmount > 0 ? `${fmtMoney(truckSummaryTotals.adblueAmount)} DHS` : '—'}</td>
                              </tr></tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                      {ledger.length > 0 && (
                        <>
                          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="text-center p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                              <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Litres Gasoil</div>
                              <div className="font-bold text-gray-700 text-sm mt-0.5">{fmt(totalFuelLitres)} L</div>
                            </div>
                            {totalAdblueLitres > 0 && (
                              <div className="text-center p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                                <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Litres AdBlue</div>
                                <div className="font-bold text-gray-700 text-sm mt-0.5">{fmt(totalAdblueLitres)} L</div>
                              </div>
                            )}
                          </div>
                          <div className="mt-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Calcul du Solde à Payer</div>
                          <div className="mt-1.5 grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="text-center p-2.5 rounded-lg bg-gray-100 border border-gray-200">
                              <div className="text-[10px] text-gray-600 font-semibold uppercase tracking-wide">Ancien Solde</div>
                              <div className="font-bold text-gray-800 text-sm mt-0.5">{ancienSolde>=0?'+ ':'− '}{fmtMoney(Math.abs(ancienSolde))} DHS</div>
                            </div>
                            <div className="text-center p-2.5 rounded-lg bg-orange-50 border border-orange-100">
                              <div className="text-[10px] text-orange-600 font-semibold uppercase tracking-wide">Achats période</div>
                              <div className="font-bold text-orange-700 text-sm mt-0.5">+ {fmtMoney(totalAchats)} DHS</div>
                            </div>
                            <div className="text-center p-2.5 rounded-lg bg-green-50 border border-green-100">
                              <div className="text-[10px] text-green-600 font-semibold uppercase tracking-wide">Paiements période</div>
                              <div className="font-bold text-green-700 text-sm mt-0.5">− {fmtMoney(totalPaiements)} DHS</div>
                            </div>
                            <div className="text-center p-2.5 rounded-lg bg-red-50 border border-red-200">
                              <div className="text-[10px] text-red-600 font-semibold uppercase tracking-wide">= Solde à payer</div>
                              <div className="font-bold text-red-700 text-sm mt-0.5">{fmtMoney(soldeAPayer)} DHS</div>
                            </div>
                          </div>
                          {fuelDiscount > 0 && (
                            <div className="mt-2 flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-50 border border-dashed border-gray-200">
                              <span className="text-[10.5px] text-gray-500 italic">ℹ Remise Carburant (période) — indicatif, non déduite du solde</span>
                              <span className="text-xs text-gray-500 font-semibold">{fmtMoney(fuelDiscount)} DHS</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {openingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">🏦 Solde Initial</h2>
                <p className="text-xs text-gray-400 mt-0.5">{openingModal.nom}</p>
              </div>
              <button onClick={() => setOpeningModal(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={saveOpeningBalance} className="p-5 space-y-4">
              <div>
                <label className="label">Montant (DHS)</label>
                <input type="text" inputMode="decimal" className="input" placeholder="ex: 45000"
                  value={openingInput} onChange={e => setOpeningInput(e.target.value)}
                  required autoFocus />
                <p className="text-xs text-gray-400 mt-1">Le total dû à ce fournisseur avant cette app — source unique utilisée par le relevé chronologique et le mode présentation.</p>
              </div>
              {openingInput && (
                <div className="p-3 rounded-xl text-sm" style={{background:'#fffbeb', border:'1px solid #fde68a'}}>
                  <div className="font-bold text-amber-700 mb-1">🏦 Solde Initial</div>
                  <div className="text-gray-700">{openingModal.nom}</div>
                  <div className="text-xl font-bold text-amber-700">{fmtMoney(parseFloat(openingInput)||0)} DHS</div>
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
    </Layout>
  )
}
