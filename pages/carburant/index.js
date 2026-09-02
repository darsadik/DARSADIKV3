import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { fmt, fmtMoney } from '../../lib/utils'
import { periodRange } from '../../lib/camionPerformance'
import {
  buildFuelCycles, buildFleetFuelStats, enrichByCamion, buildFleetIntelligenceSummary, detectAlerts,
  detectMissingData, listMergeSuggestions, buildDataHealthScore,
} from '../../lib/services/fuelCycles'
import { buildVoyageKmFuelTimeline } from '../../lib/services/voyageKmFuel'
import { buildOdometerRows } from '../../lib/services/kilometrage'
import { DEFAULT_REMISE_CARBURANT_RATE } from '../../lib/services/profitability'
import { fetchRemiseCarburantRate } from '../../lib/services/settings'
import CycleCard from '../../components/carburant/CycleCard'
import CycleAnalysisModal from '../../components/carburant/CycleAnalysisModal'
import TruckHealthPanel from '../../components/carburant/TruckHealthPanel'
import Timeline from '../../components/carburant/Timeline'
import DataHealthHeader from '../../components/carburant/DataHealthHeader'
import SmartFilters from '../../components/carburant/SmartFilters'
import MissingDataPanel from '../../components/carburant/MissingDataPanel'
import MergeSuggestionsPanel from '../../components/carburant/MergeSuggestionsPanel'
import VoyageFixModal from '../../components/carburant/VoyageFixModal'
import GasoilFixModal from '../../components/carburant/GasoilFixModal'
import PeriodSelector from '../../components/carburant/PeriodSelector'
import TruckControlCard from '../../components/carburant/TruckControlCard'
import KmEditPopover from '../../components/carburant/KmEditPopover'

