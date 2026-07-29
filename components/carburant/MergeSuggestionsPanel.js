import { fmtDate, fmtD, fmt } from '../../lib/utils'

// ── Merge Suggestions panel (spec §6/§9) — flat, top-level view of every
// auto-merged group still pending explicit confirmation. Merge/Ignore reuse
// the exact same handleMergeChoice already wired per-plein in CycleCard —
// this is just a faster way to review them without expanding every cycle.

export default function MergeSuggestionsPanel({ suggestions, onMergeChoice }) {
  return (
    <div className="card">
      <h3 className="font-semibold text-gray-900 mb-3">🔗 Suggestions de fusion</h3>
      {suggestions.length === 0 ? (
        <div className="text-center text-emerald-600 text-xs py-6">✓ Aucune suggestion en attente</div>
      ) : (
        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
          {suggestions.map((s, i) => (
            <div key={i} className="px-3 py-2 rounded-lg bg-purple-50 ring-1 ring-inset ring-purple-100 text-xs">
              <div className="font-bold text-purple-800">{s.camionPlaque} — Cycle #{s.cycleNumber}</div>
              <div className="text-purple-700/90 mt-0.5">{s.message}</div>
              <div className="text-purple-400 mt-1">
                {s.pleins.map(p => `${fmtDate(p.date)}${p.heure ? ` ${p.heure}` : ''} · ${fmtD(p.qte)} L · KM ${fmt(p.km)}`).join('  —  ')}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => onMergeChoice(s.pleins[s.pleins.length - 1].id, true)}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-purple-600 text-white hover:bg-purple-700"
                >✔ Fusionner</button>
                <button
                  onClick={() => onMergeChoice(s.pleins[s.pleins.length - 1].id, false)}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-white border border-purple-200 text-purple-700 hover:bg-purple-50"
                >✂️ Ignorer (nouveau cycle)</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
