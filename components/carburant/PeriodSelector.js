import { useState } from 'react'
import { periodRange } from '../../lib/camionPerformance'
import { fmtDate } from '../../lib/utils'

// Self-contained period control for the Truck Control Center — reuses the
// one shared date-range utility (lib/camionPerformance.js:periodRange)
// instead of computing date math in the page. Deliberately not the heavier
// SmartFilters.js (built for the old page's camion/status/threshold
// filtering) — this control only ever emits { from, to } upward.
const PRESETS = [
  { key: 'jour', label: "Aujourd'hui" },
  { key: 'semaine', label: 'Cette semaine' },
  { key: 'mois', label: 'Ce mois' },
  { key: 'mois_dernier', label: 'Mois dernier' },
  { key: 'perso', label: 'Personnalisé' },
]

export default function PeriodSelector({ value, onChange }) {
  const [preset, setPreset] = useState('mois')
  const [customFrom, setCustomFrom] = useState(value?.from || '')
  const [customTo, setCustomTo] = useState(value?.to || '')

  function selectPreset(key) {
    setPreset(key)
    if (key === 'perso') {
      onChange(periodRange('perso', customFrom, customTo))
    } else {
      onChange(periodRange(key))
    }
  }

  function applyCustom(from, to) {
    setCustomFrom(from); setCustomTo(to)
    onChange(periodRange('perso', from, to))
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {PRESETS.map(p => (
        <button key={p.key} type="button" onClick={() => selectPreset(p.key)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
            preset === p.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}>
          {p.label}
        </button>
      ))}
      {preset === 'perso' && (
        <div className="flex items-center gap-1.5 ml-1">
          <input type="date" className="input text-xs py-1.5" value={customFrom} onChange={e => applyCustom(e.target.value, customTo)} />
          <span className="text-slate-400 text-xs">→</span>
          <input type="date" className="input text-xs py-1.5" value={customTo} onChange={e => applyCustom(customFrom, e.target.value)} />
        </div>
      )}
      {value?.from && value?.to && (
        <span className="text-xs text-slate-400 ml-1">{fmtDate(value.from)} → {fmtDate(value.to)}</span>
      )}
    </div>
  )
}
