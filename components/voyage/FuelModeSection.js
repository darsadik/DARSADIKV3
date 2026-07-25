import { useState } from 'react'
import { fmt } from '../../lib/utils'
import Section from '../ui/Section'

const MODES = [
  { key: 'automatic',     label: 'Automatique',           hint: 'recommandé' },
  { key: 'manual_rate',   label: 'Estimation KM manuelle', hint: 'Distance × DH/KM' },
  { key: 'manual_amount', label: 'Coût carburant manuel',  hint: 'Montant direct' },
]

const SOURCE_BADGE = {
  automatic:     { label: '⚡ Automatique',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  manuel:        { label: '📝 Manuel (pleins)', cls: 'bg-amber-50 text-amber-700 border-amber-100' },
  manual_rate:   { label: '📏 Estimation KM',   cls: 'bg-blue-50 text-blue-700 border-blue-100' },
  manual_amount: { label: '💰 Montant manuel',  cls: 'bg-purple-50 text-purple-700 border-purple-100' },
  none:          { label: '⚠ Données manquantes', cls: 'bg-red-50 text-red-600 border-red-100' },
}

export default function FuelModeSection({ voyage, fuelCost, fuelSource, voyageKm, onSave }) {
  const activeMode = voyage?.fuel_mode || 'automatic'
  const [editing, setEditing] = useState(false)
  const [mode, setMode] = useState(activeMode)
  const [distance, setDistance] = useState(voyage?.manual_distance_km || '')
  const [rate, setRate] = useState(voyage?.manual_cost_per_km || '')
  const [amount, setAmount] = useState(voyage?.manual_fuel_cost || '')
  const [saving, setSaving] = useState(false)

  const badge = SOURCE_BADGE[fuelSource] || SOURCE_BADGE.none
  const previewRate = (parseFloat(distance) || 0) * (parseFloat(rate) || 0)

  function startEdit() {
    setMode(activeMode)
    setDistance(voyage?.manual_distance_km || '')
    setRate(voyage?.manual_cost_per_km || '')
    setAmount(voyage?.manual_fuel_cost || '')
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    try {
      await onSave({
        fuelMode: mode,
        manualDistanceKm: mode === 'manual_rate' ? distance : voyage?.manual_distance_km,
        manualCostPerKm:  mode === 'manual_rate' ? rate     : voyage?.manual_cost_per_km,
        manualFuelCost:   mode === 'manual_amount' ? amount : voyage?.manual_fuel_cost,
      })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section icon="⛽" title="Carburant — méthode de calcul" color="purple"
      action={!editing && (
        <button onClick={startEdit}
          className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition">
          ✏️ Modifier
        </button>
      )}>

      {!editing ? (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Méthode active</div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${badge.cls}`}>{badge.label}</span>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Coût carburant</div>
            <div className="text-lg font-black text-slate-700">{fmt(fuelCost)} DHS</div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {MODES.map(m => (
              <button key={m.key} type="button" onClick={() => setMode(m.key)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                  mode === m.key
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}>
                {m.label}{m.hint ? <span className={mode === m.key ? 'text-purple-100' : 'text-slate-400'}> · {m.hint}</span> : null}
              </button>
            ))}
          </div>

          {mode === 'automatic' && (
            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              Calculé à partir de l'odomètre du camion (voir barre ci-dessus).
              {voyageKm ? ` Distance: ${fmt(voyageKm)} km.` : ' Distance non disponible pour ce voyage.'}
            </div>
          )}

          {mode === 'manual_rate' && (
            <div className="flex gap-3 items-end flex-wrap">
              <div>
                <label className="text-xs text-slate-500 font-semibold mb-1 block">Distance (KM)</label>
                <input type="number" value={distance} onChange={e => setDistance(e.target.value)}
                  className="input text-sm w-32" placeholder="Ex: 420" />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-semibold mb-1 block">DH/KM</label>
                <input type="number" value={rate} onChange={e => setRate(e.target.value)}
                  className="input text-sm w-28" placeholder="Ex: 3.5" />
              </div>
              {previewRate > 0 && (
                <div className="text-xs text-slate-500 pb-2">= <span className="font-bold text-slate-700">{fmt(previewRate)} DHS</span></div>
              )}
            </div>
          )}

          {mode === 'manual_amount' && (
            <div>
              <label className="text-xs text-slate-500 font-semibold mb-1 block">Coût carburant estimé (DH)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                className="input text-sm w-40" placeholder="Ex: 1850" />
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving}
              className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-purple-700 transition disabled:opacity-60">
              {saving ? '...' : '✓ Enregistrer'}
            </button>
            <button onClick={() => setEditing(false)}
              className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition">
              Annuler
            </button>
          </div>
        </div>
      )}
    </Section>
  )
}
