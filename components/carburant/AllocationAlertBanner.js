import Link from 'next/link'

// Fuel Health / Audit Alerts (spec items 10, 11) on /gasoil — every count is
// a plain read of buildAllocationStats(buildAllocationCards(...)), the same
// functions that already power the Contrôle Allocation tab's own KPI cards;
// nothing is recomputed here. Renders nothing at all when everything is
// clean (not an empty box) — the accountant should only ever see this when
// there's something to act on.
const ALERTS = [
  { key: 'waiting', statusFilter: 'waiting', icon: '🟡', text: n => `${n} plein${n > 1 ? 's' : ''} sans KM — action manuelle requise` },
  { key: 'partiallyAllocated', statusFilter: 'remaining', icon: '🟠', text: n => `${n} plein${n > 1 ? 's' : ''} avec un solde restant à allouer` },
  { key: 'manualOverrides', statusFilter: 'manual', icon: '🔵', text: n => `${n} allocation${n > 1 ? 's' : ''} manuelle${n > 1 ? 's' : ''} à revoir` },
]

export default function AllocationAlertBanner({ stats }) {
  const active = ALERTS.filter(a => (stats?.[a.key] || 0) > 0)
  if (active.length === 0) return null

  return (
    <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
      <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wide px-1">⚠ Contrôle Allocation — à vérifier</div>
      {active.map(a => (
        <Link key={a.key} href={`/voyages/km-carburant?tab=allocation&statusFilter=${a.statusFilter}`}
          className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2 text-xs hover:bg-amber-50/60 transition group">
          <span className="text-slate-700 font-semibold">{a.icon} {a.text(stats[a.key])}</span>
          <span className="text-amber-600 font-bold opacity-0 group-hover:opacity-100 transition">Voir →</span>
        </Link>
      ))}
    </div>
  )
}
