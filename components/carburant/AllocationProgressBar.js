const FILL_CLASS = {
  red: 'bg-red-400',
  orange: 'bg-orange-400',
  purple: 'bg-purple-400',
  green: 'bg-emerald-400',
}

// Shared Allocated/Total gauge (spec items 2, 12) — a single horizontal bar,
// filled to `allocated/total`, colored by the card's own colorClass so it
// never disagrees with the badge next to it. Purely presentational: the
// percentage is computed from numbers the caller already has (never
// recomputed here), and `allocated + remaining === total` is the engine's
// own guarantee (fuelAllocation.js), not something this component enforces.
export default function AllocationProgressBar({ allocated, total, colorClass = 'green', size = 'md' }) {
  const pct = total > 0 ? Math.min(100, Math.round((allocated / total) * 1000) / 10) : 0
  const height = size === 'sm' ? 'h-1.5' : 'h-2'
  return (
    <div className={`w-full ${height} rounded-full bg-slate-100 overflow-hidden`} title={`${pct}% alloué`}>
      <div
        className={`${height} rounded-full ${FILL_CLASS[colorClass] || FILL_CLASS.green} transition-all duration-500 ease-out`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
