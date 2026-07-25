import { useState } from 'react'
import { updateAchat } from '../services/voyage/achats'
import { updateLiv } from '../services/voyage/livraisons'
import { updateRetour } from '../services/voyage/retours'
import { updateCharge } from '../services/voyage/charges'

// Single dispatch point for editing a voyage-sourced transaction (achat /
// livraison / retour / charge), used by the voyage detail page itself and by
// every other page that displays voyage-derived data. `editRow` is always
// `{ type, data }` where `data` is the real voyage_* row (resolved via
// lib/services/voyage/resolveSource.js when the caller only has a mirror row).
export function useVoyageTransactionEdit({ onSaved, camionId } = {}) {
  const [editRow,    setEditRow]    = useState(null) // { type, data }
  const [editForm,   setEditForm]   = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editError,  setEditError]  = useState('')

  // `rowCamionId` overrides the hook-level `camionId` for this row — needed by
  // pages that list charges across many voyages/camions at once (the voyage
  // detail page instead has one fixed camion, so it just uses the hook option).
  function openEdit(type, data, rowCamionId) {
    setEditError('')
    setEditRow({ type, data, camionId: rowCamionId })
    setEditForm({ ...data })
  }
  function closeEdit() { setEditRow(null); setEditError('') }

  async function save() {
    if (!editRow) return
    setEditSaving(true)
    setEditError('')
    try {
      if (editRow.type === 'achat')  await updateAchat(editRow.data, editForm)
      if (editRow.type === 'liv')    await updateLiv(editRow.data, editForm)
      if (editRow.type === 'retour') await updateRetour(editRow.data, editForm)
      if (editRow.type === 'charge') await updateCharge(editRow.data, editForm, editRow.camionId ?? camionId)
      setEditRow(null)
      await onSaved?.()
    } catch (err) {
      setEditError(err.message || 'Erreur de modification')
    } finally {
      setEditSaving(false)
    }
  }

  return { editRow, editForm, setEditForm, editSaving, editError, openEdit, closeEdit, save }
}
