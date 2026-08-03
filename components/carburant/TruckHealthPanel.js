import { fmt, fmtMoney } from '../../lib/utils'

export default function TruckHealthPanel({ camionPlaque, health }) {
  if (!health || health.nbCycles === 0) return null
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-black text-slate-700">📋 Santé du camion — {camionPlaque}</div>
        <div className="text-[10px] text-slate-400">{health.nbCycles} cycle{health.nbCycles > 1 ? 's' : ''} clôturé{health.nbCycles > 1 ? 's' : ''}</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
        <div className="bg-white rounded-lg p-1.5">
          <div className="text-[10px] text-gray-400">Conso. moyenne</div>
          <div className="text-xs font-bold text-gray-700">{health.avgConso !== null ? `${health.avgConso.toFixed(1)} L/100` : '—'}</div>
        </div>
        <div className="bg-emerald-50 rounded-lg p-1.5">
          <div className="text-[10px] text-emerald-500">Meilleur cycle</div>
          <div className="text-xs font-bold text-emerald-700">{health.bestCycle ? `${health.bestCycle.consoL100.toFixed(1)} L/100` : '—'}</div>
        </div>
        <div className="bg-red-50 rounded-lg p-1.5">
          <div className="text-[10px] text-red-400">Pire cycle</div>
          <div className="text-xs font-bold text-red-700">{health.worstCycle ? `${health.worstCycle.consoL100.toFixed(1)} L/100` : '—'}</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-1.5">
          <div className="text-[10px] text-amber-500">Coût/km moyen</div>
          <div className="text-xs font-bold text-amber-700">{health.avgCoutKm !== null ? `${fmtMoney(health.avgCoutKm)} DHS` : '—'}</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-1.5 col-span-2 md:col-span-1">
          <div className="text-[10px] text-blue-400">Distance/cycle moyenne</div>
          <div className="text-xs font-bold text-blue-700">{health.avgDistance !== null ? `${fmt(health.avgDistance)} km` : '—'}</div>
        </div>
      </div>
    </div>
  )
}
