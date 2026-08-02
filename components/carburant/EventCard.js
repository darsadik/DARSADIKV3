import Link from 'next/link'
import { fmt, fmtD, fmtDate } from '../../lib/utils'
import { TIMELINE_STATUS } from '../../lib/services/voyageKmFuel'

const BADGE_TONE = { ok: 'badge-green', warning: 'badge-amber', error: 'badge-red', info: 'badge-blue' }
const DOT_TONE = { ok: 'bg-emerald-500', warning: 'bg-amber-500', error: 'bg-red-500', info: 'bg-brand-500' }

function KmField({ label, value, sourceLabel, missingLabel = 'KM manquant', estimated }) {
  return (
    <div>
      <div className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</div>
      {value !== null && value !== undefined ? (
        <div className="text-sm font-bold text-slate-800">{fmt(value)} <span className="text-[10px] font-normal text-slate-400">km</span></div>
      ) : (
        <div className={`text-sm font-semibold ${estimated ? 'text-blue-500' : 'text-slate-300'}`}>{estimated ? 'Estimé' : missingLabel}</div>
      )}
      {sourceLabel && <div className="text-[10px] text-slate-400 mt-0.5">{sourceLabel}</div>}
    </div>
  )
}

function VoyageCard({ e, onFixVoyage, onEditKm }) {
  const meta = TIMELINE_STATUS[e.status]
  return (
    <div className={`bg-white rounded-xl border p-4 ${e.hasProblem ? 'border-red-200' : 'border-slate-100'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-lg">🚚</span>
          <div>
            <Link href={`/voyages/${e.voyageId}`} className="font-bold text-brand-600 hover:underline">{e.reference}</Link>
            <div className="text-xs text-slate-400">{e.plaque} · {e.chauffeur}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {meta && <span className={BADGE_TONE[meta.tone]}>{meta.emoji} {meta.label}</span>}
          {e.outOfSync && <span className="badge-amber">désynchronisé</span>}
          {e.hasProblem && <span className="badge-red">⚠ à vérifier</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 pt-3 border-t border-slate-50">
        <KmField label="KM Départ" value={e.kmDepart} sourceLabel="Manuel" />
        <KmField
          label="KM Arrivée"
          value={e.kmArrivee}
          sourceLabel={e.kmArrivee !== null ? 'Voyage suivant' : (e.isLastForTruck ? 'En attente du prochain voyage' : null)}
        />
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wide">Distance</div>
          <div className={`text-sm font-bold ${e.distance < 0 ? 'text-red-600' : e.distance === 0 ? 'text-amber-600' : 'text-slate-800'}`}>
            {e.distance !== null ? `${fmt(e.distance)} km` : <span className="text-slate-300 font-normal">—</span>}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wide">Carburant</div>
          <div className="text-sm font-bold text-amber-700">{e.fuelCost ? `${fmt(e.fuelCost)} DHS` : <span className="text-slate-300 font-normal">—</span>}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{e.fuelSourceLabel}{e.fillLabel ? ` · ${e.fillLabel}` : ''}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wide">Coût / KM</div>
          <div className="text-sm font-bold text-slate-800">{e.costPerKm !== null ? `${fmtD(e.costPerKm)} DHS` : <span className="text-slate-300 font-normal">—</span>}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-50">
        <button onClick={() => onEditKm(e, 'start')} className="text-xs font-semibold text-brand-600 hover:underline">✏ KM Départ</button>
        <button onClick={() => onEditKm(e, 'arrival')} className="text-xs font-semibold text-brand-600 hover:underline">✏ KM Arrivée</button>
        <button onClick={() => onFixVoyage(e.voyageId)} className="text-xs font-semibold text-slate-500 hover:underline ml-auto">🚚 Corriger le voyage →</button>
      </div>
    </div>
  )
}

const ASSIGNMENT_BADGE = {
  unassigned: null, // shown via needsAssignment/implicitlyUsed below instead
  assigned: { label: '🔗 Assigné', cls: 'badge-blue' },
  split: { label: '✂ Partagé', cls: 'badge-blue' },
}

function PleinCard({ e, onAssign, onFixGasoil }) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${e.hasProblem ? 'border-red-200' : 'border-amber-100'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-lg">⛽</span>
          <div>
            <span className="font-bold text-slate-800">{e.plaque}</span>
            <span className="text-xs text-slate-400 ml-2">{e.station || 'Station inconnue'}</span>
            <div className="text-xs text-slate-400">{fmtDate(e.date)}{e.heure ? ` · ${e.heure}` : ''}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {e.implicitlyUsed && <span className="badge-green">⚡ Utilisé auto (chaîne KM)</span>}
          {ASSIGNMENT_BADGE[e.assignmentStatus] && <span className={ASSIGNMENT_BADGE[e.assignmentStatus].cls}>{ASSIGNMENT_BADGE[e.assignmentStatus].label}</span>}
          {e.needsAssignment && <span className="badge-gray">⚪ Non assigné</span>}
          {e.estimatedPosition && <span className="badge-blue">📍 Position estimée</span>}
          {e.hasProblem && <span className="badge-red">⚠ à vérifier</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-slate-50">
        <KmField label="KM Relevé" value={e.km} estimated={false} />
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wide">Litres</div>
          <div className="text-sm font-bold text-slate-800">{fmtD(e.qte)} L</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wide">Total</div>
          <div className="text-sm font-bold text-amber-700">{fmt(e.total)} DHS</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wide">Position</div>
          {e.estimatedPosition ? (
            <div className="text-xs text-blue-600">
              {e.estimatedPosition.position === 'before' ? 'Avant' : 'Après'} <Link href={`/voyages/${e.estimatedPosition.anchorVoyageId}`} className="font-semibold hover:underline">{e.estimatedPosition.anchorReference}</Link>
            </div>
          ) : (
            <div className="text-xs text-slate-400">KM disponible</div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-50">
        <button onClick={() => onAssign(e)} className="text-xs font-semibold text-brand-600 hover:underline">
          {e.assignmentStatus === 'unassigned' ? '🔗 Assigner à un voyage' : '🔗 Modifier l\'assignation'}
        </button>
        <button onClick={() => onFixGasoil(e)} className="text-xs font-semibold text-slate-500 hover:underline ml-auto">✏ Corriger le plein</button>
      </div>
    </div>
  )
}

// The core "not a plain table row" unit (spec §13) — one event, either a
// voyage or a plein, rendered as a rich card with a timeline dot/connector
// to its left. All numbers are read straight off the event object built by
// lib/services/voyage/timelineEvents.js — this component computes nothing.
export default function EventCard({ event, isLast, onFixVoyage, onEditKm, onAssignFuel, onFixGasoil }) {
  const tone = event.type === 'voyage' ? (TIMELINE_STATUS[event.status]?.tone || 'ok') : (event.needsAssignment ? 'warning' : 'ok')
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0 pt-1">
        <div className={`w-2.5 h-2.5 rounded-full ${DOT_TONE[tone]}`} />
        {!isLast && <div className="w-px flex-1 bg-slate-100 mt-1" />}
      </div>
      <div className="flex-1 min-w-0 pb-4">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{fmtDate(event.date)}</div>
        {event.type === 'voyage'
          ? <VoyageCard e={event} onFixVoyage={onFixVoyage} onEditKm={onEditKm} />
          : <PleinCard e={event} onAssign={onAssignFuel} onFixGasoil={onFixGasoil} />}
      </div>
    </div>
  )
}
