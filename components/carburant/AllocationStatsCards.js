import { fmtMoney } from '../../lib/utils'

function Card({ label, value, sub, active, onClick, toneClass, emoji }) {
  const clickable = !!onClick
  const Cmp = clickable ? 'button' : 'div'
  return (
    <Cmp onClick={onClick} className={`stat-card text-left ${active ? 'ring-2 ring-brand-500' : ''} ${clickable ? '' : 'cursor-default'}`}>
      <div className="stat-label">{emoji ? `${emoji} ` : ''}{label}</div>
      <div className={`text-3xl font-black tracking-tight ${toneClass || 'text-gray-900'}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </Cmp>
  )
}

// Quick Statistics header for the "Contrôle Allocation" tab — every number
// comes straight from lib/services/voyage/fuelAllocationCenter.js's
// buildAllocationStats(filteredCards), so these deliberately reflect the
// currently active filters (unlike KmFuelDashboardCards on the Chronologie
// tab, which is intentionally fleet-wide).
export default function AllocationStatsCards({ stats, activeStatusFilter, onSelectStatusFilter }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
      <Card emoji="⛽" label="Achats carburant" value={stats.totalPurchases} />
      <Card emoji="🔴" label="En attente" value={stats.waiting}
        toneClass={stats.waiting ? 'text-red-600' : 'text-emerald-600'}
        active={activeStatusFilter === 'waiting'} onClick={() => onSelectStatusFilter('waiting')} />
      <Card emoji="🟠" label="Partiellement alloués" value={stats.partiallyAllocated}
        toneClass={stats.partiallyAllocated ? 'text-orange-600' : 'text-emerald-600'}
        active={activeStatusFilter === 'remaining'} onClick={() => onSelectStatusFilter('remaining')} />
      <Card emoji="✓" label="Entièrement alloués" value={stats.fullyAllocated}
        toneClass="text-emerald-600"
        active={activeStatusFilter === 'full'} onClick={() => onSelectStatusFilter('full')} />
      <Card emoji="🟣" label="Avec override manuel" value={stats.manualOverrides}
        toneClass="text-purple-600"
        active={activeStatusFilter === 'manual'} onClick={() => onSelectStatusFilter('manual')} />
      <Card emoji="💰" label="Montant restant à allouer" value={`${fmtMoney(stats.totalRemaining)} DHS`}
        toneClass={stats.totalRemaining > 0 ? 'text-orange-600' : 'text-emerald-600'} />
    </div>
  )
}
