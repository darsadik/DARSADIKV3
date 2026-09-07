import { useState } from 'react'

// Simple export-configuration panel for Contrôle KM & Carburant's PDF report
// (spec's Imprimer/PDF → Date début → Date fin → Camion(s) → Générer PDF
// flow) — deliberately independent from the on-screen PeriodSelector/camion
// dropdown above the truck cards, so exporting a different period/truck set
// never changes what's shown on screen. `camions` is already Camions Propre
// only (filtered by the caller) — Camions Loué never reach this picker.
// `selectedIds`: null = every truck (default), an array (possibly empty)
// narrows to exactly those ids — same convention as
// lib/services/fuelConsumptionReport.js's buildConsumptionReport.
export default function ExportPdfModal({ camions, defaultFrom, defaultTo, onGenerate, onClose }) {
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [selectedIds, setSelectedIds] = useState(null)

  const allIds = camions.map(c => c.id)
  const effectiveSelected = selectedIds === null ? allIds : selectedIds

  function toggleCamion(id) {
    setSelectedIds(prev => {
      const base = prev === null ? allIds : prev
      const set = new Set(base)
      if (set.has(id)) set.delete(id); else set.add(id)
      return [...set]
    })
  }

  const nothingSelected = effectiveSelected.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">🖨️ Imprimer / PDF — Contrôle KM & Carburant</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">1. Période</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Date début</label>
                <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
              </div>
              <div>
                <label className="label">Date fin</label>
                <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">2. Camion(s)</div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setSelectedIds(null)} className="text-[11px] font-semibold text-brand-600 hover:underline">Tous les Camions Propre</button>
                <button type="button" onClick={() => setSelectedIds([])} className="text-[11px] font-semibold text-gray-400 hover:underline">Aucun</button>
              </div>
            </div>
            <div className="border border-gray-200 rounded-xl p-3 max-h-56 overflow-y-auto space-y-1.5">
              {camions.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={effectiveSelected.includes(c.id)} onChange={() => toggleCamion(c.id)} />
                  {c.plaque}
                </label>
              ))}
              {camions.length === 0 && <div className="text-xs text-gray-400 italic">Aucun camion propre enregistré</div>}
            </div>
          </div>

          <button
            onClick={() => onGenerate({ camionIds: selectedIds, from, to })}
            disabled={nothingSelected}
            className="btn-primary w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed"
          >
            📄 Générer PDF
          </button>
          {nothingSelected && <div className="text-xs text-red-500 text-center">Sélectionnez au moins un camion.</div>}
        </div>
      </div>
    </div>
  )
}
