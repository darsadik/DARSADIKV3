import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmt, fmtD, fmtMoney, fmtDate, today, startOfMonth, useIsMobile, openPrintWindow, sortGrignonRecords } from '../../lib/utils'
import { printBaseCss, printHeader, printGeneratedDate, entityCard, summaryCards, soldeFinal, printFooter } from '../../lib/printLayout'
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
  // Defaults to 'all': the achats table only ever renders the filtered list
  // (never the raw `achats` array), so defaulting to 'month' silently hid
  // every prior-month purchase behind a toggle the user had to know to
  // click — that's what looked like "Voyage purchases missing" even though
  // selectFournisseur() already fetches full, unfiltered history above.
  const [filterType,   setFilterType]   = useState('all')
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
      // grignon_operations holds BOTH purchase-mirror rows (client_id null)
      // and delivery-mirror rows (client_id set) — a delivery row also
      // carries a fournisseur_id (borrowed from the voyage's own purchase,
      // see saveLiv in lib/services/voyage/livraisons.js) and a total_achat
      // (cost basis of what was delivered). Without excluding client_id,
      // every delivery's cost was double-counted into this supplier's
      // purchase history/total on top of the real achat row it came from.
      supabase.from('grignon_operations')
        .select('*')
        .eq('fournisseur_id', f.id)
        .is('client_id', null)
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
    // camion_plaque on grignon_operations is a snapshot taken from the voyage
    // at insert time (lib/services/voyage/achats.js). Editing a voyage's
    // truck afterwards only updates the voyages row — it never cascades to
    // already-created mirror rows — so the snapshot can go stale or blank.
    // The voyage is the single operational source of truth for grignon data
    // (see pages/clients/grignon.js for the same fix), so always resolve the
    // truck from the linked voyage when one exists.
    const voyageIds = [...new Set((ac || []).map(a => a.voyage_id).filter(Boolean))]
    let voyageCamionById = {}
    if (voyageIds.length > 0) {
      const { data: voys } = await supabase.from('voyages').select('id,camion_plaque').in('id', voyageIds)
      voyageCamionById = Object.fromEntries((voys || []).map(v => [v.id, v.camion_plaque]))
    }
    setAchats((ac || []).map(a => ({
      ...a,
      camion_plaque: (a.voyage_id && voyageCamionById[a.voyage_id]) || a.camion_plaque || '',
    })))
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

  const filteredAchats = sortGrignonRecords(achats.filter(a => {
    const d = a.date
    if (from && d < from) return false
    if (to   && d > to)   return false
    return true
  }))
  const filteredPai = paiements.filter(p => {
    if (from && p.date < from) return false
    if (to   && p.date > to)   return false
    return true
  })

  const totalAchats    = filteredAchats.reduce((s,a) => s+(a.total_achat||0), 0)
  const totalPaiements = filteredPai.reduce((s,p)    => s+(p.montant||0), 0)

  function printFournisseur() {
    if (!selected) return
    const accent = '#15803d'
    const printDate = printGeneratedDate()
    const periode = filterType === 'all' ? 'Toutes dates' : `${fmtDate(from)} → ${fmtDate(to)}`
    const rows = filteredAchats.map(a => `<tr>
      <td class="m" style="white-space:nowrap">${fmtDate(a.date)}</td>
      <td class="m">${a.camion_plaque||'—'}</td>
      <td class="r">${fmt(a.qte)} kg</td>
      <td class="r">${fmtMoney(a.prix_achat)}</td>
      <td class="r"><b>${fmtMoney(a.total_achat)} DHS</b></td>
      <td class="m">${a.note||'—'}</td>
    </tr>`).join('')
    const paiRows = filteredPai.map(p => `<tr>
      <td class="m" style="white-space:nowrap">${fmtDate(p.date)}</td>
      <td class="m">${p.mode||'—'}</td>
      <td class="m">${p.cheque_number||'—'}</td>
      <td class="r" style="color:#16a34a"><b>− ${fmtMoney(p.montant)} DHS</b></td>
      <td class="m">${p.note||'—'}</td>
    </tr>`).join('')

    openPrintWindow(`<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Fournisseur Grignon — ${selected.nom}</title>
<style>
${printBaseCss(accent)}
</style></head><body>
${printHeader({ date: printDate })}
${entityCard({
  avatarText: '🌿',
  name: selected.nom,
  metaHtml: `<strong>Fournisseur Grignon</strong> &nbsp;·&nbsp; <strong>Solde dû:</strong> ${fmtMoney(selected.solde||0)} DHS &nbsp;·&nbsp; <strong>Période:</strong> ${periode}`,
})}
${summaryCards([
  { label: 'Achats période', value: `${fmtMoney(totalAchats)} DHS`, color: accent },
  { label: 'Payé période', value: `${fmtMoney(totalPaiements)} DHS`, color: '#16a34a' },
  { label: 'Solde total dû', value: `${fmtMoney(selected.solde||0)} DHS`, color: '#dc2626' },
])}
<div class="bdy">
<div class="sec-title">Achats Grignon</div>
<table>
  <thead><tr><th>Date</th><th>Camion</th><th class="r">Qté kg</th><th class="r">Prix/kg</th><th class="r">Total DHS</th><th>Note</th></tr></thead>
  <tbody>${rows||'<tr><td colspan="6" style="text-align:center;color:#aaa">Aucun achat</td></tr>'}</tbody>
  ${filteredAchats.length>0?`<tfoot><tr><td colspan="2">TOTAL</td><td class="r">${fmt(filteredAchats.reduce((s,a)=>s+(a.qte||0),0))} kg</td><td></td><td class="r">${fmtMoney(totalAchats)} DHS</td><td></td></tr></tfoot>`:''}
</table>
<div class="sec-title" style="color:#16a34a;border-color:#16a34a">Paiements effectués</div>
<table>
  <thead><tr><th>Date</th><th>Mode</th><th>Chèque</th><th class="r">Montant</th><th>Note</th></tr></thead>
  <tbody>${paiRows||'<tr><td colspan="5" style="text-align:center;color:#aaa">Aucun paiement</td></tr>'}</tbody>
  ${filteredPai.length>0?`<tfoot><tr><td colspan="3">TOTAL payé</td><td class="r">− ${fmtMoney(totalPaiements)} DHS</td><td></td></tr></tfoot>`:''}
</table>
${soldeFinal({ label: 'Solde total dû', amountFormatted: fmtMoney(selected.solde||0), amount: selected.solde||0, sub: periode })}
${printFooter(printDate)}
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
                <div className="text-xs text-red-500 mt-0.5">Total dû: <b>{fmtMoney(totalDettes)} DHS</b></div>
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
                      <span className={`text-sm font-bold ${(f.solde||0)>0?'text-red-600':'text-green-600'}`}>{fmtMoney(f.solde||0)} DHS</span>
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
                    <div className="font-bold text-green-700 text-lg">{fmtMoney(totalAchats)} DHS</div>
                  </div>
                  <div className="text-center p-3 rounded-xl" style={{background:'#f0fdf4',border:'1px solid #bbf7d0'}}>
                    <div className="text-xs text-green-600 font-semibold">Payé période</div>
                    <div className="font-bold text-green-700 text-lg">{fmtMoney(totalPaiements)} DHS</div>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-red-50 border border-red-100">
                    <div className="text-xs text-red-600 font-semibold">Solde dû total</div>
                    <div className="font-bold text-red-700 text-lg">{fmtMoney(selected.solde||0)} DHS</div>
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
                          <th className="th text-xs py-3.5">Date</th>
                          <th className="th text-xs py-3.5">Camion</th>
                          <th className="th text-xs py-3.5 text-right">Qté kg</th>
                          <th className="th text-xs py-3.5 text-right">Prix/kg</th>
                          <th className="th text-xs py-3.5 text-right">Total DHS</th>
                          <th className="th text-xs py-3.5">Note</th>
                          <th className="th text-xs py-3.5"></th>
                        </tr></thead>
                        <tbody>
                          {filteredAchats.map(a => (
                            <tr key={a.id} className="hover:bg-green-50">
                              <td className="td py-3.5 text-gray-600 font-medium">{fmtDate(a.date)}</td>
                              <td className="td py-3.5 text-gray-600 font-medium">{a.camion_plaque||'—'}</td>
                              <td className="td py-3.5 text-right font-bold">{fmt(a.qte)} kg</td>
                              <td className="td py-3.5 text-right text-gray-600 font-medium">{fmtMoney(a.prix_achat)}</td>
                              <td className="td py-3.5 text-right font-bold text-green-700">{fmtMoney(a.total_achat)} DHS</td>
                              <td className="td py-3.5 text-gray-500">{a.note||'—'}</td>
                              <td className="td py-3.5 whitespace-nowrap">
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
                            <td className="tfoot-td py-3.5" colSpan={2}>TOTAL ({filteredAchats.length})</td>
                            <td className="tfoot-td py-3.5 text-right">{fmt(filteredAchats.reduce((s,a)=>s+(a.qte||0),0))} kg</td>
                            <td className="tfoot-td py-3.5"></td>
                            <td className="tfoot-td py-3.5 text-right text-green-700">{fmtMoney(totalAchats)} DHS</td>
                            <td className="tfoot-td py-3.5"></td>
                            <td className="tfoot-td py-3.5"></td>
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
                          <th className="th text-xs py-3.5">Date</th>
                          <th className="th text-xs py-3.5">Mode</th>
                          <th className="th text-xs py-3.5">Chèque</th>
                          <th className="th text-xs py-3.5 text-right">Montant DHS</th>
                          <th className="th text-xs py-3.5">Note</th>
                        </tr></thead>
                        <tbody>
                          {filteredPai.map(p => (
                            <tr key={p.id} className="hover:bg-green-50">
                              <td className="td py-3.5 text-gray-600 font-medium">{fmtDate(p.date)}</td>
                              <td className="td py-3.5 font-medium">{p.mode||'—'}</td>
                              <td className="td py-3.5 font-mono text-blue-600">{p.cheque_number||'—'}</td>
                              <td className="td py-3.5 text-right font-bold text-green-600">− {fmtMoney(p.montant)} DHS</td>
                              <td className="td py-3.5 text-gray-500">{p.note||'—'}</td>
                            </tr>
                          ))}
                          {filteredPai.length === 0 && <tr><td colSpan={5} className="td text-center text-gray-400 py-6">Aucun paiement</td></tr>}
                        </tbody>
                        {filteredPai.length > 0 && (
                          <tfoot><tr>
                            <td className="tfoot-td py-3.5" colSpan={3}>TOTAL payé</td>
                            <td className="tfoot-td py-3.5 text-right text-green-700">− {fmtMoney(totalPaiements)} DHS</td>
                            <td className="tfoot-td py-3.5"></td>
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
