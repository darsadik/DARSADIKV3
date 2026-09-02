import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { fetchRemiseCarburantRate } from '../../lib/services/settings'
import { DEFAULT_REMISE_CARBURANT_RATE } from '../../lib/services/profitability'
import { buildVoyageKmFuelTimeline, buildTimelineDashboard, detectFuelAssignmentProblems, detectUnrealisticDistances } from '../../lib/services/voyageKmFuel'
import { detectProblems as detectOdometerProblems, buildOdometerRows } from '../../lib/services/kilometrage'
import { buildUnifiedTimeline, filterUnifiedTimeline, attachChainContext } from '../../lib/services/voyage/timelineEvents'
import VoyageFixModal from '../../components/carburant/VoyageFixModal'
import GasoilFixModal from '../../components/carburant/GasoilFixModal'
import KmFuelDashboardCards from '../../components/carburant/KmFuelDashboardCards'
import TimelineFilterBar from '../../components/carburant/TimelineFilterBar'
import UnifiedTimelineList from '../../components/carburant/UnifiedTimelineList'
import FuelAssignPopover from '../../components/carburant/FuelAssignPopover'
import KmEditPopover from '../../components/carburant/KmEditPopover'
import CreateNextVoyageModal from '../../components/carburant/CreateNextVoyageModal'
import OdometerChainStrip from '../../components/carburant/OdometerChainStrip'
import AllocationControlCenter from '../../components/carburant/AllocationControlCenter'
import TruckPlanCenter from '../../components/carburant/TruckPlanCenter'

const SEVERITY_TONE = { error: 'badge-red', warning: 'badge-amber', info: 'badge-blue' }

const DEFAULT_FILTERS = {
  camionId: '', dateFrom: '', dateTo: '', show: 'all', search: '', statusFilter: '',
}

