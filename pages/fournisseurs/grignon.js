import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmt, fmtD, fmtDate, today, startOfMonth, useIsMobile, openPrintWindow } from '../../lib/utils'
import { useVoyageTransactionEdit } from '../../lib/hooks/useVoyageTransactionEdit'
import EditTransactionModal from '../../components/voyage/EditTransactionModal'
import { resolveAchatByGrignonOpId } from '../../lib/services/voyage/resolveSource'

const ADMIN   = 'abdelhafidbaadi@gmail.com'

export default function FournisseursGrignon() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const admin    = user?.email === ADMIN

  const [fournisseurs, setFournisseurs] = useState([])
  const [selected,     setSelected]     = useState(null)
  const [achats,       setAchats]       = useState([])
  const [paiements,    setPaiements]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [loadingDetail,setLoadingDetail]= useState(false)
  const [search,       setSearch]       = useState('')
  const [filterFrom,   setFilterFrom]   = useState(startOfMonth())
  const [filterTo,     setFilterTo]     = useState(today())
  const [filterType,   setFilterType]   = useState('month')
  const [showAdd,      setShowAdd]      = useState(false)
  const [newNom,       setNewNom]       = useState('')

  useEffect(() => { loadFournisseurs() }, [])

  async function loadFournisseurs() {
    setLoading(true)
    const { data } = await supabase.from('grignon_fournisseurs').select('*').order('solde', { ascending: false })
    setFournisseurs(data || [])
    setLoading(false)
  }

  async function selectFournisseur(f) {
    setSelected(f)
    setLoadingDetail(true)
    // Fournisseur-grignon payments live in two places depending on where they
    // were entered: legacy direct entries from the old /grignon page
    // (grignon_fournisseur_paiements) and payments recorded through the
    // central /paiements page ("Paiements Émis" → paiements.type_compte
    // ='fourn_grignon'), which is the only place new payments should come
    // from now. Both are reconciled into grignon_fournisseurs.solde already
    // (see sql/01_fournisseurs_snapshot_and_reconcile.sql) — merge them here
    // too so the displayed history matches the balance.
    const [{ data: ac }, { data: paLegacy }, { data: paMain }] = await Promise.all([
      supabase.from('grignon_operations')
        .select('*')
        .eq('fournisseur_id', f.id)
        .order('date', { ascending: true }),
      supabase.from('grignon_fournisseur_paiements')
        .select('*')
        .eq('fournisseur_id', f.id)
        .order('date', { ascending: true }),
      supabase.from('paiements')
        .select('*')
        .eq('grignon_fourn_id', f.id)
        .eq('type_compte', 'fourn_grignon')
        .order('date', { ascending: true }),
    ])
    setAchats(ac || [])
    const merged = [
      ...(paLegacy || []).map(p => ({ id: `legacy-${p.id}`, date: p.date, montant: p.montant, mode: p.mode_paiement, note: p.note, cheque_number: null })),
      ...(paMain   || []).map(p => ({ id: `main-${p.id}`,   date: p.date, montant: p.montant, mode: p.mode,           note: p.note, cheque_number: p.cheque_number })),
    ].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    setPaiements(merged)
    setLoadingDetail(false)
  }

  // ── EDIT VOYAGE-SOURCED ACHATS (same modal as the voyage page) ──
  const {
    editRow: voyEditRow, editForm: voyEditForm, setEditForm: setVoyEditForm,
    editSaving: voyEditSaving, editError: voyEditError,
    openEdit: openVoyEdit, closeEdit: closeVoyEdit, save: saveVoyEdit,
  } = useVoyageTransactionEdit({
    onSaved: async () => { await loadFournisseurs(); if (selected) await selectFournisseur(selected) },
  })
  useEffect(() => { if (voyEditError) alert(voyEditError) }, [voyEditError])

  async function editAchat(a) {
    const resolved = await resolveAchatByGrignonOpId(a.id)
    if (!resolved) { alert("Cet achat ne peut pas être modifié depuis cette page — ouvrez le voyage."); return }
    openVoyEdit('achat', resolved)
  }

  async function addFournisseur(e) {
    e.preventDefault()
    if (!newNom.trim()) return
    await supabase.from('grignon_fournisseurs').insert({ nom: newNom.trim(), solde: 0 })
    setNewNom(''); setShowAdd(false)
    loadFournisseurs()
  }

  async function deleteFournisseur(id) {
    if (!admin || !confirm('Supprimer ce fournisseur grignon?')) return
    await supabase.from('grignon_fournisseurs').delete().eq('id', id)
    if (selected?.id === id) setSelected(null)
    loadFournisseurs()
  }

  function getDateRange() {
    if (filterType === 'all') return { from: null, to: null }
    if (filterType === 'month') {
      const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0')
      return { from: `${y}-${m}-01`, to: today() }
    }
    return { from: filterFrom, to: filterTo }
  }
  const { from, to } = getDateRange()

  const filteredAchats = achats.filter(a => {
    const d = a.date
    if (from && d < from) return false
    if (to   && d > to)   return false
    return true
  })
  const filteredPai = paiements.filter(p => {
    if (from && p.date < from) return false
    if (to   && p.date > to)   return false
    return true
  })

  const totalAchats    = filteredAchats.reduce((s,a) => s+(a.total_achat||0), 0)
  const totalPaiements = filteredPai.reduce((s,p)    => s+(p.montant||0), 0)

  function printFournisseur() {
    if (!selected) return
    const rows = filteredAchats.map(a => `<tr>
      <td>${fmtDate(a.date)}</td>
      <td>${a.camion_plaque||'—'}</td>
      <td style="text-align:right">${fmt(a.qte)} kg</td>
      <td style="text-align:right">${fmtD(a.prix_achat)}</td>
      <td style="text-align:right"><b>${fmt(a.total_achat)} DHS</b></td>
      <td>${a.note||'—'}</td>
    </tr>`).join('')
    const paiRows = filteredPai.map(p => `<tr>
      <td>${fmtDate(p.date)}</td>
      <td>${p.mode||'—'}</td>
      <td>${p.cheque_number||'—'}</td>
      <td style="text-align:right;color:#16a34a"><b>− ${fmt(p.montant)} DHS</b></td>
      <td>${p.note||'—'}</td>
    </tr>`).join('')

    openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fournisseur Grignon — ${selected.nom}</title>
    <style>*{-webkit-print-color-adjust:exact !important}
    body{font-family:Arial;padding:28px;font-size:12px;color:#1e293b}
    .hdr{background:#15803d;color:#fff;padding:16px;border-radius:8px;margin-bottom:16px;display:flex;justify-content:space-between}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th{background:#15803d !important;color:#fff !important;padding:7px 10px;text-align:left;font-size:10px;font-weight:700}
    td{padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px}
    tr:nth-child(even) td{background:#f0fdf4 !important}
    tfoot td{background:#f1f5f9 !important;font-weight:800 !important}
    .kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
    .k{border:1px solid #e2e8f0;border-radius:6px;padding:10px;text-align:center}
    .kl{font-size:9px;text-transform:uppercase;color:#6b7280;margin-bottom:3px}
    .kv{font-size:16px;font-weight:900}
    @media print{button{display:none !important}}</style></head><body>
    <div class="hdr">
      <div><div style="font-size:20px;font-weight:900">🌿 ${selected.nom}</div><div style="opacity:0.8;font-size:11px">Fournisseur Grignon — DAR SADIK</div></div>
      <div style="text-align:right;font-size:11px;opacity:0.9">Solde dû: <b style="font-size:16px">${fmt(selected.solde||0)} DHS</b></div>
    </div>
    <div class="kpi">
      <div class="k"><div class="kl">Achats période</div><div class="kv" style="color:#15803d">${fmt(totalAchats)} DHS</div></div>
      <div class="k"><div class="kl">Payé période</div><div class="kv" style="color:#16a34a">${fmt(totalPaiements)} DHS</div></div>
      <div class="k"><div class="kl">Solde total dû</div><div class="kv" style="color:#dc2626">${fmt(selected.solde||0)} DHS</div></div>
    </div>
    <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;color:#15803d;border-bottom:2px solid #15803d;padding-bottom:4px;margin-bottom:8px">Achats Grignon</h3>
    <table><thead><tr><th>Date</th><th>Camion</th><th style="text-align:right">Qté kg</th><th style="text-align:right">Prix/kg</th><th style="text-align:right">Total DHS</th><th>Note</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="6" style="text-align:center;color:#aaa">Aucun achat</td></tr>'}</tbody>
    ${filteredAchats.length>0?`<tfoot><tr><td colspan="2">TOTAL</td><td style="text-align:right">${fmt(filteredAchats.reduce((s,a)=>s+(a.qte||0),0))} kg</td><td></td><td style="text-align:right">${fmt(totalAchats)} DHS</td><td></td></tr></tfoot>`:''}
    </table>
    <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;color:#16a34a;border-bottom:2px solid #16a34a;padding-bottom:4px;margin-bottom:8px">Paiements effectués</h3>
    <table><thead><tr><th>Date</th><th>Mode</th><th>Chèque</th><th style="text-align:right">Montant</th><th>Note</th></tr></thead>
    <tbody>${paiRows||'<tr><td colspan="5" style="text-align:center;color:#aaa">Aucun paiement</td></tr>'}</tbody>
    ${filteredPai.length>0?`<tfoot><tr><td colspan="3">TOTAL payé</td><td style="text-align:right">− ${fmt(totalPaiements)} DHS</td><td></td></tr></tfoot>`:''}
    </table>
    <div style="margin-top:20px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;display:flex;justify-content:space-between">
      <span>DAR SADIK — Selouane, Nador | Dar.sadik@hotmail.com</span>
      <span>Généré le ${new Date().toLocaleDateString('fr-MA')}</span>
    </div></body></html>`)
  }

  const filtered    = fournisseurs.filter(f => !search || f.nom.toLowerCase().includes(search.toLowerCase()))
  const totalDettes = filtered.reduce((s,f) => s+(f.solde||0), 0)

  return (
    <Layout title="Fournisseurs Grignon" subtitle="Achats et paiements fournisseurs grignon">
      <EditTransactionModal
        editRow={voyEditRow} editForm={voyEditForm} setEditForm={setVoyEditForm}
        onSave={saveVoyEdit} onCancel={closeVoyEdit} saving={voyEditSaving}
      />
      <div className={`${isMobile ? '' : 'grid grid-cols-3 gap-6'}`}>

        {/* LEFT */}
        <div className="col-span-1">
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-bold text-gray-900">🌿 Fournisseurs Grignon</div>
                <div className="text-xs text-red-500 mt-0.5">Total dû: <b>{fmt(totalDettes)} DHS</b></div>
              </div>
              {admin && <button onClick={()=>setShowAdd(!showAdd)} className="btn-primary text-xs px-3 py-1.5" style={{background:'#15803d'}}>+ Fournisseur</button>}
            </div>
            {showAdd && (
              <form onSubmit={addFournisseur} className="flex gap-2 mb-3">
                <input className="input flex-1 text-xs" placeholder="Nom du fournisseur grignon" value={newNom} onChange={e=>setNewNom(e.target.value)} required autoFocus />
                <button type="submit" className="btn-primary text-xs px-3" style={{background:'#15803d'}}>✓</button>
                <button type="button" onClick={()=>setShowAdd(false)} className="btn-secondary text-xs px-2">✕</button>
              </form>
            )}
            <input className="input text-sm mb-3" placeholder="🔍 Rechercher..." value={search} onChange={e=>setSearch(e.target.value)} />
            {loading ? <div className="text-center py-6 text-gray-400 text-sm">Chargement...</div> : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {filtered.map(f => (
                  <div key={f.id} onClick={()=>selectFournisseur(f)}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${selected?.id===f.id?'bg-green-50 border border-green-200':'hover:bg-gray-50 border border-transparent'}`}>
                    <div className="font-semibold text-sm text-gray-900">{f.nom}</div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${(f.solde||0)>0?'text-red-600':'text-green-600'}`}>{fmt(f.solde||0)} DHS</span>
                      {admin && <button onClick={e=>{e.stopPropagation();deleteFournisseur(f.id)}} className="text-red-300 hover:text-red-500 text-xs">✕</button>}
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && <div className="text-center py-6 text-gray-400 text-sm">Aucun fournisseur grignon</div>}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="col-span-2">
          {!selected ? (
            <div className="card text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">🌿</div>
              <div className="font-semibold">Sélectionnez un fournisseur</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="card">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-black" style={{background:'#15803d'}}>
                      {selected.nom[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-xl text-gray-900">{selected.nom}</div>
                      <div className="text-xs text-green-700 font-semibold mt-0.5">Fournisseur Grignon</div>
                    </div>
                  </div>
                  <button onClick={printFournisseur} className="btn-primary text-xs px-3 py-1.5" style={{background:'#15803d'}}>🖨️ PDF</button>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="text-center p-3 rounded-xl bg-green-50 border border-green-100">
                    <div className="text-xs text-green-600 font-semibold">Achats période</div>
                    <div className="font-bold text-green-700 text-lg">{fmt(totalAchats)} DHS</div>
                  </div>
                  <div className="text-center p-3 rounded-xl" style={{background:'#f0fdf4',border:'1px solid #bbf7d0'}}>
                    <div className="text-xs text-green-600 font-semibold">Payé période</div>
                    <div className="font-bold text-green-700 text-lg">{fmt(totalPaiements)} DHS</div>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-red-50 border border-red-100">
                    <div className="text-xs text-red-600 font-semibold">Solde dû total</div>
                    <div className="font-bold text-red-700 text-lg">{fmt(selected.solde||0)} DHS</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4 flex-wrap">
                  {['all','month','custom'].map(t => (
                    <button key={t} onClick={()=>setFilterType(t)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold border ${filterType===t?'text-white border-transparent':'bg-white text-gray-600 border-gray-200'}`}
                      style={filterType===t?{background:'#15803d'}:{}}>
                      {t==='all'?'Tout':t==='month'?'Ce mois':'Personnalisé'}
                    </button>
                  ))}
                  {filterType === 'custom' && (
                    <div className="flex gap-2 items-center">
                      <input type="date" className="input text-xs" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} />
                      <span className="text-gray-400 text-xs">→</span>
                      <input type="date" className="input text-xs" value={filterTo} onChange={e=>setFilterTo(e.target.value)} />
                    </div>
                  )}
                </div>
              </div>

              {loadingDetail ? <div className="card text-center py-8 text-gray-400">Chargement...</div> : (
                <>
                  <div className="card">
                    <h3 className="font-bold text-gray-900 mb-3">🌿 Achats Grignon ({filteredAchats.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead><tr>
                          <th className="th">Date</th>
                          <th className="th">Camion</th>
                          <th className="th text-right">Qté kg</th>
                          <th className="th text-right">Prix/kg</th>
                          <th className="th text-right">Total DHS</th>
                          <th className="th">Note</th>
                          <th className="th"></th>
                        </tr></thead>
                        <tbody>
                          {filteredAchats.map(a => (
                            <tr key={a.id} className="hover:bg-green-50">
                              <td className="td text-gray-500">{fmtDate(a.date)}</td>
                              <td className="td text-xs text-gray-500">{a.camion_plaque||'—'}</td>
                              <td className="td text-right font-semibold">{fmt(a.qte)} kg</td>
                              <td className="td text-right text-gray-500">{fmtD(a.prix_achat)}</td>
                              <td className="td text-right font-bold text-green-700">{fmt(a.total_achat)} DHS</td>
                              <td className="td text-gray-400 text-xs">{a.note||'—'}</td>
                              <td className="td whitespace-nowrap">
                                {a.voyage_id && (
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => editAchat(a)} title="Modifier (voyage)"
                                      className="btn-secondary" style={{fontSize:10,padding:'2px 5px'}}>✎</button>
                                    <Link href={`/voyages/${a.voyage_id}`} title="Ouvrir le voyage"
                                      className="btn-secondary" style={{fontSize:10,padding:'2px 5px',textDecoration:'none'}}>↗</Link>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                          {filteredAchats.length === 0 && <tr><td colSpan={7} className="td text-center text-gray-400 py-6">Aucun achat</td></tr>}
                        </tbody>
                        {filteredAchats.length > 0 && (
                          <tfoot><tr>
                            <td className="tfoot-td" colSpan={2}>TOTAL ({filteredAchats.length})</td>
                            <td className="tfoot-td text-right">{fmt(filteredAchats.reduce((s,a)=>s+(a.qte||0),0))} kg</td>
                            <td className="tfoot-td"></td>
                            <td className="tfoot-td text-right text-green-700">{fmt(totalAchats)} DHS</td>
                            <td className="tfoot-td"></td>
                            <td className="tfoot-td"></td>
                          </tr></tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  <div className="card">
                    <h3 className="font-bold text-gray-900 mb-3">💸 Paiements effectués ({filteredPai.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead><tr>
                          <th className="th">Date</th>
                          <th className="th">Mode</th>
                          <th className="th">Chèque</th>
                          <th className="th text-right">Montant DHS</th>
                          <th className="th">Note</th>
                        </tr></thead>
                        <tbody>
                          {filteredPai.map(p => (
                            <tr key={p.id} className="hover:bg-green-50">
                              <td className="td text-gray-500">{fmtDate(p.date)}</td>
                              <td className="td text-xs">{p.mode||'—'}</td>
                              <td className="td text-xs font-mono text-blue-600">{p.cheque_number||'—'}</td>
                              <td className="td text-right font-bold text-green-600">− {fmt(p.montant)} DHS</td>
                              <td className="td text-gray-400 text-xs">{p.note||'—'}</td>
                            </tr>
                          ))}
                          {filteredPai.length === 0 && <tr><td colSpan={5} className="td text-center text-gray-400 py-6">Aucun paiement</td></tr>}
                        </tbody>
                        {filteredPai.length > 0 && (
                          <tfoot><tr>
                            <td className="tfoot-td" colSpan={3}>TOTAL payé</td>
                            <td className="tfoot-td text-right text-green-700">− {fmt(totalPaiements)} DHS</td>
                            <td className="tfoot-td"></td>
                          </tr></tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
