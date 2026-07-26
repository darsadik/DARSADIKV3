import { fmt } from '../../lib/utils'
import Section from '../ui/Section'
import Empty from '../ui/Empty'
import { computeVoyageValidation } from '../../lib/services/voyage/validation'

const STATUS_META = {
  perfect:     { icon: '✅', label: 'Parfait',                  badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', row: 'bg-white border-slate-100' },
  remaining:   { icon: '⚠️', label: 'Reste',                     badge: 'bg-amber-50 text-amber-700 border-amber-200',       row: 'bg-amber-50/50 border-amber-100' },
  exceeds:     { icon: '❌', label: 'Livraison dépasse achat',   badge: 'bg-red-50 text-red-600 border-red-200',            row: 'bg-red-50/50 border-red-100' },
  no_purchase: { icon: '❌', label: 'Aucun achat trouvé',        badge: 'bg-red-50 text-red-600 border-red-200',            row: 'bg-red-50/50 border-red-100' },
}

// Real-time, no-reload: rows are derived straight from the `achats` /
// `livraisons` state already loaded in VoyageDetailPanel, so any add/edit/
// delete that triggers loadVoyage() re-renders this panel automatically.
export default function ValidationPanel({ achats, livraisons }) {
  const rows = computeVoyageValidation(achats, livraisons)
  const hasError   = rows.some(r => r.status === 'no_purchase' || r.status === 'exceeds')
  const hasWarning = !hasError && rows.some(r => r.status === 'remaining')
  const sectionColor = hasError ? 'red' : hasWarning ? 'orange' : 'green'

  return (
    <Section icon="🛡️" title="Validation du Voyage" color={sectionColor}>
      {rows.length === 0 ? (
        <Empty text="Aucun achat ni livraison à valider" />
      ) : (
        <div className="space-y-1.5">
          {rows.map(row => {
            const meta = STATUS_META[row.status]
            return (
              <div key={row.key}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 ${meta.row}`}>
                <div className="flex items-center gap-2 min-w-[110px]">
                  <span className="text-sm">{row.type_produit === 'grignon' ? '🫒' : '🧱'}</span>
                  <span className="font-bold text-slate-700 text-sm">{row.type_brique || '—'}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-[9px] text-slate-400 uppercase tracking-wide">Acheté</div>
                    <div className="font-semibold text-slate-700 text-xs">{fmt(row.achatQte)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-slate-400 uppercase tracking-wide">Livré</div>
                    <div className="font-semibold text-slate-700 text-xs">{fmt(row.deliveredQte)}</div>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${meta.badge}`}>
                    {meta.icon} {meta.label}
                    {row.status === 'remaining'   && <>: {fmt(Math.abs(row.diff))}</>}
                    {row.status === 'exceeds'     && <>: +{fmt(row.diff)}</>}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}
