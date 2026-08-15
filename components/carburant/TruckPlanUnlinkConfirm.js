import { useState } from 'react'
import { fmtDate, fmtMoney } from '../../lib/utils'
import { useToast } from '../../lib/toast'
import { unlinkCamionFromVoyage } from '../../lib/services/voyage/camionLink'

// Dedicated "Retirer" confirmation — spec asks for a small dialog that
// clearly names the truck + plan being disconnected and explains exactly
// what happens to its Voyage Carburant (fuel) data. Only voyages.camion_id/
// camion_plaque/chauffeur are cleared (see lib/services/voyage/camionLink.js)
// — achats, livraisons, charges, retours and every voyage_gasoil link stay
// exactly as they are, keyed by voyage_id, never camion_id.
export default function TruckPlanUnlinkConfirm({ camion, plan, planRow, gasoilCount, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const { toast, ToastContainer } = useToast()

  async function confirm() {
    setBusy(true)
    try {
      await unlinkCamionFromVoyage({ voyageId: plan.id, camionId: camion.id })
      toast('Camion retiré du plan', 'success')
      await onSaved?.()
      onClose()
    } catch (err) {
      toast('Erreur: ' + err.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <ToastContainer />
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">⛔ Retirer ce plan ?</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-sm text-slate-600">
            Retirer <b className="text-slate-800">{camion.plaque}</b> du plan{' '}
            <b className="text-slate-800">{plan.reference || `#${plan.id}`}</b> ({fmtDate(plan.date_depart)}{plan.destination ? ` → ${plan.destination}` : ''}) ?
          </div>

          {(gasoilCount > 0 || (planRow && planRow.fuelCost > 0)) && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-800 leading-relaxed">
              Ce voyage a {gasoilCount > 0 && <>{gasoilCount} plein{gasoilCount > 1 ? 's' : ''} de carburant lié{gasoilCount > 1 ? 's' : ''}</>}
              {gasoilCount > 0 && planRow?.fuelCost > 0 && ' et '}
              {planRow?.fuelCost > 0 && <>un coût carburant actuel de <b>{fmtMoney(planRow.fuelCost)} DHS</b></>}.
              <br />Ces données resteront intactes et resteront associées à ce voyage. Seul le lien avec le camion est retiré.
            </div>
          )}

          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs text-slate-500 leading-relaxed">
            Achats, livraisons et charges de ce voyage ne sont pas affectés. Vous pourrez relier ce voyage au bon camion à tout moment depuis « Réassigner un voyage existant ».
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={onClose} disabled={busy} className="btn-secondary text-xs">Annuler</button>
            <button onClick={confirm} disabled={busy}
              className="text-xs bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-60">
              {busy ? '...' : '⛔ Retirer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
