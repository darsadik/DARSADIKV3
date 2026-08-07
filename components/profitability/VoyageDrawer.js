import { useState } from 'react'
import Link from 'next/link'
import { fmt, fmtDate, fmtMoney } from '../../lib/utils'
import MarginBadge from './MarginBadge'
import AllocationProgressBar from '../carburant/AllocationProgressBar'

const FUEL_SOURCE_LABEL = {
  automatic:     '⚡ Automatique (odomètre)',
  manuel:        '📝 Manuel (pleins liés)',
  manual_rate:   '📏 Estimation KM',
  manual_amount: '💰 Montant manuel',
  none:          '⚠ Non disponible',
}

function Row({ label, value, bold, indent, color }) {
  return (
    <div className={`flex justify-between py-1.5 text-xs ${indent ? 'pl-4' : ''} ${bold ? 'font-bold border-t border-slate-100 mt-1 pt-2' : ''}`}>
      <span className="text-slate-500">{label}</span>
      <span className={color || (bold ? 'text-slate-800' : 'text-slate-600')}>{value}</span>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-slate-50 rounded-xl p-4">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</div>
      {children}
    </div>
  )
}

export default function VoyageDrawer({ voyage: v, onClose, contributions }) {
  const nbCli = v.clients?.length || 0
  const clientNames = (v.clients || []).map(c => c.client_nom).filter(Boolean)
  const [showFuelDetail, setShowFuelDetail] = useState(false)
  const hasFuelDetail = (contributions?.length > 0) && (v.cost.fuelSource === 'automatic' || v.cost.fuelSource === 'manuel')

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-white shadow-2xl overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 py-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-black text-slate-800 text-lg">{v.reference || `Voyage #${v.id}`}</h2>
              <MarginBadge marge={v.marge} size="lg" />
              {v.warnings?.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  ⚠ {v.warnings.length} avertissement{v.warnings.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {fmtDate(v.date_depart)} · {v.camion_plaque}{v.chauffeur ? ` · ${v.chauffeur}` : ''}{v.destination ? ` → ${v.destination}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href={`/voyages/${v.id}`} className="text-xs font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-3 py-1.5 whitespace-nowrap">
              Ouvrir le voyage →
            </Link>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1">×</button>
          </div>
        </div>

        <div className="p-6 space-y-4">

          {/* Profit headline */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Revenu</div>
              <div className="text-lg font-black text-emerald-400">{fmtMoney(v.revenue.total)} DHS</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Coût</div>
              <div className="text-lg font-black text-red-400">{fmtMoney(v.cost.total)} DHS</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Profit net</div>
              <div className={`text-lg font-black ${v.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {v.profit >= 0 ? '+' : ''}{fmtMoney(v.profit)} DHS
              </div>
            </div>
          </div>

          {/* Warnings */}
          {v.warnings?.length > 0 && (
            <Section title="⚠ Avertissements">
              <div className="space-y-1.5">
                {v.warnings.map((w, i) => (
                  <div key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    {w.type === 'delivery_cost_undetermined' && (
                      <>Coût d'achat indéterminé — {fmt(w.qte)} {w.type_brique} livré à <strong>{w.client_nom}</strong> sans achat correspondant sur ce voyage.</>
                    )}
                    {w.type === 'achat_without_delivery' && (
                      <>{fmt(w.qte)} {w.type_brique} acheté ({fmtMoney(w.total_achat)} DHS) sans livraison correspondante — coût non attribué à un client.</>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Revenue detail */}
          <Section title="Revenu">
            <Row label="Ventes briques" value={`+ ${fmtMoney(v.revenue.briqueSales)} DHS`} />
            <Row label="Ventes grignon" value={`+ ${fmtMoney(v.revenue.grignonSales)} DHS`} />
            <Row label="Retours" value={`+ ${fmtMoney(v.revenue.retours)} DHS`} />
            <Row label="Charges facturées clients" value={`+ ${fmtMoney(v.revenue.chargesFacturees)} DHS`} />
            <Row label="= Revenu total" value={`${fmtMoney(v.revenue.total)} DHS`} bold />
          </Section>

          {/* Cost detail — kept to just two lines: Gasoil, and everything
              else combined into Charges (achats + location + charges
              opérationnelles). Charges = Coût total − Gasoil, so the two
              always reconcile exactly to the engine's own Total Cost. */}
          <Section title="Coût">
            <div className="flex items-center justify-between py-1.5 text-xs">
              <span className="text-slate-500">Gasoil — {FUEL_SOURCE_LABEL[v.cost.fuelSource] || v.cost.fuelSource}</span>
              <span className="flex items-center gap-2">
                <span className="text-slate-600">− {fmtMoney(v.cost.fuel)} DHS</span>
                {hasFuelDetail && (
                  <button onClick={() => setShowFuelDetail(x => !x)} className="text-[10px] font-bold text-blue-600 hover:underline whitespace-nowrap">
                    {showFuelDetail ? '✕ Fermer' : 'Détails →'}
                  </button>
                )}
              </span>
            </div>

            {/* Profitability Transparency (spec item 9) — one row per fuel
                purchase this voyage draws from, read straight from
                lib/services/voyage/fuelAllocationCenter.js's
                buildVoyageFuelContributions (which itself only reads the
                unmodified engine's own voyageContributions output — no new
                math). Sums back exactly to v.cost.fuel above. */}
            {showFuelDetail && hasFuelDetail && (
              <div className="mb-2 -mt-1 space-y-2">
                {contributions.map(c => (
                  <div key={c.gasoilId} className="bg-white border border-slate-200 rounded-lg p-2.5 text-[11px]">
                    <div className="flex items-center justify-between mb-1">
                      <Link href={`/voyages/km-carburant?tab=allocation&search=${c.gasoilId}`}
                        className="font-bold text-blue-600 hover:underline">
                        Plein #{c.gasoilId} — {fmtDate(c.date)}
                      </Link>
                      <span className="font-black text-slate-800">{fmtMoney(c.amount)} DHS</span>
                    </div>
                    <div className="text-slate-400 mb-1.5">{c.camionPlaque}{c.station ? ` · ${c.station}` : ''}</div>
                    {c.isFixed ? (
                      <div className="text-purple-600 font-semibold">💰 Montant fixe manuel</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2 text-slate-500 mb-1">
                          <div>Distance <b className="text-slate-700">{fmt(c.distance)} km</b></div>
                          <div>Total plein <b className="text-slate-700">{c.totalDistance !== null ? `${fmt(c.totalDistance)} km` : '—'}</b></div>
                          <div>Allocation <b className="text-slate-700">{Math.round((c.share || 0) * 1000) / 10}%</b></div>
                        </div>
                        <AllocationProgressBar allocated={c.share * 100} total={100} colorClass="green" size="sm" />
                      </>
                    )}
                  </div>
                ))}
                <div className="flex justify-between px-1 text-[11px] font-bold text-slate-700">
                  <span>= Coût carburant final</span>
                  <span>{fmtMoney(v.cost.fuel)} DHS</span>
                </div>
              </div>
            )}

            <Row label="Charges" value={`− ${fmtMoney(v.cost.total - v.cost.fuel)} DHS`} />
            {v.cost.achatUnallocated > 0 && (
              <Row label="dont achat non livré (non attribué)" value={fmtMoney(v.cost.achatUnallocated) + ' DHS'} indent color="text-amber-600" />
            )}
            <Row label="= Coût total" value={`${fmtMoney(v.cost.total)} DHS`} bold />
          </Section>

          {/* Per-client breakdown */}
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">
              Répartition par client ({nbCli}) — {clientNames.join(', ') || '—'}
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="py-2 px-3 text-left text-[10px] font-semibold text-slate-400 uppercase">Client</th>
                    <th className="py-2 px-3 text-right text-[10px] font-semibold text-slate-400 uppercase">Qté</th>
                    <th className="py-2 px-3 text-right text-[10px] font-semibold text-slate-400 uppercase">Revenu</th>
                    <th className="py-2 px-3 text-right text-[10px] font-semibold text-slate-400 uppercase">Gasoil</th>
                    <th className="py-2 px-3 text-right text-[10px] font-semibold text-slate-400 uppercase">Charges</th>
                    <th className="py-2 px-3 text-right text-[10px] font-semibold text-slate-400 uppercase">= Coût total</th>
                    <th className="py-2 px-3 text-right text-[10px] font-semibold text-slate-400 uppercase">Profit</th>
                    <th className="py-2 px-3 text-right text-[10px] font-semibold text-slate-400 uppercase">Marge</th>
                  </tr>
                </thead>
                <tbody>
                  {(v.clients || []).map(c => (
                    <tr key={c.key} className="border-b border-slate-50">
                      <td className="py-2 px-3 font-semibold text-slate-700">
                        {c.client_nom}
                        {c.type_produit === 'grignon' && <span className="ml-1 text-[9px] bg-lime-100 text-lime-700 px-1.5 py-0.5 rounded font-semibold">GRIGNON</span>}
                        {c.hasUndeterminedCost && <span className="text-amber-500 ml-1" title="Coût indéterminé pour au moins une livraison">⚠</span>}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">{fmt(c.qte)}</td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-600">{fmtMoney(c.revenue.total)}</td>
                      <td className="py-2 px-3 text-right text-red-400">{c.cost.fuelAllocated > 0 ? `−${fmtMoney(c.cost.fuelAllocated)}` : '—'}</td>
                      <td className="py-2 px-3 text-right text-red-400">−{fmtMoney(c.cost.total - c.cost.fuelAllocated)}</td>
                      <td className="py-2 px-3 text-right font-bold text-red-700">−{fmtMoney(c.cost.total)}</td>
                      <td className={`py-2 px-3 text-right font-black ${c.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {c.profit >= 0 ? '+' : ''}{fmtMoney(c.profit)}
                      </td>
                      <td className="py-2 px-3 text-right"><MarginBadge marge={c.marge} /></td>
                    </tr>
                  ))}
                  {nbCli === 0 && (
                    <tr><td colSpan={8} className="py-8 text-center text-slate-400">Aucun client sur ce voyage</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
