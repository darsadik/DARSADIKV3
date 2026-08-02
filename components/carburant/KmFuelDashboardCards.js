import { fmtD } from '../../lib/utils'
import { TIMELINE_STATUS } from '../../lib/services/voyageKmFuel'

const TONE_TEXT = { ok: 'text-emerald-600', warning: 'text-amber-600', error: 'text-red-600', info: 'text-brand-600' }

function Card({ label, value, sub, active, onClick, toneClass }) {
  const clickable = !!onClick
  const Cmp = clickable ? 'button' : 'div'
  return (
    <Cmp onClick={onClick} className={`stat-card text-left ${active ? 'ring-2 ring-brand-500' : ''} ${clickable ? '' : 'cursor-default'}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${toneClass || 'text-gray-900'}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </Cmp>
  )
}

// Spec §6 — one card per status bucket + total + the avg-cost/km metric.
// Every count comes straight from buildTimelineDashboard(rows) — no
// recomputation here. Clicking a status card sets the page's statusFilter;
// the Total/Avg cards reset it.
export default function KmFuelDashboardCards({ dashboard, activeStatus, onSelectStatus, onReset }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
      <Card label="Total voyages" value={dashboard.total} active={!activeStatus} onClick={onReset} />
      {Object.entries(TIMELINE_STATUS).map(([key, meta]) => (
        <Card
          key={key}
          label={`${meta.emoji} ${meta.label}`}
          value={dashboard.byStatus[key] || 0}
          active={activeStatus === key}
          onClick={() => onSelectStatus(key)}
          toneClass={TONE_TEXT[meta.tone]}
        />
      ))}
      <Card label="Coût / KM moyen" value={dashboard.avgCostPerKm !== null ? `${fmtD(dashboard.avgCostPerKm)} DHS` : '—'} sub="Toute la flotte" />
    </div>
  )
}
