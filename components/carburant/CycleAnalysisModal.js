import { fmt, fmtD, fmtDate, fmtMoney } from '../../lib/utils'
import { CYCLE_STATUS_META, generateCycleConclusion } from '../../lib/services/fuelCycles'

export default function CycleAnalysisModal({ cycle, camionPlaque, onClose }) {
  if (!cycle) return null
  const ev = cycle.evaluation
  const status = ev?.status || 'in_progress'
  const meta = CYCLE_STATUS_META[status] || CYCLE_STATUS_META.normal
  const conclusion = generateCycleConclusion(cycle)
  const suspicious = status === 'critical' || status === 'to_verify'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-black text-slate-800 text-sm">Analyse — Cycle #{cycle.number}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{camionPlaque} · {fmtDate(cycle.dateDebut)} → {cycle.dateFin ? fmtDate(cycle.dateFin) : 'en cours'}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1">×</button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <div className={`rounded-xl p-3 ${meta.bg} ${meta.text} ring-1 ring-inset ${meta.ring}`}>
            <div className="flex items-center justify-between">
              <span className="font-black text-sm">{meta.emoji} {meta.label}</span>
              {ev?.score !== null && ev?.score !== undefined && <span className="font-black text-sm">{ev.score}/100</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-gray-400">Distance</div>
              <div className="text-sm font-bold">{cycle.distance !== null ? `${fmt(cycle.distance)} km` : '—'}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-red-400">Coût carburant</div>
              <div className="text-sm font-bold text-red-700">{fmtMoney(cycle.coutTotal)} DHS</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-purple-400">Consommation</div>
              <div className="text-sm font-bold text-purple-700">{cycle.consoL100 !== null ? `${cycle.consoL100.toFixed(1)} L/100km` : '—'}</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-amber-400">Coût/km</div>
              <div className="text-sm font-bold text-amber-700">{cycle.coutKm !== null ? `${fmtMoney(cycle.coutKm)} DHS` : '—'}</div>
            </div>
          </div>

          {(ev?.comparisonToAverage || ev?.comparisonToPrevious) && (
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Comparaisons</div>
              <div className="space-y-1.5">
                {ev?.comparisonToAverage && (
                  <div className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                    <span>vs. moyenne du camion</span>
                    <span className={`font-black ${ev.comparisonToAverage.direction === 'better' ? 'text-emerald-600' : 'text-orange-600'}`}>
                      {ev.comparisonToAverage.direction === 'better' ? '▼' : '▲'} {ev.comparisonToAverage.diffPct > 0 ? '+' : ''}{ev.comparisonToAverage.diffPct}%
                    </span>
                  </div>
                )}
                {ev?.comparisonToPrevious && (
                  <div className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                    <span>vs. cycle précédent</span>
                    <span className={`font-black ${ev.comparisonToPrevious.direction === 'better' ? 'text-emerald-600' : 'text-orange-600'}`}>
                      {ev.comparisonToPrevious.direction === 'better' ? '▼' : '▲'} {ev.comparisonToPrevious.diffPct > 0 ? '+' : ''}{ev.comparisonToPrevious.diffPct}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {ev?.checks && (
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Vérifications</div>
              <div className="space-y-1">
                {ev.checks.filter(c => c.pass !== null).map(c => (
                  <div key={c.key} className={`text-xs px-2.5 py-1.5 rounded-lg ${c.pass ? 'text-emerald-700 bg-emerald-50' : 'text-orange-700 bg-orange-50'}`}>
                    {c.pass ? '✔' : '⚠'} {c.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`rounded-xl p-3 text-sm ${suspicious ? 'bg-orange-50 text-orange-800' : 'bg-emerald-50 text-emerald-800'}`}>
            <div className="font-black mb-1">Conclusion automatique</div>
            {conclusion.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </div>
      </div>
    </div>
  )
}
