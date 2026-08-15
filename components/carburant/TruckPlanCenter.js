import { useState, useMemo } from 'react'
import { fmtMoney, fmtDate } from '../../lib/utils'
import { StatusBadge } from '../voyage/StatusBadges'
import TruckPlanAssignModal from './TruckPlanAssignModal'
import TruckPlanUnlinkConfirm from './TruckPlanUnlinkConfirm'

// "Truck ↔ Plan" tab (km-carburant.js) — a per-truck view of the existing
// truck↔voyage relationship (voyages.camion_id), letting the user Link/
// Change/Unlink a truck's current active voyage ("plan") without leaving
// the Truck Control Center. Every number shown (fuel cost/source, litres,
// linked pleins) is read straight off `voyageRows` — already built by
// buildVoyageKmFuelTimeline for the Chronologie tab — nothing here
// recomputes anything. Writes go through lib/services/voyage/camionLink.js,
// which only ever touches voyages.camion_id/camion_plaque/chauffeur —
// achats/livraisons/charges/retours/voyage_gasoil/gasoil are never touched.
export default function TruckPlanCenter({ camions, activeVoyages, voyageRows, voyageGasoilRows, onSaved }) {
  const [search, setSearch] = useState('')
  const [assignState, setAssignState] = useState(null) // { mode: 'link'|'change', camion, currentPlan }
  const [unlinkState, setUnlinkState] = useState(null) // { camion, plan, planRow }

  const voyageRowById = useMemo(() => new Map((voyageRows || []).map(v => [v.voyageId, v])), [voyageRows])

  const gasoilCountByVoyageId = useMemo(() => {
    const map = new Map()
    ;(voyageGasoilRows || []).forEach(g => map.set(g.voyage_id, (map.get(g.voyage_id) || 0) + 1))
    return map
  }, [voyageGasoilRows])

  const truckPlans = useMemo(() => {
    return (camions || []).map(camion => {
      const myVoyages = (activeVoyages || []).filter(v => v.camion_id === camion.id)
      const activePlans = myVoyages.filter(v => v.statut === 'en_cours')
      return { camion, activePlans }
    })
  }, [camions, activeVoyages])

  const filteredTruckPlans = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return truckPlans
    return truckPlans.filter(({ camion }) =>
      (camion.plaque || '').toLowerCase().includes(q) || (camion.chauffeur || '').toLowerCase().includes(q))
  }, [truckPlans, search])

  const stats = useMemo(() => {
    const withPlan = truckPlans.filter(t => t.activePlans.length === 1).length
    const withoutPlan = truckPlans.filter(t => t.activePlans.length === 0).length
    const problems = truckPlans.filter(t => t.activePlans.length > 1).length
    return { total: truckPlans.length, withPlan, withoutPlan, problems }
  }, [truckPlans])

  // "Available plans" for the Link/Change picker: any other truck's active
  // voyage, or an orphaned (unlinked) voyage — never this truck's own
  // current plan(s). Scoped to en_cours (or truck-less) so historical
  // finished voyages don't clutter the picker.
  function availablePlansFor(camionId) {
    return (activeVoyages || []).filter(v =>
      v.camion_id !== camionId && (v.statut === 'en_cours' || !v.camion_id))
  }

  function openLink(camion) {
    setAssignState({ mode: 'link', camion, currentPlan: null, available: availablePlansFor(camion.id) })
  }
  function openChange(camion, currentPlan) {
    setAssignState({ mode: 'change', camion, currentPlan, available: availablePlansFor(camion.id) })
  }
  function openUnlink(camion, plan) {
    setUnlinkState({ camion, plan, planRow: voyageRowById.get(plan.id) || null })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-3 md:p-4">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Camions</div>
          <div className="text-xl font-black text-slate-800">{stats.total}</div>
        </div>
        <div className="card p-3 md:p-4">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Avec plan actif</div>
          <div className="text-xl font-black text-emerald-600">{stats.withPlan}</div>
        </div>
        <div className="card p-3 md:p-4">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Sans plan</div>
          <div className="text-xl font-black text-slate-400">{stats.withoutPlan}</div>
        </div>
        <div className="card p-3 md:p-4">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">⚠ Problèmes</div>
          <div className={`text-xl font-black ${stats.problems > 0 ? 'text-red-500' : 'text-slate-300'}`}>{stats.problems}</div>
        </div>
      </div>

      <input className="input text-sm w-full max-w-xs" placeholder="Rechercher un camion, un chauffeur..."
        value={search} onChange={e => setSearch(e.target.value)} />

      {filteredTruckPlans.length === 0 ? (
        <div className="card text-center text-slate-400 py-14">Aucun camion trouvé</div>
      ) : (
        <div className="space-y-3">
          {filteredTruckPlans.map(({ camion, activePlans }) => (
            <TruckPlanCard key={camion.id} camion={camion} activePlans={activePlans}
              voyageRowById={voyageRowById} gasoilCountByVoyageId={gasoilCountByVoyageId}
              onLink={() => openLink(camion)}
              onChange={plan => openChange(camion, plan)}
              onUnlink={plan => openUnlink(camion, plan)} />
          ))}
        </div>
      )}

      {assignState && (
        <TruckPlanAssignModal
          mode={assignState.mode}
          camion={assignState.camion}
          currentPlan={assignState.currentPlan}
          available={assignState.available}
          onClose={() => setAssignState(null)}
          onSaved={onSaved}
        />
      )}

      {unlinkState && (
        <TruckPlanUnlinkConfirm
          camion={unlinkState.camion}
          plan={unlinkState.plan}
          planRow={unlinkState.planRow}
          gasoilCount={gasoilCountByVoyageId.get(unlinkState.plan.id) || 0}
          onClose={() => setUnlinkState(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

function TruckPlanCard({ camion, activePlans, voyageRowById, gasoilCountByVoyageId, onLink, onChange, onUnlink }) {
  const hasProblem = activePlans.length > 1
  const plan = activePlans.length === 1 ? activePlans[0] : null
  const planRow = plan ? voyageRowById.get(plan.id) : null

  return (
    <div className={`card border-l-4 ${hasProblem ? 'border-l-red-400' : plan ? 'border-l-emerald-400' : 'border-l-slate-200'}`}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl flex-shrink-0">🚚</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-black text-slate-900">{camion.plaque}</span>
              {camion.chauffeur && <span className="text-xs text-slate-400">{camion.chauffeur}</span>}
            </div>
            {camion.depot && <div className="text-[11px] text-slate-400 mt-0.5">{camion.depot}</div>}
          </div>
        </div>

        {!hasProblem && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {plan ? (
              <>
                <button onClick={() => onChange(plan)}
                  className="text-xs font-bold bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition">
                  🔄 Changer
                </button>
                <button onClick={() => onUnlink(plan)}
                  className="text-xs font-bold bg-white border border-red-200 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition">
                  ⛔ Retirer
                </button>
              </>
            ) : (
              <button onClick={onLink}
                className="text-xs font-bold bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 transition">
                🔗 Lier un plan
              </button>
            )}
          </div>
        )}
      </div>

      {hasProblem && (
        <div className="mt-3 bg-red-50 border border-red-100 rounded-xl p-3">
          <div className="text-xs font-bold text-red-600 mb-2">⚠ Assignation multiple — {activePlans.length} plans actifs simultanément pour ce camion</div>
          <div className="space-y-2">
            {activePlans.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 bg-white border border-red-100 rounded-lg px-3 py-2">
                <span className="text-xs font-semibold text-slate-700">{p.reference || `#${p.id}`} <span className="text-slate-400 font-normal">({fmtDate(p.date_depart)})</span></span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => onChange(p)} className="text-[11px] font-bold text-slate-500 hover:text-slate-700">🔄 Changer</button>
                  <button onClick={() => onUnlink(p)} className="text-[11px] font-bold text-red-500 hover:text-red-700">⛔ Retirer</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasProblem && !plan && (
        <div className="mt-3 text-xs text-slate-400">— Aucun plan actif —</div>
      )}

      {!hasProblem && plan && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-slate-800">{plan.reference || `#${plan.id}`}</span>
              <StatusBadge statut={plan.statut} />
              {plan.destination && <span className="text-xs text-slate-400">→ {plan.destination}</span>}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">{fmtDate(plan.date_depart)}</div>
          </div>
          {planRow && (
            <div className="text-right">
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                ⛽ {planRow.fuelSourceLabel}{gasoilCountByVoyageId.get(plan.id) > 0 && ` · ${gasoilCountByVoyageId.get(plan.id)} plein${gasoilCountByVoyageId.get(plan.id) > 1 ? 's' : ''} lié${gasoilCountByVoyageId.get(plan.id) > 1 ? 's' : ''}`}
              </div>
              <div className="text-sm font-black text-orange-500">{fmtMoney(planRow.fuelCost)} DHS</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
