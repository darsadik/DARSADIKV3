import { fmt, fmtMoney, fmtDate } from '../../lib/utils'
import Section from '../ui/Section'
import Empty from '../ui/Empty'
import DelBtn from '../ui/DelBtn'
import EditBtn from '../ui/EditBtn'

export default function RetourSection({
  retours,
  showRetour, onToggleForm,
  retForm, onFormChange,
  savingRetour,
  clients,
  onSave, onCancel,
  onEdit, onDel,
}) {
  return (
    <Section icon="↩️" title="Retour transport" color="purple"
      action={
        <button onClick={onToggleForm}
          className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-purple-700 transition">
          {showRetour ? 'Fermer' : '+ Ajouter retour'}
        </button>
      }>
      {showRetour && (
        <form onSubmit={onSave} className="bg-white border border-purple-100 rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Date</label>
            <input type="date" value={retForm.date_retour} onChange={e => onFormChange({...retForm, date_retour: e.target.value})} className="input w-full text-sm"/></div>
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Client retour *</label>
            <input list="ret-clients" type="text" value={retForm.client_nom} onChange={e => onFormChange({...retForm, client_nom: e.target.value})} className="input w-full text-sm" placeholder="Nom du client" required/>
            <datalist id="ret-clients">{clients.map(c => <option key={c.id} value={c.nom}/>)}</datalist>
          </div>
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Destination</label>
            <input type="text" value={retForm.destination} onChange={e => onFormChange({...retForm, destination: e.target.value})} className="input w-full text-sm" placeholder="Ex: Berkane..."/></div>
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant total *</label>
            <input type="number" value={retForm.montant} onChange={e => onFormChange({...retForm, montant: e.target.value})} className="input w-full text-sm" placeholder="1500" required/></div>
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant payé</label>
            <input type="number" value={retForm.montant_paye} onChange={e => onFormChange({...retForm, montant_paye: e.target.value})} className="input w-full text-sm" placeholder="0"/></div>
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Restant</label>
            <div className="input w-full text-sm bg-slate-50 font-bold text-orange-600 flex items-center">
              {fmtMoney(Math.max(0, (parseFloat(retForm.montant)||0) - (parseFloat(retForm.montant_paye)||0)))} DHS
            </div></div>
          <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600">Annuler</button>
            <button type="submit" disabled={savingRetour} className="text-xs bg-purple-600 text-white px-4 py-1.5 rounded-lg font-semibold">{savingRetour ? '...' : '✅ Enregistrer'}</button>
          </div>
        </form>
      )}
      {retours.length === 0 ? <Empty text="Aucun retour transport sur ce voyage"/> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                <th className="text-left pb-2 pr-3">Date</th>
                <th className="text-left pb-2 pr-3">Client</th>
                <th className="text-left pb-2 pr-3">Destination</th>
                <th className="text-right pb-2 pr-3">Montant</th>
                <th className="text-right pb-2 pr-3">Payé</th>
                <th className="text-right pb-2">Reste</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {retours.map(r => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-3 text-slate-500">{fmtDate(r.date_retour)}</td>
                  <td className="py-2 pr-3 font-semibold">{r.client_nom}</td>
                  <td className="py-2 pr-3 text-slate-500">{r.destination || '—'}</td>
                  <td className="py-2 pr-3 text-right font-bold text-purple-600">{fmtMoney(r.montant)} DHS</td>
                  <td className="py-2 pr-3 text-right text-emerald-600">{fmtMoney(r.montant_paye)} DHS</td>
                  <td className="py-2 text-right text-orange-500 font-semibold">{r.restant > 0 ? fmtMoney(r.restant) + ' DHS ⚠' : '✓'}</td>
                  <td className="py-2 pl-1 flex items-center gap-0.5">
                    <EditBtn onEdit={() => onEdit(r)}/>
                    <DelBtn onDel={() => onDel(r)}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
