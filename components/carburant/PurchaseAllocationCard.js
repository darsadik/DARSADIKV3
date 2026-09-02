import { useState } from 'react'
import { fmt, fmtD, fmtDate, fmtMoney } from '../../lib/utils'
import { remainingBadgeTone, explainRemaining } from '../../lib/services/voyage/fuelAllocationCenter'
import AllocationListRow from './AllocationListRow'
import AllocationProgressBar from './AllocationProgressBar'

// Border/ring color per the confirmed 4-color priority chain
// (lib/services/voyage/fuelAllocationCenter.js's classifyAllocationColor),
// never re-derived here. Red now means "impossible to resolve on its own"
// (no KM, or a manual fixed amount got capped) — not just "waiting."
const COLOR = {
  red:    { border: 'border-l-red-400',    ring: 'ring-red-100 bg-red-50',       text: 'text-red-600' },
  orange: { border: 'border-l-orange-400', ring: 'ring-orange-100 bg-orange-50', text: 'text-orange-600' },
  purple: { border: 'border-l-purple-400', ring: 'ring-purple-100 bg-purple-50', text: 'text-purple-600' },
  green:  { border: 'border-l-emerald-400',ring: 'ring-emerald-100 bg-emerald-50', text: 'text-emerald-600' },
}

// Same 4 states as classifyAllocationColor — only the wording changed
// (confirmed with the accountant) to a friendlier workflow vocabulary. No
// new status is stored anywhere; this is a pure relabeling of the existing
// derived colorClass.
const STATUS_LABEL = {
  red: '🟡 Nouveau',
  orange: '🟠 Nécessite vérification',
  purple: '🔵 Clôturé — manuel',
  green: '🟢 Vérifié',
}

const STATUS_TITLE = {
  red: "Pas encore de KM ou montant manuel qui ne couvre pas le plein — action requise.",
  orange: "Allocation partielle — il reste un solde à couvrir.",
  purple: "Entièrement alloué grâce à un lien manuel — figé tant que personne ne le modifie.",
  green: "Entièrement alloué automatiquement par le moteur d'allocation.",
}

// Small badge next to the Remaining figure — its OWN color, independent of
// the card's overall badge, purely from remaining/total (spec item 2).
const REMAINING_TONE_CLS = {
  green: 'text-emerald-600 bg-emerald-50',
  'light-green': 'text-emerald-500 bg-emerald-50/60',
  orange: 'text-orange-600 bg-orange-50',
}