export default function VoyageKmCarburant() {
  const router = useRouter()
  const [tab, setTab] = useState('timeline') // 'timeline' | 'allocation' | 'link'
  // Deep-link support (spec items 10, 11, 14) — /gasoil's alert banner and
  // "voir les suggestions" link land here with ?tab=allocation&statusFilter=…
  // Applied once when the router is ready; the tab/filters stay normal local
  // state afterward (no URL sync back), same one-way pattern as every other
  // page's filter bar in this app.
  const [initialAllocationFilters, setInitialAllocationFilters] = useState(null)
  useEffect(() => {
    if (!router.isReady) return
    const { tab: qTab, statusFilter, camionId, search, dateFrom, dateTo } = router.query
    if (qTab === 'allocation') {
      setTab('allocation')
      setInitialAllocationFilters({
        camionId: camionId || '', statusFilter: statusFilter || '', search: search || '',
        dateFrom: dateFrom || '', dateTo: dateTo || '',
      })
    }
  }, [router.isReady])
  const [camions, setCamions] = useState([])
  const [voyages, setVoyages] = useState([])
  const [gasoil, setGasoil] = useState([])
  const [voyageGasoilRows, setVoyageGasoilRows] = useState([])
  const [livraisons, setLivraisons] = useState([])
  const [remiseRate, setRemiseRate] = useState(DEFAULT_REMISE_CARBURANT_RATE)
  const [loading, setLoading] = useState(true)

  const [filters, setFilters] = useState(DEFAULT_FILTERS)

  const [fixingVoyageId, setFixingVoyageId] = useState(null)
  const [assigningGasoilId, setAssigningGasoilId] = useState(null)
  const [fixingGasoilRow, setFixingGasoilRow] = useState(null)
  const [kmEditContext, setKmEditContext] = useState(null) // { voyageId, mode }
  const [creatingNextVoyageFor, setCreatingNextVoyageFor] = useState(null)
  const [viewingChainForCamionId, setViewingChainForCamionId] = useState(null)

  useEffect(() => { loadAll(); fetchRemiseCarburantRate().then(setRemiseRate) }, [])

  async function loadAll() {
    setLoading(true)
    const [camionsRes, voyagesRes, gasoilRes, voyageGasoilRes, livraisonsRes] = await Promise.all([
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('voyages')
        .select('id,reference,date_depart,camion_id,camion_plaque,chauffeur,statut,destination,km_depart,km_arrivee,fuel_mode,manual_distance_km,manual_cost_per_km,manual_fuel_cost,deleted_at')
        .order('date_depart', { ascending: true }),
      // 'heure' was a product decision to drop entirely (trucks don't operate
      // on an hourly schedule) — do not select it, it no longer exists on
      // gasoil. Selecting a nonexistent column fails the WHOLE query (not
      // just that field), which previously emptied the entire fuel timeline
      // silently.
      supabase.from('gasoil').select('id,camion_id,camion_plaque,km,total,qte,prix_unitaire,adblue_total,adblue_qte,adblue_prix_unitaire,date,station'),
      supabase.from('voyage_gasoil').select('id,voyage_id,gasoil_id,date_gasoil,qte_litres,prix_unitaire,total,is_split'),
      // Client name per voyage for the "Contrôle Allocation" tab's Allocation
      // List (spec item 2) — client_nom is already denormalized on this
      // table, so this is a read-only, additive lookup, unused by the
      // Chronologie tab.
      supabase.from('voyage_livraisons').select('voyage_id, client_nom'),
    ])
    // Surface query failures instead of silently rendering empty data —
    // this is exactly the class of bug that made the Fuel tab look empty
    // (a bad column name failed the query, and the failure went unnoticed
    // because only `data` was read, never `error`).
    ;[camionsRes, voyagesRes, gasoilRes, voyageGasoilRes, livraisonsRes].forEach(res => {
      if (res.error) console.error('km-carburant loadAll:', res.error.message)
    })
    setCamions(camionsRes.data || [])
    setVoyages(voyagesRes.data || [])
    setGasoil(gasoilRes.data || [])
    setVoyageGasoilRows(voyageGasoilRes.data || [])
    setLivraisons(livraisonsRes.data || [])
    setLoading(false)
  }

  const activeVoyages = useMemo(() => voyages.filter(v => !v.deleted_at), [voyages])

  // Client name per voyage — dedup, preserve insertion order. Feeds both the
  // "Contrôle Allocation" tab (AllocationControlCenter) and, via voyageRows
  // below, every voyage card in the Chronologie tab (spec: client name +
  // destination are mandatory on every voyage row, never just the reference).
  const clientNamesByVoyageId = useMemo(() => {
    const map = new Map()
    livraisons.forEach(l => {
      if (!l.voyage_id || !l.client_nom) return
      if (!map.has(l.voyage_id)) map.set(l.voyage_id, [])
      if (!map.get(l.voyage_id).includes(l.client_nom)) map.get(l.voyage_id).push(l.client_nom)
    })
    return map
  }, [livraisons])

  // destination already comes straight off the voyage row inside
  // buildVoyageKmFuelTimeline (voyageKmFuel.js) — clientNames is the only
  // field attached here, reusing the same lookup as the Allocation tab
  // rather than a second query.
  const voyageRows = useMemo(() => buildVoyageKmFuelTimeline({
    voyages, camions, gasoil, voyageGasoilRows, remiseRate,
  }).map(r => ({ ...r, clientNames: clientNamesByVoyageId.get(r.voyageId) || [] })),
    [voyages, camions, gasoil, voyageGasoilRows, remiseRate, clientNamesByVoyageId])

  const dashboard = useMemo(() => buildTimelineDashboard(voyageRows), [voyageRows])

  const odometerRows = useMemo(() => buildOdometerRows(activeVoyages, camions), [activeVoyages, camions])
  const odometerProblems = useMemo(() => detectOdometerProblems(odometerRows), [odometerRows])
  const fuelProblems = useMemo(() => detectFuelAssignmentProblems({ voyages, voyageRows }), [voyages, voyageRows])
  const distanceProblems = useMemo(() => detectUnrealisticDistances(voyageRows), [voyageRows])
  const allProblems = useMemo(() => {
    const order = { error: 0, warning: 1, info: 2 }
    return [...odometerProblems, ...fuelProblems, ...distanceProblems].sort((a, b) => order[a.severity] - order[b.severity])
  }, [odometerProblems, fuelProblems, distanceProblems])

  const problemVoyageIds = useMemo(() => new Set(allProblems.flatMap(p => p.voyageIds || [])), [allProblems])
  const problemGasoilIds = useMemo(() => new Set(fuelProblems.map(p => p.gasoilId).filter(Boolean)), [fuelProblems])

  const unifiedTimelineBase = useMemo(() => buildUnifiedTimeline({
    voyageRows, gasoil, voyageGasoilRows, problemVoyageIds, problemGasoilIds,
  }), [voyageRows, gasoil, voyageGasoilRows, problemVoyageIds, problemGasoilIds])

  const unifiedTimeline = useMemo(() => attachChainContext(unifiedTimelineBase, odometerRows, gasoil), [unifiedTimelineBase, odometerRows, gasoil])

  const pleinsNeedingAssignmentCount = useMemo(() => unifiedTimeline.filter(e => e.type === 'plein' && e.needsAssignment).length, [unifiedTimeline])
  const pleinsAssignedCount = useMemo(() => unifiedTimeline.filter(e => e.type === 'plein' && (e.assignmentStatus === 'assigned' || e.assignmentStatus === 'split')).length, [unifiedTimeline])

  const visibleEvents = useMemo(() => filterUnifiedTimeline(unifiedTimeline, {
    camionId: filters.camionId ? parseInt(filters.camionId) : null,
    dateFrom: filters.dateFrom, dateTo: filters.dateTo, show: filters.show, search: filters.search,
    statusFilter: filters.statusFilter,
  }), [unifiedTimeline, filters])

  const visibleProblems = useMemo(() =>
    filters.camionId ? allProblems.filter(p => p.camionId === parseInt(filters.camionId)) : allProblems,
    [allProblems, filters.camionId])

  const camionVoyagesRaw = useMemo(() => {
    const map = new Map()
    activeVoyages.forEach(v => {
      if (!v.camion_id) return
      if (!map.has(v.camion_id)) map.set(v.camion_id, [])
      map.get(v.camion_id).push(v)
    })
    return map
  }, [activeVoyages])

  function selectStatus(key) {
    setFilters(f => ({ ...f, statusFilter: f.statusFilter === key ? '' : key, show: 'all' }))
  }
  function selectShow(mode) {
    setFilters(f => ({ ...f, show: f.show === mode ? 'all' : mode, statusFilter: '' }))
  }
  function resetFilters() {
    setFilters(DEFAULT_FILTERS)
  }

  // ── Modal wiring ───────────────────────────────────────────────────────────
  const kmEditVoyage = kmEditContext ? voyageRows.find(v => v.voyageId === kmEditContext.voyageId) : null
  const assigningPlein = assigningGasoilId ? unifiedTimeline.find(e => e.type === 'plein' && e.gasoilId === assigningGasoilId) : null
  const viewingChainCamion = viewingChainForCamionId ? camions.find(c => c.id === viewingChainForCamionId) : null

  function onEditKm(voyageEvent, mode) {
    setKmEditContext({ voyageId: voyageEvent.voyageId, mode })
  }
  function onAssignFuel(pleinEvent) {
    setAssigningGasoilId(pleinEvent.gasoilId)
  }
  function onFixGasoil(pleinEvent) {
    setFixingGasoilRow({
      id: pleinEvent.gasoilId, date: pleinEvent.date, camion_plaque: pleinEvent.plaque,
      km: pleinEvent.km, camion_id: pleinEvent.camionId,
    })
  }
  function onCreateNext(voyage) {
    setKmEditContext(null)
    setCreatingNextVoyageFor({ camionId: voyage.camionId, camionPlaque: voyage.plaque, chauffeur: voyage.chauffeur, prefillKm: '' })
  }

  return (
    <Layout title="Truck Timeline & KM/Fuel Control Center" subtitle="Centre de contrôle unique par camion — voyages, pleins, KM, distance et carburant en une seule chronologie. Corrigez, assignez et vérifiez tout depuis cette page.">

      <div className="flex gap-2 bg-white border border-slate-200 rounded-xl p-1.5 mb-6 w-fit">
        <button onClick={() => setTab('timeline')}
          className={`text-sm font-bold px-4 py-2 rounded-lg transition ${tab === 'timeline' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
          🕐 Chronologie
        </button>
        <button onClick={() => setTab('allocation')}
          className={`text-sm font-bold px-4 py-2 rounded-lg transition ${tab === 'allocation' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
          ⛽ Contrôle Allocation
        </button>
        <button onClick={() => setTab('link')}
          className={`text-sm font-bold px-4 py-2 rounded-lg transition ${tab === 'link' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
          🔗 Camion ↔ Plan
        </button>
      </div>

      {tab === 'allocation' && loading && (
        <div className="space-y-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="card animate-pulse">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-40 bg-slate-100 rounded" />
                  <div className="h-3 w-64 bg-slate-100 rounded" />
                </div>
                <div className="h-8 w-24 bg-slate-100 rounded" />
              </div>
              <div className="h-2 w-full bg-slate-100 rounded mt-4" />
            </div>
          ))}
        </div>
      )}

      {tab === 'allocation' && !loading && (
        <AllocationControlCenter
          camions={camions}
          activeVoyages={activeVoyages}
          voyageRows={voyageRows}
          gasoil={gasoil}
          voyageGasoilRows={voyageGasoilRows}
          clientNamesByVoyageId={clientNamesByVoyageId}
          remiseRate={remiseRate}
          onSaved={loadAll}
          initialFilters={initialAllocationFilters}
        />
      )}

      {tab === 'link' && !loading && (
        <TruckPlanCenter
          camions={camions}
          activeVoyages={activeVoyages}
          voyageRows={voyageRows}
          voyageGasoilRows={voyageGasoilRows}
          onSaved={loadAll}
        />
      )}

      {tab === 'link' && loading && (
        <div className="space-y-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="card animate-pulse">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-40 bg-slate-100 rounded" />
                  <div className="h-3 w-64 bg-slate-100 rounded" />
                </div>
                <div className="h-8 w-24 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'timeline' && <>

      <KmFuelDashboardCards
        dashboard={dashboard}
        pleinsNeedingAssignment={pleinsNeedingAssignmentCount}
        pleinsAssigned={pleinsAssignedCount}
        activeStatus={filters.statusFilter}
        activeShow={filters.show}
        onSelectStatus={selectStatus}
        onSelectShow={selectShow}
      />

      {visibleProblems.length > 0 && (
        <div className="card mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">⚠ Problèmes détectés ({visibleProblems.length})</h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {visibleProblems.map((p, i) => (
              <div key={i} className="w-full flex items-start gap-2 px-3 py-2 rounded-lg text-xs">
                <span className={SEVERITY_TONE[p.severity]}>{p.severity === 'error' ? '❌' : p.severity === 'warning' ? '⚠' : 'ℹ'}</span>
                <span className="flex-1 text-gray-700">{p.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <TimelineFilterBar camions={camions} filters={filters} setFilters={setFilters} onReset={resetFilters} />

      <UnifiedTimelineList
        events={visibleEvents}
        camions={camions}
        loading={loading}
        onFixVoyage={setFixingVoyageId}
        onEditKm={onEditKm}
        onAssignFuel={onAssignFuel}
        onFixGasoil={onFixGasoil}
        onViewChain={setViewingChainForCamionId}
      />

      {fixingVoyageId && (
        <VoyageFixModal voyageId={fixingVoyageId} onClose={() => setFixingVoyageId(null)} onSaved={loadAll} />
      )}

      {fixingGasoilRow && (
        <GasoilFixModal gasoilRow={fixingGasoilRow} camions={camions} onClose={() => setFixingGasoilRow(null)} onSaved={loadAll} />
      )}

      {assigningPlein && (
        <FuelAssignPopover
          plein={assigningPlein}
          camionVoyageRows={voyageRows}
          onClose={() => setAssigningGasoilId(null)}
          onSaved={loadAll}
        />
      )}

      {kmEditVoyage && kmEditContext && (
        <KmEditPopover
          voyage={kmEditVoyage}
          mode={kmEditContext.mode}
          camionRawVoyages={camionVoyagesRaw.get(kmEditVoyage.camionId) || []}
          onClose={() => setKmEditContext(null)}
          onSaved={loadAll}
          onCreateNext={onCreateNext}
        />
      )}

      {creatingNextVoyageFor && (
        <CreateNextVoyageModal
          {...creatingNextVoyageFor}
          onClose={() => setCreatingNextVoyageFor(null)}
          onCreated={loadAll}
        />
      )}

      {viewingChainCamion && (
        <OdometerChainStrip
          camionId={viewingChainCamion.id}
          camionPlaque={viewingChainCamion.plaque}
          odometerRows={odometerRows}
          gasoil={gasoil}
          onClose={() => setViewingChainForCamionId(null)}
        />
      )}
      </>}
    </Layout>
  )
}
