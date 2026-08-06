import { fmt, fmtDate, fmtMoney } from '../../lib/utils'

const DOT_COLOR = { red: 'bg-red-500', orange: 'bg-orange-500', purple: 'bg-purple-500', green: 'bg-emerald-500' }

// Optional visual timeline (spec item 10) — Purchase → Voyages → Purchase,
// per truck. Pure display re-arrangement of the SAME cards
// AllocationControlCenter already built (lib/services/voyage/fuelAllocationCenter.js) —
// no new data model, no recomputation. Purchases with no KM sort to the end
// of their truck's rail since they have no position on it.
//
// Click-to-highlight (spec item 8): clicking a purchase or a voyage chip
// dims everything else, showing only that purchase's own voyages or that
// voyage's own purchase — pure client-side selection state, no data change.
export default function AllocationVisualTimeline({ cards, highlightedGasoilId, highlightedVoyageId, onSelectPurchase, onSelectVoyage }) {
  const byCamion = new Map()
  cards.forEach(c => {
    if (!byCamion.has(c.camionId)) byCamion.set(c.camionId, [])
    byCamion.get(c.camionId).push(c)
  })

  const groups = [...byCamion.entries()].map(([camionId, list]) => ({
    camionId, plaque: list[0]?.plaque || `Camion #${camionId}`,
    cards: [...list].sort((a, b) => {
      if (a.hasKm !== b.hasKm) return a.hasKm ? -1 : 1
      return (a.km ?? 0) - (b.km ?? 0)
    }),
  })).sort((a, b) => a.plaque.localeCompare(b.plaque))

  if (groups.length === 0) return <div className="card text-center text-slate-400 py-14">Aucun plein pour ces filtres</div>

  // A purchase is "relevant" to the current highlight if it's the selected
  // purchase itself, or it's the selected voyage's own purchase.
  function isPurchaseRelevant(c) {
    if (highlightedGasoilId) return c.gasoilId === highlightedGasoilId
    if (highlightedVoyageId) return c.voyageAllocations.some(v => v.voyageId === highlightedVoyageId)
    return true
  }
  function isVoyageRelevant(c, v) {
    if (highlightedGasoilId) return c.gasoilId === highlightedGasoilId
    if (highlightedVoyageId) return v.voyageId === highlightedVoyageId
    return true
  }
  const hasHighlight = !!(highlightedGasoilId || highlightedVoyageId)

  return (
    <div className="space-y-6">
      {hasHighlight && (
        <button onClick={() => { onSelectPurchase(null); onSelectVoyage(null) }} className="text-xs font-bold text-brand-600 hover:underline">
          ✕ Effacer la sélection
        </button>
      )}
      {groups.map(g => (
        <div key={g.camionId} className="card">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🚛</span>
            <span className="font-black text-slate-900">{g.plaque}</span>
          </div>
          <div className="relative pl-7">
            <div className="absolute left-[9px] top-3 bottom-3 w-0.5 bg-slate-200" />
            <div className="space-y-5">
              {g.cards.map(c => {
                const purchaseDim = hasHighlight && !isPurchaseRelevant(c)
                return (
                  <div key={c.gasoilId} className={`relative transition-opacity ${purchaseDim ? 'opacity-30' : ''}`}>
                    <div className={`absolute -left-7 top-1.5 w-3.5 h-3.5 rounded-full ring-4 ring-white ${DOT_COLOR[c.colorClass] || 'bg-slate-400'}`} />
                    <button onClick={() => onSelectPurchase(highlightedGasoilId === c.gasoilId ? null : c.gasoilId)}
                      className="text-xs font-bold text-slate-700 hover:text-brand-600 transition text-left">
                      ⛽ {fmtDate(c.date)} {c.hasKm ? `· KM ${fmt(c.km)}` : '· sans KM'} · {fmtMoney(c.total)} DHS
                      <span className="ml-2 text-[10px] text-slate-400 font-normal">restant {fmtMoney(c.remaining)} DHS</span>
                    </button>
                    {c.voyageAllocations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 pl-2">
                        {c.voyageAllocations.map(v => {
                          const voyageDim = hasHighlight && !isVoyageRelevant(c, v)
                          return (
                            <button key={v.voyageId}
                              onClick={() => onSelectVoyage(highlightedVoyageId === v.voyageId ? null : v.voyageId)}
                              className={`text-[10px] font-semibold border rounded-full px-2 py-1 transition-opacity ${
                                voyageDim ? 'opacity-30 bg-slate-50 border-slate-100 text-slate-500' : 'bg-slate-50 border-slate-100 text-slate-600 hover:border-brand-300'
                              }`}>
                              🚚 {v.reference} · {fmtMoney(v.amount)} DHS
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
