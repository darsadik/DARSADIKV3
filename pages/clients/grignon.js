import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmt, fmtD, fmtDate, today, startOfMonth, useIsMobile, openPrintWindow } from '../../lib/utils'
import { ADMIN_EMAIL } from '../../lib/config'
import { useVoyageTransactionEdit } from '../../lib/hooks/useVoyageTransactionEdit'
import EditTransactionModal from '../../components/voyage/EditTransactionModal'
import { resolveLivraisonByGrignonOpId, resolveLivraisonGrignonHeuristic } from '../../lib/services/voyage/resolveSource'

const ADMIN = ADMIN_EMAIL

export default function ClientsGrignon() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const admin = user?.email === ADMIN

  const [clients,      setClients]      = useState([])
  const [selected,     setSelected]     = useState(null)
  const [operations,   setOperations]   = useState([])
  const [paiements,    setPaiements]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [loadingDetail,setLoadingDetail]= useState(false)
  const [search,       setSearch]       = useState('')
  const [filterFrom,   setFilterFrom]   = useState(startOfMonth())
  const [filterTo,     setFilterTo]     = useState(today())
  const [filterType,   setFilterType]   = useState('month')
  const [showAddClient,setShowAddClient]= useState(false)
  const [newClientNom, setNewClientNom] = useState('')

  useEffect(() => { loadClients() }, [])

  const gMap = n => n?.toUpperCase() === 'NOVA BRIQUE' ? 'NOVA ET DURA' : n

  async function loadClients() {
    setLoading(true)
    const { data } = await supabase.from('grignon_clients').select('*').order('solde', { ascending: false })
    setClients((data || []).map(c => ({...c, nom: gMap(c.nom)})))
    setLoading(false)
  }

  async function selectClient(cl) {
    setSelected(cl)
    setLoadingDetail(true)
    const [{ data: ops }, { data: pa }] = await Promise.all([
      supabase.from('grignon_operations').select('*').eq('client_id', cl.id).order('date', { ascending: true }),
      supabase.from('grignon_paiements').select('*').eq('client_id', cl.id).order('date', { ascending: true }),
    ])
    setOperations((ops || []).map(op => ({...op, client_nom: gMap(op.client_nom)})))
    setPaiements(pa || [])
    setLoadingDetail(false)
  }

  // ── EDIT VOYAGE-SOURCED OPERATIONS (same modal as the voyage page) ──
  const {
    editRow: voyEditRow, editForm: voyEditForm, setEditForm: setVoyEditForm,
    editSaving: voyEditSaving, editError: voyEditError,
    openEdit: openVoyEdit, closeEdit: closeVoyEdit, save: saveVoyEdit,
  } = useVoyageTransactionEdit({
    onSaved: async () => { await loadClients(); if (selected) await selectClient(selected) },
  })
  useEffect(() => { if (voyEditError) alert(voyEditError) }, [voyEditError])

  async function editOperation(op) {
    // Exact link first (sql/14_grignon_livraison_link.sql); the heuristic
    // match is only for rows saved before that column existed.
    const resolved = await resolveLivraisonByGrignonOpId(op.id)
      || await resolveLivraisonGrignonHeuristic({ voyage_id: op.voyage_id, client_id: op.client_id, date: op.date })
    if (!resolved) { alert("Cette opération ne peut pas être modifiée depuis cette page — ouvrez le voyage."); return }
    openVoyEdit('liv', resolved)
  }

  async function addClient(e) {
    e.preventDefault()
    if (!newClientNom.trim()) return
    await supabase.from('grignon_clients').insert({ nom: newClientNom.trim(), solde: 0 })
    setNewClientNom(''); setShowAddClient(false)
    loadClients()
  }

  async function deleteClient(id) {
    if (!admin || !confirm('Supprimer ce client grignon?')) return
    await supabase.from('grignon_clients').delete().eq('id', id)
    if (selected?.id === id) setSelected(null)
    loadClients()
  }

  // ── FILTERS ──
  function getDateRange() {
    if (filterType === 'all') return { from: null, to: null }
    if (filterType === 'month') {
      const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0')
      return { from: `${y}-${m}-01`, to: today() }
    }
    return { from: filterFrom, to: filterTo }
  }
  const { from, to } = getDateRange()

  const filteredOps = operations.filter(op => {
    const d = op.date
    if (from && d < from) return false
    if (to   && d > to)   return false
    return true
  })
  const filteredPai = paiements.filter(p => {
    const d = p.date
    if (from && d < from) return false
    if (to   && d > to)   return false
    return true
  })

  const totalVentes    = filteredOps.reduce((s,op) => s+(op.total_vente||0), 0)
  const totalPaiements = filteredPai.reduce((s,p)  => s+(p.montant||0), 0)

  function printClient() {
    if (!selected) return
    const rows = filteredOps.map(op => `<tr>
      <td>${op.camion_plaque||'—'}</td>
      <td style="text-align:right">${fmt(op.qte)} kg</td>
      <td style="text-align:right">${fmtD(op.prix_vente)}</td>
      <td style="text-align:right"><b>${fmt(op.total_vente)} DHS</b></td>
      <td>${op.note||'—'}</td>
    </tr>`).join('')
    const paiRows = filteredPai.map(p => `<tr>
      <td>${fmtDate(p.date)}</td>
      <td>${p.mode||'—'}</td>
      <td style="text-align:right;color:#16a34a"><b>− ${fmt(p.montant)} DHS</b></td>
      <td>${p.note||'—'}</td>
    </tr>`).join('')

    openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Client Grignon — ${selected.nom}</title>
    <style>*{-webkit-print-color-adjust:exact !important}
    @page{margin:0}
    body{font-family:Arial;padding:28px;font-size:12px;color:#1e293b}
    .hdr{background:#92400e;color:#fff;padding:16px;border-radius:8px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th{background:#92400e !important;color:#fff !important;padding:7px 10px;text-align:left;font-size:10px;font-weight:700}
    td{padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px}
    tr:nth-child(even) td{background:#fffbeb !important}
    tfoot td{background:#f1f5f9 !important;font-weight:800 !important}
    @media print{button{display:none !important}}</style></head><body>
    <div class="hdr">
      <div><div style="font-size:20px;font-weight:900">🫒 ${selected.nom}</div><div style="opacity:0.8;font-size:11px">${from && to ? fmtDate(from)+' → '+fmtDate(to) : 'Toutes les périodes'}</div></div>
    </div>
    <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;color:#92400e;border-bottom:2px solid #92400e;padding-bottom:4px;margin-bottom:8px">Opérations Grignon</h3>
    <table><thead><tr><th>Camion</th><th style="text-align:right">Qté kg</th><th style="text-align:right">Prix/kg</th><th style="text-align:right">Total DHS</th><th>Note</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="5" style="text-align:center;color:#aaa">Aucune opération</td></tr>'}</tbody>
    ${filteredOps.length>0?`<tfoot><tr><td>TOTAL</td><td style="text-align:right">${fmt(filteredOps.reduce((s,o)=>s+(o.qte||0),0))} kg</td><td></td><td style="text-align:right">${fmt(totalVentes)} DHS</td><td></td></tr></tfoot>`:''}
    </table>
    <div style="margin-top:20px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;display:flex;justify-content:space-between">
      <span></span>
      <span>Généré le ${new Date().toLocaleDateString('fr-MA')}</span>
    </div>
    </body></html>`)
  }

  const filtered = clients.filter(c => !search || c.nom.toLowerCase().includes(search.toLowerCase()))
  const totalCreances = filtered.reduce((s,c) => s+(c.solde||0), 0)

  return (
    <Layout title="Clients Grignon" subtitle="Comptabilité et suivi des clients grignon">
      <EditTransactionModal
        editRow={voyEditRow} editForm={voyEditForm} setEditForm={setVoyEditForm}
        onSave={saveVoyEdit} onCancel={closeVoyEdit} saving={voyEditSaving}
      />
      <div className={`${isMobile ? '' : 'grid grid-cols-3 gap-6'}`}>

        {/* LEFT: client list */}
        <div className="col-span-1">
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-bold text-gray-900">🫒 Clients Grignon</div>
                <div className="text-xs text-gray-400 mt-0.5">Total créances: <b className="text-amber-700">{fmt(totalCreances)} DHS</b></div>
              </div>
              {admin && <button onClick={()=>setShowAddClient(!showAddClient)} className="btn-primary text-xs px-3 py-1.5" style={{background:'#92400e'}}>+ Client</button>}
            </div>
            {showAddClient && (
              <form onSubmit={addClient} className="flex gap-2 mb-3">
                <input className="input flex-1 text-xs" placeholder="Nom du client grignon" value={newClientNom} onChange={e=>setNewClientNom(e.target.value)} required autoFocus />
                <button type="submit" className="btn-primary text-xs px-3" style={{background:'#92400e'}}>✓</button>
                <button type="button" onClick={()=>setShowAddClient(false)} className="btn-secondary text-xs px-2">✕</button>
              </form>
            )}
            <input className="input text-sm mb-3" placeholder="🔍 Rechercher..." value={search} onChange={e=>setSearch(e.target.value)} />
            {loading ? <div className="text-center py-6 text-gray-400 text-sm">Chargement...</div> : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {filtered.map(cl => (
                  <div key={cl.id} onClick={()=>selectClient(cl)}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${selected?.id===cl.id?'bg-amber-50 border border-amber-200':'hover:bg-gray-50 border border-transparent'}`}>
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{cl.nom}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${(cl.solde||0)>0?'text-amber-700':'text-green-600'}`}>{fmt(cl.solde||0)} DHS</span>
                      {admin && <button onClick={e=>{e.stopPropagation();deleteClient(cl.id)}} className="text-red-300 hover:text-red-500 text-xs">✕</button>}
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && <div className="text-center py-6 text-gray-400 text-sm">Aucun client grignon</div>}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: detail */}
        <div className="col-span-2">
          {!selected ? (
            <div className="card text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">🫒</div>
              <div className="font-semibold">Sélectionnez un client</div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header */}
              <div className="card">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-black" style={{background:'#92400e'}}>
                      {selected.nom[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-xl text-gray-900">{selected.nom}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={printClient} className="btn-primary text-xs px-3 py-1.5" style={{background:'#92400e'}}>🖨️ PDF</button>
                  </div>
                </div>
                {/* KPIs */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="text-center p-3 rounded-xl" style={{background:'#fffbeb',border:'1px solid #fde68a'}}>
                    <div className="text-xs text-amber-600 font-semibold">Ventes période</div>
                    <div className="font-bold text-amber-700 text-lg">{fmt(totalVentes)} DHS</div>
                  </div>
                  <div className="text-center p-3 rounded-xl" style={{background:'#f0fdf4',border:'1px solid #bbf7d0'}}>
                    <div className="text-xs text-green-600 font-semibold">Payé période</div>
                    <div className="font-bold text-green-700 text-lg">{fmt(totalPaiements)} DHS</div>
                  </div>
                  <div className="text-center p-3 rounded-xl" style={{background:'#faf5ff',border:'1px solid #e9d5ff'}}>
                    <div className="text-xs text-purple-600 font-semibold">Solde total</div>
                    <div className="font-bold text-purple-700 text-lg">{fmt(selected.solde||0)} DHS</div>
                  </div>
                </div>
                {/* Period filter */}
                <div className="flex gap-2 mt-4 flex-wrap">
                  {['all','month','custom'].map(t => (
                    <button key={t} onClick={()=>setFilterType(t)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold border ${filterType===t?'text-white border-transparent':'bg-white text-gray-600 border-gray-200'}`}
                      style={filterType===t?{background:'#92400e'}:{}}>
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

              {/* Operations */}
              {loadingDetail ? <div className="card text-center py-8 text-gray-400">Chargement...</div> : (
                <>
                  <div className="card">
                    <h3 className="font-bold text-gray-900 mb-3">🫒 Opérations Grignon ({filteredOps.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead><tr>
                          <th className="th">Date</th><th className="th">Camion</th>
                          <th className="th text-right">Qté kg</th>
                          <th className="th text-right">Prix/kg</th>
                          <th className="th text-right">Total DHS</th>
                          <th className="th">Note</th>
                          <th className="th"></th>
                        </tr></thead>
                        <tbody>
                          {filteredOps.map(op => (
                            <tr key={op.id} className="hover:bg-amber-50">
                              <td className="td text-gray-500">{fmtDate(op.date)}</td>
                              <td className="td text-gray-500 text-xs">{op.camion_plaque||'—'}</td>
                              <td className="td text-right font-semibold">{fmt(op.qte)} kg</td>
                              <td className="td text-right text-gray-500">{fmtD(op.prix_vente)}</td>
                              <td className="td text-right font-bold text-amber-700">{fmt(op.total_vente)} DHS</td>
                              <td className="td text-gray-400 text-xs">{op.note||'—'}</td>
                              <td className="td whitespace-nowrap">
                                {op.voyage_id && (
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => editOperation(op)} title="Modifier (voyage)"
                                      className="btn-secondary" style={{fontSize:10,padding:'2px 5px'}}>✎</button>
                                    <Link href={`/voyages/${op.voyage_id}`} title="Ouvrir le voyage"
                                      className="btn-secondary" style={{fontSize:10,padding:'2px 5px',textDecoration:'none'}}>↗</Link>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                          {filteredOps.length === 0 && <tr><td colSpan={7} className="td text-center text-gray-400 py-6">Aucune opération</td></tr>}
                        </tbody>
                        {filteredOps.length > 0 && (
                          <tfoot><tr>
                            <td className="tfoot-td" colSpan={2}>TOTAL ({filteredOps.length})</td>
                            <td className="tfoot-td text-right">{fmt(filteredOps.reduce((s,o)=>s+(o.qte||0),0))} kg</td>
                            <td className="tfoot-td"></td>
                            <td className="tfoot-td text-right text-amber-700">{fmt(totalVentes)} DHS</td>
                            <td className="tfoot-td"></td>
                            <td className="tfoot-td"></td>
                          </tr></tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  <div className="card">
                    <h3 className="font-bold text-gray-900 mb-3">💰 Paiements reçus ({filteredPai.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead><tr>
                          <th className="th">Date</th><th className="th">Mode</th>
                          <th className="th text-right">Montant DHS</th>
                          <th className="th">Note</th>
                        </tr></thead>
                        <tbody>
                          {filteredPai.map(p => (
                            <tr key={p.id} className="hover:bg-green-50">
                              <td className="td text-gray-500">{fmtDate(p.date)}</td>
                              <td className="td text-xs">{p.mode||'—'}</td>
                              <td className="td text-right font-bold text-green-600">− {fmt(p.montant)} DHS</td>
                              <td className="td text-gray-400 text-xs">{p.note||'—'}</td>
                            </tr>
                          ))}
                          {filteredPai.length === 0 && <tr><td colSpan={4} className="td text-center text-gray-400 py-6">Aucun paiement</td></tr>}
                        </tbody>
                        {filteredPai.length > 0 && (
                          <tfoot><tr>
                            <td className="tfoot-td" colSpan={2}>TOTAL reçu</td>
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