const SEVERITY_META = {
  error:   { emoji: '🔴', label: 'Critique',    bg: 'bg-red-50',   text: 'text-red-700',   ring: 'ring-red-100' },
  warning: { emoji: '🟡', label: 'À surveiller', bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-100' },
  info:    { emoji: '🔵', label: 'Info',         bg: 'bg-blue-50',  text: 'text-blue-700',  ring: 'ring-blue-100' },
}

function AlertRow({ a }) {
  const m = SEVERITY_META[a.severity] || SEVERITY_META.info
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg ${m.bg} ${m.text} ring-1 ring-inset ${m.ring} text-xs`}>
      <span>{m.emoji}</span>
      <span className="flex-1">{a.message}</span>
    </div>
  )
}

function IntelWidget({ label, value, sub, tone }) {
  return (
    <div className={`stat-card border ${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

const DEFAULT_FILTERS = {
  camionId: '', periodKind: 'tous', from: '', to: '', status: '', thresholdPct: 15,
  issues: false, missingKm: false, missingRefills: false, mergeSuggestions: false, openCycles: false,
}

// Display-layer only — never refetches, never rebuilds the engine output.
// Cycle-level filters (period/status/openCycles/issues) narrow which cycles
// show on a truck's card; truck-level filters (missingKm/missingRefills/
// mergeSuggestions) narrow which trucks are shown at all. Unchanged from
// before the redesign — this only ever runs on the propre-filtered data now.
function cycleMatchesFilters(c, filters) {
  if (filters.status) {
    const st = c.evaluation?.status || (c.statut === 'en_cours' ? 'in_progress' : 'normal')
    if (st !== filters.status) return false
  }
  if (filters.openCycles && c.statut !== 'en_cours') return false
  if (filters.issues) {
    const st = c.evaluation?.status
    if (!st || st === 'normal' || st === 'excellent' || st === 'in_progress') return false
  }
  if (filters.from && c.dateFin && c.dateFin < filters.from) return false
  if (filters.to && c.dateDebut > filters.to) return false
  return true
}

// Per-voyage/per-truck weighted aggregation — the ONLY correct way to reduce
// several voyages' own already-computed litersLinked/distance/fuelCost
// (lib/services/voyageKmFuel.js, itself the corrected fuelAllocation.js
// engine's per-voyage share) into one period figure: sum litres, sum km,
// THEN divide — never average each voyage's own L/100km. A voyage only
// enters the litres/km ratio when it has a genuine measured allocation
// (litersLinked > 0 and a known distance); a still-open period's voyages
// never dilute it (§ never fabricate).
function summarizePeriod(rows) {
  const measured = rows.filter(r => r.litersLinked !== null && r.litersLinked > 0 && r.distance > 0)
  const totalKm = rows.reduce((s, r) => s + (r.distance || 0), 0)
  const totalLitres = measured.reduce((s, r) => s + r.litersLinked, 0)
  const measuredKm = measured.reduce((s, r) => s + r.distance, 0)
  const avgL100km = measuredKm > 0 ? (totalLitres / measuredKm) * 100 : null
  const totalCost = rows.reduce((s, r) => s + (r.fuelCost || 0), 0)
  const avgDhKm = totalKm > 0 ? totalCost / totalKm : null
  const nbPending = rows.filter(r => r.status === 'pending_measurement').length
  return { totalKm, totalLitres, avgL100km, totalCost, avgDhKm, nbMeasured: measured.length, nbPending, total: rows.length }
}

export default function CarburantCycles() {
  const [camions, setCamions] = useState([])
  const [gasoil, setGasoil] = useState([])
  const [voyages, setVoyages] = useState([])
  const [voyageGasoilRows, setVoyageGasoilRows] = useState([])
  const [livraisons, setLivraisons] = useState([])
  const [remiseRate, setRemiseRate] = useState(DEFAULT_REMISE_CARBURANT_RATE)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [analyzing, setAnalyzing] = useState(null) // { cycle, camionPlaque }
  const [fixingVoyageId, setFixingVoyageId] = useState(null)
  const [fixingGasoilId, setFixingGasoilId] = useState(null)
  const [period, setPeriod] = useState(() => periodRange('mois'))
  const [editingKmRow, setEditingKmRow] = useState(null)
  const [showValidationTools, setShowValidationTools] = useState(false)

  useEffect(() => { loadAll(); fetchRemiseCarburantRate().then(setRemiseRate) }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ca }, { data: ga }, { data: vo }, { data: vgl }, { data: li }] = await Promise.all([
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('gasoil').select('*').order('date', { ascending: true }),
      supabase.from('voyages')
        .select('id,reference,date_depart,camion_id,camion_plaque,destination,statut,km_depart,km_arrivee,fuel_mode,manual_distance_km,manual_cost_per_km,manual_fuel_cost,deleted_at')
        .order('date_depart', { ascending: true }),
      supabase.from('voyage_gasoil').select('id,voyage_id,gasoil_id,is_split'),
      supabase.from('voyage_livraisons').select('voyage_id, client_nom'),
    ])
    setCamions(ca || [])
    setGasoil(ga || [])
    setVoyages(vo || [])
    setVoyageGasoilRows(vgl || [])
    setLivraisons(li || [])
    setLoading(false)
  }

  // ── /carburant is Camions Propre only (§2) — loué trucks are excluded
  // BEFORE any engine call, not just hidden in the UI: their gasoil/voyages
  // rows never reach buildFuelCycles/buildVoyageKmFuelTimeline, so they can
  // never contribute to any total, average, or KPI on this page.
  const propreCamions = useMemo(() => camions.filter(c => c.type_camion !== 'loue'), [camions])
  const propreCamionIds = useMemo(() => new Set(propreCamions.map(c => c.id)), [propreCamions])
  const gasoilPropre = useMemo(() => gasoil.filter(g => propreCamionIds.has(g.camion_id)), [gasoil, propreCamionIds])
  const voyagesPropre = useMemo(() => voyages.filter(v => propreCamionIds.has(v.camion_id)), [voyages, propreCamionIds])

  const clientNamesByVoyageId = useMemo(() => {
    const map = new Map()
    livraisons.forEach(l => {
      if (!l.voyage_id || !l.client_nom) return
      if (!map.has(l.voyage_id)) map.set(l.voyage_id, [])
      if (!map.get(l.voyage_id).includes(l.client_nom)) map.get(l.voyage_id).push(l.client_nom)
    })
    return map
  }, [livraisons])

  // Everything below is derived from the propre-scoped arrays via useMemo —
  // no duplicated queries, no repeated computation on unrelated re-renders.
  const byCamion = useMemo(() => buildFuelCycles({ gasoil: gasoilPropre, voyages: voyagesPropre, camions: propreCamions }), [gasoilPropre, voyagesPropre, propreCamions])
  const enriched = useMemo(() => enrichByCamion(byCamion, filters.thresholdPct), [byCamion, filters.thresholdPct])
  const fleetStats = useMemo(() => buildFleetFuelStats(byCamion), [byCamion])
  const intel = useMemo(() => buildFleetIntelligenceSummary(enriched), [enriched])
  const alerts = useMemo(() => detectAlerts({ byCamion, thresholdPct: filters.thresholdPct }), [byCamion, filters.thresholdPct])
  const missingData = useMemo(() => detectMissingData({ byCamion, gasoil: gasoilPropre, voyages: voyagesPropre }), [byCamion, gasoilPropre, voyagesPropre])
  const mergeSuggestions = useMemo(() => listMergeSuggestions(enriched), [enriched])
  const health = useMemo(() => buildDataHealthScore({ byCamion, missingData, mergeSuggestions }), [byCamion, missingData, mergeSuggestions])

  // ── NEW primary view — per-voyage rows (client/destination/L per 100km),
  // reusing lib/services/voyageKmFuel.js's buildVoyageKmFuelTimeline exactly
  // as the Voyage Carburant Chronologie tab does. No second calculation.
  const voyageRows = useMemo(() => buildVoyageKmFuelTimeline({
    voyages: voyagesPropre, camions: propreCamions, gasoil: gasoilPropre, voyageGasoilRows, remiseRate,
  }), [voyagesPropre, propreCamions, gasoilPropre, voyageGasoilRows, remiseRate])

  const periodVoyageRows = useMemo(() =>
    voyageRows
      .filter(r => (!period.from || r.date >= period.from) && (!period.to || r.date <= period.to))
      .map(r => ({ ...r, clientNames: clientNamesByVoyageId.get(r.voyageId) || [] })),
    [voyageRows, period, clientNamesByVoyageId])

  const truckPeriodData = useMemo(() => {
    const byCamionId = new Map()
    periodVoyageRows.forEach(r => {
      if (!byCamionId.has(r.camionId)) byCamionId.set(r.camionId, [])
      byCamionId.get(r.camionId).push(r)
    })
    return propreCamions
      .map(camion => {
        const rows = (byCamionId.get(camion.id) || []).sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1)
        return { camion, rows, kpis: summarizePeriod(rows) }
      })
      .sort((a, b) => (a.camion.plaque || '').localeCompare(b.camion.plaque || ''))
  }, [propreCamions, periodVoyageRows])

  const fleetSummary = useMemo(() => summarizePeriod(periodVoyageRows), [periodVoyageRows])

  // "Current KM" per truck (§3) — the truck's last voyage's own km_depart,
  // the same source suggestPreviousKm/KmEditPopover already use. Editing it
  // goes through the exact same saveStartKm path (see KmEditPopover below).
  const odometerRows = useMemo(() => buildOdometerRows(voyagesPropre, propreCamions), [voyagesPropre, propreCamions])
  const currentKmRowByCamion = useMemo(() => {
    const map = new Map()
    odometerRows.forEach(r => { if (r.isLastForTruck) map.set(r.camionId, r) })
    return map
  }, [odometerRows])

  // "Last relevant fuel/measurement date" (§3) — the truck's own cycles,
  // already built above (fuelCycles.js), not period-scoped (a truck-level
  // fact, not a period aggregate).
  const lastFuelDateByCamion = useMemo(() => {
    const map = new Map()
    byCamion.forEach(t => {
      const openCycle = t.cycles.find(c => c.statut === 'en_cours')
      const lastClosed = [...t.cycles].reverse().find(c => c.statut === 'termine')
      map.set(t.camionId, openCycle ? openCycle.dateDebut : (lastClosed ? lastClosed.dateFin : null))
    })
    return map
  }, [byCamion])

  const truckHasMissingKm = useMemo(() => new Set(missingData
    .filter(m => m.category === 'voyage_missing_km' || m.category === 'plein_missing_km')
    .map(m => m.camionId)), [missingData])
  const truckHasMissingRefills = useMemo(() => new Set(missingData
    .filter(m => m.category === 'missing_cycle')
    .map(m => m.camionId)), [missingData])
  const truckHasMergeSuggestion = useMemo(() => new Set(mergeSuggestions.map(s => s.camionId)), [mergeSuggestions])

  const visibleCamions = useMemo(() => {
    return enriched
      .filter(t => !filters.camionId || t.camionId === parseInt(filters.camionId))
      .filter(t => !filters.missingKm || truckHasMissingKm.has(t.camionId))
      .filter(t => !filters.missingRefills || truckHasMissingRefills.has(t.camionId))
      .filter(t => !filters.mergeSuggestions || truckHasMergeSuggestion.has(t.camionId))
      .map(t => ({ ...t, cycles: t.cycles.filter(c => cycleMatchesFilters(c, filters)) }))
      .filter(t => (
        !(filters.status || filters.openCycles || filters.issues || filters.from || filters.to)
        || t.cycles.length > 0
      ))
  }, [enriched, filters, truckHasMissingKm, truckHasMissingRefills, truckHasMergeSuggestion])

  const visibleAlerts = useMemo(() =>
    filters.camionId ? alerts.filter(a => a.camionId === parseInt(filters.camionId)) : alerts,
    [alerts, filters.camionId])
  const visibleMissingData = useMemo(() =>
    filters.camionId ? missingData.filter(m => m.camionId === parseInt(filters.camionId)) : missingData,
    [missingData, filters.camionId])
  const visibleMergeSuggestions = useMemo(() =>
    filters.camionId ? mergeSuggestions.filter(s => s.camionId === parseInt(filters.camionId)) : mergeSuggestions,
    [mergeSuggestions, filters.camionId])

  async function handleMergeChoice(gasoilId, value) {
    await supabase.from('gasoil').update({ merge_with_previous: value }).eq('id', gasoilId)
    loadAll()
  }

  function handleQuickFilter(key) {
    setFilters(f => ({ ...DEFAULT_FILTERS, thresholdPct: f.thresholdPct, [key]: true }))
    setShowValidationTools(true)
  }

  const gasoilRowById = useMemo(() => Object.fromEntries(gasoilPropre.map(g => [g.id, g])), [gasoilPropre])

  const globalTotals = fleetStats.reduce((acc, s) => ({
    kmTotal: acc.kmTotal + s.kmTotal,
    litresGasoil: acc.litresGasoil + s.litresGasoil,
    litresAdblue: acc.litresAdblue + s.litresAdblue,
    coutTotal: acc.coutTotal + s.coutTotal,
    nbCycles: acc.nbCycles + s.nbCycles,
    nbPleins: acc.nbPleins + s.nbPleins,
  }), { kmTotal: 0, litresGasoil: 0, litresAdblue: 0, coutTotal: 0, nbCycles: 0, nbPleins: 0 })

  return (
    <Layout title="Truck Control Center" subtitle="Suivi carburant de la flotte propre — KM, consommation et coût par camion et par voyage">

      <div className="flex justify-end mb-3 text-xs text-gray-400">
        <Link href="/gasoil" className="text-brand-600 font-semibold hover:underline">← Gasoil (pleins)</Link>
        {' · '}
        <Link href="/voyages/km-carburant" className="text-brand-600 font-semibold hover:underline">Truck Timeline & KM/Fuel Control Center →</Link>
        {' · '}
        <Link href="/camions" className="text-brand-600 font-semibold hover:underline">Performance Camions →</Link>
      </div>

      <PeriodSelector value={period} onChange={setPeriod} />

      {/* ── FLEET SUMMARY (Camions Propre only) ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="stat-card border border-slate-100">
          <div className="stat-label">Camions propres</div>
          <div className="stat-value text-gray-700">{propreCamions.length}</div>
          <div className="stat-sub">Flotte surveillée</div>
        </div>
        <div className="stat-card border border-blue-100 bg-blue-50">
          <div className="stat-label text-blue-600">Total KM</div>
          <div className="stat-value text-blue-700">{fmt(fleetSummary.totalKm)}</div>
          <div className="stat-sub">Période sélectionnée</div>
        </div>
        <div className="stat-card border border-cyan-100 bg-cyan-50">
          <div className="stat-label text-cyan-600">Total litres</div>
          <div className="stat-value text-cyan-700">{fmt(fleetSummary.totalLitres)} L</div>
          <div className="stat-sub">Voyages mesurés</div>
        </div>
        <div className="stat-card border border-purple-100 bg-purple-50">
          <div className="stat-label text-purple-600">L/100km moyen</div>
          <div className="stat-value text-purple-700">{fleetSummary.avgL100km !== null ? fleetSummary.avgL100km.toFixed(1) : '—'}</div>
          <div className="stat-sub">Pondéré par distance</div>
        </div>
        <div className="stat-card border border-orange-100 bg-orange-50">
          <div className="stat-label text-orange-600">Coût carburant</div>
          <div className="stat-value text-orange-700">{fmtMoney(fleetSummary.totalCost)}</div>
          <div className="stat-sub">DHS</div>
        </div>
      </div>

      {/* ── TRUCK CARDS ── */}
      {loading ? (
        <div className="card text-center text-gray-400 py-10">Chargement...</div>
      ) : truckPeriodData.length === 0 ? (
        <div className="card text-center text-gray-400 py-10">Aucun camion propre enregistré</div>
      ) : (
        <div className="space-y-4 mb-8">
          {truckPeriodData.map(({ camion, rows, kpis }) => (
            <TruckControlCard
              key={camion.id}
              camion={camion}
              currentKmRow={currentKmRowByCamion.get(camion.id) || null}
              lastFuelDate={lastFuelDateByCamion.get(camion.id) || null}
              kpis={kpis}
              voyageRows={rows}
              onEditKm={setEditingKmRow}
            />
          ))}
        </div>
      )}

      {/* ── OUTILS DE VALIDATION DES DONNÉES (demoted, collapsed) ── */}
      <details open={showValidationTools} onToggle={e => setShowValidationTools(e.target.open)} className="mb-8">
        <summary className="cursor-pointer text-sm font-bold text-slate-500 hover:text-slate-700 select-none mb-3">
          🔧 Outils de validation des données {visibleAlerts.length > 0 && <span className="text-red-500">({visibleAlerts.length} alerte{visibleAlerts.length > 1 ? 's' : ''})</span>}
        </summary>

        <DataHealthHeader health={health} onFilter={handleQuickFilter} />

        <SmartFilters camions={propreCamions} filters={filters} setFilters={setFilters} />

        {/* ── FLEET INTELLIGENCE WIDGETS ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <IntelWidget label="Conso. flotte" value={intel.fleetAvgConso !== null ? `${intel.fleetAvgConso.toFixed(1)} L/100` : '—'} sub="Moyenne tous camions" tone="border-purple-100 bg-purple-50" />
          <IntelWidget label="🏆 Meilleur camion" value={intel.bestTruck?.camionPlaque || '—'} sub={intel.bestTruck ? `${intel.bestTruck.health.avgConso.toFixed(1)} L/100` : 'Aucune donnée'} tone="border-emerald-100 bg-emerald-50" />
          <IntelWidget label="⚠️ Camion à surveiller" value={intel.worstTruck?.camionPlaque || '—'} sub={intel.worstTruck ? `${intel.worstTruck.health.avgConso.toFixed(1)} L/100` : 'Aucune donnée'} tone="border-red-100 bg-red-50" />
          <IntelWidget label="Cycles en cours" value={intel.openCyclesCount} sub="Camions actifs" tone="border-blue-100 bg-blue-50" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <IntelWidget label="Alertes critiques" value={intel.criticalAlertsCount} sub="Cycles 🔴" tone="border-red-100 bg-red-50" />
          <IntelWidget label="🔧 À inspecter" value={intel.trucksNeedingInspection.length} sub="Camions" tone="border-orange-100 bg-orange-50" />
          <IntelWidget label="Cycle le plus long" value={intel.longestCycle ? `${fmt(intel.longestCycle.distance)} km` : '—'} sub={intel.longestCycle?.camionPlaque || 'Par distance'} tone="border-gray-100" />
          <IntelWidget label="💸 Camion le + coûteux (mois)" value={intel.mostExpensiveTruckThisMonth?.camionPlaque || '—'} sub={intel.mostExpensiveTruckThisMonth ? `${fmtMoney(intel.mostExpensiveTruckThisMonth.cost)} DHS` : 'Aucune donnée'} tone="border-amber-100 bg-amber-50" />
        </div>

        {/* ── FLEET TOTALS (all-time, cycle-based) ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <div className="stat-card border border-blue-100 bg-blue-50">
            <div className="stat-label text-blue-600">Total KM</div>
            <div className="stat-value text-blue-700">{fmt(globalTotals.kmTotal)}</div>
            <div className="stat-sub">Cycles clôturés</div>
          </div>
          <div className="stat-card border border-amber-100 bg-amber-50">
            <div className="stat-label text-amber-600">Litres Gasoil</div>
            <div className="stat-value text-amber-700">{fmt(globalTotals.litresGasoil)} L</div>
            <div className="stat-sub">Tous cycles</div>
          </div>
          <div className="stat-card border border-cyan-100 bg-cyan-50">
            <div className="stat-label text-cyan-600">Litres AdBlue</div>
            <div className="stat-value text-cyan-700">{fmt(globalTotals.litresAdblue)} L</div>
            <div className="stat-sub">Tous cycles</div>
          </div>
          <div className="stat-card border border-orange-100 bg-orange-50">
            <div className="stat-label text-orange-600">Coût total</div>
            <div className="stat-value text-orange-700">{fmtMoney(globalTotals.coutTotal)}</div>
            <div className="stat-sub">DHS</div>
          </div>
          <div className="stat-card border border-gray-100">
            <div className="stat-label">Cycles</div>
            <div className="stat-value text-gray-700">{globalTotals.nbCycles}</div>
            <div className="stat-sub">{globalTotals.nbPleins} pleins</div>
          </div>
          <div className={`stat-card border ${visibleAlerts.length ? 'border-red-100 bg-red-50' : 'border-emerald-100 bg-emerald-50'}`}>
            <div className={`stat-label ${visibleAlerts.length ? 'text-red-600' : 'text-emerald-600'}`}>Alertes</div>
            <div className={`stat-value ${visibleAlerts.length ? 'text-red-700' : 'text-emerald-700'}`}>{visibleAlerts.length}</div>
            <div className="stat-sub">{visibleAlerts.length ? 'À vérifier' : '✓ Rien à signaler'}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {loading ? (
              <div className="card text-center text-gray-400 py-10">Chargement...</div>
            ) : visibleCamions.length === 0 ? (
              <div className="card text-center text-gray-400 py-10">Aucune donnée pour ces filtres</div>
            ) : (
              visibleCamions.map(truck => (
                <div key={truck.camionId} className="card">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold text-gray-900">🚛 {truck.camionPlaque}</h2>
                    <Link href={`/camions/${truck.camionId}`} className="text-xs font-semibold text-brand-600 hover:underline">Fiche camion →</Link>
                  </div>

                  <TruckHealthPanel camionPlaque={truck.camionPlaque} health={truck.health} />

                  {truck.cycles.length === 0 ? (
                    <div className="text-center text-gray-400 text-xs py-6">
                      {enriched.find(t => t.camionId === truck.camionId)?.cycles.length
                        ? 'Aucun cycle ne correspond aux filtres actifs pour ce camion'
                        : 'Aucun cycle détectable — enregistrez le KM compteur sur les pleins de ce camion'}
                    </div>
                  ) : (
                    <>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1 mt-2">Chronologie</div>
                      <Timeline truck={truck} />

                      <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1 mt-3">Cycles</div>
                      <div className="space-y-2">
                        {[...truck.cycles].reverse().map((c, i) => (
                          <CycleCard
                            key={`${truck.camionId}-${c.dateDebut}-${i}`}
                            cycle={c}
                            onMergeChoice={handleMergeChoice}
                            onAnalyze={cycle => setAnalyzing({ cycle, camionPlaque: truck.camionPlaque })}
                            thresholdPct={filters.thresholdPct}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {/* ── SIDE PANELS ── */}
          <div className="lg:col-span-1 space-y-6">
            <MissingDataPanel
              items={visibleMissingData}
              onOpenVoyage={setFixingVoyageId}
              onOpenGasoil={setFixingGasoilId}
            />
            <MergeSuggestionsPanel
              suggestions={visibleMergeSuggestions}
              onMergeChoice={handleMergeChoice}
            />
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-3">⚠️ Alertes</h3>
              {visibleAlerts.length === 0 ? (
                <div className="text-center text-emerald-600 text-xs py-6">✓ Aucune alerte</div>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  {visibleAlerts.map((a, i) => <AlertRow key={i} a={a} />)}
                </div>
              )}
              <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400">
                Les alertes sont informatives — elles ne bloquent jamais l'enregistrement d'un plein ou d'un voyage.
              </div>
            </div>
          </div>
        </div>
      </details>

      {analyzing && (
        <CycleAnalysisModal
          cycle={analyzing.cycle}
          camionPlaque={analyzing.camionPlaque}
          onClose={() => setAnalyzing(null)}
        />
      )}

      {fixingVoyageId && (
        <VoyageFixModal voyageId={fixingVoyageId} onClose={() => setFixingVoyageId(null)} onSaved={loadAll} />
      )}

      {fixingGasoilId && gasoilRowById[fixingGasoilId] && (
        <GasoilFixModal
          gasoilRow={gasoilRowById[fixingGasoilId]}
          camions={propreCamions}
          onClose={() => setFixingGasoilId(null)}
          onSaved={loadAll}
        />
      )}

      {editingKmRow && (
        <KmEditPopover
          voyage={editingKmRow}
          mode="depart"
          camionRawVoyages={voyagesPropre.filter(v => v.camion_id === editingKmRow.camionId)}
          onClose={() => setEditingKmRow(null)}
          onSaved={loadAll}
        />
      )}

    </Layout>
  )
}
