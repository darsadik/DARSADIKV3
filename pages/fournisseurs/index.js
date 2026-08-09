import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmt, fmtD, fmtMoney, fmtDate, today, startOfMonth, useIsMobile, openPrintWindow } from '../../lib/utils'
import { printBaseCss, printHeader, printGeneratedDate, entityCard, summaryCards, soldeFinal, printFooter } from '../../lib/printLayout'
import { buildAchatTraceability, buildProductSummary, buildGrandTotal, TRACE_STATUS_META, DISTRIBUTION_STATUS_META } from '../../lib/fournisseurTraceability'
import { useVoyageTransactionEdit } from '../../lib/hooks/useVoyageTransactionEdit'
import EditTransactionModal from '../../components/voyage/EditTransactionModal'

const ADMIN   = 'abdelhafidbaadi@gmail.com'

export default function FournisseursBriques() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const admin    = user?.email === ADMIN

  const [fournisseurs, setFournisseurs] = useState([])
  const [typeBriques,  setTypeBriques]  = useState([])
  const [selected,     setSelected]     = useState(null)
  const [achats,       setAchats]       = useState([])
  const [voyageAchats, setVoyageAchats] = useState([])
  const [paiements,    setPaiements]    = useState([])
  const [voyageLivraisons, setVoyageLivraisons] = useState([])
  const [voyagesById,      setVoyagesById]      = useState({})
  const [loading,      setLoading]      = useState(true)
  const [loadingDetail,setLoadingDetail]= useState(false)
  const [search,       setSearch]       = useState('')
  const [filterFrom,   setFilterFrom]   = useState(startOfMonth())
  const [filterTo,     setFilterTo]     = useState(today())
  // Defaults to 'all' — same fix as pages/fournisseurs/grignon.js and
  // pages/clients/grignon.js: the achats table only ever renders the
  // filtered list, so a 'month' default silently hid every prior-month
  // purchase even though selectFournisseur() already fetches full,
  // unfiltered history above.
  const [filterType,   setFilterType]   = useState('all')
  const [showAdd,      setShowAdd]      = useState(false)
  const [newNom,       setNewNom]       = useState('')

  useEffect(() => {
    loadFournisseurs()
    // Needed for the achat edit modal's "Type brique" selector (Test F —
    // changing an achat's brick type in place) — not used anywhere else on
    // this page, so it's a one-time load, not part of selectFournisseur().
    supabase.from('type_briques').select('*').order('nom').then(({ data }) => setTypeBriques(data || []))
  }, [])

  async function loadFournisseurs() {
    setLoading(true)
    const { data } = await supabase.from('fournisseurs').select('*').order('solde', { ascending: false })
    setFournisseurs(data || [])
    setLoading(false)
  }

  async function selectFournisseur(f) {
    setSelected(f)
    setLoadingDetail(true)
    // voyage_achats is the authoritative source for voyage-sourced achats —
    // ventes (`type_entree='achat'`) is only a mirror that saveAchat/updateAchat
    // write to for the fournisseur-accounting join; it can silently go stale
    // when the mirror link (vente_id) is missing, which was the root cause of
    // false "Dépassement" states here (audited 2026-08-09: 265/321 brique
    // voyage_achats rows had no vente_id, so an edit to the achat's qty never
    // reached the ventes row this page used to read). Reading voyage_achats
    // directly — the same table pages/achats/index.js already reads from —
    // makes this figure structurally impossible to go stale.
    // Pre-Voyage historical achats (`ventes` rows with fournisseur_id set but
    // voyage_id NULL — the old "legacy" tag) are deliberately NOT fetched
    // here anymore (2026-08-09): the current Achats Briques workflow is
    // Voyage-linked purchases only, per business rule. Those 125 historical
    // rows are untouched in the database — solde already includes them
    // (maintained incrementally by saveAchat/updateAchat/delAchat, never
    // recomputed from this query) — they're just no longer surfaced in this
    // table, since they can't be traced back to a Voyage.
    const [{ data: ac }, { data: va }, { data: pa }] = await Promise.all([
      supabase.from('achats').select('*').eq('fournisseur_id', f.id).order('date', { ascending: true }),
      supabase.from('voyage_achats').select('*').eq('fournisseur_id', f.id).eq('type_produit', 'brique').order('date_achat', { ascending: true }),
      supabase.from('paiements').select('*').eq('fournisseur_id', f.id).order('date', { ascending: true }),
    ])
    // ── Traçabilité achats → livraisons (outil de contrôle, lecture seule) ──
    // Retrouve les livraisons des voyages concernés pour calculer, par achat,
    // la répartition par client. Aucune écriture, uniquement de la lecture.
    const voyageIds = [...new Set((va || []).map(a => a.voyage_id).filter(Boolean))]
    let vld = []
    let vMap = {}
    let archivedVoyageIds = new Set()
    if (voyageIds.length > 0) {
      const [{ data: livData }, { data: voyData }] = await Promise.all([
        supabase.from('voyage_livraisons')
          .select('voyage_id, type_brique, qte, client_nom, type_produit')
          .in('voyage_id', voyageIds)
          .eq('type_produit', 'brique'),
        supabase.from('voyages').select('id, camion_plaque, chauffeur, deleted_at').in('id', voyageIds),
      ])
      vld = livData || []
      vMap = Object.fromEntries((voyData || []).map(v => [v.id, v]))
      archivedVoyageIds = new Set((voyData || []).filter(v => v.deleted_at).map(v => v.id))
    }
    // Archived voyages are hidden here too — archive_voyage (supabase_rpc.sql)
    // already reverses their achats out of fournisseur.solde, so leaving the
    // rows visible would show purchases the solde above no longer counts.
    // Rows with no voyage_id (the standalone `achats` table) are never
    // voyage-archived, so they pass through.
    setAchats(ac || [])
    setVoyageAchats((va || []).filter(a => !archivedVoyageIds.has(a.voyage_id)))
    setPaiements(pa || [])
    setVoyageLivraisons(vld)
    setVoyagesById(vMap)

    setLoadingDetail(false)
  }

  // ── EDIT VOYAGE-SOURCED ACHATS (same modal as the voyage page) ──
  // Only rows sourced from voyage_achats (_source==='voyage') are editable
  // here — the separate manual `achats` table (_source==='new', currently
  // empty/dead) isn't voyage data. The full voyage_achats row is already in
  // `voyageAchats` state, so this is a direct lookup — no network round-trip
  // to resolve it via a vente_id link (which is what read the stale mirror
  // in the first place; see selectFournisseur).
  const {
    editRow: voyEditRow, editForm: voyEditForm, setEditForm: setVoyEditForm,
    editSaving: voyEditSaving, editError: voyEditError,
    openEdit: openVoyEdit, closeEdit: closeVoyEdit, save: saveVoyEdit,
  } = useVoyageTransactionEdit({
    onSaved: async () => { await loadFournisseurs(); if (selected) await selectFournisseur(selected) },
    achatLists: { fournisseurs, typeBriques },
  })
  useEffect(() => { if (voyEditError) alert(voyEditError) }, [voyEditError])

  function editAchat(a) {
    const row = voyageAchats.find(v => v.id === a._achatId)
    if (!row) { alert("Cet achat ne peut pas être modifié depuis cette page — ouvrez le voyage."); return }
    openVoyEdit('achat', row)
  }

  async function addFournisseur(e) {
    e.preventDefault()
    if (!newNom.trim()) return
    await supabase.from('fournisseurs').insert({ nom: newNom.trim(), solde: 0 })
    setNewNom(''); setShowAdd(false)
    loadFournisseurs()
  }

  async function deleteFournisseur(id) {
    if (!admin || !confirm('Supprimer ce fournisseur?')) return
    await supabase.from('fournisseurs').delete().eq('id', id)
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

  // Current Achats Briques workflow is Voyage-linked purchases only — see
  // the comment in selectFournisseur for why pre-Voyage `ventes` history
  // (the old "legacy" tag) is excluded here rather than merged in.
  const allAchats = [
    ...achats.map(a => ({ ...a, _source: 'new' })),
    ...(voyageAchats||[]).map(a => ({
      id: `va_${a.id}`, date: a.date_achat,
      voyage_id: a.voyage_id, type_brique: a.type_brique,
      qte: a.qte, prix_achat: a.prix_achat,
      total_achat: a.total_achat || Math.round((a.qte||0)*(a.prix_achat||0)*100)/100,
      camion_plaque: voyagesById[a.voyage_id]?.camion_plaque || '',
      note: a.note, _source: 'voyage', _achatId: a.id,
    })),
  ].sort((a,b) => (a.date||'').localeCompare(b.date||''))

  const filteredAchats = allAchats.filter(a => {
    if (from && a.date < from) return false
    if (to   && a.date > to)   return false
    return true
  })
  const filteredPai = paiements.filter(p => {
    if (from && p.date < from) return false
    if (to   && p.date > to)   return false
    return true
  })

  const totalAchats    = filteredAchats.reduce((s,a) => s+(a.total_achat||0), 0)
  const totalPaiements = filteredPai.reduce((s,p)    => s+(p.montant||0), 0)

  // ── Traçabilité achats → livraisons (outil de contrôle, lecture seule) ──
  const achatsWithDistribution = buildAchatTraceability(filteredAchats, voyageLivraisons)
  const productSummary = buildProductSummary(filteredAchats, voyageLivraisons)
  const grandTotal      = buildGrandTotal(productSummary)

  function printFournisseur() {
    if (!selected) return
    const accent = '#1e3a5f'
    const printDate = printGeneratedDate()
    const periode = filterType === 'all' ? 'Toutes dates' : `${fmtDate(from)} → ${fmtDate(to)}`
    const rows = filteredAchats.map(a => `<tr>
      <td class="m" style="white-space:nowrap">${fmtDate(a.date)}</td>
      <td class="m">${a.camion_plaque||'—'}</td>
      <td>${a.type_brique||'—'}</td>
      <td class="r">${fmt(a.qte)}</td>
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
<meta charset="UTF-8"><title>Fournisseur Brique — ${selected.nom}</title>
<style>
${printBaseCss(accent)}
</style></head><body>
${printHeader({ date: printDate })}
${entityCard({
  avatarText: '🏭',
  name: selected.nom,
  metaHtml: `<strong>Fournisseur Brique</strong> &nbsp;·&nbsp; <strong>Solde dû:</strong> ${fmtMoney(selected.solde||0)} DHS &nbsp;·&nbsp; <strong>Période:</strong> ${periode}`,
})}
${summaryCards([
  { label: 'Achats période', value: `${fmtMoney(totalAchats)} DHS`, color: accent },
  { label: 'Payé période', value: `${fmtMoney(totalPaiements)} DHS`, color: '#16a34a' },
  { label: 'Solde total dû', value: `${fmtMoney(selected.solde||0)} DHS`, color: '#dc2626' },
])}
<div class="bdy">
<div class="sec-title">Achats Briques</div>
<table>
  <thead><tr><th>Date</th><th>Camion</th><th>Produit</th><th class="r">Qté</th><th class="r">Prix/u</th><th class="r">Total DHS</th><th>Note</th></tr></thead>
  <tbody>${rows||'<tr><td colspan="7" style="text-align:center;color:#aaa">Aucun achat</td></tr>'}</tbody>
  ${filteredAchats.length>0?`<tfoot><tr><td colspan="3">TOTAL</td><td class="r">${fmt(filteredAchats.reduce((s,a)=>s+(a.qte||0),0))}</td><td></td><td class="r">${fmtMoney(totalAchats)} DHS</td><td></td></tr></tfoot>`:''}
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

  const filtered      = fournisseurs.filter(f => !search || f.nom.toLowerCase().includes(search.toLowerCase()))
  const totalDettes   = filtered.reduce((s,f) => s+(f.solde||0), 0)

  return (
    <Layout title="Fournisseurs Briques" subtitle="Achats et paiements fournisseurs briques">
      <EditTransactionModal
        editRow={voyEditRow} editForm={voyEditForm} setEditForm={setVoyEditForm}
        onSave={saveVoyEdit} onCancel={closeVoyEdit} saving={voyEditSaving}
        fournisseurs={fournisseurs} typeBriques={typeBriques}
      />
      <div className={`${isMobile ? '' : 'grid grid-cols-3 gap-6'}`}>

        {/* LEFT */}
        <div className="col-span-1">
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-bold text-gray-900">🏭 Fournisseurs Briques</div>
                <div className="text-xs text-red-500 mt-0.5">Total dû: <b>{fmtMoney(totalDettes)} DHS</b></div>
              </div>
              {admin && <button onClick={()=>setShowAdd(!showAdd)} className="btn-primary text-xs px-3 py-1.5" style={{background:'#1e3a5f'}}>+ Fournisseur</button>}
            </div>
            {showAdd && (
              <form onSubmit={addFournisseur} className="flex gap-2 mb-3">
                <input className="input flex-1 text-xs" placeholder="Nom du fournisseur" value={newNom} onChange={e=>setNewNom(e.target.value)} required autoFocus />
                <button type="submit" className="btn-primary text-xs px-3" style={{background:'#1e3a5f'}}>✓</button>
                <button type="button" onClick={()=>setShowAdd(false)} className="btn-secondary text-xs px-2">✕</button>
              </form>
            )}
            <input className="input text-sm mb-3" placeholder="🔍 Rechercher..." value={search} onChange={e=>setSearch(e.target.value)} />
            {loading ? <div className="text-center py-6 text-gray-400 text-sm">Chargement...</div> : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {filtered.map(f => (
                  <div key={f.id} onClick={()=>selectFournisseur(f)}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${selected?.id===f.id?'bg-blue-50 border border-blue-200':'hover:bg-gray-50 border border-transparent'}`}>
                    <div className="font-semibold text-sm text-gray-900">{f.nom}</div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${(f.solde||0)>0?'text-red-600':'text-green-600'}`}>{fmtMoney(f.solde||0)} DHS</span>
                      {admin && <button onClick={e=>{e.stopPropagation();deleteFournisseur(f.id)}} className="text-red-300 hover:text-red-500 text-xs">✕</button>}
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && <div className="text-center py-6 text-gray-400 text-sm">Aucun fournisseur</div>}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="col-span-2">
          {!selected ? (
            <div className="card text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">🏭</div>
              <div className="font-semibold">Sélectionnez un fournisseur</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="card">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-black" style={{background:'#1e3a5f'}}>
                      {selected.nom[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-xl text-gray-900">{selected.nom}</div>
                      <div className="text-xs text-blue-700 font-semibold mt-0.5">Fournisseur Brique</div>
                    </div>
                  </div>
                  <button onClick={printFournisseur} className="btn-primary text-xs px-3 py-1.5" style={{background:'#1e3a5f'}}>🖨️ PDF</button>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="text-center p-3 rounded-xl bg-blue-50 border border-blue-100">
                    <div className="text-xs text-blue-600 font-semibold">Achats période</div>
                    <div className="font-bold text-blue-700 text-lg">{fmtMoney(totalAchats)} DHS</div>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-green-50 border border-green-100">
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
                      style={filterType===t?{background:'#1e3a5f'}:{}}>
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
                    <h3 className="font-bold text-gray-900 mb-3">📦 Achats Briques ({filteredAchats.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead><tr>
                          <th className="th">Date</th><th className="th">Voyage</th>
                          <th className="th">Camion</th>
                          <th className="th">Produit</th>
                          <th className="th text-right">Qté</th>
                          <th className="th text-right">Prix/u</th>
                          <th className="th text-right">Total DHS</th>
                          <th className="th">Client(s)</th>
                          <th className="th text-right">Qté distribuée</th>
                          <th className="th text-right">Écart</th>
                          <th className="th">Statut</th>
                          <th className="th"></th>
                        </tr></thead>
                        <tbody>
                          {achatsWithDistribution.map(a => {
                            const meta = DISTRIBUTION_STATUS_META[a.rowStatus]
                            const ecart = Math.round(((a.qte||0) - (a.totalDistribue||0)) * 1000) / 1000
                            const camionPlaque = voyagesById[a.voyage_id]?.camion_plaque
                            return (
                              <tr key={a.id} className="hover:bg-blue-50">
                                <td className="td text-gray-500">
                                  {fmtDate(a.date)}
                                </td>
                                <td className="td text-xs text-blue-600">
                                  {a.voyage_id ? `#${a.voyage_id}` : '—'}
                                </td>
                                <td className="td text-xs font-semibold text-gray-600">{camionPlaque || '—'}</td>
                                <td className="td text-xs font-semibold">{a.type_brique||'—'}</td>
                                <td className="td text-right font-semibold">{fmt(a.qte)}</td>
                                <td className="td text-right text-gray-500">{fmtMoney(a.prix_achat)}</td>
                                <td className="td text-right font-bold text-blue-700">{fmtMoney(a.total_achat)} DHS</td>
                                <td className="td text-xs">
                                  {a.repartition.length === 0
                                    ? <span className="text-gray-400">—</span>
                                    : a.repartition.map((r,i) => (
                                        <span key={i} className="text-gray-700">
                                          {i>0 && <span className="text-gray-300 mx-1">•</span>}
                                          {r.client_nom} <span className="text-gray-400">({fmt(r.qte)})</span>
                                        </span>
                                      ))
                                  }
                                </td>
                                <td className="td text-right font-semibold">{fmt(a.totalDistribue)}</td>
                                <td className={`td text-right font-bold ${ecart===0?'text-gray-500':ecart>0?'text-amber-600':'text-red-600'}`}>
                                  {ecart>0?'+':''}{fmt(ecart)}
                                </td>
                                <td className="td">
                                  <span className={`text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap ${meta.bg} ${meta.text}`}>{meta.emoji} {meta.label}</span>
                                </td>
                                <td className="td whitespace-nowrap">
                                  {a._source === 'voyage' && a.voyage_id && (
                                    <div className="flex items-center gap-1">
                                      <button onClick={() => editAchat(a)} title="Modifier (voyage)"
                                        className="btn-secondary" style={{fontSize:10,padding:'2px 5px'}}>✎</button>
                                      <Link href={`/voyages/${a.voyage_id}`} title="Ouvrir le voyage"
                                        className="btn-secondary" style={{fontSize:10,padding:'2px 5px',textDecoration:'none'}}>↗</Link>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                          {achatsWithDistribution.length === 0 && <tr><td colSpan={12} className="td text-center text-gray-400 py-6">Aucun achat</td></tr>}
                        </tbody>
                        {achatsWithDistribution.length > 0 && (
                          <tfoot><tr>
                            <td className="tfoot-td" colSpan={4}>TOTAL ({filteredAchats.length})</td>
                            <td className="tfoot-td text-right">{fmt(filteredAchats.reduce((s,a)=>s+(a.qte||0),0))}</td>
                            <td className="tfoot-td"></td>
                            <td className="tfoot-td text-right text-blue-700">{fmtMoney(totalAchats)} DHS</td>
                            <td className="tfoot-td" colSpan={5}></td>
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
                          <th className="th">Date</th><th className="th">Mode</th>
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
                              <td className="td text-right font-bold text-green-600">− {fmtMoney(p.montant)} DHS</td>
                              <td className="td text-gray-400 text-xs">{p.note||'—'}</td>
                            </tr>
                          ))}
                          {filteredPai.length === 0 && <tr><td colSpan={5} className="td text-center text-gray-400 py-6">Aucun paiement</td></tr>}
                        </tbody>
                        {filteredPai.length > 0 && (
                          <tfoot><tr>
                            <td className="tfoot-td" colSpan={3}>TOTAL payé</td>
                            <td className="tfoot-td text-right text-green-700">− {fmtMoney(totalPaiements)} DHS</td>
                            <td className="tfoot-td"></td>
                          </tr></tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  {/* ── Contrôle par produit ── */}
                  <div className="card">
                    <h3 className="font-bold text-gray-900 mb-3">📊 Contrôle par produit</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead><tr>
                          <th className="th">Produit</th>
                          <th className="th text-right">Qté achetée</th>
                          <th className="th text-right">Qté distribuée</th>
                          <th className="th text-right">Écart</th>
                          <th className="th">Statut</th>
                        </tr></thead>
                        <tbody>
                          {productSummary.map((p,i) => {
                            const meta = TRACE_STATUS_META[p.status]
                            return (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="td font-semibold">{p.label}</td>
                                <td className="td text-right">{fmt(p.achete)}</td>
                                <td className="td text-right">{fmt(p.distribue)}</td>
                                <td className={`td text-right font-bold ${p.ecart===0?'text-gray-500':p.ecart<0?'text-amber-600':'text-red-600'}`}>
                                  {p.ecart>0?'+':''}{fmt(p.ecart)}
                                </td>
                                <td className="td">
                                  <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${meta.bg} ${meta.text}`}>{meta.emoji}</span>
                                </td>
                              </tr>
                            )
                          })}
                          {productSummary.length === 0 && <tr><td colSpan={5} className="td text-center text-gray-400 py-6">Aucune donnée</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* ── Total général fournisseur ── */}
                  <div className="card">
                    <h3 className="font-bold text-gray-900 mb-3">🧮 Total Fournisseur</h3>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="text-center p-3 rounded-xl bg-blue-50 border border-blue-100">
                        <div className="text-xs text-blue-600 font-semibold">Total acheté</div>
                        <div className="font-bold text-blue-700 text-lg">{fmt(grandTotal.totalAchete)}</div>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="text-xs text-slate-600 font-semibold">Total distribué</div>
                        <div className="font-bold text-slate-700 text-lg">{fmt(grandTotal.totalDistribue)}</div>
                      </div>
                      <div className={`text-center p-3 rounded-xl ${TRACE_STATUS_META[grandTotal.status].bg} border ${TRACE_STATUS_META[grandTotal.status].ring}`}>
                        <div className={`text-xs font-semibold ${TRACE_STATUS_META[grandTotal.status].text}`}>Écart global</div>
                        <div className={`font-bold text-lg ${TRACE_STATUS_META[grandTotal.status].text}`}>{grandTotal.ecart>0?'+':''}{fmt(grandTotal.ecart)}</div>
                      </div>
                    </div>
                    <div className={`text-center py-2 rounded-xl font-bold ${TRACE_STATUS_META[grandTotal.status].bg} ${TRACE_STATUS_META[grandTotal.status].text}`}>
                      {TRACE_STATUS_META[grandTotal.status].emoji} {TRACE_STATUS_META[grandTotal.status].label}
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
