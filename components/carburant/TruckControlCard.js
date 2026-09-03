import Link from 'next/link'
import { fmt, fmtD, fmtDate, fmtMoney } from '../../lib/utils'
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

function RowStatus({ row }) {
  if (row.status === 'pending') {
    return <span className="text-amber-600 text-[11px] font-bold">⏳ En attente</span>
  }
  if (row.status === 'insufficient_km') {
    return <span className="text-amber-600 text-[11px] font-bold">⚠ KM insuffisant</span>
  }
  if (row.status === 'invalid') {
    return <span className="text-red-600 text-[11px] font-bold">⚠ KM invalide</span>
  }
  return <span className="font-bold text-slate-700">{row.consoL100.toFixed(1)}</span>
}

// A Bon whose own KM was missing never disappears — its litres ride along
// with the next Bon that DOES have a KM, and this note is the only visible
// trace of that merge (so the higher litres figure on that row is never a
// silent surprise).
function GroupedNote({ row }) {
  if (!row.groupedFrom) return null
  return <div className="text-[9px] text-amber-600 mt-0.5">inclut plein(s) sans KM depuis le {fmtDate(row.groupedFrom)}</div>
}

// Bon-based KM & consumption card (Contrôle KM & Carburant) — one row per
// Gasoil Bon, not per voyage. Every number here comes straight from
// lib/services/fleetFuelMonitoring.js, itself a thin shaping of
// lib/services/fuelPeriods.js's buildFleetFuelPeriods (the same authoritative
// REFUEL → VOYAGES → NEXT REFUEL model behind fuelAllocation.js) — no second
// calculation engine.
export default function TruckControlCard({ camion, currentKm, summary, onEditKm }) {
  const rows = summary.rowsInPeriod
  return (
    <Section icon="🚛" title={camion.plaque} color="blue"
      action={<Link href={`/camions/${camion.id}`} className="text-xs font-semibold text-brand-600 hover:underline">Fiche camion →</Link>}>

      {/* ── Header: current KM + driver ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">KM compteur actuel</div>
            <div className="text-lg font-black text-slate-800">{currentKm !== null ? `${fmt(currentKm)} km` : '—'}</div>
          </div>
          {camion.chauffeur && (
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">Chauffeur</div>
              <div className="text-xs font-semibold text-slate-600">{camion.chauffeur}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Period KPIs (weighted, never averaged-of-averages) ── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
        <Kpi label="Total KM" value={fmt(summary.distanceTotal)} tone="bg-blue-50" />
        <Kpi label="Total Gasoil" value={`${fmtD(summary.litresTotal)} L`} tone="bg-cyan-50" />
        <Kpi label="Consommation" value={summary.consoL100 !== null ? `${summary.consoL100.toFixed(1)} L/100` : '—'} tone="bg-purple-50" />
        <Kpi label="Coût carburant" value={`${fmtMoney(summary.coutTotal)} DHS`} tone="bg-red-50" />
        <Kpi label="DH/km" value={summary.coutKm !== null ? fmtMoney(summary.coutKm) : '—'} tone="bg-amber-50" />
        <Kpi label="Bons" value={`${summary.measuredCount} / ${rows.length}`} sub={summary.pendingCount > 0 ? `${summary.pendingCount} en attente` : 'tous mesurés'} />
      </div>

      {/* ── Bon / KM table ── */}
      {rows.length === 0 ? (
        <div className="text-center text-slate-400 text-xs py-4">Aucun bon de gasoil sur la période sélectionnée</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                <th className="text-left pb-2 pr-3">Date</th>
                <th className="text-right pb-2 pr-3">KM compteur</th>
                <th className="text-right pb-2 pr-3">KM parcourus</th>
                <th className="text-right pb-2 pr-3">Gasoil</th>
                <th className="text-right pb-2 pr-3">L/100km</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map(row => (
                <tr key={row.key} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-3 text-slate-500">{fmtDate(row.date)}</td>
                  <td className="py-2 pr-3 text-right font-semibold text-slate-700">{row.km !== null ? fmt(row.km) : '—'}</td>
                  <td className="py-2 pr-3 text-right text-slate-600">{row.distance !== null ? `${fmt(row.distance)} km` : '—'}</td>
                  <td className="py-2 pr-3 text-right text-slate-600">
                    {fmtD(row.liters)} L
                    <GroupedNote row={row} />
                  </td>
                  <td className="py-2 pr-3 text-right"><RowStatus row={row} /></td>
                  <td className="py-2 text-right">
                    {row.editGasoilRow && (
                      <button onClick={() => onEditKm(row.editGasoilRow)} className="text-[10px] font-semibold text-brand-600 hover:underline">✏️ KM</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
