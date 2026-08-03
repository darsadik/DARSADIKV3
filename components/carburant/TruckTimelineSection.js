import { useState } from 'react'
import { fmt, fmtDate } from '../../lib/utils'
import EventCard, { eventColorClasses } from './EventCard'

// Groups one truck's already-sorted events by day so the date header shows
// once per day instead of being repeated on every block.
function groupByDate(events) {
  const groups = []
  events.forEach(e => {
    const last = groups[groups.length - 1]
    if (last && last.date === e.date) last.items.push(e)
    else groups.push({ date: e.date, items: [e] })
  })
  return groups
}

function HeaderStat({ label, value, tone }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-black ${tone || 'text-slate-800'}`}>{value}</div>
    </div>
  )
}

// One independent truck timeline (spec §1/§7) — a collapsible section with a
// summary header, then this truck's own chronological voyage+fuel history.
// All numbers come from lib/services/voyage/timelineEvents.js's
// groupTimelineByTruck — this component only renders.
export default function TruckTimelineSection({ group, onFixVoyage, onEditKm, onAssignFuel, onFixGasoil, onViewChain, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const dayGroups = groupByDate(group.events)

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setExpanded(x => !x)} className="w-full flex items-center justify-between gap-4 flex-wrap text-left">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🚛</span>
          <div>
            <div className="text-lg font-black text-slate-900">{group.plaque}</div>
            {group.chauffeur && <div className="text-xs font-semibold text-slate-400">{group.chauffeur}</div>}
          </div>
        </div>

        <div className="flex items-center gap-6 flex-wrap">
          <HeaderStat label="Dernier KM connu" value={group.lastKnownKm !== null ? fmt(group.lastKnownKm) : '—'} />
          <HeaderStat label="Voyages" value={group.nbVoyages} />
          <HeaderStat label="Pleins" value={group.nbFuel} />
          <HeaderStat label="Carburant non assigné" value={group.fuelNotAssigned} tone={group.fuelNotAssigned ? 'text-amber-600' : 'text-emerald-600'} />
          <HeaderStat label="Problèmes" value={group.problems} tone={group.problems ? 'text-red-600' : 'text-emerald-600'} />
          <button onClick={e => { e.stopPropagation(); onViewChain(group.camionId) }}
            className="text-xs font-bold text-brand-600 hover:underline whitespace-nowrap">🔗 Chaîne odomètre</button>
          <span className={`text-slate-400 text-lg transition-transform ${expanded ? 'rotate-180' : ''}`}>⌄</span>
        </div>
      </button>

      {expanded && (
        <div className="mt-6 pt-6 border-t border-slate-100 space-y-8">
          {dayGroups.map((g, gi) => (
            <div key={g.date} className={gi % 2 === 1 ? 'bg-slate-50/60 -mx-5 px-5 py-4 rounded-xl' : ''}>
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
      )}
    </div>
  )
}
