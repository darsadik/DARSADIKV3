import { useState, useMemo, useEffect } from 'react'
import { buildAllocationCards, filterAllocationCards, buildAllocationStats, buildUnallocatedVoyages, buildFuelCoverageSummary } from '../../lib/services/voyage/fuelAllocationCenter'
import { unlinkGasoilFromVoyage } from '../../lib/services/voyage/gasoilLink'
import AllocationStatsCards from './AllocationStatsCards'
import AllocationFilterBar from './AllocationFilterBar'
import PurchaseAllocationCard from './PurchaseAllocationCard'
import AllocationAssignModal from './AllocationAssignModal'
import AllocationVisualTimeline from './AllocationVisualTimeline'
import UnallocatedVoyagesPanel from './UnallocatedVoyagesPanel'

const DEFAULT_FILTERS = { camionId: '', dateFrom: '', dateTo: '', statusFilter: '', search: '' }

// Orchestrator for the "Contrôle Allocation" tab (pages/voyages/km-carburant.js).
// Owns filter/view/modal state; every number displayed comes from
// lib/services/voyage/fuelAllocationCenter.js, which itself only calls the
// real engine (lib/services/fuelAllocation.js) — nothing here recomputes
// money. The sibling "Chronologie" tab and its components are never touched
// by anything in this file.
export default function AllocationControlCenter({ camions, activeVoyages, voyageRows, gasoil, voyageGasoilRows, clientNamesByVoyageId, remiseRate, onSaved, initialFilters }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)

  // Deep-link from /gasoil's alert banner (spec items 10, 11, 14) — applied
  // once the parent page has parsed router.query (arrives one tick after
  // mount, hence a separate effect rather than a lazy useState initializer).
  useEffect(() => {
    if (initialFilters) setFilters(f => ({ ...f, ...initialFilters }))
  }, [initialFilters])
  const [viewMode, setViewMode] = useState('list') // 'list' | 'timeline'
  const [assignState, setAssignState] = useState(null) // { mode: 'assign'|'move', card, voyage }
  // Timeline click-to-highlight (spec item 8) — pure UI state, never affects
  // which cards exist or their numbers.
  const [highlightedGasoilId, setHighlightedGasoilId] = useState(null)
  const [highlightedVoyageId, setHighlightedVoyageId] = useState(null)

  const allCards = useMemo(() => buildAllocationCards({
    camions, activeVoyages, voyageRows, gasoil, voyageGasoilRows, clientNamesByVoyageId, remiseRate,
  }), [camions, activeVoyages, voyageRows, gasoil, voyageGasoilRows, clientNamesByVoyageId, remiseRate])

  const filteredCards = useMemo(() => filterAllocationCards(allCards, {
    camionId: filters.camionId ? parseInt(filters.camionId) : null,
    dateFrom: filters.dateFrom, dateTo: filters.dateTo, statusFilter: filters.statusFilter,
    search: filters.search,
  }), [allCards, filters])

  const stats = useMemo(() => buildAllocationStats(filteredCards), [filteredCards])

  // A voyage with real KM but no fuel cost never shows up in `allCards`
  // (cards are per-purchase, not per-voyage) — this reads the SAME
  // voyageRows prop the cards above are built from, just filtered/reshaped,
  // so a voyage in an open refueling period or with no bracket at all is
  // never silently invisible here (spec §2/§3).
  const unallocatedVoyages = useMemo(() => buildUnallocatedVoyages(voyageRows), [voyageRows])
  const coverage = useMemo(() => buildFuelCoverageSummary(voyageRows), [voyageRows])

  function resetFilters() { setFilters(DEFAULT_FILTERS) }
  function selectStatusFilter(key) { setFilters(f => ({ ...f, statusFilter: f.statusFilter === key ? '' : key })) }

  function openAssign(card) { setAssignState({ mode: 'assign', card }) }
  function openMove(card, voyage) { setAssignState({ mode: 'move', card, voyage }) }

  async function unlinkVoyage(card, voyage) {
    if (!confirm(`Retirer ${voyage.reference} de ce plein ?`)) return
    const rows = (voyageGasoilRows || []).filter(l => l.voyage_id === voyage.voyageId && l.gasoil_id === card.gasoilId)
    for (const row of rows) await unlinkGasoilFromVoyage(row)
    await onSaved?.()
  }

  const assignCamionData = useMemo(() => {
    if (!assignState) return null
    const camionId = assignState.card.camionId
    return {
      camionVoyageRows: (voyageRows || []).filter(v => v.camionId === camionId),
      camionGasoil: (gasoil || []).filter(g => g.camion_id === camionId),
      camionVoyages: (activeVoyages || []).filter(v => v.camion_id === camionId),
    }
  }, [assignState, voyageRows, gasoil, activeVoyages])

  return (
    <div className="space-y-4">
      <AllocationStatsCards stats={stats} activeStatusFilter={filters.statusFilter} onSelectStatusFilter={selectStatusFilter} coverage={coverage} />
      <UnallocatedVoyagesPanel voyages={unallocatedVoyages} />
      <AllocationFilterBar camions={camions} filters={filters} setFilters={setFilters} onReset={resetFilters} />

      <div className="flex items-center justify-end gap-2 -mt-2">
        <button onClick={() => setViewMode('list')}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition ${viewMode === 'list' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>
          📋 Liste
        </button>
        <button onClick={() => setViewMode('timeline')}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition ${viewMode === 'timeline' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>
          📈 Chronologie visuelle
        </button>
      </div>

      {viewMode === 'timeline' ? (
        <AllocationVisualTimeline cards={filteredCards}
          highlightedGasoilId={highlightedGasoilId} highlightedVoyageId={highlightedVoyageId}
          onSelectPurchase={id => { setHighlightedGasoilId(id); setHighlightedVoyageId(null) }}
          onSelectVoyage={id => { setHighlightedVoyageId(id); setHighlightedGasoilId(null) }} />
      ) : filteredCards.length === 0 ? (
        <div className="card text-center text-slate-400 py-14">Aucun plein pour ces filtres</div>
      ) : (
        <div className="space-y-4">
          {filteredCards.map(card => (
            <PurchaseAllocationCard key={card.gasoilId} card={card}
              onAssign={openAssign} onMoveVoyage={openMove} onUnlinkVoyage={unlinkVoyage} />
          ))}
        </div>
      )}

      {assignState && assignCamionData && (
        <AllocationAssignModal
          mode={assignState.mode} card={assignState.card} voyage={assignState.voyage}
          allCards={allCards}
          camionVoyageRows={assignCamionData.camionVoyageRows}
          camionGasoil={assignCamionData.camionGasoil}
          camionVoyages={assignCamionData.camionVoyages}
          voyageGasoilRows={voyageGasoilRows}
          remiseRate={remiseRate}
          onClose={() => setAssignState(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
