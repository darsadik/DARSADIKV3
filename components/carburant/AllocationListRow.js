import Link from 'next/link'
import { fmt, fmtDate, fmtMoney } from '../../lib/utils'

const MODE_BADGE = {
  automatic:       { label: '⚡ Automatique',     cls: 'badge-blue',   title: 'Détecté automatiquement par le moteur, à partir du KM du voyage.' },
  manual_override: { label: '🔧 Override Manuel', cls: 'badge-purple', title: 'Lié manuellement à ce plein — ne suit plus la détection automatique.' },
  manual_km:       { label: '📏 KM Manuel',       cls: 'badge-purple', title: "Distance approximative saisie à la main (pas d'odomètre réel)." },
  manual_fixed:    { label: '💰 Montant Fixe',    cls: 'badge-purple', title: "Montant DHS fixe saisi à la main — remplace l'allocation automatique." },
}

// One voyage row inside a PurchaseAllocationCard's expanded Allocation List
// (spec items 2, 6) — stacked labeled fields (Client / Date / Distance /
// Mode / Amount) so everything useful is visible without a second click.
// All values are read straight off the card's own voyageAllocations entry
// (lib/services/voyage/fuelAllocationCenter.js) — nothing is recomputed here.
export default function AllocationListRow({ voyage, onMove, onUnlink, canUnlink }) {
  const badge = MODE_BADGE[voyage.mode] || MODE_BADGE.automatic
  const km = voyage.kmDepart !== null && voyage.kmArrivee !== null
    ? `${fmt(voyage.kmDepart)} → ${fmt(voyage.kmArrivee)}`
    : null

  return (
    <div className="py-3 border-b border-slate-50 last:border-0">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/voyages/${voyage.voyageId}`} className="font-bold text-brand-700 hover:underline text-sm">{voyage.reference}</Link>
          <span className={badge.cls} title={badge.title}>{badge.label}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Montant</div>
            <div className="font-black text-slate-800">{fmtMoney(voyage.amount)} DHS</div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => onMove(voyage)} className="text-[11px] font-bold text-brand-600 hover:underline whitespace-nowrap">Déplacer</button>
            {canUnlink && (
              <button onClick={() => onUnlink(voyage)} className="text-[11px] font-bold text-red-500 hover:underline whitespace-nowrap">Retirer</button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2 pl-0">
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wide">Client</div>
          <div className="text-xs font-semibold text-slate-600">{voyage.clientNames?.length ? voyage.clientNames.join(', ') : 'Sans client'}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wide">Date</div>
          <div className="text-xs font-semibold text-slate-600">{fmtDate(voyage.date)}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wide">Distance</div>
          <div className="text-xs font-semibold text-slate-600">
            {voyage.distance !== null ? `${fmt(voyage.distance)} km` : '—'}
            {km && <span className="text-slate-400 font-normal"> ({km})</span>}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wide">Mode</div>
          <div className="text-xs font-semibold text-slate-600">{badge.label}</div>
        </div>
      </div>

      {voyage.mode === 'manual_override' && (
        <div className="text-[11px] text-purple-600 font-semibold mt-1.5">
          Ne suit plus l'allocation automatique.
        </div>
      )}
    </div>
  )
}
