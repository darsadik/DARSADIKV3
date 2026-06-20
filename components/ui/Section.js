export default function Section({ icon, title, children, action, color = 'blue' }) {
  const colors = {
    blue:   'border-blue-100 bg-blue-50/30',
    green:  'border-emerald-100 bg-emerald-50/30',
    orange: 'border-orange-100 bg-orange-50/30',
    purple: 'border-purple-100 bg-purple-50/30',
    red:    'border-red-100 bg-red-50/30',
    slate:  'border-slate-100 bg-slate-50/30',
  }
  return (
    <div className={`rounded-2xl border ${colors[color]} overflow-hidden`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className="font-bold text-slate-700 text-sm">{title}</span>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}
