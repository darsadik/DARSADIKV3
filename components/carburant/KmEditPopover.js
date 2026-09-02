import { useState } from 'react'
import { fmt } from '../../lib/utils'
import { suggestPreviousKm } from '../../lib/services/kilometrage'
import { saveStartKm } from '../../lib/services/voyage/updates'

// Spec §4 — Edit Start KM / Edit Arrival KM / Use Suggested Previous KM, all
// from this page. km_arrivee has never been an independently stored field
// (kilometrage.js: it's always the truck's NEXT voyage's km_depart, derived
// by recalc_camion_odometer_chain) — so "arrival" mode here actually edits
// the next voyage's start KM, with copy that says so explicitly. Never
// auto-overwrites: the suggestion only fills the input on click, the user
// still saves.
export default function KmEditPopover({ voyage, mode, camionRawVoyages, onClose, onSaved, onCreateNext }) {
  const isArrival = mode === 'arrival'
  const targetVoyageId = isArrival ? voyage.nextVoyageId : voyage.voyageId
  const currentValue = isArrival ? voyage.kmArrivee : voyage.kmDepart
  const [value, setValue] = useState(currentValue !== null && currentValue !== undefined ? String(currentValue) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const suggested = !isArrival ? suggestPreviousKm(camionRawVoyages, voyage.voyageId) : null

  // Basic sanity checks — saveStartKm/updateKm accept any parseFloat result
  // with no validation at all today, so this is the only guard in the app
  // against an obviously wrong KM (typo, negative, going backwards).
  function validate(parsed) {
    if (!Number.isFinite(parsed) || parsed <= 0) return 'Entrez une KM valide (nombre positif).'
    if (!isArrival && suggested !== null && parsed < suggested) {
      return `La KM ne peut pas être inférieure à la dernière valeur connue (${fmt(suggested)} km).`
    }
    if (isArrival && voyage.kmDepart !== null && voyage.kmDepart !== undefined && parsed < voyage.kmDepart) {
      return `La KM d'arrivée ne peut pas être inférieure à la KM de départ de ce voyage (${fmt(voyage.kmDepart)} km).`
    }
    return null
  }

  async function save() {
    const parsed = parseFloat(value)
    const validationError = validate(parsed)
    if (validationError) { setError(validationError); return }
    setSaving(true); setError('')
    try {
      await saveStartKm(targetVoyageId, voyage.camionId, value)
      onSaved?.()
      onClose?.()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">✏ {isArrival ? 'KM Arrivée' : 'KM Départ'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{voyage.plaque} · {voyage.reference}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>

        <div className="p-5 space-y-3">
          {isArrival && voyage.nextVoyageId && (
            <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              La KM d'arrivée correspond à la KM de départ du voyage suivant. Modifier cette valeur mettra à jour le voyage suivant.
            </div>
          )}

          {isArrival && !voyage.nextVoyageId ? (
            <div className="space-y-3">
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Aucun voyage suivant pour ce camion — la KM d'arrivée sera connue au prochain voyage.
              </div>
              <button onClick={() => onCreateNext?.(voyage)} className="btn-primary w-full text-sm">+ Créer le prochain voyage</button>
            </div>
          ) : (
            <>
              <div>
                <label className="label">{isArrival ? 'Nouvelle KM de départ (voyage suivant)' : 'KM départ'}</label>
                <input type="number" className="input" value={value} onChange={e => setValue(e.target.value)} placeholder="Ex: 245310" />
              </div>
              {!isArrival && suggested !== null && (
                <button type="button" onClick={() => setValue(String(suggested))}
                  className="text-xs font-semibold text-brand-600 hover:underline">
                  💡 Utiliser la KM suggérée ({fmt(suggested)} km — dernier relevé connu du camion)
                </button>
              )}
              {error && <div className="text-xs text-red-600">{error}</div>}
              <div className="flex gap-2 pt-1">
                <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Enregistrement...' : '✔ Enregistrer'}</button>
                <button onClick={onClose} className="btn-secondary">Annuler</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
