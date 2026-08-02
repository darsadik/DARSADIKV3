import { useState } from 'react'
import { today } from '../../lib/utils'
import { createFollowUpVoyage } from '../../lib/services/voyage/create'

// Triggered only from KmEditPopover's "arrival KM, no next voyage yet" case
// (spec §4) — never a silent no-op. Same voyages-insert field set as
// pages/voyages/index.js's own create form, just pre-filled with the truck
// and the KM the user was about to type as "arrival KM".
export default function CreateNextVoyageModal({ camionId, camionPlaque, chauffeur, prefillKm, onClose, onCreated }) {
  const [dateDepart, setDateDepart] = useState(today())
  const [kmDepart, setKmDepart] = useState(prefillKm || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true); setError('')
    try {
      await createFollowUpVoyage({ camionId, camionPlaque, chauffeur, dateDepart, kmDepart })
      onCreated?.()
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
            <h2 className="font-bold text-gray-900">🚚 Nouveau voyage</h2>
            <p className="text-xs text-gray-400 mt-0.5">{camionPlaque}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="label">Date de départ</label>
            <input type="date" className="input" value={dateDepart} onChange={e => setDateDepart(e.target.value)} />
          </div>
          <div>
            <label className="label">KM départ</label>
            <input type="number" className="input" value={kmDepart} onChange={e => setKmDepart(e.target.value)} placeholder="Ex: 245310" />
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Création...' : '✔ Créer le voyage'}</button>
            <button onClick={onClose} className="btn-secondary">Annuler</button>
          </div>
          <div className="text-[10px] text-slate-400">Les autres champs (destination, chauffeur, etc.) restent modifiables ensuite depuis /voyages.</div>
        </div>
      </div>
    </div>
  )
}
