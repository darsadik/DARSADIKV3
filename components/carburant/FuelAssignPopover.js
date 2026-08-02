import { useState, useMemo } from 'react'
import { fmt, fmtD, fmtDate } from '../../lib/utils'
import { linkGasoilToVoyage, unlinkGasoilFromVoyage } from '../../lib/services/voyage/gasoilLink'
import { suggestVoyagesForPlein } from '../../lib/services/voyage/fuelSuggestions'

const REASON_LABEL = {
  same_truck: 'Même camion',
  closest_date: 'Date la plus proche',
  km_in_range: 'KM correspondant',
  km_after_start: 'KM après départ',
}

// Assign / Change / Remove / Split for ONE plein (spec §3), modeled on
// components/voyage/GasoilSection.js's existing "+ Lier un plein" picker but
// inverted: the plein is fixed here, the voyage is what gets picked. Every
// write goes through lib/services/voyage/gasoilLink.js — the exact same
// functions VoyageDetailPanel already uses, so behavior can never diverge.
export default function FuelAssignPopover({ plein, camionVoyageRows, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [splitQte, setSplitQte] = useState({})

  const pleinForLink = useMemo(() => ({
    id: plein.gasoilId, date: plein.date, station: plein.station,
    qte: plein.qte, prix_unitaire: plein.prixUnitaire,
  }), [plein])

  const suggestions = useMemo(() => suggestVoyagesForPlein(
    { date: plein.date, km: plein.km, camion_id: plein.camionId },
    camionVoyageRows,
  ), [plein, camionVoyageRows])

  const filteredVoyages = useMemo(() => {
    const q = search.trim().toLowerCase()
    return camionVoyageRows
      .filter(v => v.camionId === plein.camionId)
      .filter(v => !q || v.reference.toLowerCase().includes(q))
      .slice(0, 30)
  }, [camionVoyageRows, plein.camionId, search])

  const assignedQte = plein.links.reduce((s, l) => s + (l.qte_litres || 0), 0)
  const remainingQte = Math.max(0, (plein.qte || 0) - assignedQte)

  // qte is whatever the user explicitly typed (or null for "the rest"/a
  // suggestion click). linkGasoilToVoyage treats a falsy splitQte as "link
  // the WHOLE plein" — correct only when nothing else has claimed part of it
  // yet. Once earlier partial links exist (remainingQte < plein.qte), a
  // blank/suggested assign must still only claim what's actually left,
  // otherwise it would double-count litres already assigned elsewhere.
  async function assign(voyageId, qte) {
    setBusy(true); setError('')
    try {
      const splitQte = qte || (remainingQte < (plein.qte || 0) ? remainingQte : null)
      await linkGasoilToVoyage({ plein: pleinForLink, voyageId, splitQte })
      onSaved?.()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function remove(link) {
    setBusy(true); setError('')
    try {
      await unlinkGasoilFromVoyage(link)
      onSaved?.()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-gray-900">⛽ Assigner ce plein</h2>
            <p className="text-xs text-gray-400 mt-0.5">{plein.plaque} · {fmtDate(plein.date)} · {fmtD(plein.qte)}L = {fmt(plein.total)} DHS</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

          {/* Current assignments */}
          {plein.links.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1.5">Assignations actuelles</div>
              <div className="space-y-1.5">
                {plein.links.map(l => (
                  <div key={l.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50 text-xs">
                    <span className="font-semibold text-slate-700">
                      Voyage #{l.voyage_id}{l.is_split ? ` · ${fmtD(l.qte_litres)}L (partiel)` : ' · plein entier'}
                    </span>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button disabled={busy} onClick={() => remove(l)} className="text-red-500 hover:underline font-semibold">Retirer</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-slate-400 mt-1.5">Pour changer un voyage : retirez l'assignation puis choisissez le nouveau voyage ci-dessous.</div>
            </div>
          )}

          {/* Smart suggestions */}
          {remainingQte > 0 && suggestions.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1.5">Suggestions (jamais automatique — un clic assigne)</div>
              <div className="space-y-1.5">
                {suggestions.map(s => (
                  <button key={s.voyageId} disabled={busy}
                    onClick={() => assign(s.voyageId, null)}
                    className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg border border-brand-100 bg-brand-50 hover:bg-brand-100 text-left transition">
                    <span className="text-xs font-semibold text-brand-700">{s.reference} <span className="text-slate-400 font-normal">({fmtDate(s.date)})</span></span>
                    <span className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[10px] text-slate-400">{s.reasons.map(r => REASON_LABEL[r] || r).join(' · ')}</span>
                      <span className="badge-blue">{s.confidence}%</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Manual search + split */}
          {remainingQte > 0 && (
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1.5">
                Recherche manuelle {plein.qte ? `— ${fmtD(remainingQte)}L disponibles` : ''}
              </div>
              <input className="input text-sm mb-2" placeholder="Rechercher un voyage..." value={search} onChange={e => setSearch(e.target.value)} />
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {filteredVoyages.map(v => (
                  <div key={v.voyageId} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-100 hover:bg-slate-50 text-xs">
                    <span className="font-semibold text-slate-700">{v.reference} <span className="text-slate-400 font-normal">({fmtDate(v.date)})</span></span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <input type="number" min="0" max={remainingQte || undefined} step="0.01"
                        placeholder={`${fmtD(remainingQte)}L`}
                        value={splitQte[v.voyageId] || ''}
                        onChange={e => setSplitQte({ ...splitQte, [v.voyageId]: e.target.value })}
                        title="Litres à assigner — laisser vide pour lier tout le reste"
                        className="input text-xs w-16 py-1" />
                      <button disabled={busy} onClick={() => assign(v.voyageId, parseFloat(splitQte[v.voyageId]) || null)}
                        className="text-xs bg-brand-600 text-white px-2 py-1 rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-60">
                        ✓ Lier
                      </button>
                    </div>
                  </div>
                ))}
                {filteredVoyages.length === 0 && <div className="text-center text-slate-400 text-xs py-3">Aucun voyage pour ce camion</div>}
              </div>
              <div className="text-[10px] text-slate-400 mt-1.5">Laisser le champ litres vide = lier tout le reste disponible. Une valeur inférieure = assignation partielle (split).</div>
            </div>
          )}

          {remainingQte <= 0 && plein.links.length > 0 && (
            <div className="text-center text-emerald-600 text-xs py-2">✓ Plein entièrement assigné</div>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-50">
            <button onClick={onClose} className="btn-secondary text-xs">Fermer</button>
          </div>
        </div>
      </div>
    </div>
  )
}
