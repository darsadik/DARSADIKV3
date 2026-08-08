import Link from 'next/link'
import { fmt, fmtD, fmtMoney, fmtDate } from '../../lib/utils'
import Section from '../ui/Section'
import DelBtn from '../ui/DelBtn'

// Same 4 labels/icons Contrôle Allocation uses for a contribution's mode
// (lib/services/voyage/fuelAllocationCenter.js's modeForVoyage) — kept here
// as pure display metadata only (icon/color), never a second classification:
// the `mode` string itself always comes from modeForVoyage.
const MODE_META = {
  automatic:        { icon: '⚡', label: 'Automatique',        cls: 'text-emerald-600' },
  manual_override:  { icon: '📝', label: 'Lié manuellement',   cls: 'text-amber-600' },
  manual_km:        { icon: '📏', label: 'Estimation KM',      cls: 'text-blue-600' },
  manual_fixed:     { icon: '💰', label: 'Montant manuel',     cls: 'text-purple-600' },
}

function ContributionMeta({ c }) {
  const meta = MODE_META[c.mode] || MODE_META.automatic
  return <span className={`font-bold ${meta.cls}`}>{meta.icon} {meta.label}</span>
}

function PurchaseLine({ c, camionPlaque }) {
  return (
    <span className="text-slate-500">
      Plein du <b className="text-slate-700">{fmtDate(c.date)}</b>
      {camionPlaque ? ` — ${camionPlaque}` : ''}
      {c.purchaseKm !== null && c.purchaseKm !== undefined ? ` · ${fmt(c.purchaseKm)} KM` : ''}
      {c.purchaseQte ? ` · ${fmtD(c.purchaseQte)}L` : ''}
      {c.purchaseTotal ? ` · Total plein ${fmtMoney(c.purchaseTotal)} DHS` : ''}
    </span>
  )
}

