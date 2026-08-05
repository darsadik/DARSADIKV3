// 4-tier margin color coding, shared by every table/badge/chart in the
// Profitability Center so "high/medium/low/loss" always means the same
// thresholds everywhere. Presentational only — does not touch how margin
// itself is calculated (that's marge = profit/revenue*100 from the engine).
// Thresholds follow standard accounting convention: green >25%, blue 15-25%,
// orange 5-15%, red <5%.
export const MARGIN_TIERS = [
  { key: 'high',   label: 'Élevée',  min: 25,        text: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', dot: '#10b981' },
  { key: 'medium', label: 'Moyenne', min: 15,        text: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-200',    dot: '#2563eb' },
  { key: 'low',    label: 'Faible',  min: 5,         text: 'text-orange-700',  bg: 'bg-orange-50',   border: 'border-orange-200',  dot: '#ea580c' },
  { key: 'loss',   label: 'Perte',   min: -Infinity, text: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',     dot: '#dc2626' },
]

export function marginTier(marge) {
  const m = marge ?? 0
  return MARGIN_TIERS.find(t => m >= t.min) || MARGIN_TIERS[MARGIN_TIERS.length - 1]
}

export default function MarginBadge({ marge, size = 'sm' }) {
  const tier = marginTier(marge)
  const pad = size === 'lg' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
  return (
    <span className={`inline-flex items-center gap-1 font-bold rounded-full border ${tier.bg} ${tier.text} ${tier.border} ${pad}`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tier.dot }} />
      {Math.round(marge ?? 0)}%
    </span>
  )
}

// Row-level tint (for "one row = one voyage" tables) — softer than the badge
// background so it reads as a subtle row highlight, not a solid fill.
export function marginRowClass(marge) {
  const tier = marginTier(marge)
  return {
    high:   'hover:bg-emerald-50/60',
    medium: 'hover:bg-blue-50/60',
    low:    'hover:bg-orange-50/60',
    loss:   'bg-red-50/40 hover:bg-red-50/70',
  }[tier.key]
}
