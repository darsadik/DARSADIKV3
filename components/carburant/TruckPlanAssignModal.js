import { useState, useMemo } from 'react'
import { fmtDate } from '../../lib/utils'
import { useToast } from '../../lib/toast'
import { linkCamionToVoyage, unlinkCamionFromVoyage } from '../../lib/services/voyage/camionLink'
import CreateNextVoyageModal from './CreateNextVoyageModal'

// Handles both "Lier un plan" (currentPlan === null) and "Changer de plan"
// (currentPlan set) — same modal, per spec ("Provide Change Plan instead of
// forcing the user to remove it first"). Two ways to get a truck a plan:
//   - Create a brand new voyage for it (delegates entirely to the existing
//     CreateNextVoyageModal / createFollowUpVoyage — zero new logic).
//   - Reassign an existing en_cours (or currently truck-less) voyage to this
//     truck — covers the "linked the wrong truck by mistake" correction
//     flow. Writes go through lib/services/voyage/camionLink.js, which only
//     ever touches voyages.camion_id/camion_plaque/chauffeur.
export default function TruckPlanAssignModal({ mode, camion, currentPlan, available, onClose, onSaved }) {
  const [choice, setChoice] = useState(null) // null | 'create' | 'reassign'
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState(null)
  const [busy, setBusy] = useState(false)
  const { toast, ToastContainer } = useToast()

  const searchList = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (available || [])
      .filter(v => !q || (v.reference || '').toLowerCase().includes(q) || (v.camion_plaque || '').toLowerCase().includes(q))
      .slice(0, 40)
  }, [available, search])

  async function confirmReassign() {
    setBusy(true)
    try {
      if (mode === 'change' && currentPlan && currentPlan.id !== picked.id) {
        await unlinkCamionFromVoyage({ voyageId: currentPlan.id, camionId: camion.id })
      }
      await linkCamionToVoyage({ voyageId: picked.id, camion, previousCamionId: picked.camion_id })
      toast('Plan lié avec succès', 'success')
      await onSaved?.()
      onClose()
    } catch (err) {
      toast('Erreur: ' + err.message)
    }
    setBusy(false)
  }

  // Freeing the current plan happens BEFORE opening the create-voyage modal
  // (awaited + error-surfaced here) rather than after — CreateNextVoyageModal
  // fires its onCreated callback without awaiting it, so doing the unlink
  // afterward would race its own onClose().
  async function chooseCreate() {
    if (mode === 'change' && currentPlan) {
      setBusy(true)
      try {
        await unlinkCamionFromVoyage({ voyageId: currentPlan.id, camionId: camion.id })
      } catch (err) {
        toast('Erreur: ' + err.message)
        setBusy(false)
        return
      }
      setBusy(false)
    }
    setChoice('create')
  }

  if (choice === 'create') {
    return (
      <CreateNextVoyageModal
        camionId={camion.id} camionPlaque={camion.plaque} chauffeur={camion.chauffeur} prefillKm=""
        onClose={onClose}
        onCreated={onSaved}
      />
    )
  }

  const title = mode === 'change' ? `Changer le plan — ${camion.plaque}` : `Lier un plan — ${camion.plaque}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <ToastContainer />
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-gray-900">{title}</h2>
            {mode === 'change' && currentPlan && (
              <p className="text-xs text-gray-400 mt-0.5">Plan actuel : {currentPlan.reference || `#${currentPlan.id}`} ({fmtDate(currentPlan.date_depart)})</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {!choice && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button onClick={chooseCreate} disabled={busy}
                className="p-4 rounded-xl border-2 border-slate-200 hover:border-brand-400 hover:bg-brand-50/40 text-left transition disabled:opacity-60">
                <div className="text-2xl mb-1">➕</div>
                <div className="font-bold text-sm text-slate-800">{busy ? 'Préparation...' : 'Créer un nouveau voyage'}</div>
                <div className="text-xs text-slate-400 mt-1">Ce camion démarre un tout nouveau voyage.</div>
              </button>
              <button onClick={() => setChoice('reassign')} disabled={busy}
                className="p-4 rounded-xl border-2 border-slate-200 hover:border-brand-400 hover:bg-brand-50/40 text-left transition disabled:opacity-60">
                <div className="text-2xl mb-1">🔁</div>
                <div className="font-bold text-sm text-slate-800">Réassigner un voyage existant</div>
                <div className="text-xs text-slate-400 mt-1">Corriger un voyage lié au mauvais camion par erreur.</div>
              </button>
            </div>
          )}

          {choice === 'reassign' && !picked && (
            <div>
              <button onClick={() => setChoice(null)} className="text-xs text-slate-400 hover:text-slate-600 mb-3">← Retour</button>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1.5">Voyages disponibles</div>
              <input className="input text-sm mb-2" placeholder="Rechercher une référence, un camion..." value={search} onChange={e => setSearch(e.target.value)} />
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {searchList.map(v => (
                  <button key={v.id} onClick={() => setPicked(v)}
                    className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 text-left text-xs">
                    <span className="font-semibold text-slate-700">
                      {v.reference || `#${v.id}`} <span className="text-slate-400 font-normal">({fmtDate(v.date_depart)})</span>
                      {v.destination && <span className="text-slate-400 font-normal"> → {v.destination}</span>}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${v.camion_id ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                      {v.camion_id ? `Actuellement : ${v.camion_plaque || '—'}` : '— Aucun camion —'}
                    </span>
                  </button>
                ))}
                {searchList.length === 0 && <div className="text-center text-slate-400 text-xs py-6">Aucun voyage disponible pour réassignation</div>}
              </div>
            </div>
          )}

          {choice === 'reassign' && picked && (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-800 leading-relaxed">
                Le voyage <b>{picked.reference || `#${picked.id}`}</b> sera retiré de{' '}
                <b>{picked.camion_id ? (picked.camion_plaque || '—') : '« aucun camion »'}</b> et lié à <b>{camion.plaque}</b>.
                {mode === 'change' && currentPlan && currentPlan.id !== picked.id && (
                  <> Le plan actuel de ce camion (<b>{currentPlan.reference || `#${currentPlan.id}`}</b>) sera libéré et restera disponible, avec son historique intact.</>
                )}
                <br />Achats, livraisons, carburant et charges de ce voyage restent inchangés.
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setPicked(null)} disabled={busy} className="btn-secondary text-xs">← Retour</button>
                <button onClick={confirmReassign} disabled={busy}
                  className="text-xs bg-brand-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-60">
                  {busy ? '...' : '✓ Confirmer'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
