import { fmt, fmtD, fmtMoney, fmtDate } from '../../lib/utils'
import Section from '../ui/Section'
import Empty from '../ui/Empty'
import DelBtn from '../ui/DelBtn'
import EditBtn from '../ui/EditBtn'

export default function AchatSection({
  achats,
  showAchat, onToggleForm,
  achatForm, onFormChange,
  showAchatNote, onShowNote,
  savingAchat,
  fournisseurs, grignonFournisseurs, typeBriques,
  addAnotherAchatRef,
  onSave, onCancel,
  onEdit, onDel,
}) {
  return (
    <Section icon="📦" title="Achats (Briques & Grignon)" color="blue"
      action={
        <button onClick={onToggleForm}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-700 transition">
          {showAchat ? 'Fermer' : '+ Ajouter achat'}
        </button>
      }>
      {showAchat && (
        <form onSubmit={onSave} className="bg-white border border-blue-100 rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Date achat</label>
            <input type="date" value={achatForm.date_achat} onChange={e=>onFormChange({...achatForm,date_achat:e.target.value})} className="input w-full text-sm"/></div>
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Type produit</label>
            <select value={achatForm.type_produit} onChange={e=>onFormChange({...achatForm,type_produit:e.target.value,fournisseur_id:'',type_brique_id:''})} className="input w-full text-sm">
              <option value="brique">🧱 Briques</option>
              <option value="grignon">🫒 Grignon</option>
            </select></div>
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Fournisseur</label>
            <select value={achatForm.fournisseur_id} onChange={e=>onFormChange({...achatForm,fournisseur_id:e.target.value})} className="input w-full text-sm" required>
              <option value="">— Sélectionner —</option>
              {(achatForm.type_produit==='brique'?fournisseurs:grignonFournisseurs).map(f=><option key={f.id} value={f.id}>{f.nom}</option>)}
            </select></div>
          {achatForm.type_produit==='brique' && (
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Type brique</label>
              <select value={achatForm.type_brique_id} onChange={e=>onFormChange({...achatForm,type_brique_id:e.target.value})} className="input w-full text-sm">
                <option value="">— Sélectionner —</option>
                {typeBriques.map(t=><option key={t.id} value={t.id}>{t.nom}</option>)}
              </select></div>
          )}
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Quantité</label>
            <input type="number" value={achatForm.qte} onChange={e=>onFormChange({...achatForm,qte:e.target.value})} className="input w-full text-sm" placeholder="6000" required/></div>
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Prix achat / u</label>
            <input type="number" step="0.01" value={achatForm.prix_achat} onChange={e=>onFormChange({...achatForm,prix_achat:e.target.value})} className="input w-full text-sm" placeholder="1.20" required/></div>
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Total achat</label>
            <div className="input w-full text-sm bg-slate-50 font-bold text-slate-700 flex items-center">{fmtMoney((parseFloat(achatForm.qte)||0)*(parseFloat(achatForm.prix_achat)||0))} DHS</div></div>
          <div>
            {showAchatNote
              ? <><label className="text-[10px] font-semibold text-slate-500 block mb-1">Note</label>
                  <input type="text" value={achatForm.note} onChange={e=>onFormChange({...achatForm,note:e.target.value})} className="input w-full text-sm" placeholder="Optionnel..."/></>
              : <button type="button" onClick={onShowNote} className="text-[10px] text-slate-400 hover:text-slate-600">＋ Ajouter une note</button>
            }
          </div>
          {/* Live preview */}
          {achatForm.qte && achatForm.prix_achat && (
            <div className="col-span-2 md:col-span-3 grid grid-cols-3 gap-2 p-3 rounded-xl bg-blue-50 border border-blue-100">
              <div className="text-center">
                <div className="text-[10px] text-blue-400 uppercase">Quantité</div>
                <div className="font-bold text-blue-700">{fmt(parseFloat(achatForm.qte)||0)}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-blue-400 uppercase">Prix/u</div>
                <div className="font-bold text-blue-700">{fmtMoney(parseFloat(achatForm.prix_achat)||0)} DHS</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-blue-400 uppercase font-bold">Total achat</div>
                <div className="font-black text-red-600 text-lg">
                  {fmtMoney(Math.round((parseFloat(achatForm.qte)||0)*(parseFloat(achatForm.prix_achat)||0)*100)/100)} DHS
                </div>
              </div>
            </div>
          )}
          <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-1 flex-wrap">
            <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600">Annuler</button>
            <button type="submit" onMouseDown={()=>{ addAnotherAchatRef.current = true }} disabled={savingAchat}
              className="text-xs bg-blue-500 text-white px-4 py-1.5 rounded-lg font-semibold">
              {savingAchat ? '...' : achatForm.type_produit === 'brique' ? '＋ Ajouter Grignon' : '＋ Ajouter Briques'}
            </button>
            <button type="submit" onMouseDown={()=>{ addAnotherAchatRef.current = false }} disabled={savingAchat}
              className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg font-semibold">
              {savingAchat ? '...' : '✅ Enregistrer'}
            </button>
          </div>
        </form>
      )}
      {achats.length===0 ? <Empty text="Aucun achat enregistré"/> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                <th className="text-left pb-2 pr-3">Date</th>
                <th className="text-left pb-2 pr-3">Produit</th>
                <th className="text-left pb-2 pr-3">Fournisseur</th>
                <th className="text-right pb-2 pr-3">Qté</th>
                <th className="text-right pb-2 pr-3">Prix/u</th>
                <th className="text-right pb-2">Total</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {achats.map(a => (
                <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-3 text-slate-500">{fmtDate(a.date_achat)}</td>
                  <td className="py-2 pr-3 font-semibold">{a.type_brique||a.type_produit}</td>
                  <td className="py-2 pr-3 text-slate-500">{a.fournisseur_nom||'—'}</td>
                  <td className="py-2 pr-3 text-right">{fmt(a.qte)}</td>
                  <td className="py-2 pr-3 text-right">{fmtMoney(a.prix_achat)}</td>
                  <td className="py-2 text-right font-bold text-red-500">{fmtMoney(a.total_achat)} DHS</td>
                  <td className="py-2 pl-1 flex items-center gap-0.5">
                    <EditBtn onEdit={() => onEdit(a)}/>
                    <DelBtn onDel={() => onDel(a)}/>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50">
                <td colSpan={5} className="py-2 pr-3 font-bold text-slate-700 text-right text-[10px] uppercase">Total achats</td>
                <td className="py-2 font-black text-red-600">{fmtMoney(achats.reduce((s,a)=>s+(a.total_achat||0),0))} DHS</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
