import Link from 'next/link'
import { fmt, fmtD, fmtMoney, fmtDate } from '../../lib/utils'
import { TIMELINE_STATUS } from '../../lib/services/voyageKmFuel'
import Section from '../ui/Section'

function Kpi({ label, value, sub, tone = '' }) {
  return (
    <div className={`rounded-xl p-2.5 text-center ${tone || 'bg-slate-50'}`}>
      <div className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-black text-slate-800">{value}</div>
      {sub && <div className="text-[9px] text-slate-400">{sub}</div>}
    </div>
  )
}

// One voyage's L/100km — reuses the row's own already-computed litersLinked
// (lib/services/voyageKmFuel.js, itself reading the corrected fuelAllocation
// engine's per-voyage share). 'pending_measurement' shows the existing
// pending wording rather than a fabricated number; any other no-litres case
// (manual_rate/manual_amount modes, which never enter the litres pool) shows
// a plain dash — genuinely different from "waiting for the next refuel".
function VoyageL100Km({ row }) {
  if (row.litersLinked !== null && row.litersLinked > 0 && row.distance > 0) {
    return <span className="font-bold text-slate-700">{(row.litersLinked / row.distance * 100).toFixed(1)}</span>
  }
  if (row.status === 'pending_measurement') {
    const meta = TIMELINE_STATUS.pending_measurement
    return <span className="text-amber-600 text-[11px] font-semibold">{meta.emoji} {meta.label}</span>
  }
  return <span className="text-slate-300">—</span>
}

export default function TruckControlCard({ camion, currentKmRow, lastFuelDate, kpis, voyageRows, onEditKm }) {
  return (
    <Section icon="🚛" title={camion.plaque} color="blue"
      action={<Link href={`/camions/${camion.id}`} className="text-xs font-semibold text-brand-600 hover:underline">Fiche camion →</Link>}>

      {/* ── Header: current KM (editable) + last fuel date ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">KM compteur actuel</div>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-black text-slate-800">
                {currentKmRow ? `${fmt(currentKmRow.kmDepart)} km` : '—'}
              </span>
              {currentKmRow && (
                <button onClick={() => onEditKm(currentKmRow)}
                  className="text-xs text-brand-600 hover:text-brand-700" title="Modifier la KM">✏️</button>
              )}
            </div>
          </div>
          {camion.chauffeur && (
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">Chauffeur</div>
              <div className="text-xs font-semibold text-slate-600">{camion.chauffeur}</div>
            </div>
          )}
          {voyageRows.length > 0 && voyageRows[voyageRows.length - 1]?.statut && (
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">Dernier statut voyage</div>
              <div className="text-xs font-semibold text-slate-600">{voyageRows[voyageRows.length - 1].statut}</div>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-400 uppercase tracking-wide">Dernier plein</div>
          <div className="text-xs font-semibold text-slate-600">{lastFuelDate ? fmtDate(lastFuelDate) : '—'}</div>
        </div>
      </div>

      {/* ── Period KPIs ── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
        <Kpi label="Total KM" value={fmt(kpis.totalKm)} tone="bg-blue-50" />
        <Kpi label="Litres" value={`${fmtD(kpis.totalLitres)} L`} tone="bg-cyan-50" />
        <Kpi label="L/100km" value={kpis.avgL100km !== null ? kpis.avgL100km.toFixed(1) : '—'} tone="bg-purple-50" />
        <Kpi label="Coût carburant" value={`${fmtMoney(kpis.totalCost)} DHS`} tone="bg-red-50" />
        <Kpi label="DH/km" value={kpis.avgDhKm !== null ? fmtMoney(kpis.avgDhKm) : '—'} tone="bg-amber-50" />
        <Kpi label="Voyages" value={`${kpis.nbMeasured} / ${kpis.nbMeasured + kpis.nbPending}`} sub={kpis.nbPending > 0 ? `${kpis.nbPending} en attente` : 'tous mesurés'} />
      </div>

      {/* ── Voyages ── */}
      {voyageRows.length === 0 ? (
        <div className="text-center text-slate-400 text-xs py-4">Aucun voyage sur la période sélectionnée</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                <th className="text-left pb-2 pr-3">Date</th>
                <th className="text-left pb-2 pr-3">Client</th>
                <th className="text-left pb-2 pr-3">Destination</th>
                <th className="text-right pb-2 pr-3">KM</th>
                <th className="text-right pb-2">L/100km</th>
              </tr>
            </thead>
            <tbody>
              {voyageRows.map(row => (
                <tr key={row.voyageId} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-3 text-slate-500">{fmtDate(row.date)}</td>
                  <td className="py-2 pr-3 text-slate-700 font-medium">{(row.clientNames || []).join(', ') || '—'}</td>
                  <td className="py-2 pr-3 text-slate-500">{row.destination || '—'}</td>
                  <td className="py-2 pr-3 text-right text-slate-600">{row.distance !== null ? `${fmt(row.distance)} km` : '—'}</td>
                  <td className="py-2 text-right"><VoyageL100Km row={row} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
