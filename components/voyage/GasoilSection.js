import Link from 'next/link'
import { fmt, fmtD, fmtMoney, fmtDate } from '../../lib/utils'
import Section from '../ui/Section'
import DelBtn from '../ui/DelBtn'

export default function GasoilSection({
  gasoil,
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
  return (
    <Section icon="⛽" title={`Gasoil${gasoil.length > 0 ? ` (${gasoil.length} plein(s))` : ''}`} color="orange"
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

      {gasoil.length === 0 ? (
        <div className="text-center py-3 space-y-1">
          {fuelSource === 'automatic' ? (
            <div className="text-sm font-semibold text-emerald-600">
              ⚡ Alloué automatiquement — {fmtMoney(fuelCost)} DHS ({fmt(voyageKm)} km)
            </div>
          ) : (fuelSource === 'manual_rate' || fuelSource === 'manual_amount') ? (
            <div className="text-sm font-semibold text-purple-600">
              📝 Carburant en mode manuel — {fmtMoney(fuelCost)} DHS (voir section Carburant ci-dessus)
            </div>
          ) : (
            <div className="text-sm text-slate-500">
              Cliquez sur "+ Lier un plein" pour associer un gasoil à ce voyage
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                <th className="text-left pb-2 pr-3">Date</th>
                <th className="text-left pb-2 pr-3">Station</th>
                <th className="text-right pb-2 pr-3">Litres</th>
                <th className="text-right pb-2 pr-3">Prix/L</th>
                <th className="text-right pb-2 pr-3">Total</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {gasoil.map(g => (
                <tr key={g.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-3 text-slate-500">
                    {fmtDate(g.date_gasoil)}
                  </td>
                  <td className="py-2 pr-3 text-slate-500 truncate max-w-[140px]">{g.station}</td>
                  <td className="py-2 pr-3 text-right">{g.qte_litres}L</td>
                  <td className="py-2 pr-3 text-right">{fmtMoney(g.prix_unitaire)}</td>
                  <td className="py-2 pr-3 text-right font-bold text-orange-600">{fmtMoney(g.total)} DHS</td>
                  <td className="py-2 pl-1"><DelBtn onDel={() => onDel(g)}/></td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold">
                <td colSpan={4} className="py-2 pr-3 text-right text-[10px] uppercase text-slate-700">Total (historique)</td>
                <td className="py-2 pr-3 text-right text-orange-600">{fmtMoney(totalGasoilManuel)} DHS</td>
                <td></td>
              </tr>
            </tbody>
          </table>
          {fuelSource === 'automatic' && (
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              <span>⚡ Ce voyage utilise l'allocation km automatique ({fmtMoney(fuelCost)} DHS) — les entrées ci-dessus sont conservées à titre d'historique.</span>
              {onUseAsFuelCost && (
                <button onClick={onUseAsFuelCost}
                  className="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition">
                  Utiliser ce carburant lié à la place ({fmtMoney(totalGasoilManuel)} DHS)
                </button>
              )}
            </div>
          )}
          {(fuelSource === 'manual_rate' || fuelSource === 'manual_amount') && (
            <div className="mt-2 text-[10px] text-purple-700 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
              📝 Ce voyage utilise un carburant saisi manuellement ({fmtMoney(fuelCost)} DHS) — les entrées ci-dessus sont conservées à titre d'historique.
            </div>
          )}
        </div>
      )}
    </Section>
  )
}
