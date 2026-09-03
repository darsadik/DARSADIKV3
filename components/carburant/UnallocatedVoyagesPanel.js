import Link from 'next/link'
import { fmt, fmtDate } from '../../lib/utils'
import { TIMELINE_STATUS } from '../../lib/services/voyageKmFuel'

// ── Voyages sans allocation carburant (spec §2/§3/§14 case 1) ───────────────
// A voyage with real KM but no fuel cost must never look like a silent "real
// zero" — this panel lists exactly those voyages, distinguishing "⏳ En
// attente" (its refueling period hasn't closed yet — normal, temporary) from
// "⚠ Manquant" (no automatic bracket and no manual link — needs a dispatcher
// to look at it). Every field comes from buildUnallocatedVoyages, itself a
// pure filter/reshape of voyageRows (buildVoyageKmFuelTimeline) — no new
// calculation happens here or in that function.
export default function UnallocatedVoyagesPanel({ voyages }) {
  if (!voyages || voyages.length === 0) {
    return (
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-1">⛽ Voyages sans allocation carburant</h3>
        <div className="text-center text-emerald-600 text-xs py-6">✓ Tous les voyages avec KM ont un carburant déterminé</div>
      </div>
    )
  }

  const pending = voyages.filter(v => v.status === 'pending_measurement')
  const missing = voyages.filter(v => v.status === 'fuel_not_assigned')

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">⛽ Voyages sans allocation carburant</h3>
        <div className="flex gap-2 text-[10px] font-bold">
          {pending.length > 0 && <span className="badge-blue">{TIMELINE_STATUS.pending_measurement.emoji} {pending.length} en attente</span>}
          {missing.length > 0 && <span className="badge-amber">⚠ {missing.length} manquant{missing.length > 1 ? 's' : ''}</span>}
        </div>
      </div>
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100 sticky top-0 bg-white">
              <th className="text-left pb-2 pr-3">Date</th>
              <th className="text-left pb-2 pr-3">Client</th>
              <th className="text-left pb-2 pr-3">Destination</th>
              <th className="text-right pb-2 pr-3">KM</th>
              <th className="text-right pb-2">Statut</th>
            </tr>
          </thead>
          <tbody>
            {voyages.map(v => {
              const meta = TIMELINE_STATUS[v.status]
              return (
                <tr key={v.voyageId} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-3 text-slate-500">{fmtDate(v.date)}</td>
                  <td className="py-2 pr-3 text-slate-700 font-medium">{v.clientNames.length ? v.clientNames.join(', ') : '—'}</td>
                  <td className="py-2 pr-3 text-slate-500">{v.destination || '—'}</td>
                  <td className="py-2 pr-3 text-right text-slate-600">{fmt(v.distance)} km</td>
                  <td className="py-2 text-right">
                    <Link href={`/voyages/km-carburant?tab=allocation&search=${v.reference}`} className="font-semibold hover:underline"
                      style={{ color: v.status === 'pending_measurement' ? '#2563eb' : '#d97706' }}>
                      {meta?.emoji} {meta?.label}
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
