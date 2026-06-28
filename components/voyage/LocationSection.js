import { fmt } from '../../lib/utils'
import Section from '../ui/Section'
import DelBtn from '../ui/DelBtn'

export default function LocationSection({
  locations,
  showLocation, onToggleForm,
  locForm, onFormChange,
  savingLoc,
  loueurs,
  onSave, onCancel,
  onDel,
}) {
  return (
    <Section icon="🔑" title="Location camion" color="purple"
      action={
        <button onClick={onToggleForm}
          className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-purple-700 transition">
          {showLocation ? 'Fermer' : locations.length === 0 ? '+ Saisir location' : '✏️ Modifier'}
        </button>
      }>

      {showLocation && (
        <form onSubmit={onSave} className="bg-white border border-purple-100 rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="col-span-2 md:col-span-3">
            <label className="text-[10px] font-semibold text-slate-500 block mb-1">Loueur</label>
            <select value={locForm.loueur_id} onChange={e => onFormChange({...locForm, loueur_id: e.target.value})} className="input w-full text-sm">
              <option value="">— Sélectionner un loueur —</option>
              {loueurs.map(l => <option key={l.id} value={l.id}>{l.nom}{l.telephone ? ` · ${l.telephone}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant location (DHS)</label>
            <input type="number" step="0.01" min="0" value={locForm.montant_location}
              onChange={e => onFormChange({...locForm, montant_location: e.target.value})}
              className="input w-full text-sm font-bold" placeholder="0" required />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant payé (DHS)</label>
            <input type="number" step="0.01" min="0" value={locForm.montant_paye}
              onChange={e => onFormChange({...locForm, montant_paye: e.target.value})}
              className="input w-full text-sm" placeholder="0" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 block mb-1">Reste à payer</label>
            <div className="input w-full text-sm bg-slate-50 font-bold text-red-600 flex items-center">
              {fmt(Math.max(0, (parseFloat(locForm.montant_location)||0) - (parseFloat(locForm.montant_paye)||0)))} DHS
            </div>
          </div>
          <div className="col-span-2 md:col-span-3">
            <label className="text-[10px] font-semibold text-slate-500 block mb-1">Note (optionnel)</label>
            <input type="text" value={locForm.note} onChange={e => onFormChange({...locForm, note: e.target.value})}
              className="input w-full text-sm" placeholder="ex: chèque #123, mode de paiement..." />
          </div>
          <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel}
              className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600">Annuler</button>
            <button type="submit" disabled={savingLoc}
              className="text-xs bg-purple-600 text-white px-5 py-1.5 rounded-lg font-bold hover:bg-purple-700 transition">
              {savingLoc ? '...' : '✅ Enregistrer'}
            </button>
          </div>
        </form>
      )}

      {locations.length === 0 ? (
        <div className="text-center py-4 space-y-1">
          <div className="text-sm text-slate-400">Location non saisie</div>
          <div className="text-xs text-slate-300">Cliquez sur "+ Saisir location" pour enregistrer le coût de location</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                <th className="text-left pb-2 pr-3">Loueur</th>
                <th className="text-right pb-2 pr-3">Montant location</th>
                <th className="text-right pb-2 pr-3">Payé</th>
                <th className="text-right pb-2 pr-3">Reste</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {locations.map(loc => (
                <tr key={loc.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-3 font-semibold text-slate-700">{loc.loueur_nom || '—'}</td>
                  <td className="py-2 pr-3 text-right font-bold text-purple-600">{fmt(loc.montant_location)} DHS</td>
                  <td className="py-2 pr-3 text-right font-semibold text-emerald-600">{fmt(loc.montant_paye)} DHS</td>
                  <td className="py-2 pr-3 text-right font-bold text-red-600">
                    {Math.max(0, (loc.montant_location||0) - (loc.montant_paye||0)) > 0
                      ? `${fmt(Math.max(0, (loc.montant_location||0) - (loc.montant_paye||0)))} DHS`
                      : <span className="text-emerald-600">✓ Soldé</span>
                    }
                  </td>
                  <td className="py-2 pl-1"><DelBtn onDel={() => onDel(loc)}/></td>
                </tr>
              ))}
            </tbody>
          </table>
          {locations[0]?.note && (
            <div className="mt-2 text-xs text-slate-400 px-1">📝 {locations[0].note}</div>
          )}
        </div>
      )}
    </Section>
  )
}
