import { useMemo } from 'react'
import { fmt, fmtDate } from '../../lib/utils'
import { buildTruckOdometerChain } from '../../lib/services/voyage/timelineEvents'

const WARNING_META = {
  duplicate: { label: 'KM dupliqué', cls: 'border-amber-300 bg-amber-50 text-amber-700' },
  decreasing: { label: 'KM inférieur au précédent', cls: 'border-red-300 bg-red-50 text-red-700' },
}

// Spec §11 — read-only KM sequence visualization per truck, merging voyage
// KM readings (kilometrage.js's buildOdometerRows) with plein KM readings.
// Purely comparative flags (this point vs the previous one) — no write
// actions, no recomputation of any distance/status already produced
// elsewhere.
export default function OdometerChainStrip({ camionId, camionPlaque, odometerRows, gasoil, onClose }) {
  const points = useMemo(() => buildTruckOdometerChain(camionId, odometerRows, gasoil), [camionId, odometerRows, gasoil])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-gray-900">🔗 Chaîne odomètre — {camionPlaque}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Séquence chronologique des relevés KM (voyages + pleins)</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>

        <div className="p-5">
          {points.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">Aucun relevé KM pour ce camion</div>
          ) : (
            <div className="space-y-1">
              {points.map((p, i) => (
                <div key={`${p.type}-${p.voyageId || p.gasoilId}-${i}`}>
                  <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border ${p.warning ? WARNING_META[p.warning].cls : 'border-slate-100 bg-slate-50'}`}>
                    <div className="flex items-center gap-2">
                      <span>{p.type === 'voyage' ? '🚚' : '⛽'}</span>
                      <span className="text-xs font-semibold text-slate-700">{p.label}</span>
                      <span className="text-[10px] text-slate-400">{fmtDate(p.date)}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-800">{fmt(p.km)} km</span>
                  </div>
                  {p.warning && (
                    <div className="text-[10px] font-semibold px-3 py-1 text-red-500">⚠ {WARNING_META[p.warning].label}</div>
                  )}
                  {i < points.length - 1 && <div className="flex justify-center text-slate-300 text-xs py-0.5">↓</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
