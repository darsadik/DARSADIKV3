import { fmtMoney } from '../../lib/utils'
import FraisEditor from './FraisEditor'

// Shared editor for achat / livraison / retour / charge rows sourced from a
// voyage. Used inside the voyage detail page AND from any other page that
// displays voyage-derived data (client/fournisseur statements, retours,
// charges, dashboard…) — always the same modal, same fields, same save path.
export default function EditTransactionModal({ editRow, editForm, setEditForm, onSave, onCancel, saving }) {
  if (!editRow) return null
  const ef = editForm
  const setEf = v => setEditForm(prev => ({ ...prev, ...v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target===e.currentTarget) onCancel() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 text-sm">
            {editRow.type==='achat'  && '✏️ Modifier Achat'}
            {editRow.type==='liv'    && '✏️ Modifier Livraison'}
            {editRow.type==='retour' && '✏️ Modifier Retour'}
            {editRow.type==='charge' && '✏️ Modifier Charge'}
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {editRow.type==='achat' && <>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Date</label>
              <input type="date" value={ef.date_achat||''} onChange={e=>setEf({date_achat:e.target.value})} className="input w-full text-sm"/></div>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Quantité</label>
              <input type="number" value={ef.qte||''} onChange={e=>setEf({qte:e.target.value})} className="input w-full text-sm"/></div>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Prix achat / u</label>
              <input type="number" step="0.01" value={ef.prix_achat||''} onChange={e=>setEf({prix_achat:e.target.value})} className="input w-full text-sm"/></div>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Total achat</label>
              <div className="input w-full text-sm bg-slate-50 font-bold text-red-600">{fmtMoney((parseFloat(ef.qte)||0)*(parseFloat(ef.prix_achat)||0))} DHS</div></div>
          </>}
          {editRow.type==='liv' && <>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Date livraison</label>
              <input type="date" value={ef.date_livraison||''} onChange={e=>setEf({date_livraison:e.target.value})} className="input w-full text-sm"/></div>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Quantité</label>
              <input type="number" value={ef.qte||''} onChange={e=>setEf({qte:e.target.value})} className="input w-full text-sm"/></div>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Prix vente / u</label>
              <input type="number" step="0.01" value={ef.prix_vente||''} onChange={e=>setEf({prix_vente:e.target.value})} className="input w-full text-sm"/></div>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Prix achat / u</label>
              <input type="number" step="0.01" value={ef.prix_achat||''} onChange={e=>setEf({prix_achat:e.target.value})} className="input w-full text-sm"/></div>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Remise (DHS)</label>
              <input type="number" step="0.01" value={ef.remise||''} onChange={e=>setEf({remise:e.target.value})} className="input w-full text-sm"/></div>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Total produits</label>
              <div className="input w-full text-sm bg-slate-50 font-bold text-emerald-600">{fmtMoney(Math.max(0,(parseFloat(ef.qte)||0)*(parseFloat(ef.prix_vente)||0)-(parseFloat(ef.remise)||0)))} DHS</div></div>
            <div className="col-span-2"><label className="text-[10px] font-semibold text-slate-500 block mb-1">Note livraison</label>
              <input type="text" value={ef.note||''} onChange={e=>setEf({note:e.target.value})} className="input w-full text-sm" placeholder="ex: SAIDIA, Chantier A…"/></div>
            <div className="col-span-2">
              <FraisEditor items={ef.frais||[]} onChange={arr=>setEf({frais:arr})} />
              {(ef.frais||[]).length > 0 && (
                <div className="text-[10px] text-emerald-700 font-bold mt-2 border-t border-slate-100 pt-2">
                  Total livraison : {fmtMoney(
                    Math.max(0,(parseFloat(ef.qte)||0)*(parseFloat(ef.prix_vente)||0)-(parseFloat(ef.remise)||0))
                    + (ef.frais||[]).reduce((s,f)=>{const amt=parseFloat(f.montant)||0; return s + (f.kind==='deduction' ? -amt : amt)},0)
                  )} DHS
                </div>
              )}
            </div>
          </>}
          {editRow.type==='retour' && <>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Date</label>
              <input type="date" value={ef.date_retour||''} onChange={e=>setEf({date_retour:e.target.value})} className="input w-full text-sm"/></div>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Client</label>
              <input type="text" value={ef.client_nom||''} onChange={e=>setEf({client_nom:e.target.value})} className="input w-full text-sm"/></div>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Destination</label>
              <input type="text" value={ef.destination||''} onChange={e=>setEf({destination:e.target.value})} className="input w-full text-sm"/></div>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant total</label>
              <input type="number" value={ef.montant||''} onChange={e=>setEf({montant:e.target.value})} className="input w-full text-sm"/></div>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant payé</label>
              <input type="number" value={ef.montant_paye||''} onChange={e=>setEf({montant_paye:e.target.value})} className="input w-full text-sm"/></div>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Restant</label>
              <div className="input w-full text-sm bg-slate-50 font-bold text-orange-600">{fmtMoney(Math.max(0,(parseFloat(ef.montant)||0)-(parseFloat(ef.montant_paye)||0)))} DHS</div></div>
          </>}
          {editRow.type==='charge' && <>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Date</label>
              <input type="date" value={ef.date_charge||''} onChange={e=>setEf({date_charge:e.target.value})} className="input w-full text-sm"/></div>
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Montant (DHS)</label>
              <input type="number" value={ef.montant||''} onChange={e=>setEf({montant:e.target.value})} className="input w-full text-sm"/></div>
          </>}
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-slate-100">
          <button onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">
            Annuler
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 transition disabled:opacity-60">
            {saving ? '⌛ Sauvegarde...' : '✅ Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
