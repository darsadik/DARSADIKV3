// Spec §12 "Quick Audit Mode" — a compact, always-visible strip so the whole
// truck history can be sanity-checked in seconds. Every number here is a
// read of something the page already computed (buildTimelineDashboard,
// buildUnifiedTimeline) — this component performs zero detection of its own.
function Pill({ emoji, label, value, tone, active, onClick }) {
  const toneCls = {
    ok: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-100 bg-amber-50 text-amber-700',
    error: 'border-red-100 bg-red-50 text-red-700',
    neutral: 'border-slate-100 bg-slate-50 text-slate-600',
  }[tone || 'neutral']
  const Cmp = onClick ? 'button' : 'div'
  return (
    <Cmp onClick={onClick} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap transition ${toneCls} ${active ? 'ring-2 ring-brand-500' : ''} ${onClick ? 'hover:brightness-95' : ''}`}>
      <span>{emoji}</span><span>{value}</span><span className="font-normal opacity-80">{label}</span>
    </Cmp>
  )
}

export default function QuickAuditStrip({ dashboard, pleinsWithKm, pleinsNeedingAssignment, activeStatus, needsAssignmentActive, onSelectStatus, onNeedsAssignment }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <Pill emoji="✔" label="voyages vérifiés" value={dashboard.byStatus.complete || 0} tone="ok"
        active={activeStatus === 'complete'} onClick={() => onSelectStatus('complete')} />
      <Pill emoji="⛽" label="pleins avec KM" value={pleinsWithKm} tone="neutral" />
      <Pill emoji="🟡" label="KM départ manquant" value={dashboard.byStatus.missing_start_km || 0} tone="warning"
        active={activeStatus === 'missing_start_km'} onClick={() => onSelectStatus('missing_start_km')} />
      <Pill emoji="🟡" label="KM arrivée manquant" value={dashboard.byStatus.missing_end_km || 0} tone="warning"
        active={activeStatus === 'missing_end_km'} onClick={() => onSelectStatus('missing_end_km')} />
      <Pill emoji="🔴" label="chaîne / distance cassée" value={dashboard.byStatus.impossible_distance || 0} tone="error"
        active={activeStatus === 'impossible_distance'} onClick={() => onSelectStatus('impossible_distance')} />
      <Pill emoji="⚪" label="pleins non assignés" value={pleinsNeedingAssignment} tone={pleinsNeedingAssignment ? 'warning' : 'neutral'}
        active={needsAssignmentActive} onClick={onNeedsAssignment} />
    </div>
  )
}
