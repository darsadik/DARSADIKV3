import EventCard, { eventColorClasses } from './EventCard'
import { fmtDate } from '../../lib/utils'

// Groups already-sorted events by day so the date header appears once per
// day (spec §1's mockup) instead of being repeated on every block.
function groupByDate(events) {
  const groups = []
  events.forEach(e => {
    const last = groups[groups.length - 1]
    if (last && last.date === e.date) last.items.push(e)
    else groups.push({ date: e.date, items: [e] })
  })
  return groups
}

// One continuous operational history (spec §1) — a single rail runs through
// every day's events so voyages and fuel purchases read as one uninterrupted
// timeline instead of a pile of separate cards.
export default function UnifiedTimelineList({ events, loading, onFixVoyage, onEditKm, onAssignFuel, onFixGasoil }) {
  if (loading) return <div className="card text-center text-gray-400 py-14">Chargement...</div>
  if (events.length === 0) return <div className="card text-center text-gray-400 py-14">Aucun événement pour ces filtres</div>

  const groups = groupByDate(events)

  return (
    <div className="card">
      <div className="space-y-10">
        {groups.map(g => (
          <div key={g.date}>
            <div className="flex items-center gap-3 mb-4">
              <div className="text-sm font-black text-slate-800 uppercase tracking-wide whitespace-nowrap">{fmtDate(g.date)}</div>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <div className="relative pl-7">
              <div className="absolute left-[9px] top-3 bottom-3 w-0.5 bg-slate-200" />
              <div className="space-y-6">
                {g.items.map(e => (
                  <div key={e.id} className="relative">
                    <div className={`absolute -left-7 top-6 w-3.5 h-3.5 rounded-full ring-4 ring-white ${eventColorClasses(e).dot}`} />
                    <EventCard
                      event={e}
                      onFixVoyage={onFixVoyage}
                      onEditKm={onEditKm}
                      onAssignFuel={onAssignFuel}
                      onFixGasoil={onFixGasoil}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
