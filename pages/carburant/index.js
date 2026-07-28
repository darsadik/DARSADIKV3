import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../lib/utils'
import {
  buildFuelCycles, buildFleetFuelStats, enrichByCamion, buildFleetIntelligenceSummary, detectAlerts,
} from '../../lib/services/fuelCycles'
import CycleCard from '../../components/carburant/CycleCard'
import CycleAnalysisModal from '../../components/carburant/CycleAnalysisModal'
import TruckHealthPanel from '../../components/carburant/TruckHealthPanel'
import Timeline from '../../components/carburant/Timeline'

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

export default function CarburantCycles() {
  const [camions, setCamions] = useState([])
  const [gasoil, setGasoil] = useState([])
  const [voyages, setVoyages] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCamion, setSelectedCamion] = useState('')
  const [thresholdPct, setThresholdPct] = useState(15)
  const [analyzing, setAnalyzing] = useState(null) // { cycle, camionPlaque }

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ca }, { data: ga }, { data: vo }] = await Promise.all([
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('gasoil').select('*').order('date', { ascending: true }),
      supabase.from('voyages')
        .select('id,reference,date_depart,camion_id,camion_plaque,destination,km_depart,km_arrivee,deleted_at')
        .order('date_depart', { ascending: true }),
    ])
    setCamions(ca || [])
    setGasoil(ga || [])
    setVoyages(vo || [])
    setLoading(false)
  }

  // Everything below is derived from the 3 arrays already loaded above via
  // useMemo — no duplicated queries, no repeated computation on unrelated
  // re-renders (§13).
  const byCamion = useMemo(() => buildFuelCycles({ gasoil, voyages, camions }), [gasoil, voyages, camions])
  const enriched = useMemo(() => enrichByCamion(byCamion, thresholdPct), [byCamion, thresholdPct])
  const fleetStats = useMemo(() => buildFleetFuelStats(byCamion), [byCamion])
  const intel = useMemo(() => buildFleetIntelligenceSummary(enriched), [enriched])
  const alerts = useMemo(() => detectAlerts({ byCamion, thresholdPct }), [byCamion, thresholdPct])

  const visibleCamions = selectedCamion ? enriched.filter(b => b.camionId === parseInt(selectedCamion)) : enriched
  const visibleAlerts = selectedCamion ? alerts.filter(a => a.camionId === parseInt(selectedCamion)) : alerts

  async function handleMergeChoice(gasoilId, value) {
    await supabase.from('gasoil').update({ merge_with_previous: value }).eq('id', gasoilId)
    loadAll()
  }

  const globalTotals = fleetStats.reduce((acc, s) => ({
    kmTotal: acc.kmTotal + s.kmTotal,
    litresGasoil: acc.litresGasoil + s.litresGasoil,
    litresAdblue: acc.litresAdblue + s.litresAdblue,
    coutTotal: acc.coutTotal + s.coutTotal,
    nbCycles: acc.nbCycles + s.nbCycles,
    nbPleins: acc.nbPleins + s.nbPleins,
  }), { kmTotal: 0, litresGasoil: 0, litresAdblue: 0, coutTotal: 0, nbCycles: 0, nbPleins: 0 })

  return (
    <Layout title="Cycles Carburant" subtitle="Intelligence flotte : cycles, santé camion, alertes et aide à la décision">

      {/* ── FILTERS ── */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-end gap-4 justify-between">
          <div>
            <label className="label">Camion</label>
            <select className="input" style={{ width: '240px' }} value={selectedCamion} onChange={e => setSelectedCamion(e.target.value)}>
              <option value="">Tous les camions</option>
              {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}{c.chauffeur ? ` — ${c.chauffeur}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Seuil d'alerte (%)</label>
            <input type="number" className="input" style={{ width: '90px' }} value={thresholdPct} min={1} max={100}
              onChange={e => setThresholdPct(parseFloat(e.target.value) || 15)} />
          </div>
          <div className="text-xs text-gray-400">
            <Link href="/gasoil" className="text-brand-600 font-semibold hover:underline">← Gasoil (pleins)</Link>
            {' · '}
            <Link href="/camions" className="text-brand-600 font-semibold hover:underline">Performance Camions →</Link>
          </div>
        </div>
      </div>

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
        <IntelWidget label="💸 Camion le + coûteux (mois)" value={intel.mostExpensiveTruckThisMonth?.camionPlaque || '—'} sub={intel.mostExpensiveTruckThisMonth ? `${fmt(intel.mostExpensiveTruckThisMonth.cost)} DHS` : 'Aucune donnée'} tone="border-amber-100 bg-amber-50" />
      </div>

      {/* ── FLEET TOTALS ── */}
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
          <div className="stat-value text-orange-700">{fmt(globalTotals.coutTotal)}</div>
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
            <div className="card text-center text-gray-400 py-10">Aucune donnée carburant</div>
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
                    Aucun cycle détectable — enregistrez le KM compteur sur les pleins de ce camion
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
                          thresholdPct={thresholdPct}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* ── ALERTS PANEL ── */}
        <div className="lg:col-span-1">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">⚠️ Alertes</h3>
            {visibleAlerts.length === 0 ? (
              <div className="text-center text-emerald-600 text-xs py-6">✓ Aucune alerte</div>
            ) : (
              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                {visibleAlerts.map((a, i) => <AlertRow key={i} a={a} />)}
              </div>
            )}
            <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400">
              Les alertes sont informatives — elles ne bloquent jamais l'enregistrement d'un plein ou d'un voyage.
            </div>
          </div>
        </div>
      </div>

      {analyzing && (
        <CycleAnalysisModal
          cycle={analyzing.cycle}
          camionPlaque={analyzing.camionPlaque}
          onClose={() => setAnalyzing(null)}
        />
      )}

    </Layout>
  )
}
