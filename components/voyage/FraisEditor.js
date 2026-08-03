import { fmtMoney } from '../../lib/utils'
import { FRAIS_LABELS, DEDUCTION_LABELS } from '../../lib/voyage-constants'

// Shared editor for a livraison's child rows: "Frais supplémentaires" (kind='charge',
// increases the client balance) and "Déductions client" (kind='deduction', decreases it).
// Both kinds live in the same flat `items` array — only `kind` tells them apart.
// montant is always a positive magnitude; the sign is applied downstream from kind.
export default function FraisEditor({ items, onChange }) {
  const list = items || []

  function addItem(kind) {
    const labels = kind === 'deduction' ? DEDUCTION_LABELS : FRAIS_LABELS
    onChange([...list, { _id: Date.now(), kind, label: labels[0], montant: '', note: '' }])
  }
  function removeItem(idx) {
    const arr = [...list]; arr.splice(idx, 1); onChange(arr)
  }
  function changeItem(idx, field, value) {
    onChange(list.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  const withIdx    = list.map((f, i) => ({ ...f, _idx: i }))
  const charges    = withIdx.filter(f => (f.kind || 'charge') === 'charge')
  const deductions = withIdx.filter(f => f.kind === 'deduction')
  const chargesTotal    = charges.reduce((s, f) => s + (parseFloat(f.montant) || 0), 0)
  const deductionsTotal = deductions.reduce((s, f) => s + (parseFloat(f.montant) || 0), 0)

  return (
    <>
      {/* Frais supplémentaires (charges) */}
      <div className="border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Frais supplémentaires</label>
          <button type="button" onClick={() => addItem('charge')}
            className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded px-2 py-0.5 transition">
            ＋ Ajouter frais
          </button>
        </div>
        {charges.length === 0 && (
          <div className="text-[10px] text-slate-300 italic">Aucun frais — optionnel (transport, gasoil, ouvriers…)</div>
        )}
        {charges.map(f => (
          <div key={f._id ?? f.id ?? f._idx} className="flex gap-2 mb-1.5 items-center">
            <select value={f.label} onChange={e=>changeItem(f._idx,'label',e.target.value)} className="input text-xs flex-1">
              {FRAIS_LABELS.map(l=><option key={l} value={l}>{l}</option>)}
              {!FRAIS_LABELS.includes(f.label) && f.label && <option value={f.label}>{f.label}</option>}
            </select>
            <input type="number" step="0.01" value={f.montant} onChange={e=>changeItem(f._idx,'montant',e.target.value)}
              className="input text-xs w-28" placeholder="Montant DHS"/>
            <button type="button" onClick={()=>removeItem(f._idx)}
              className="text-red-400 hover:text-red-600 text-sm font-bold leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 transition flex-shrink-0">✕</button>
          </div>
        ))}
        {chargesTotal > 0 && (
          <div className="text-[10px] text-amber-600 font-semibold mt-1">
            Total frais : + {fmtMoney(chargesTotal)} DHS
          </div>
        )}
      </div>

      {/* Déductions client */}
      <div className="border-t border-slate-100 pt-3 mt-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Déductions client</label>
          <button type="button" onClick={() => addItem('deduction')}
            className="text-[10px] font-semibold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded px-2 py-0.5 transition">
            ＋ Ajouter déduction
          </button>
        </div>
        {deductions.length === 0 && (
          <div className="text-[10px] text-slate-300 italic">Aucune déduction — optionnel (transport payé, ouvriers…)</div>
        )}
        {deductions.map(f => (
          <div key={f._id ?? f.id ?? f._idx} className="flex gap-2 mb-1.5 items-center">
            <select value={f.label} onChange={e=>changeItem(f._idx,'label',e.target.value)} className="input text-xs flex-1">
              {DEDUCTION_LABELS.map(l=><option key={l} value={l}>{l}</option>)}
              {!DEDUCTION_LABELS.includes(f.label) && f.label && <option value={f.label}>{f.label}</option>}
            </select>
            <input type="number" step="0.01" value={f.montant} onChange={e=>changeItem(f._idx,'montant',e.target.value)}
              className="input text-xs w-28" placeholder="Montant DHS"/>
            <button type="button" onClick={()=>removeItem(f._idx)}
              className="text-red-400 hover:text-red-600 text-sm font-bold leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 transition flex-shrink-0">✕</button>
          </div>
        ))}
        {deductionsTotal > 0 && (
          <div className="text-[10px] text-rose-600 font-semibold mt-1">
            Total déductions : − {fmtMoney(deductionsTotal)} DHS
          </div>
        )}
      </div>
    </>
  )
}
