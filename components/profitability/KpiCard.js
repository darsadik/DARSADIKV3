const COLORS = {
  slate:   'text-slate-800',
  green:   'text-emerald-600',
  red:     'text-red-500',
  darkred: 'text-red-800',
  blue:    'text-blue-600',
  orange:  'text-orange-500',
  amber:   'text-amber-600',
  purple:  'text-purple-600',
}

export default function KpiCard({ label, value, sub, color = 'slate', icon, large, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-3 md:p-4 text-left w-full ${onClick ? 'hover:border-slate-200 hover:shadow-md transition cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between mb-2 gap-1">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
        {icon && <span className="text-lg flex-shrink-0">{icon}</span>}
      </div>
      {/* Value shrinks below `md` (the same breakpoint the surrounding KPI
          grids switch from 2 to 4+ columns at), and wraps instead of
          overflowing if a long formatted amount still doesn't fit — never
          truncates/clips a financial figure. */}
      <div className={`font-black ${COLORS[color] || COLORS.slate} break-words ${large ? 'text-xl md:text-3xl' : 'text-base md:text-xl'}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-1">{sub}</div>}
    </Tag>
  )
}
