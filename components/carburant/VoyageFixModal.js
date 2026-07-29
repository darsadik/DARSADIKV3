import VoyageDetailPanel from '../voyage/VoyageDetailPanel'

// ── Quick-fix overlay (spec §10) — reuses VoyageDetailPanel exactly as
// Review Mode already embeds it (embedded prop), so the voyage's Odomètre
// bar (km_depart) and its existing save path (updateKm → recalcOdometerChain)
// are used verbatim. Zero new voyage-editing logic.
export default function VoyageFixModal({ voyageId, onClose, onSaved }) {
  if (!voyageId) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-gray-900">🚚 Corriger le voyage</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>
        <div className="p-4">
          <VoyageDetailPanel
            voyageId={voyageId}
            embedded
            onSaved={() => { onSaved?.(); }}
          />
        </div>
      </div>
    </div>
  )
}
