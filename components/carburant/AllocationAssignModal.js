import { useState, useMemo } from 'react'
import { fmt, fmtD, fmtDate, fmtMoney, confidenceToStars } from '../../lib/utils'
import { linkGasoilToVoyage, unlinkGasoilFromVoyage } from '../../lib/services/voyage/gasoilLink'
import { updateFuelMode } from '../../lib/services/voyage/updates'
import { suggestVoyagesForPlein } from '../../lib/services/voyage/fuelSuggestions'
import { computeAllocationPreview } from '../../lib/services/voyage/fuelAllocationCenter'

const REASON_LABEL = {
  same_truck: 'Même camion',
  same_day: 'Même jour',
  closest_date: 'Date la plus proche',
  km_in_range: 'KM du départ dans la fourchette du plein',
  km_after_start: 'KM après le départ',
  no_km: 'Candidat manuel — sans KM',
}

// Tier label — splits the existing 0-80 confidence score (unchanged, from
// fuelSuggestions.js) into three descriptive bands. Display-only: never
// changes the score or the ranking order.
function confidenceTier(confidence) {
  if (confidence >= 65) return 'Correspondance parfaite'
  if (confidence >= 40) return 'Très probable'
  return 'Possible'
}

function Stars({ confidence }) {
  const n = confidenceToStars(confidence)
  return <span className="text-amber-400 text-xs tracking-tighter">{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>
}

// New sibling to components/carburant/FuelAssignPopover.js — deliberately
// NOT an extension of it (that popover still powers the Chronologie tab and
// must stay untouched). This modal calls the exact same underlying
// functions (linkGasoilToVoyage / unlinkGasoilFromVoyage / suggestVoyagesForPlein)
// so the write/ranking behavior can never diverge between the two surfaces —
// only the orchestration/presentation is new.
//
// Two entry modes:
//   'assign' — target purchase (`card`) is fixed, user picks a VOYAGE.
//   'move'   — source purchase + voyage (`card`, `voyage`) are fixed, user
//              picks a DESTINATION purchase.
// Both converge on the same final step: if the voyage already belongs to a
// different purchase, show the strict Cancel/Move warning (spec item 4);
// otherwise skip straight to the real-time preview (spec item 6) before
// writing anything.
export default function AllocationAssignModal({
  mode, card, voyage, allCards, camionVoyageRows, camionGasoil, camionVoyages, voyageGasoilRows,
  remiseRate, onClose, onSaved,
}) {
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pickedVoyageId, setPickedVoyageId] = useState(mode === 'move' ? voyage?.voyageId : null)
  const [pickedGasoilId, setPickedGasoilId] = useState(mode === 'assign' ? card?.gasoilId : null)
  const [fuelModeChoice, setFuelModeChoice] = useState(null) // 'manual_km' | 'manual_fixed' | null
  const [manualKm, setManualKm] = useState('')
  const [manualAmount, setManualAmount] = useState('')

  const pickedVoyageFull = pickedVoyageId ? (camionVoyages || []).find(v => v.id === pickedVoyageId) : null

  // The voyage's CURRENT purchase, if any — scanned across every card (not
  // just this truck's), since a voyage can only belong to one truck anyway.
  // This is what makes the moved-from warning correct whether the voyage
  // got there automatically or via an earlier manual link.
  const currentCard = useMemo(() => {
    if (!pickedVoyageId) return null
    return (allCards || []).find(c => c.gasoilId !== pickedGasoilId && c.voyageAllocations.some(v => v.voyageId === pickedVoyageId)) || null
  }, [pickedVoyageId, pickedGasoilId, allCards])

  const needsFuelModeChoice = pickedVoyageFull &&
    !(pickedVoyageFull.km_depart && pickedVoyageFull.km_arrivee) &&
    (pickedVoyageFull.fuel_mode || 'automatic') === 'automatic'

  const suggestions = useMemo(() => {
    if (mode !== 'assign' || !card?.hasKm) return []
    return suggestVoyagesForPlein(
      { date: card.date, km: card.km, camion_id: card.camionId },
      camionVoyageRows,
    ).filter(s => !card.voyageAllocations.some(v => v.voyageId === s.voyageId))
  }, [mode, card, camionVoyageRows])

  const searchList = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (mode === 'assign') {
      return camionVoyageRows
        .filter(v => !card.voyageAllocations.some(a => a.voyageId === v.voyageId))
        .filter(v => !q || v.reference.toLowerCase().includes(q))
        .slice(0, 30)
    }
    // move mode: list other purchases of the same truck
    return (allCards || [])
      .filter(c => c.camionId === card.camionId && c.gasoilId !== card.gasoilId)
      .filter(c => !q || c.plaque.toLowerCase().includes(q) || (c.station || '').toLowerCase().includes(q))
  }, [mode, card, camionVoyageRows, allCards, search])

  const preview = useMemo(() => {
    if (!pickedVoyageId || !pickedGasoilId || needsFuelModeChoice) return null
    return computeAllocationPreview({
      camionGasoil, camionVoyages, voyageGasoilRows, remiseRate,
      voyageId: pickedVoyageId, addToGasoilId: pickedGasoilId,
      removeFromGasoilId: currentCard?.gasoilId || null,
    })
  }, [pickedVoyageId, pickedGasoilId, currentCard, camionGasoil, camionVoyages, voyageGasoilRows, remiseRate, needsFuelModeChoice])

  async function confirm() {
    setBusy(true); setError('')
    try {
      if (needsFuelModeChoice) {
        if (!fuelModeChoice) { setError('Choisissez KM approximatif ou montant fixe.'); setBusy(false); return }
        const value = fuelModeChoice === 'manual_km' ? manualKm : manualAmount
        if (!(parseFloat(value) > 0)) { setError('Entrez une valeur supérieure à zéro.'); setBusy(false); return }
        await updateFuelMode(pickedVoyageId, {
          fuelMode: fuelModeChoice,
          manualDistanceKm: fuelModeChoice === 'manual_km' ? manualKm : null,
          manualFuelCost: fuelModeChoice === 'manual_fixed' ? manualAmount : null,
        })
      }
      if (currentCard) await unlinkAllLinksFor(pickedVoyageId, currentCard.gasoilId)
      const purchase = camionGasoil.find(g => g.id === pickedGasoilId)
      await linkGasoilToVoyage({ plein: purchase, voyageId: pickedVoyageId })
      await onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function unlinkAllLinksFor(voyageId, gasoilId) {
    const rows = (voyageGasoilRows || []).filter(l => l.voyage_id === voyageId && l.gasoil_id === gasoilId)
    for (const row of rows) await unlinkGasoilFromVoyage(row)
  }

  const title = mode === 'assign' ? `Assigner un voyage — plein du ${fmtDate(card.date)}` : `Déplacer ${voyage.reference}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-gray-900">{title}</h2>
            {mode === 'assign' && <p className="text-xs text-gray-400 mt-0.5">{card.plaque} · {fmtD(card.qte)}L = {fmtMoney(card.total)} DHS</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

          {mode === 'assign' && card.status === 'waiting' && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              ⚠ Ce plein n'a pas de KM — suggestions automatiques indisponibles. Recherchez manuellement ci-dessous.
            </div>
          )}

          {/* Step 1: pick voyage (assign) or destination purchase (move) */}
          {!pickedVoyageId || (mode === 'move' && !pickedGasoilId) ? (
            <>
              {mode === 'assign' && suggestions.length > 0 && (
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1.5">Suggestions automatiques (jamais appliquées seules — un clic sélectionne)</div>
                  <div className="space-y-2">
                    {suggestions.map(s => (
                      <button key={s.voyageId} disabled={busy} onClick={() => setPickedVoyageId(s.voyageId)}
                        className="w-full p-2.5 rounded-lg border border-brand-100 bg-brand-50 hover:bg-brand-100 text-left transition">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-brand-700">{s.reference} <span className="text-slate-400 font-normal">({fmtDate(s.date)})</span></span>
                          <span className="flex items-center gap-1.5 flex-shrink-0">
                            <Stars confidence={s.confidence} />
                            <span className="text-[10px] font-bold text-brand-600">{confidenceTier(s.confidence)}</span>
                          </span>
                        </div>
                        <ul className="mt-1.5 space-y-0.5">
                          {s.reasons.map(r => (
                            <li key={r} className="text-[10px] text-slate-500 flex items-center gap-1">
                              <span className="text-brand-400">•</span>{REASON_LABEL[r] || r}
                            </li>
                          ))}
                        </ul>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1.5">{mode === 'assign' ? 'Autres voyages' : 'Choisir le plein de destination'}</div>
                <input className="input text-sm mb-2" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {mode === 'assign' ? searchList.map(v => (
                    <button key={v.voyageId} disabled={busy} onClick={() => setPickedVoyageId(v.voyageId)}
                      className="w-full flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-100 hover:bg-slate-50 text-left text-xs">
                      <span className="font-semibold text-slate-700">{v.reference} <span className="text-slate-400 font-normal">({fmtDate(v.date)})</span></span>
                    </button>
                  )) : searchList.map(c => (
                    <button key={c.gasoilId} disabled={busy} onClick={() => setPickedGasoilId(c.gasoilId)}
                      className="w-full flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-100 hover:bg-slate-50 text-left text-xs">
                      <span className="font-semibold text-slate-700">{fmtDate(c.date)} · {c.station || 'Station inconnue'}</span>
                      <span className="text-slate-400">{fmtMoney(c.remaining)} DHS restants</span>
                    </button>
                  ))}
                  {searchList.length === 0 && <div className="text-center text-slate-400 text-xs py-3">Aucun résultat</div>}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Step 2: missing-KM inline chooser, if needed */}
              {needsFuelModeChoice && (
                <div className="border border-amber-100 bg-amber-50/40 rounded-xl p-3 space-y-2">
                  <div className="text-xs font-semibold text-amber-700">Ce voyage n'a pas de KM réel — choisissez :</div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setFuelModeChoice('manual_km')}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${fuelModeChoice === 'manual_km' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                      KM approximatif
                    </button>
                    <button type="button" onClick={() => setFuelModeChoice('manual_fixed')}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${fuelModeChoice === 'manual_fixed' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                      Montant fixe
                    </button>
                  </div>
                  {fuelModeChoice === 'manual_km' && (
                    <input type="number" className="input text-sm w-32" placeholder="Ex: 150" value={manualKm} onChange={e => setManualKm(e.target.value)} />
                  )}
                  {fuelModeChoice === 'manual_fixed' && (
                    <input type="number" className="input text-sm w-32" placeholder="Ex: 500" value={manualAmount} onChange={e => setManualAmount(e.target.value)} />
                  )}
                </div>
              )}

              {/* Step 3: move warning */}
              {currentCard && (
                <div className="border border-amber-100 bg-amber-50 rounded-xl p-3 text-xs text-amber-800">
                  Ce voyage est actuellement alloué {currentCard.hasManualLink ? 'manuellement' : 'automatiquement'} au plein du <b>{fmtDate(currentCard.date)}</b> ({currentCard.station || currentCard.plaque}).
                  <br />Le déplacer ici le retirera automatiquement de ce plein.
                </div>
              )}

              {/* Step 4: real-time preview — everything updates live before
                  Confirm is clicked, computed by calling the real engine
                  twice (see computeAllocationPreview), never a separate
                  formula. Remaining can never go negative (the engine always
                  caps it) — if a manual_fixed amount doesn't fit, it shows up
                  as `targetWasCapped`, not a fabricated negative number. */}
              {preview && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Aperçu avant/après — tout se met à jour avant l'enregistrement</div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="font-bold text-slate-400 uppercase tracking-wide text-[10px] mb-2">Avant</div>
                      {preview.source && (
                        <div className="mb-2 pb-2 border-b border-slate-200">
                          <div className="text-slate-400 text-[10px]">Plein source</div>
                          <div>Alloué <b>{fmtMoney(preview.source.before.allocated)}</b></div>
                          <div>Restant <b>{fmtMoney(preview.source.before.remaining)}</b></div>
                        </div>
                      )}
                      <div className="text-slate-400 text-[10px]">Plein cible</div>
                      <div>Alloué <b>{fmtMoney(preview.target.before?.allocated || 0)}</b></div>
                      <div>Restant <b>{fmtMoney(preview.target.before?.remaining ?? preview.target.after.total)}</b></div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                      <div className="font-bold text-emerald-600 uppercase tracking-wide text-[10px] mb-2">Après</div>
                      {preview.source && (
                        <div className="mb-2 pb-2 border-b border-emerald-200">
                          <div className="text-emerald-500 text-[10px]">Plein source</div>
                          <div>Alloué <b>{fmtMoney(preview.source.after.allocated)}</b></div>
                          <div>Restant <b>{fmtMoney(preview.source.after.remaining)}</b></div>
                        </div>
                      )}
                      <div className="text-emerald-500 text-[10px]">Plein cible</div>
                      <div>Alloué <b>{fmtMoney(preview.target.after.allocated)}</b></div>
                      <div>Restant <b>{fmtMoney(preview.target.after.remaining)}</b></div>
                    </div>
                  </div>

                  {preview.targetWasCapped && (
                    <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      ⚠ Le montant fixe sera réduit automatiquement — le plein choisi ne peut pas couvrir la totalité du montant demandé.
                    </div>
                  )}
                  {!preview.targetWasCapped && preview.target.after.remaining <= 0.01 && (
                    <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                      ✓ Le plein cible sera entièrement alloué (Restant = 0).
                    </div>
                  )}

                  <div className="flex justify-between items-center bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs">
                    <span className="font-bold text-slate-700">Ce voyage recevra</span>
                    <span className="font-black text-emerald-600 text-sm">{fmtMoney(preview.voyageAmountAfter)} DHS</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => { setPickedVoyageId(mode === 'move' ? voyage.voyageId : null); setPickedGasoilId(mode === 'assign' ? card.gasoilId : null); setFuelModeChoice(null) }}
                  disabled={busy} className="btn-secondary text-xs">Annuler</button>
                <button onClick={confirm} disabled={busy}
                  className="text-xs bg-brand-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-60">
                  {busy ? '...' : (currentCard ? '✓ Déplacer' : '✓ Confirmer')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
