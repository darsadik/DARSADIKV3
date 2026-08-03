import { fmt, fmtMoney } from '../../lib/utils'

// Moved verbatim out of pages/voyages/index.js so other pages (Review Mode)
// can reuse the exact same chips instead of redefining them.

export function StatusBadge({ statut }) {
  const map = {
    en_cours: { label: 'En cours', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
    termine:  { label: 'Terminé',  cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    annule:   { label: 'Annulé',   cls: 'bg-red-50 text-red-500 border-red-200' },
  }
  const s = map[statut] || map.en_cours
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
}

export function ProfitCell({ v }) {
  return (
    <span className={`font-black text-sm ${v >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
      {v >= 0 ? '+' : ''}{fmtMoney(v)}
    </span>
  )
}

export function MargeBadge({ m }) {
  const cls = m > 15 ? 'bg-emerald-50 text-emerald-700' : m > 0 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
  return <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${cls}`}>{m}%</span>
}
