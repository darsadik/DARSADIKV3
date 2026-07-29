import { fmtDate } from '../../lib/utils'

// ── Missing Data panel (spec §4/§10) — every row is clickable and opens the
// exact record to fix, in-place, without navigating away from the Control
// Center (VoyageFixModal / GasoilFixModal). Rows with no single record to
// open (missing_cycle, missing_truck without an id) just show as info.

const CATEGORY_META = {
  voyage_missing_km: { emoji: '🚚', label: 'Voyage sans KM' },
  plein_missing_km:  { emoji: '⛽', label: 'Plein sans KM' },
  plein_missing_hour:{ emoji: '🕒', label: 'Heure manquante' },
  missing_cycle:     { emoji: '📭', label: 'Aucun cycle' },
  missing_truck:     { emoji: '❓', label: 'Camion manquant' },
}

export default function MissingDataPanel({ items, onOpenVoyage, onOpenGasoil }) {
  return (
    <div className="card">
      <h3 className="font-semibold text-gray-900 mb-3">🧩 Données manquantes</h3>
      {items.length === 0 ? (
        <div className="text-center text-emerald-600 text-xs py-6">✓ Aucune donnée manquante</div>
      ) : (
        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
          {items.map((m, i) => {
            const meta = CATEGORY_META[m.category] || { emoji: '⚠️', label: m.category }
            const clickable = (m.refType === 'voyage' && onOpenVoyage) || (m.refType === 'plein' && onOpenGasoil)
            return (
              <button
                key={i}
                disabled={!clickable}
                onClick={() => {
                  if (m.refType === 'voyage') onOpenVoyage?.(m.refId)
                  else if (m.refType === 'plein') onOpenGasoil?.(m.refId)
                }}
                className={`w-full flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100 text-xs text-left transition-colors ${clickable ? 'hover:bg-amber-100 cursor-pointer' : 'cursor-default opacity-80'}`}
              >
                <span>{meta.emoji}</span>
                <span className="flex-1">
                  <span className="font-bold">{meta.label}</span>
                  {m.date && <span className="text-amber-500 ml-1">· {fmtDate(m.date)}</span>}
                  <div className="text-amber-700/90">{m.message}</div>
                </span>
                {clickable && <span className="text-amber-400 font-bold">→</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
