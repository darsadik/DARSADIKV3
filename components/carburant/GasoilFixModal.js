import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtDate } from '../../lib/utils'

// ── Quick-fix overlay (spec §10) — minimal correction form (KM, heure,
// camion) for a single gasoil row, scoped to exactly what the Control
// Center's Missing Data list needs. Deliberately not the full plein editor
// (diesel/AdBlue amounts, station, bon) — that stays in pages/gasoil/index.js,
// this only ever touches km/heure/camion_id so it can never diverge from the
// real edit form's totals math.
export default function GasoilFixModal({ gasoilRow, camions, onClose, onSaved }) {
  const [km, setKm] = useState(gasoilRow?.km ?? '')
  const [heure, setHeure] = useState(gasoilRow?.heure ?? '')
  const [camionId, setCamionId] = useState(gasoilRow?.camion_id ?? '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  if (!gasoilRow) return null

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    const camion = camions.find(c => c.id === parseInt(camionId))
    const { error } = await supabase.from('gasoil').update({
      km: km === '' ? null : parseFloat(km),
      heure: heure || null,
      camion_id: camionId ? parseInt(camionId) : null,
      camion_plaque: camion?.plaque || gasoilRow.camion_plaque,
    }).eq('id', gasoilRow.id)
    setSaving(false)
    if (error) { setMsg('❌ ' + error.message); return }
    onSaved?.()
    onClose?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">⛽ Corriger le plein</h2>
            <p className="text-xs text-gray-400 mt-0.5">{gasoilRow.camion_plaque || '—'} · {fmtDate(gasoilRow.date)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>
        <form onSubmit={save} className="p-5 space-y-3">
          <div>
            <label className="label">Camion</label>
            <select className="input" value={camionId} onChange={e => setCamionId(e.target.value)}>
              <option value="">— Sélectionner —</option>
              {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}{c.chauffeur ? ` — ${c.chauffeur}` : ''}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">KM compteur</label>
              <input type="number" className="input" value={km} onChange={e => setKm(e.target.value)} />
            </div>
            <div>
              <label className="label">Heure</label>
              <input type="time" className="input" value={heure} onChange={e => setHeure(e.target.value)} />
            </div>
          </div>
          {msg && <div className="text-xs text-red-600">{msg}</div>}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Enregistrement...' : '✔ Enregistrer'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  )
}