export default function GasoilSection({
  gasoil,
  fuelContributions,
  orphanGasoilLinks,
  voyage,
  showGasoilPicker, onClosePicker,
  camionPleins,
  linkingGasoil,
  onLoadPleins,
  onLinkGasoil,
  onDel,
  fuelSource,
  fuelCost,
  voyageKm,
  totalGasoilManuel,
  camionPlaque,
  voyageId,
  onUseAsFuelCost,
}) {
  const contributions = fuelContributions || []
  const orphans = orphanGasoilLinks || []
  const hasContributions = contributions.length > 0

  return (
    <Section icon="⛽" title="Carburant — allocation" color="orange"
      action={
        <button onClick={onLoadPleins}
          className="text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-orange-600 transition">
          + Lier un plein
        </button>
      }>

      {/* Gasoil Picker */}
      {showGasoilPicker && (
        <div className="bg-white border border-orange-100 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-700">
              Choisir un plein — {camionPlaque}
            </span>
            <button onClick={onClosePicker} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          {camionPleins.length === 0 ? (
            <div className="text-center py-4 text-slate-400 text-xs">
              Aucun plein enregistré pour ce camion.
              <Link href="/gasoil" className="text-blue-500 hover:underline ml-1">
                → Ajouter dans Gasoil
              </Link>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {camionPleins.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-100 hover:bg-orange-50">
                  <div className="text-xs">
                    <span className="font-semibold text-slate-700">{fmtDate(p.date)}</span>
                    <span className="text-slate-400 ml-2">{p.station || '—'}</span>
                    <span className="text-orange-600 font-bold ml-2">{p.qte}L × {fmtMoney(p.prix_unitaire)} = {fmtMoney(p.total)} DHS</span>
                  </div>
                  <button
                    onClick={() => onLinkGasoil(p)}
                    disabled={linkingGasoil}
                    className="text-xs bg-orange-500 text-white px-2 py-1 rounded-lg font-semibold hover:bg-orange-600 flex-shrink-0">
                    ✓ Lier
                  </button>
                </div>
              ))}
              <div className="text-[10px] text-slate-400 px-1">
                Le montant attribué à ce voyage est calculé automatiquement au prorata de sa distance — un même plein peut être lié à plusieurs voyages.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state — nothing allocated yet */}
      {!hasContributions && orphans.length === 0 && (
        <div className="text-center py-3 space-y-1">
          {voyage?.fuel_mode === 'manual_km' ? (
            <div className="text-sm">
              <div className="font-semibold text-blue-600">📏 KM approximatif : {fmt(voyage?.manual_distance_km)} KM</div>
              <div className="text-slate-500 mt-1 text-xs">Liez un plein ci-dessus ("+ Lier un plein") pour appliquer cette distance à l'allocation.</div>
            </div>
          ) : voyage?.fuel_mode === 'manual_fixed' ? (
            <div className="text-sm">
              <div className="font-semibold text-purple-600">💰 Montant fixe : {fmtMoney(voyage?.manual_fuel_cost)} DHS</div>
              <div className="text-slate-500 mt-1 text-xs">Liez un plein ci-dessus ("+ Lier un plein") pour prélever ce montant.</div>
            </div>
          ) : (fuelSource === 'manual_rate' || fuelSource === 'manual_amount') ? (
            <div className="text-sm font-semibold text-purple-600">
              📝 Carburant en mode manuel — {fmtMoney(fuelCost)} DHS (voir section Carburant ci-dessus)
            </div>
          ) : (
            <div className="text-sm text-slate-500">
              Aucune allocation pour l'instant. Cliquez sur "+ Lier un plein", ou vérifiez le KM du voyage pour l'allocation automatique.
            </div>
          )}
        </div>
      )}

      {/* Single purchase — compact card */}
      {contributions.length === 1 && (
        <div className="border border-orange-100 bg-orange-50/40 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <ContributionMeta c={contributions[0]} />
            <span className="text-lg font-black text-orange-600">{fmtMoney(contributions[0].amount)} DHS</span>
          </div>
          <div className="text-xs">
            <PurchaseLine c={contributions[0]} camionPlaque={camionPlaque} />
          </div>
          <div className="text-xs text-slate-600">
            {contributions[0].isFixed
              ? 'Montant fixe prélevé sur ce plein'
              : `${fmt(contributions[0].distance)} KM · Part ${Math.round((contributions[0].share || 0) * 1000) / 10}%`}
          </div>
          {contributions[0].linkRowId && (
            <div className="pt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
              <span>Délier ce plein</span>
              <DelBtn onDel={() => onDel({ id: contributions[0].linkRowId })} />
            </div>
          )}
        </div>
      )}

      {/* Multiple purchases — full table */}
      {contributions.length > 1 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                <th className="text-left pb-2 pr-3">Source</th>
                <th className="text-left pb-2 pr-3">Plein</th>
                <th className="text-right pb-2 pr-3">Distance</th>
                <th className="text-right pb-2 pr-3">Part</th>
                <th className="text-right pb-2 pr-3">Coût</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {contributions.map(c => (
                <tr key={c.gasoilId} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-3"><ContributionMeta c={c} /></td>
                  <td className="py-2 pr-3 text-slate-500">
                    {fmtDate(c.date)}{c.purchaseKm !== null && c.purchaseKm !== undefined ? ` — ${fmt(c.purchaseKm)} KM` : ''}
                  </td>
                  <td className="py-2 pr-3 text-right text-slate-500">{c.isFixed ? '—' : `${fmt(c.distance)} KM`}</td>
                  <td className="py-2 pr-3 text-right text-slate-500">{c.isFixed ? '—' : `${Math.round((c.share || 0) * 1000) / 10}%`}</td>
                  <td className="py-2 pr-3 text-right font-bold text-orange-600">{fmtMoney(c.amount)} DHS</td>
                  <td className="py-2 pl-1">{c.linkRowId && <DelBtn onDel={() => onDel({ id: c.linkRowId })} />}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold">
                <td colSpan={4} className="py-2 pr-3 text-right text-[10px] uppercase text-slate-700">Coût total carburant</td>
                <td className="py-2 pr-3 text-right text-orange-600">{fmtMoney(fuelCost)} DHS</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {hasContributions && fuelSource === 'automatic' && onUseAsFuelCost && totalGasoilManuel > 0 && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          <span>⚡ Ce voyage utilise l'allocation km automatique ({fmtMoney(fuelCost)} DHS).</span>
          <button onClick={onUseAsFuelCost}
            className="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition">
            Utiliser ce carburant lié à la place ({fmtMoney(totalGasoilManuel)} DHS)
          </button>
        </div>
      )}

      {/* Orphaned links — a manual link whose purchase no longer produces any
          allocation (e.g. the purchase was deleted, or lost its km/qte).
          Surfaced explicitly rather than silently shown via legacy
          qte_litres/prix_unitaire/total columns, which are never the source
          of truth under the current engine. */}
      {orphans.length > 0 && (
        <div className="mt-2 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 space-y-1.5">
          <div className="font-semibold">
            ⚠ {orphans.length} lien{orphans.length > 1 ? 's' : ''} sans allocation — le plein associé n'existe plus ou n'a plus de KM/quantité valide.
          </div>
          {orphans.map(l => (
            <div key={l.id} className="flex items-center justify-between">
              <span>Plein #{l.gasoil_id}{l.date_gasoil ? ` du ${fmtDate(l.date_gasoil)}` : ''}</span>
              <DelBtn onDel={() => onDel(l)} />
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
