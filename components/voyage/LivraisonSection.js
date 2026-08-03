import { Fragment } from 'react'
import { fmt, fmtD, fmtMoney, fmtDate } from '../../lib/utils'
import Section from '../ui/Section'
import Empty from '../ui/Empty'
import DelBtn from '../ui/DelBtn'
import EditBtn from '../ui/EditBtn'
import FraisEditor from './FraisEditor'

export default function LivraisonSection({
  livraisons,
  showLiv, onToggleForm,
  livForm, onFormChange,
  showLivNote, onShowNote,
  savingLiv,
  clients, grignonClients, typeBriques,
  addAnotherLivRef,
  onSave, onCancel,
  onEdit, onDel,
}) {
  const totalRevenuLivs = livraisons.reduce((s, l) => s + (l.total_vente||0) + (l.frais_total||0), 0)
  const livFrais = livForm.frais || []

  const productTotal = Math.max(0, (parseFloat(livForm.qte)||0)*(parseFloat(livForm.prix_vente)||0)-(parseFloat(livForm.remise)||0))
  const fraisTotal   = livFrais.reduce((s, f) => {
    const amt = parseFloat(f.montant) || 0
    return s + (f.kind === 'deduction' ? -amt : amt)
  }, 0)
  const combinedTotal = productTotal + fraisTotal
  const productAchat  = (parseFloat(livForm.qte)||0)*(parseFloat(livForm.prix_achat)||0)
  const marge         = combinedTotal - productAchat

  return (
    <Section icon="🚚" title="Livraisons clients" color="green"
      action={
        <button onClick={onToggleForm}
          className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-emerald-700 transition">
          {showLiv ? 'Fermer' : '+ Ajouter livraison'}
        </button>
      }>
      {showLiv && (
        <form onSubmit={onSave} className="bg-white border border-emerald-100 rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Date livraison</label>
            <input type="date" value={livForm.date_livraison} onChange={e=>onFormChange({...livForm,date_livraison:e.target.value})} className="input w-full text-sm"/></div>
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Type produit</label>
            <select value={livForm.type_produit} onChange={e=>onFormChange({...livForm,type_produit:e.target.value,type_brique_id:''})} className="input w-full text-sm">
              <option value="brique">🧱 Briques</option>
              <option value="grignon">🫒 Grignon</option>
            </select></div>
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Client *</label>
            <select value={livForm.client_id} onChange={e=>onFormChange({...livForm,client_id:e.target.value})} className="input w-full text-sm" required>
              <option value="">— Sélectionner —</option>
              {(livForm.type_produit==='grignon'?grignonClients:clients).map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
            </select></div>
          {livForm.type_produit==='brique' && (
            <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Type brique</label>
              <select value={livForm.type_brique_id} onChange={e=>onFormChange({...livForm,type_brique_id:e.target.value})} className="input w-full text-sm">
                <option value="">— Sélectionner —</option>
                {typeBriques.map(t=><option key={t.id} value={t.id}>{t.nom}</option>)}
              </select></div>
          )}
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Quantité livrée *</label>
            <input type="number" value={livForm.qte} onChange={e=>onFormChange({...livForm,qte:e.target.value})} className="input w-full text-sm" placeholder="3500" required/></div>
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Prix vente / u *</label>
            <input type="number" step="0.01" value={livForm.prix_vente} onChange={e=>onFormChange({...livForm,prix_vente:e.target.value})} className="input w-full text-sm" placeholder="2.10" required/></div>
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Prix achat / u</label>
            <input type="number" step="0.01" value={livForm.prix_achat} onChange={e=>onFormChange({...livForm,prix_achat:e.target.value})} className="input w-full text-sm" placeholder="1.20"/></div>
          <div><label className="text-[10px] font-semibold text-slate-500 block mb-1">Remise (DHS)</label>
            <input type="number" step="0.01" value={livForm.remise} onChange={e=>onFormChange({...livForm,remise:e.target.value})} className="input w-full text-sm" placeholder="0"/></div>

          {/* Note */}
          <div>
            {showLivNote
              ? <><label className="text-[10px] font-semibold text-slate-500 block mb-1">Note livraison</label>
                  <input type="text" value={livForm.note} onChange={e=>onFormChange({...livForm,note:e.target.value})} className="input w-full text-sm" placeholder="ex: SAIDIA, Chantier A…"/></>
              : <button type="button" onClick={onShowNote} className="text-[10px] text-slate-400 hover:text-slate-600 mt-5 block">＋ Ajouter une note</button>
            }
          </div>

          {/* Frais supplémentaires + Déductions client */}
          <div className="col-span-2 md:col-span-3">
            <FraisEditor items={livFrais} onChange={arr => onFormChange({ ...livForm, frais: arr })} />
          </div>

          {/* Live preview */}
          {livForm.qte && livForm.prix_vente && (
            <div className="col-span-2 md:col-span-3 grid grid-cols-4 gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <div className="text-center">
                <div className="text-[10px] text-emerald-400 uppercase">Qté</div>
                <div className="font-bold text-emerald-700">{fmt(parseFloat(livForm.qte)||0)}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-emerald-400 uppercase">Produits</div>
                <div className="font-bold text-emerald-700">{fmtMoney(productTotal)} DHS</div>
                {fraisTotal !== 0 && (
                  <div className={`text-[9px] ${fraisTotal > 0 ? 'text-amber-500' : 'text-rose-500'}`}>
                    {fraisTotal > 0 ? '+' : '−'} {fmtMoney(Math.abs(fraisTotal))} {fraisTotal > 0 ? 'frais' : 'déduction'}
                  </div>
                )}
              </div>
              <div className="text-center">
                <div className="text-[10px] text-emerald-400 uppercase">Total livraison</div>
                <div className="font-bold text-emerald-700">{fmtMoney(combinedTotal)} DHS</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-purple-400 uppercase">Marge%</div>
                <div className="font-bold text-purple-700">
                  {combinedTotal > 0 ? Math.round((combinedTotal-productAchat)/combinedTotal*100) : 0}%
                </div>
              </div>
            </div>
          )}
          <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-1 flex-wrap">
            <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600">Annuler</button>
            <button type="submit" onMouseDown={()=>{ addAnotherLivRef.current = true }} disabled={savingLiv}
              className="text-xs bg-emerald-500 text-white px-4 py-1.5 rounded-lg font-semibold">
              {savingLiv ? '...' : '＋ Ajouter une autre'}
            </button>
            <button type="submit" onMouseDown={()=>{ addAnotherLivRef.current = false }} disabled={savingLiv}
              className="text-xs bg-emerald-600 text-white px-4 py-1.5 rounded-lg font-semibold">
              {savingLiv ? '...' : '✅ Enregistrer'}
            </button>
          </div>
        </form>
      )}
      {livraisons.length===0 ? <Empty text="Aucune livraison enregistrée"/> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                <th className="text-left pb-2 pr-3">Date</th>
                <th className="text-left pb-2 pr-3">Client</th>
                <th className="text-left pb-2 pr-3">Produit</th>
                <th className="text-right pb-2 pr-3">Qté</th>
                <th className="text-right pb-2 pr-3">P.Vente</th>
                <th className="text-right pb-2 pr-3">Total livraison</th>
                <th className="text-left pb-2 pr-3">Note</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {livraisons.map(l => {
                const deliveryTotal = (l.total_vente||0) + (l.frais_total||0)
                const livFraisRows  = l.frais || []
                const chargesSum    = livFraisRows.filter(f => (f.kind||'charge')==='charge').reduce((s,f)=>s+(f.montant||0),0)
                const deductionsSum = livFraisRows.filter(f => f.kind==='deduction').reduce((s,f)=>s+(f.montant||0),0)
                return (
                  <Fragment key={l.id}>
                    <tr className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pr-3 text-slate-500">{fmtDate(l.date_livraison)}</td>
                      <td className="py-2 pr-3 font-semibold">{l.client_nom}</td>
                      <td className="py-2 pr-3 text-slate-500">{l.type_brique||l.type_produit}</td>
                      <td className="py-2 pr-3 text-right">{fmt(l.qte)}</td>
                      <td className="py-2 pr-3 text-right">
                        {fmtMoney(l.prix_vente)}
                        {l.remise>0 && <span className="ml-1 text-orange-500 text-[9px]">-{fmtMoney(l.remise)}</span>}
                      </td>
                      <td className="py-2 pr-3 text-right font-bold text-emerald-600">
                        {fmtMoney(deliveryTotal)} DHS
                        {(chargesSum > 0 || deductionsSum > 0) && (
                          <div className="text-[9px] text-slate-400 font-normal">
                            {chargesSum > 0 && <>dont +{fmtMoney(chargesSum)} frais</>}
                            {chargesSum > 0 && deductionsSum > 0 && ' · '}
                            {deductionsSum > 0 && <>−{fmtMoney(deductionsSum)} déd.</>}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-slate-400 italic max-w-[120px] truncate">{l.note || ''}</td>
                      <td className="py-2 pl-1 flex items-center gap-0.5">
                        <EditBtn onEdit={() => onEdit(l)}/>
                        <DelBtn onDel={() => onDel(l)}/>
                      </td>
                    </tr>
                    {livFraisRows.map((f, fi) => {
                      const isDeduction = f.kind === 'deduction'
                      return (
                        <tr key={`${l.id}-frais-${fi}`} className={isDeduction ? 'bg-rose-50/60' : 'bg-amber-50/60'}>
                          <td colSpan={4}></td>
                          <td className={`text-right py-1 pr-3 text-[10px] italic ${isDeduction ? 'text-rose-600' : 'text-amber-600'}`}>
                            ↳ {f.label}
                          </td>
                          <td className={`py-1 pr-3 text-right text-[10px] font-semibold ${isDeduction ? 'text-rose-600' : 'text-amber-600'}`}>
                            {isDeduction ? '−' : '+'} {fmtMoney(f.montant)} DHS
                          </td>
                          <td className="py-1 pr-3 text-[10px] text-slate-400">{f.note || ''}</td>
                          <td></td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
              <tr className="bg-slate-50 font-bold">
                <td colSpan={4} className="py-2 pr-3 text-right text-[10px] uppercase text-slate-700">Total livraisons</td>
                <td></td>
                <td className="py-2 pr-3 text-right text-emerald-600">{fmtMoney(totalRevenuLivs)} DHS</td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
