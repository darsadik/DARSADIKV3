import { useState } from 'react'
import Link from 'next/link'
import { fmt, fmtD, fmtDate } from '../../lib/utils'
import { CYCLE_STATUS_META } from '../../lib/services/fuelCycles'

function StatusBadge({ status }) {
  const m = CYCLE_STATUS_META[status] || CYCLE_STATUS_META.normal
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${m.bg} ${m.text} ring-1 ring-inset ${m.ring}`}>
      {m.emoji} {m.label}
    </span>
  )
}

function ScoreBadge({ score }) {
  if (score === null || score === undefined) return null
  const color = score >= 90 ? 'text-emerald-700 bg-emerald-50' : score >= 75 ? 'text-amber-700 bg-amber-50' : score >= 55 ? 'text-orange-700 bg-orange-50' : 'text-red-700 bg-red-50'
  return (
    <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${color}`} title="Score qualité du cycle">
      {score}/100
    </span>
  )
}

function ComparisonStrip({ label, comparison, thresholdPct = 15 }) {
  if (!comparison) return null
  const { diffPct, direction } = comparison
  const severe = direction === 'worse' && diffPct >= thresholdPct * 2
  const color = direction === 'better'
    ? 'text-emerald-700 bg-emerald-50'
    : severe ? 'text-red-700 bg-red-50' : (diffPct >= thresholdPct ? 'text-orange-700 bg-orange-50' : 'text-amber-700 bg-amber-50')
  const arrow = direction === 'better' ? '▼' : '▲'
  return (
    <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs ${color}`}>
      <span className="font-medium">{label}</span>
      <span className="font-black">{arrow} {diffPct > 0 ? '+' : ''}{diffPct}%</span>
    </div>
  )
}

function Stat({ label, value, sub, tone = '' }) {
  return (
    <div className={`rounded-lg p-1.5 text-center ${tone || 'bg-gray-50'}`}>
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className="text-xs font-bold text-gray-700">{value}</div>
      {sub && <div className="text-[9px] text-gray-400">{sub}</div>}
    </div>
  )
}

export default function CycleCard({ cycle, onMergeChoice, onAnalyze, thresholdPct = 15 }) {
  const [expanded, setExpanded] = useState(false)
  const isOpen = cycle.statut === 'en_cours'
  const ev = cycle.evaluation

  return (
    <div className={`border rounded-xl p-3 ${isOpen ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100'}`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <span className="font-black text-gray-900 text-sm">Cycle #{cycle.number}</span>
          <StatusBadge status={ev?.status || (isOpen ? 'in_progress' : 'normal')} />
          <ScoreBadge score={ev?.score ?? null} />
          {cycle.merged && (
            <span className="bg-purple-50 text-purple-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
              🔗 {cycle.pleins.length} pleins {cycle.mergedManually ? '(fusion manuelle)' : '(fusion auto)'}
            </span>
          )}
        </div>
        {onAnalyze && (
          <button onClick={() => onAnalyze(cycle)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-900 transition-colors">
            🔍 Analyser le cycle
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-3 text-center">
        <Stat label="Début" value={fmtDate(cycle.dateDebut)} />
        <Stat label="Fin" value={cycle.dateFin ? fmtDate(cycle.dateFin) : 'En cours'} />
        <Stat label="Distance" value={cycle.distance !== null ? `${fmt(cycle.distance)} km` : 'en attente'} tone="bg-blue-50" />
        <Stat label="Voyages" value={cycle.nbVoyages} />
        <Stat label="Pleins" value={cycle.pleins.length} />
        <Stat label="Litres" value={`${fmtD(cycle.litresGasoil)} L`} tone="bg-cyan-50" />
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-2 text-center">
        <Stat label="Coût carburant" value={`${fmt(cycle.coutTotal)} DHS`} tone="bg-red-50" />
        <Stat label="Consommation" value={cycle.consoL100 !== null ? `${cycle.consoL100.toFixed(1)} L/100` : '—'} tone="bg-purple-50" />
        <Stat label="Coût/km" value={cycle.coutKm !== null ? `${cycle.coutKm.toFixed(2)} DHS` : '—'} tone="bg-amber-50" />
        <Stat label="KM ouverture" value={fmt(cycle.kmDebut)} />
        <Stat label="KM fermeture" value={isOpen ? (cycle.kmActuel !== null ? fmt(cycle.kmActuel) : '—') : fmt(cycle.kmFin)} />
        <Stat label="Durée" value={cycle.dateFin ? `${Math.round((new Date(cycle.dateFin) - new Date(cycle.dateDebut)) / 86400000)} j` : '—'} sub="secondaire" />
      </div>

      {(ev?.comparisonToAverage || ev?.comparisonToPrevious) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
          <ComparisonStrip label="vs. moyenne du camion" comparison={ev?.comparisonToAverage} thresholdPct={thresholdPct} />
          <ComparisonStrip label="vs. cycle précédent" comparison={ev?.comparisonToPrevious} thresholdPct={thresholdPct} />
        </div>
      )}

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
          {ev?.checks && (
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Vérifications qualité</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                {ev.checks.filter(c => c.pass !== null).map(c => (
                  <div key={c.key} className={`text-xs px-2 py-1 rounded-lg ${c.pass ? 'text-emerald-700 bg-emerald-50' : 'text-orange-700 bg-orange-50'}`}>
                    {c.pass ? '✔' : '⚠'} {c.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Pleins ({cycle.pleins.length})</div>
            <div className="space-y-1">
              {cycle.pleins.map((p, i) => {
                // Spec §5's explicit sequence: opening refill → (intermediate
                // refills, when this cycle-start group merged several
                // same-session pleins) → the row below the loop shows the
                // closing refill (the NEXT cycle's opening plein).
                const roleLabel = i === 0 ? 'Plein d\'ouverture' : 'Plein intermédiaire'
                return (
                  <div key={p.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-2 py-1.5 text-xs">
                    <div>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mr-1.5">{roleLabel}</span>
                      <span className="font-semibold text-gray-800">{fmtDate(p.date)}</span>
                      <span className="text-gray-400 ml-2">{fmtD(p.qte)} L · KM {fmt(p.km)}</span>
                    </div>
                    {i > 0 && onMergeChoice && (
                      <button
                        onClick={() => onMergeChoice(p.id, false)}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white border border-gray-200 hover:bg-gray-100"
                        title="Créer un nouveau cycle à partir de ce plein"
                      >✂️ Nouveau cycle</button>
                    )}
                    {i === 0 && cycle.pleins.length === 1 && onMergeChoice && (
                      <button
                        onClick={() => onMergeChoice(p.id, true)}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white border border-gray-200 hover:bg-gray-100"
                        title="Fusionner avec le plein précédent"
                      >🔗 Fusionner avec le précédent</button>
                    )}
                  </div>
                )
              })}
              {cycle.closingPlein && (
                <div className="flex items-center justify-between bg-emerald-50 rounded-lg px-2 py-1.5 text-xs ring-1 ring-inset ring-emerald-100">
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-500 mr-1.5">Plein de clôture</span>
                    <span className="font-semibold text-emerald-800">{fmtDate(cycle.closingPlein.date)}</span>
                    <span className="text-emerald-500 ml-2">KM {fmt(cycle.closingPlein.km)}</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-600">🏁 Cycle clôturé</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Voyages du cycle ({cycle.nbVoyages})</div>
            {cycle.voyages.length === 0 ? (
              <div className="text-[10px] text-gray-400 italic">Aucun voyage dans ce cycle</div>
            ) : (
              <div className="space-y-1">
                {cycle.voyages.map(v => {
                  const part = cycle.coutKm !== null && v.vKm !== null ? v.vKm * cycle.coutKm : null
                  return (
                    <Link key={v.id} href={`/voyages/${v.id}`} className="flex items-center justify-between bg-slate-50 hover:bg-slate-100 rounded-lg px-2 py-1.5 text-xs transition-colors">
                      <div>
                        <span className="font-semibold text-gray-800">{v.reference || `#${v.id}`}</span>
                        <span className="text-gray-400 ml-2">{fmtDate(v.date_depart)}</span>
                        {v.destination && <span className="text-gray-400 ml-1">→ {v.destination}</span>}
                      </div>
                      <div className="flex gap-3 text-right">
                        <span className="text-blue-600 font-semibold">{v.vKm !== null ? `${fmt(v.vKm)} km` : '—'}</span>
                        <span className="text-amber-600 font-bold">{part !== null ? `${fmt(part)} DHS` : '—'}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
