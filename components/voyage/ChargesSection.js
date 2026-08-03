import { fmtMoney, fmtDate } from '../../lib/utils'
import { CHARGE_CATS, COMMON_CHARGE_KEYS } from '../../lib/voyage-constants'
import Section from '../ui/Section'
import Empty from '../ui/Empty'
import DelBtn from '../ui/DelBtn'
import EditBtn from '../ui/EditBtn'

export default function ChargesSection({
  charges,
  showCharge, onToggleForm,
  chgDate, onDateChange,
  chgGrid, onGridChange,
  chgFactureMap, onFactureMapChange,
  showAllCharges, onShowAll,
  savingChg,
  clients,
  onSave, onCancel,
  onEdit, onDel,
}) {
  const totalChargesFixed  = charges.filter(c => !c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)
  const totalChargesClient = charges.filter(c =>  c.facture_client).reduce((s, c) => s + (c.montant || 0), 0)

  return (
    <Section icon="💸" title="Charges du voyage" color="red"
      action={
        <button onClick={onToggleForm}
          className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-red-600 transition">
          {showCharge ? 'Fermer' : '+ Saisir charges'}
        </button>
      }>
      {showCharge && (
        <form onSubmit={onSave} className="bg-white border border-red-100 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Date</label>
            <input type="date" value={chgDate} onChange={e => onDateChange(e.target.value)} className="input text-sm"/>
            <span className="text-[10px] text-slate-400 ml-2">Saisissez les montants présents. Laissez vide si absent.</span>
          </div>
          <div className="space-y-2">
            {CHARGE_CATS.filter(cat => showAllCharges || COMMON_CHARGE_KEYS.has(cat.key) || parseFloat(chgGrid[cat.key]) > 0).map(cat => (
              <div key={cat.key} className="grid grid-cols-12 gap-2 items-center py-2 border-b border-slate-50">
                <div className="col-span-3 flex items-center gap-2">
                  <span className="text-base">{cat.icon}</span>
                  <span className="text-xs font-semibold text-slate-700">{cat.label}</span>
                </div>
                <div className="col-span-3">
                  <input type="number" value={chgGrid[cat.key]}
                    onChange={e => onGridChange(g => ({ ...g, [cat.key]: e.target.value }))}
                    className={`input w-full text-sm text-right ${parseFloat(chgGrid[cat.key]) > 0 ? 'border-red-300 bg-red-50 font-bold' : ''}`}
                    placeholder="0"/>
                </div>
                <div className="col-span-1 text-[10px] text-slate-400 font-semibold">DHS</div>
                <div className="col-span-5 flex items-center gap-2">
                  {parseFloat(chgGrid[cat.key]) > 0 && (<>
                    <input type="checkbox" id={`fc_${cat.key}`} checked={!!chgFactureMap[cat.key]}
                      onChange={e => onFactureMapChange(m => ({ ...m, [cat.key]: e.target.checked ? '' : undefined }))}
                      className="rounded flex-shrink-0"/>
                    <label htmlFor={`fc_${cat.key}`} className="text-[10px] text-slate-500 cursor-pointer whitespace-nowrap">Facturé client</label>
                    {chgFactureMap[cat.key] !== undefined && (
                      <select value={chgFactureMap[cat.key] || ''} onChange={e => onFactureMapChange(m => ({ ...m, [cat.key]: e.target.value }))} className="input text-xs flex-1">
                        <option value="">— Client —</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                      </select>
                    )}
                  </>)}
                </div>
              </div>
            ))}
          </div>
          {!showAllCharges && (
            <button type="button" onClick={() => onShowAll(true)}
              className="text-xs text-slate-400 hover:text-slate-600 mt-3 font-semibold">
              ＋ Voir toutes les charges ({CHARGE_CATS.filter(c => !COMMON_CHARGE_KEYS.has(c.key)).length} autres catégories)
            </button>
          )}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
            <div className="text-sm font-bold text-slate-700">
              Total: <span className="text-red-600">{fmtMoney(CHARGE_CATS.reduce((s, c) => s + (parseFloat(chgGrid[c.key]) || 0), 0))} DHS</span>
              <span className="text-[10px] text-slate-400 ml-2">({CHARGE_CATS.filter(c => parseFloat(chgGrid[c.key]) > 0).length} catégorie(s))</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onCancel}
                className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600">Annuler</button>
              <button type="submit" disabled={savingChg}
                className="text-xs bg-red-500 text-white px-5 py-1.5 rounded-lg font-bold hover:bg-red-600 transition">
                {savingChg ? '...' : '✅ Enregistrer les charges'}
              </button>
            </div>
          </div>
        </form>
      )}
      {charges.length === 0 ? <Empty text="Aucune charge enregistrée"/> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                <th className="text-left pb-2 pr-3">Date</th>
                <th className="text-left pb-2 pr-3">Catégorie</th>
                <th className="text-left pb-2 pr-3">Description</th>
                <th className="text-right pb-2 pr-3">Montant</th>
                <th className="text-left pb-2">Client?</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {charges.map(c => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-3 text-slate-500">{fmtDate(c.date_charge)}</td>
                  <td className="py-2 pr-3 font-semibold">{(() => { const cat = CHARGE_CATS.find(x => x.key === c.categorie); return cat ? `${cat.icon} ${cat.label}` : c.categorie })()}</td>
                  <td className="py-2 pr-3 text-slate-500">{c.description || '—'}</td>
                  <td className="py-2 pr-3 text-right font-bold text-red-600">{fmtMoney(c.montant)} DHS</td>
                  <td className="py-2 text-xs">
                    {c.facture_client
                      ? <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded font-semibold">📋 {c.client_nom || 'Client'}</span>
                      : <span className="text-slate-300">Entreprise</span>}
                  </td>
                  <td className="py-2 pl-1 flex items-center gap-0.5">
                    <EditBtn onEdit={() => onEdit(c)}/>
                    <DelBtn onDel={() => onDel(c)}/>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold">
                <td colSpan={3} className="py-2 pr-3 text-right text-[10px] uppercase text-slate-700">Total charges fixes</td>
                <td className="py-2 pr-3 text-right text-red-600">{fmtMoney(totalChargesFixed)} DHS</td>
                <td className="py-2 text-xs text-slate-400">répartition par quantité</td>
                <td></td>
              </tr>
              {totalChargesClient > 0 && (
                <tr className="bg-emerald-50">
                  <td colSpan={3} className="py-2 pr-3 text-right text-[10px] uppercase text-slate-700">Charges facturées clients</td>
                  <td className="py-2 pr-3 text-right text-emerald-600 font-bold">{fmtMoney(totalChargesClient)} DHS</td>
                  <td colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
