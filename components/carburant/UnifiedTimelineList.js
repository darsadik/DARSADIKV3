import { useMemo } from 'react'
import { groupTimelineByTruck } from '../../lib/services/voyage/timelineEvents'
import TruckTimelineSection from './TruckTimelineSection'

// Spec "GROUP BY TRUCK" — the page is no longer one mixed timeline; it's a
// stack of independent, collapsible per-truck timelines (each internally
// still one continuous chronological rail). Grouping itself is a pure lookup
// (lib/services/voyage/timelineEvents.js's groupTimelineByTruck) over the
// already-filtered events — no new queries, no recomputation.
export default function UnifiedTimelineList({ events, camions, loading, onFixVoyage, onEditKm, onAssignFuel, onFixGasoil, onViewChain }) {
  const groups = useMemo(() => groupTimelineByTruck(events, camions), [events, camions])

  if (loading) return <div className="card text-center text-gray-400 py-14">Chargement...</div>
  if (groups.length === 0) return <div className="card text-center text-gray-400 py-14">Aucun événement pour ces filtres</div>

  return (
    <div className="space-y-6">
      {groups.map(g => (
        <TruckTimelineSection
          key={g.camionId}
          group={g}
          onFixVoyage={onFixVoyage}
          onEditKm={onEditKm}
          onAssignFuel={onAssignFuel}
          onFixGasoil={onFixGasoil}
          onViewChain={onViewChain}
        />
      ))}
    </div>
  )
}
