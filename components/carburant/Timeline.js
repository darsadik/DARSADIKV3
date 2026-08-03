import { fmt, fmtD, fmtDate } from '../../lib/utils'
import { buildTimeline } from '../../lib/services/fuelCycles'

const EVENT_META = {
  plein:        { icon: '⛽', color: 'text-amber-700 bg-amber-50' },
  voyage:       { icon: '🚚', color: 'text-blue-700 bg-blue-50' },
  cycle_closed: { icon: '🏁', color: 'text-emerald-700 bg-emerald-50' },
}

function eventLabel(e) {
  if (e.type === 'plein') return `Plein — ${fmtD(e.ref.qte || 0)} L${e.ref.km ? ` · KM ${fmt(e.ref.km)}` : ''}`
  if (e.type === 'voyage') return `Voyage ${e.ref.reference || `#${e.ref.id}`}${e.ref.destination ? ` → ${e.ref.destination}` : ''}`
  if (e.type === 'cycle_closed') return `Cycle #${e.ref.number || ''} clôturé`
  return e.type
}

export default function Timeline({ truck, limit = 30 }) {
  const events = buildTimeline(truck).slice(-limit)
  if (events.length === 0) {
    return <div className="text-center text-gray-400 text-xs py-4">Aucun événement</div>
  }
  return (
    <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
      {events.map((e, i) => {
        const m = EVENT_META[e.type]
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className={`w-6 h-6 flex items-center justify-center rounded-full ${m.color} flex-shrink-0`}>{m.icon}</span>
            <span className="text-gray-400 w-20 flex-shrink-0">{fmtDate(e.date)}</span>
            <span className="text-gray-700 truncate">{eventLabel(e)}</span>
          </div>
        )
      })}
    </div>
  )
}
