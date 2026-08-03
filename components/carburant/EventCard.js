import Link from 'next/link'
import { fmt, fmtD } from '../../lib/utils'
import { TIMELINE_STATUS } from '../../lib/services/voyageKmFuel'

const BADGE_TONE = { ok: 'badge-green', warning: 'badge-amber', error: 'badge-red', info: 'badge-blue' }

// Color-coding language from spec §5: blue = voyage, green = fuel purchase,
// gray = estimated position, red overrides both when the event has a real
// problem. Shared with UnifiedTimelineList's rail dots so the accent bar and
// the dot always agree.
export function eventColorClasses(e) {
  if (e.hasProblem || (e.type === 'voyage' && e.status === 'impossible_distance')) return { border: 'border-l-red-400', dot: 'bg-red-500' }
  if (e.type === 'plein' && e.estimatedPosition) return { border: 'border-l-slate-300', dot: 'bg-slate-400' }
  if (e.type === 'voyage') return { border: 'border-l-brand-400', dot: 'bg-brand-500' }
  return { border: 'border-l-emerald-400', dot: 'bg-emerald-500' }
}

// Hero KM display (spec §3) — the number the whole page exists to make
// instantly verifiable. Values only, never computed here.
function KmHero({ startLabel, startValue, endLabel, endValue }) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div>
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{startLabel}</div>
        {startValue !== null && startValue !== undefined ? (
          <div className="text-4xl font-black text-slate-900 leading-none tabular-nums">{fmt(startValue)}</div>
        ) : (
          <div className="text-2xl font-bold text-slate-300 leading-none">— manquant</div>
        )}
      </div>
      {endLabel && (
        <>
          <div className="text-2xl text-slate-300 pt-4">→</div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{endLabel}</div>
            {endValue !== null && endValue !== undefined ? (
              <div className="text-4xl font-black text-slate-900 leading-none tabular-nums">{fmt(endValue)}</div>
            ) : (
              <div className="text-2xl font-bold text-amber-400 leading-none">en attente</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Thin odometer-chain breadcrumb (spec §7) — nearest known reading before
// and after this event on the same truck, so a discontinuity is visible
// without opening the full chain modal. Pure display of values already
// computed by lib/services/voyage/timelineEvents.js's attachChainContext.
function ChainBreadcrumb({ e }) {
  if (e.chainPrevKm === null && e.chainNextKm === null) return null
  const broken = e.chainWarning === 'decreasing'
  const duplicate = e.chainWarning === 'duplicate'
  const currentKm = e.type === 'plein' ? e.km : e.kmDepart
  return (
    <div className={`flex items-center gap-1.5 text-[11px] mt-2 ${broken ? 'text-red-600 font-semibold' : duplicate ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
      <span>Chaîne :</span>
      <span>{e.chainPrevKm !== null ? fmt(e.chainPrevKm) : '—'}</span>
      <span>→</span>
      <span className="font-bold">{currentKm !== null && currentKm !== undefined ? fmt(currentKm) : '?'}</span>
      <span>→</span>
      <span>{e.chainNextKm !== null ? fmt(e.chainNextKm) : '—'}</span>
      {broken && <span className="badge-red ml-1">⚠ discontinuité</span>}
      {duplicate && <span className="badge-amber ml-1">⚠ KM dupliqué</span>}
    </div>
  )
}

function Tile({ label, value, tone }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-base font-bold ${tone || 'text-slate-800'}`}>{value}</div>
    </div>
  )
}

function VoyageBlock({ e, onFixVoyage, onEditKm }) {
  const meta = TIMELINE_STATUS[e.status]
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">🚚</span>
          <div>
            <Link href={`/voyages/${e.voyageId}`} className="text-lg font-black text-brand-700 hover:underline leading-tight">{e.reference}</Link>
            <div className="text-xs font-semibold text-slate-500">{e.plaque} <span className="text-slate-300">·</span> {e.chauffeur}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {meta && <span className={BADGE_TONE[meta.tone]}>{meta.emoji} {meta.label}</span>}
          {e.outOfSync && <span className="badge-amber">désynchronisé</span>}
        </div>
      </div>

      <KmHero startLabel="KM Départ" startValue={e.kmDepart} endLabel="KM Arrivée" endValue={e.kmArrivee} />
      <ChainBreadcrumb e={e} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
        <Tile label="Distance" value={e.distance !== null ? `${fmt(e.distance)} km` : '—'}
          tone={e.distance < 0 ? 'text-red-600' : e.distance === 0 ? 'text-amber-600' : undefined} />
        <Tile label="Carburant assigné" value={e.fuelCost ? `${fmt(e.fuelCost)} DHS` : '—'} tone="text-amber-700" />
        <Tile label="Coût / KM" value={e.costPerKm !== null ? `${fmtD(e.costPerKm)} DHS` : '—'} />
        <Tile label="Source" value={<span className="text-xs font-semibold text-slate-500">{e.fuelSourceLabel}{e.fillLabel ? ` · ${e.fillLabel}` : ''}</span>} />
      </div>

      <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
        <button onClick={() => onEditKm(e, 'start')} className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition">✏ Corriger KM Départ</button>
        <button onClick={() => onEditKm(e, 'arrival')} className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition">✏ Corriger KM Arrivée</button>
        <button onClick={() => onFixVoyage(e.voyageId)} className="text-xs font-bold text-brand-700 bg-brand-50 border border-brand-100 px-3 py-1.5 rounded-lg hover:bg-brand-100 transition ml-auto">🚚 Ouvrir le voyage →</button>
      </div>
    </div>
  )
}

const ASSIGNMENT_BADGE = {
  assigned: { label: '🔗 Assigné', cls: 'badge-blue' },
  split: { label: '✂ Partagé', cls: 'badge-blue' },
}

function PleinBlock({ e, onAssign, onFixGasoil }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">⛽</span>
          <div>
            <div className="text-lg font-black text-emerald-700 leading-tight">Plein — {e.plaque}</div>
            <div className="text-xs font-semibold text-slate-500">{e.station || 'Station inconnue'}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {e.implicitlyUsed && <span className="badge-green">⚡ Auto (chaîne KM)</span>}
          {ASSIGNMENT_BADGE[e.assignmentStatus] && <span className={ASSIGNMENT_BADGE[e.assignmentStatus].cls}>{ASSIGNMENT_BADGE[e.assignmentStatus].label}</span>}
          {e.needsAssignment && <span className="badge-gray">⚪ Non assigné</span>}
          {e.estimatedPosition && <span className="badge-gray">📍 Position estimée</span>}
        </div>
      </div>

      <KmHero startLabel="KM Relevé" startValue={e.km} />
      <ChainBreadcrumb e={e} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
        <Tile label="Litres" value={`${fmtD(e.qte)} L`} />
        <Tile label="Total" value={`${fmt(e.total)} DHS`} tone="text-amber-700" />
        <Tile label="Assigné à" value={
          e.links.length
            ? e.links.map(l => `V-${l.voyage_id}`).join(', ')
            : (e.estimatedPosition
              ? <Link href={`/voyages/${e.estimatedPosition.anchorVoyageId}`} className="text-slate-500 hover:underline">{e.estimatedPosition.position === 'before' ? 'avant' : 'après'} {e.estimatedPosition.anchorReference}</Link>
              : '—')
        } />
        <Tile label="AdBlue" value={e.adblueTotal ? (
          <>
            {fmt(e.adblueTotal)} DHS
            {!!e.adblueQte && <span className="block text-[10px] font-semibold text-slate-400 normal-case">{fmtD(e.adblueQte)} L × {fmtD(e.adblueUnitPrice)} DHS</span>}
          </>
        ) : '—'} />
      </div>

      <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
        <button onClick={() => onAssign(e)} className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition">
          {e.assignmentStatus === 'unassigned' ? '🔗 Assigner' : e.assignmentStatus === 'split' ? '✂ Modifier / compléter' : '🔗 Modifier l\'assignation'}
        </button>
        <button onClick={() => onFixGasoil(e)} className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition ml-auto">✏ Corriger le plein</button>
      </div>
    </div>
  )
}

// One block of the unified operational history (spec §1/§4) — a voyage or a
// fuel purchase, both rendered with equal visual weight so fuel purchases
// stop feeling like an afterthought (spec §2). All numbers are read straight
// off the event object built by lib/services/voyage/timelineEvents.js.
export default function EventCard({ event, onFixVoyage, onEditKm, onAssignFuel, onFixGasoil }) {
  return (
    <div className={`border-l-4 ${eventColorClasses(event).border} bg-white rounded-r-xl pl-5 pr-5 py-5`}>
      {event.type === 'voyage'
        ? <VoyageBlock e={event} onFixVoyage={onFixVoyage} onEditKm={onEditKm} />
        : <PleinBlock e={event} onAssign={onAssignFuel} onFixGasoil={onFixGasoil} />}
    </div>
  )
}
