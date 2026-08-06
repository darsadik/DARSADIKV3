import { useState, useMemo } from 'react'
import { fmt, fmtD, fmtDate, fmtMoney } from '../../lib/utils'
import { linkGasoilToVoyage, unlinkGasoilFromVoyage } from '../../lib/services/voyage/gasoilLink'
import { suggestVoyagesForPlein } from '../../lib/services/voyage/fuelSuggestions'

const REASON_LABEL = {
  same_truck: 'Même camion',
  closest_date: 'Date la plus proche',
  km_in_range: 'KM correspondant',
  km_after_start: 'KM après départ',
}

// Assign / Change / Remove for ONE plein, modeled on
// components/voyage/GasoilSection.js's existing "+ Lier un plein" picker but
// inverted: the plein is fixed here, the voyage is what gets picked. Every
// write goes through lib/services/voyage/gasoilLink.js — the exact same
// functions VoyageDetailPanel already uses, so behavior can never diverge.
// Linking never takes an amount — a purchase can be linked to any number of
// voyages, and each one's DHS share is always computed dynamically by
// lib/services/fuelAllocation.js (distance-proportional), never typed here.
export default function FuelAssignPopover({ plein, camionVoyageRows, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const pleinForLink = useMemo(() => ({ id: plein.gasoilId, date: plein.date, station: plein.station }), [plein])

  const linkedVoyageIds = useMemo(() => new Set(plein.links.map(l => l.voyage_id)), [plein.links])

  const suggestions = useMemo(() => suggestVoyagesForPlein(
    { date: plein.date, km: plein.km, camion_id: plein.camionId },
    camionVoyageRows,
  ).filter(s => !linkedVoyageIds.has(s.voyageId)), [plein, camionVoyageRows, linkedVoyageIds])

  const filteredVoyages = useMemo(() => {
    const q = search.trim().toLowerCase()
    return camionVoyageRows
      .filter(v => v.camionId === plein.camionId)
      .filter(v => !linkedVoyageIds.has(v.voyageId))
      .filter(v => !q || v.reference.toLowerCase().includes(q))
      .slice(0, 30)
  }, [camionVoyageRows, plein.camionId, search, linkedVoyageIds])

  async function assign(voyageId) {
    setBusy(true); setError('')
    try {
      await linkGasoilToVoyage({ plein: pleinForLink, voyageId })
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
            <p className="text-xs text-gray-400 mt-0.5">{plein.plaque} · {fmtDate(plein.date)} · {fmtD(plein.qte)}L = {fmtMoney(plein.total)} DHS</p>
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
                    <span className="font-semibold text-slate-700">Voyage #{l.voyage_id}</span>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button disabled={busy} onClick={() => remove(l)} className="text-red-500 hover:underline font-semibold">Retirer</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-slate-400 mt-1.5">Le montant DHS de chaque voyage est calculé automatiquement au prorata de sa distance.</div>
            </div>
          )}

          {/* Smart suggestions */}
          {suggestions.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1.5">Suggestions (jamais automatique — un clic assigne)</div>
              <div className="space-y-1.5">
                {suggestions.map(s => (
                  <button key={s.voyageId} disabled={busy}
                    onClick={() => assign(s.voyageId)}
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

          {/* Manual search */}
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1.5">Recherche manuelle</div>
            <input className="input text-sm mb-2" placeholder="Rechercher un voyage..." value={search} onChange={e => setSearch(e.target.value)} />
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {filteredVoyages.map(v => (
                <div key={v.voyageId} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-100 hover:bg-slate-50 text-xs">
                  <span className="font-semibold text-slate-700">{v.reference} <span className="text-slate-400 font-normal">({fmtDate(v.date)})</span></span>
                  <button disabled={busy} onClick={() => assign(v.voyageId)}
                    className="text-xs bg-brand-600 text-white px-2 py-1 rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-60 flex-shrink-0">
                    ✓ Lier
                  </button>
                </div>
              ))}
              {filteredVoyages.length === 0 && <div className="text-center text-slate-400 text-xs py-3">Aucun voyage disponible pour ce camion</div>}
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-50">
            <button onClick={onClose} className="btn-secondary text-xs">Fermer</button>
          </div>
        </div>
      </div>
    </div>
  )
}