// The Fuel Purchase Card (spec items 1, 2, 5, 7, 8) — collapsed by default,
// showing a rich summary (truck/date/KM/litres/price/total/voyage count) and
// the Total/Allocated/Remaining bar; expands to the full Allocation List.
// Every number is read straight off the card object built by
// lib/services/voyage/fuelAllocationCenter.js:buildAllocationCards — nothing
// is recomputed in this component.
export default function PurchaseAllocationCard({ card, onAssign, onMoveVoyage, onUnlinkVoyage, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [showWhy, setShowWhy] = useState(false)
  const c = COLOR[card.colorClass] || COLOR.green
  const remTone = remainingBadgeTone(card)
  const why = explainRemaining(card)

  return (
    <div className={`card border-l-4 ${c.border} overflow-hidden`}>
      <button onClick={() => setExpanded(x => !x)} className="w-full flex items-center justify-between gap-4 flex-wrap text-left">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl flex-shrink-0">⛽</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-black text-slate-900">{card.plaque}</span>
              <span className="text-[11px] font-semibold text-slate-400">Plein #{card.gasoilId}</span>
              <span title={STATUS_TITLE[card.colorClass]} className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${c.ring} ${c.text} cursor-help`}>
                {STATUS_LABEL[card.colorClass]}
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {card.voyageAllocations.length} voyage{card.voyageAllocations.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {fmtDate(card.date)} · {card.station || 'Station inconnue'} · {card.hasKm ? `KM ${fmt(card.km)}` : 'Sans KM'}
              {' · '}{fmtD(card.qte)} L × {fmtMoney(card.prixUnitaire)} DHS/L
              {card.discount > 0 && <> · <span className="text-emerald-500">Remise −{fmtMoney(card.discount)} DHS</span></>}
              {card.adblueTotal > 0 && <> · AdBlue {fmtMoney(card.adblueTotal)} DHS</>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 flex-wrap">
          <div className="text-right">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Total</div>
            <div className="text-sm font-black text-slate-800">{fmtMoney(card.total)} DHS</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Alloué</div>
            <div className="text-sm font-black text-emerald-600">{fmtMoney(card.allocated)} DHS</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Restant</div>
            {remTone ? (
              <button onClick={e => { e.stopPropagation(); setShowWhy(x => !x) }}
                className={`text-sm font-black px-2 py-0.5 rounded-lg ${REMAINING_TONE_CLS[remTone]}`}>
                {fmtMoney(card.remaining)} DHS <span className="font-semibold">({card.remainingPct}%)</span>
              </button>
            ) : (
              <div className="text-sm font-black text-slate-300">{fmtMoney(card.remaining)} DHS (0%)</div>
            )}
          </div>
          <span className={`text-slate-400 text-lg transition-transform ${expanded ? 'rotate-180' : ''}`}>⌄</span>
        </div>
      </button>

      <div className="mt-3 max-w-md">
        <AllocationProgressBar allocated={card.allocated} total={card.total} colorClass={card.colorClass} />
      </div>

      {showWhy && why && (
        <div className="mt-3 text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
          <b>Pourquoi ce reste ?</b> {why}
        </div>
      )}

      {expanded && (
        <div className="mt-5 pt-5 border-t border-slate-100">
          {card.hasManualLink && (
            <div className="mb-4 flex items-start gap-2 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2.5 text-xs text-purple-800">
              <span className="text-base leading-none">🔧</span>
              <div>
                <b>Override manuel</b> — ce plein a été modifié manuellement.
                Déplacer un voyage affecte immédiatement les totaux ci-dessus.
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Prix / L</div>
              <div className="text-sm font-bold text-slate-700">{fmtMoney(card.prixUnitaire)} DHS</div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Chauffeur</div>
              <div className="text-sm font-bold text-slate-700">{card.chauffeur}</div>
            </div>
            {card.adblueTotal > 0 && (
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">AdBlue</div>
                <div className="text-sm font-bold text-slate-700">{fmtD(card.adblueQte)} L × {fmtMoney(card.adblueUnitPrice)}</div>
              </div>
            )}
            {card.fixedAmountsCapped && (
              <div>
                <div className="text-[11px] font-bold text-red-500 uppercase tracking-wide">⚠ Montants fixes plafonnés</div>
                <div className="text-xs text-red-600">Les montants manuels dépassaient le total — réduits proportionnellement.</div>
              </div>
            )}
          </div>

          {/* Visual Coverage (spec item 5) — one summary line before the
              itemized list, built purely from voyageAllocations already on
              this card (no new data). */}
          {card.voyageAllocations.length > 0 && (
            <div className="mb-4 flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
              <span className="text-emerald-500">✔</span>
              <span>
                Ce plein couvre <b className="text-slate-700">{card.voyageAllocations.length} voyage{card.voyageAllocations.length > 1 ? 's' : ''}</b>
                {card.coveredDistance > 0 && <> sur <b className="text-slate-700">{fmt(card.coveredDistance)} km</b></>}
                {' — '}
                {card.fullyAllocated
                  ? <span className="text-emerald-600 font-semibold">carburant entièrement alloué ✓</span>
                  : <span className="text-orange-600 font-semibold">{fmtMoney(card.remaining)} DHS restants</span>}
              </span>
            </div>
          )}

          {card.status === 'waiting' ? (
            <div className="text-center py-6 text-sm text-red-500 font-semibold bg-red-50 rounded-xl">
              Ce plein n'a pas de KM — allocation automatique impossible.<br />
              <span className="font-normal text-red-400 text-xs">Suggestions indisponibles — associez un voyage manuellement.</span>
            </div>
          ) : card.voyageAllocations.length === 0 ? (
            <div className="text-center py-6 text-sm text-slate-400">
              Aucun voyage associé pour l'instant.
              {card.isFirstBoundary ? (
                <div className="text-xs mt-1">Premier plein enregistré pour ce camion — point de départ, rien à mesurer encore.</div>
              ) : card.isOpenBracket && (
                <div className="text-xs mt-1">Aucun voyage dans la période couverte par ce plein.</div>
              )}
            </div>
          ) : (
            <div>
              {card.voyageAllocations.map(v => (
                <AllocationListRow key={v.voyageId} voyage={v}
                  canUnlink={v.mode !== 'automatic'}
                  onMove={() => onMoveVoyage(card, v)}
                  onUnlink={() => onUnlinkVoyage(card, v)} />
              ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
            <button onClick={() => onAssign(card)} className="text-xs font-bold bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition">
              + Assigner un voyage
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
