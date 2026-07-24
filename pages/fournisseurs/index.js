import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmt, fmtD, fmtDate, today, startOfMonth, useIsMobile, openPrintWindow } from '../../lib/utils'
import { buildAchatTraceability, buildProductSummary, buildGrandTotal, TRACE_STATUS_META, DISTRIBUTION_STATUS_META } from '../../lib/fournisseurTraceability'

const ADMIN   = 'abdelhafidbaadi@gmail.com'

export default function FournisseursBriques() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const admin    = user?.email === ADMIN

  const [fournisseurs, setFournisseurs] = useState([])
  const [selected,     setSelected]     = useState(null)
  const [achats,       setAchats]       = useState([])
  const [ventesLegacy, setVentesLegacy] = useState([])
  const [paiements,    setPaiements]    = useState([])
  const [voyageLivraisons, setVoyageLivraisons] = useState([])
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
    const { data } = await supabase.from('fournisseurs').select('*').order('solde', { ascending: false })
    setFournisseurs(data || [])
    setLoading(false)
  }

  async function selectFournisseur(f) {
    setSelected(f)
    setLoadingDetail(true)
    const [{ data: ac }, { data: vl }, { data: pa }] = await Promise.all([
      supabase.from('achats').select('*').eq('fournisseur_id', f.id).order('date', { ascending: true }),
      supabase.from('ventes').select('*').eq('fournisseur_id', f.id).order('date', { ascending: true }),
      supabase.from('paiements').select('*').eq('fournisseur_id', f.id).order('date', { ascending: true }),
    ])
    setAchats(ac || [])
    setVentesLegacy(vl || [])
    setPaiements(pa || [])

    // ── Traçabilité achats → livraisons (outil de contrôle, lecture seule) ──
    // Retrouve les livraisons des voyages concernés pour calculer, par achat,
    // la répartition par client. Aucune écriture, uniquement de la lecture.
    const voyageIds = [...new Set([
      ...(ac || []).map(a => a.voyage_id),
      ...(vl || []).map(v => v.voyage_id),
    ].filter(Boolean))]
    let vld = []
    if (voyageIds.length > 0) {
      const { data } = await supabase.from('voyage_livraisons')
        .select('voyage_id, type_brique, qte, client_nom, type_produit')
        .in('voyage_id', voyageIds)
        .eq('type_produit', 'brique')
      vld = data || []
    }
    setVoyageLivraisons(vld)

    setLoadingDetail(false)
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

  const allAchats = [
    ...achats.map(a => ({ ...a, _source: 'new' })),
    ...(ventesLegacy||[]).map(v => ({
      id: `leg_${v.id}`, date: v.date_fournisseur || v.date,
      voyage_id: v.voyage_id || null, type_brique: v.type_brique,
      qte: v.qte, prix_achat: v.prix_achat,
      total_achat: v.total_achat || 0, note: v.note, _source: 'legacy',
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
    const rows = filteredAchats.map(a => `<tr>
      <td>${fmtDate(a.date)}</td>
      <td>${a.camion_plaque||'—'}</td>
      <td>${a.type_brique||'—'}</td>
      <td style="text-align:right">${fmt(a.qte)}</td>
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

    openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fournisseur Brique — ${selected.nom}</title>
    <style>*{-webkit-print-color-adjust:exact !important}
    body{font-family:Arial;padding:28px;font-size:12px;color:#1e293b}
    .hdr{background:#1e3a5f;color:#fff;padding:16px;border-radius:8px;margin-bottom:16px;display:flex;justify-content:space-between}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th{background:#1e3a5f !important;color:#fff !important;padding:7px 10px;text-align:left;font-size:10px;font-weight:700}
    td{padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px}
    tr:nth-child(even) td{background:#f8fafc !important}
    tfoot td{background:#f1f5f9 !important;font-weight:800 !important}
    .kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
    .k{border:1px solid #e2e8f0;border-radius:6px;padding:10px;text-align:center}
    .kl{font-size:9px;text-transform:uppercase;color:#6b7280;margin-bottom:3px}
    .kv{font-size:16px;font-weight:900}
    @media print{button{display:none !important}}</style></head><body>
    <div class="hdr">
      <div><div style="font-size:20px;font-weight:900">🏭 ${selected.nom}</div><div style="opacity:0.8;font-size:11px">Fournisseur Brique — DAR SADIK</div></div>
      <div style="text-align:right;font-size:11px;opacity:0.9">Solde dû: <b style="font-size:16px">${fmt(selected.solde||0)} DHS</b></div>
    </div>
    <div class="kpi">
      <div class="k"><div class="kl">Achats période</div><div class="kv" style="color:#1e3a5f">${fmt(totalAchats)} DHS</div></div>
      <div class="k"><div class="kl">Payé période</div><div class="kv" style="color:#16a34a">${fmt(totalPaiements)} DHS</div></div>
      <div class="k"><div class="kl">Solde total dû</div><div class="kv" style="color:#dc2626">${fmt(selected.solde||0)} DHS</div></div>
    </div>
    <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;color:#1e3a5f;border-bottom:2px solid #1e3a5f;padding-bottom:4px;margin-bottom:8px">Achats Briques</h3>
    <table><thead><tr><th>Date</th><th>Camion</th><th>Produit</th><th style="text-align:right">Qté</th><th style="text-align:right">Prix/u</th><th style="text-align:right">Total DHS</th><th>Note</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="7" style="text-align:center;color:#aaa">Aucun achat</td></tr>'}</tbody>
    ${filteredAchats.length>0?`<tfoot><tr><td colspan="3">TOTAL</td><td style="text-align:right">${fmt(filteredAchats.reduce((s,a)=>s+(a.qte||0),0))}</td><td></td><td style="text-align:right">${fmt(totalAchats)} DHS</td><td></td></tr></tfoot>`:''}
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

  const filtered      = fournisseurs.filter(f => !search || f.nom.toLowerCase().includes(search.toLowerCase()))
  const totalDettes   = filtered.reduce((s,f) => s+(f.solde||0), 0)

  return (
    <Layout title="Fournisseurs Briques" subtitle="Achats et paiements fournisseurs briques">
      <div className={`${isMobile ? '' : 'grid grid-cols-3 gap-6'}`}>

        {/* LEFT */}
        <div className="col-span-1">
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-bold text-gray-900">🏭 Fournisseurs Briques</div>
                <div className="text-xs text-red-500 mt-0.5">Total dû: <b>{fmt(totalDettes)} DHS</b></div>
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
                      <span className={`text-sm font-bold ${(f.solde||0)>0?'text-red-600':'text-green-600'}`}>{fmt(f.solde||0)} DHS</span>
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
                    <div className="font-bold text-blue-700 text-lg">{fmt(totalAchats)} DHS</div>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-green-50 border border-green-100">
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
                          <th className="th">Produit</th>
                          <th className="th text-right">Qté</th>
                          <th className="th text-right">Prix/u</th>
                          <th className="th text-right">Total DHS</th>
                          <th className="th">Client(s)</th>
                          <th className="th text-right">Qté distribuée</th>
                          <th className="th text-right">Écart</th>
                          <th className="th">Statut</th>
                        </tr></thead>
                        <tbody>
                          {achatsWithDistribution.map(a => {
                            const meta = DISTRIBUTION_STATUS_META[a.rowStatus]
                            const ecart = Math.round(((a.qte||0) - (a.totalDistribue||0)) * 1000) / 1000
                            return (
                              <tr key={a.id} className="hover:bg-blue-50">
                                <td className="td text-gray-500">
                                  {fmtDate(a.date)}
                                  {a._source==='legacy'&&<span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-400">legacy</span>}
                                </td>
                                <td className="td text-xs text-blue-600">
                                  {a.voyage_id ? `#${a.voyage_id}` : '—'}
                                </td>
                                <td className="td text-xs font-semibold">{a.type_brique||'—'}</td>
                                <td className="td text-right font-semibold">{fmt(a.qte)}</td>
                                <td className="td text-right text-gray-500">{fmtD(a.prix_achat)}</td>
                                <td className="td text-right font-bold text-blue-700">{fmt(a.total_achat)} DHS</td>
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
                              </tr>
                            )
                          })}
                          {achatsWithDistribution.length === 0 && <tr><td colSpan={10} className="td text-center text-gray-400 py-6">Aucun achat</td></tr>}
                        </tbody>
                        {achatsWithDistribution.length > 0 && (
                          <tfoot><tr>
                            <td className="tfoot-td" colSpan={3}>TOTAL ({filteredAchats.length})</td>
                            <td className="tfoot-td text-right">{fmt(filteredAchats.reduce((s,a)=>s+(a.qte||0),0))}</td>
                            <td className="tfoot-td"></td>
                            <td className="tfoot-td text-right text-blue-700">{fmt(totalAchats)} DHS</td>
                            <td className="tfoot-td" colSpan={4}></td>
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
