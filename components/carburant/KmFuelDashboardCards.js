import { fmtD } from '../../lib/utils'

function Card({ label, value, sub, active, onClick, toneClass, emoji }) {
  const clickable = !!onClick
  const Cmp = clickable ? 'button' : 'div'
  return (
    <Cmp onClick={onClick} className={`stat-card text-left ${active ? 'ring-2 ring-brand-500' : ''} ${clickable ? '' : 'cursor-default'}`}>
      <div className="stat-label">{emoji ? `${emoji} ` : ''}{label}</div>
      <div className={`stat-value ${toneClass || 'text-gray-900'}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </Cmp>
  )
}

// Spec §10 — the exact 9-card operational dashboard. Every count is a plain
// read of what the page already computed (buildTimelineDashboard +
// buildUnifiedTimeline) — no recomputation here. Each clickable card drives
// the SAME filter state the filter bar uses, so a card and a filter chip can
// never disagree about what "Fuel Not Assigned" means.
export default function KmFuelDashboardCards({
  dashboard, truckCount, voyageCount, fuelCount, pleinsNeedingAssignment, pleinsAssigned,
  activeStatus, activeShow, onSelectStatus, onSelectShow,
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
      <Card emoji="🟡" label="KM départ manquant" value={dashboard.byStatus.missing_start_km || 0} tone={undefined}
        toneClass="text-amber-600" active={activeStatus === 'missing_start_km'} onClick={() => onSelectStatus('missing_start_km')} />
      <Card emoji="🟡" label="KM arrivée manquant" value={dashboard.byStatus.missing_end_km || 0}
        toneClass="text-amber-600" active={activeStatus === 'missing_end_km'} onClick={() => onSelectStatus('missing_end_km')} />
      <Card emoji="🔴" label="Distance impossible" value={dashboard.byStatus.impossible_distance || 0}
        toneClass="text-red-600" active={activeStatus === 'impossible_distance'} onClick={() => onSelectStatus('impossible_distance')} />
      <Card emoji="⚪" label="Carburant non assigné" value={pleinsNeedingAssignment}
        toneClass={pleinsNeedingAssignment ? 'text-amber-600' : 'text-emerald-600'} active={activeShow === 'not_assigned'} onClick={() => onSelectShow('not_assigned')} />
      <Card emoji="🔗" label="Assignations manuelles" value={pleinsAssigned}
        toneClass="text-brand-600" active={activeShow === 'assigned'} onClick={() => onSelectShow('assigned')} />
      <Card emoji="💰" label="Coût / KM moyen" value={dashboard.avgCostPerKm !== null ? `${fmtD(dashboard.avgCostPerKm)} DHS` : '—'} sub="Toute la flotte" />
      <Card emoji="🚛" label="Camions" value={truckCount} sub="Actifs sur la période" />
      <Card emoji="🚚" label="Voyages" value={voyageCount}
        active={activeShow === 'voyages'} onClick={() => onSelectShow('voyages')} />
      <Card emoji="⛽" label="Pleins" value={fuelCount}
        active={activeShow === 'fuel'} onClick={() => onSelectShow('fuel')} />
    </div>
  )
}
