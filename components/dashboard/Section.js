// Shared card/header shell for every Executive Cockpit section — same white
// card, radius, border, shadow and header typography as the Profitability
// Center (components/profitability/DataTable.js / Overview.js's ChartCard),
// so the Dashboard reads as one consistent system instead of a one-off theme.
export default function Section({ title, subtitle, action, children, bodyClassName = '' }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {(title || action) && (
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            {title && <h3 className="font-bold text-slate-700 text-sm">{title}</h3>}
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  )
}
