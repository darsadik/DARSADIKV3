import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmt, fmtD, fmtMoney, fmtDate, today, startOfMonth, useIsMobile, openPrintWindow } from '../../lib/utils'
import { printBaseCss, printHeader, printGeneratedDate, entityCard, summaryCards, printFooter } from '../../lib/printLayout'
import { fetchRemiseCarburantRate } from '../../lib/services/settings'
import { DEFAULT_REMISE_CARBURANT_RATE } from '../../lib/services/profitability'

const ADMIN = 'abdelhafidbaadi@gmail.com'

// One merged chronological ledger per supplier — every Fuel Purchase (Plein)
// linked via gasoil.fournisseur_id is a DEBIT, every Payment linked via
// paiements.gasoil_fourn_id (type_compte='gasoil') is a CREDIT. The running
// balance is never stored separately here — it's always replayed from these
// two sources, exactly like a Client/Supplier statement (§6 of the spec).
export default function FournisseursGasoil() {
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
  const [filterType,   setFilterType]   = useState('all')
  const [showAdd,      setShowAdd]      = useState(false)
  const [newNom,       setNewNom]       = useState('')
  const [remiseRate,   setRemiseRate]   = useState(DEFAULT_REMISE_CARBURANT_RATE)

  useEffect(() => { loadFournisseurs(); fetchRemiseCarburantRate().then(setRemiseRate) }, [])

  async function loadFournisseurs() {
    setLoading(true)
    const { data } = await supabase.from('gasoil_fournisseurs').select('*').order('solde', { ascending: false })
    setFournisseurs(data || [])
    setLoading(false)
  }

  async function selectFournisseur(f) {
    setSelected(f)
    setLoadingDetail(true)
    const [{ data: ac }, { data: pa }] = await Promise.all([
      supabase.from('gasoil').select('*').eq('fournisseur_id', f.id).order('date', { ascending: true }),
      supabase.from('paiements').select('*').eq('gasoil_fourn_id', f.id).eq('type_compte', 'gasoil').order('date', { ascending: true }),
    ])
    setAchats(ac || [])
    setPaiements(pa || [])
    setLoadingDetail(false)
  }

  async function addFournisseur(e) {
    e.preventDefault()
    if (!newNom.trim()) return
    await supabase.from('gasoil_fournisseurs').insert({ nom: newNom.trim(), solde: 0 })
    setNewNom(''); setShowAdd(false)
    loadFournisseurs()
  }

  async function deleteFournisseur(id) {
    if (!admin || !confirm('Supprimer ce fournisseur carburant ?')) return
    await supabase.from('gasoil_fournisseurs').delete().eq('id', id)
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

  // ── ONE MERGED CHRONOLOGICAL LEDGER (§5, §6) ──
  const allEntries = [
    ...achats.map(a => ({
      id: `p-${a.id}`, date: a.date, seq: `${a.date}_0_${String(a.id).padStart(10,'0')}`,
      type: 'purchase', label: a.adblue_qte ? 'Achat Carburant + AdBlue' : 'Achat Carburant',
      debit: (a.total || 0) + (a.adblue_total || 0), credit: 0,
      camion: a.camion_plaque || '—', bon: a.bon || '—', note: a.note || '',
      // Presentation-only enrichment (§ Unit Price / Liters) — never read by
      // the debit/credit/solde math above, so the ledger stays identical.
      qte: a.qte || 0, prixUnitaire: a.prix_unitaire || 0,
      adblueQte: a.adblue_qte || 0, adbluePrixUnitaire: a.adblue_prix_unitaire || 0,
    })),
    ...paiements.map(p => ({
      id: `c-${p.id}`, date: p.date, seq: `${p.date}_1_${String(p.id).padStart(10,'0')}`,
      type: 'payment', label: 'Paiement',
      debit: 0, credit: p.montant || 0,
      camion: '—', bon: p.mode || '—', note: p.note || '',
    })),
  ].sort((a, b) => a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0)

  // Opening balance = every entry before the period start, so the displayed
  // running balance stays correct no matter which period is selected — same
  // approach as the Grand Livre Fournisseur report on /gasoil.
  const beforeEntries = from ? allEntries.filter(e => e.date < from) : []
  const openingBalance = beforeEntries.reduce((s, e) => s + e.debit - e.credit, 0)
  const periodEntries = allEntries.filter(e => (!from || e.date >= from) && (!to || e.date <= to))

  let running = openingBalance
  const ledger = periodEntries.map(e => { running += e.debit - e.credit; return { ...e, solde: running } })
  const closingBalance = running

  const totalAchats    = periodEntries.reduce((s, e) => s + e.debit, 0)
  const totalPaiements = periodEntries.reduce((s, e) => s + e.credit, 0)

  // ── FUEL DISCOUNT — informational only, exactly like /gasoil's own Grand
  // Livre report: litres × remiseRate, gasoil only (never AdBlue). Restored
  // here as a presentation figure; it does NOT feed into the ledger's
  // debit/credit/solde columns or into gasoil_fournisseurs.solde above.
  const totalFuelLitres   = periodEntries.reduce((s, e) => s + (e.qte || 0), 0)
  const totalAdblueLitres = periodEntries.reduce((s, e) => s + (e.adblueQte || 0), 0)
  const fuelDiscount      = Math.round(totalFuelLitres * remiseRate * 100) / 100
  const netSupplierTotal  = Math.round((totalAchats - fuelDiscount) * 100) / 100

  function printFournisseur() {
    if (!selected) return
    const accent = '#f97316'
    const printDate = printGeneratedDate()
    const periode = filterType === 'all' ? 'Toutes dates' : `${fmtDate(from)} → ${fmtDate(to)}`
    const rows = (from && openingBalance !== 0 ? [{
      date: from, type: 'opening', label: "Solde d'ouverture", debit: 0, credit: 0, camion: '—', bon: '—', note: '', solde: openingBalance,
    }] : []).concat(ledger).map(e => {
      // ── unit price + liters subtext (§ Unit Price / Liters) — a compact
      // two-line addition under the label, purchase rows only, never a new
      // column, so nothing about the table's structure changes.
      const priceLines = e.type === 'purchase' && (e.qte || e.adblueQte) ? `<div style="font-size:9.5px;color:#94a3b8;margin-top:2px;font-weight:400;font-family:'Courier New',monospace">${
        e.qte ? `${fmtD(e.qte)} L × ${fmtMoney(e.prixUnitaire)} DH/L` : ''
      }${e.adblueQte ? `${e.qte ? '<br>' : ''}AdBlue: ${fmtD(e.adblueQte)} L × ${fmtMoney(e.adbluePrixUnitaire)} DH/L` : ''}</div>` : ''
      return `<tr>
      <td class="m" style="white-space:nowrap">${fmtDate(e.date)}</td>
      <td>${e.label}${priceLines}</td>
      <td class="m">${e.camion}</td>
      <td class="m">${e.bon}</td>
      <td class="r" style="color:${accent}">${e.debit ? `<b>+ ${fmtMoney(e.debit)}</b>` : '—'}</td>
      <td class="r" style="color:#16a34a">${e.credit ? `<b>− ${fmtMoney(e.credit)}</b>` : '—'}</td>
      <td class="r" style="font-weight:800;color:${e.solde>=0?'#dc2626':'#16a34a'}">${e.solde>=0?'+ ':'− '}${fmtMoney(Math.abs(e.solde))}</td>
    </tr>`
    }).join('')

    openPrintWindow(`<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Fournisseur Carburant — ${selected.nom}</title>
<style>
${printBaseCss(accent)}
</style></head><body>
${printHeader({ date: printDate })}
${entityCard({
  avatarText: '⛽',
  name: selected.nom,
  metaHtml: `<strong>Fournisseur Carburant</strong> &nbsp;·&nbsp; <strong>Solde dû:</strong> ${fmtMoney(selected.solde||0)} DHS &nbsp;·&nbsp; <strong>Période:</strong> ${periode}`,
})}
${summaryCards([
  { label: 'Achats période', value: `${fmtMoney(totalAchats)} DHS`, color: accent },
  { label: 'Payé période', value: `${fmtMoney(totalPaiements)} DHS`, color: '#16a34a' },
  { label: 'Solde total dû', value: `${fmtMoney(selected.solde||0)} DHS`, color: '#dc2626' },
])}
<div class="bdy">
<div class="sec-title">Relevé Chronologique</div>
<table>
  <thead><tr><th>Date</th><th>Opération</th><th>Camion</th><th>Bon / Mode</th><th class="r">Débit (+)</th><th class="r">Crédit (−)</th><th class="r">Solde</th></tr></thead>
  <tbody>${rows||'<tr><td colspan="7" style="text-align:center;color:#aaa">Aucune opération</td></tr>'}</tbody>
</table>
<div class="sec-title" style="margin-top:20px">Résumé</div>
<table style="width:100%;border-collapse:collapse">
  <tbody>
    <tr><td style="padding:6px 4px;font-size:12px;color:#374151">Total Litres Gasoil</td><td style="padding:6px 4px;text-align:right;font-family:'Courier New',monospace;font-weight:700">${fmt(totalFuelLitres)} L</td></tr>
    ${totalAdblueLitres > 0 ? `<tr><td style="padding:6px 4px;font-size:12px;color:#374151">Total Litres AdBlue</td><td style="padding:6px 4px;text-align:right;font-family:'Courier New',monospace;font-weight:700">${fmt(totalAdblueLitres)} L</td></tr>` : ''}
    <tr><td style="padding:6px 4px;font-size:12px;color:#374151">Total Achats</td><td style="padding:6px 4px;text-align:right;font-family:'Courier New',monospace;font-weight:700">${fmtMoney(totalAchats)} DHS</td></tr>
    <tr><td style="padding:6px 4px;font-size:12px;color:#374151">Remise Carburant</td><td style="padding:6px 4px;text-align:right;font-family:'Courier New',monospace;font-weight:700;color:#16a34a">− ${fmtMoney(fuelDiscount)} DHS</td></tr>
    <tr style="border-top:1.5px solid #e2e8f0"><td style="padding:8px 4px;font-size:12.5px;font-weight:800;color:#1e293b">Total Net Fournisseur</td><td style="padding:8px 4px;text-align:right;font-family:'Courier New',monospace;font-weight:900;color:${accent}">${fmtMoney(netSupplierTotal)} DHS</td></tr>
  </tbody>
</table>
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding:11px 18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px">
  <div>
    <div style="font-size:11.5px;font-weight:700;color:#9a3412">Solde total dû</div>
    <div style="font-size:9.5px;color:#c2703d;margin-top:2px">${periode}</div>
  </div>
  <div style="font-size:21px;font-weight:900;color:${accent};line-height:1">${fmtMoney(selected.solde||0)}<span style="font-size:11px;font-weight:600;margin-left:3px;color:#9a3412">DHS</span></div>
</div>
${printFooter(printDate)}
</div></body></html>`)
  }

  const filtered    = fournisseurs.filter(f => !search || f.nom.toLowerCase().includes(search.toLowerCase()))
  const totalDettes = filtered.reduce((s, f) => s + (f.solde || 0), 0)

  return (
    <Layout title="Fournisseurs Carburant" subtitle="Achats et paiements fournisseurs carburant (Petrom, Afriquia, Winxo, Shell...)">
      <div className={`${isMobile ? '' : 'grid grid-cols-3 gap-6'}`}>

        {/* LEFT */}
        <div className="col-span-1">
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-bold text-gray-900">⛽ Fournisseurs Carburant</div>
                <div className="text-xs text-red-500 mt-0.5">Total dû: <b>{fmtMoney(totalDettes)} DHS</b></div>
              </div>
              {admin && <button onClick={()=>setShowAdd(!showAdd)} className="btn-primary text-xs px-3 py-1.5" style={{background:'#f97316'}}>+ Fournisseur</button>}
            </div>
            {showAdd && (
              <form onSubmit={addFournisseur} className="flex gap-2 mb-3">
                <input className="input flex-1 text-xs" placeholder="ex: Petrom, Afriquia, Winxo..." value={newNom} onChange={e=>setNewNom(e.target.value)} required autoFocus />
                <button type="submit" className="btn-primary text-xs px-3" style={{background:'#f97316'}}>✓</button>
                <button type="button" onClick={()=>setShowAdd(false)} className="btn-secondary text-xs px-2">✕</button>
              </form>
            )}
            <input className="input text-sm mb-3" placeholder="🔍 Rechercher..." value={search} onChange={e=>setSearch(e.target.value)} />
            {loading ? <div className="text-center py-6 text-gray-400 text-sm">Chargement...</div> : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {filtered.map(f => (
                  <div key={f.id} onClick={()=>selectFournisseur(f)}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${selected?.id===f.id?'bg-orange-50 border border-orange-200':'hover:bg-gray-50 border border-transparent'}`}>
                    <div className="font-semibold text-sm text-gray-900">{f.nom}</div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${(f.solde||0)>0?'text-red-600':'text-green-600'}`}>{fmtMoney(f.solde||0)} DHS</span>
                      {admin && <button onClick={e=>{e.stopPropagation();deleteFournisseur(f.id)}} className="text-red-300 hover:text-red-500 text-xs">✕</button>}
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && <div className="text-center py-6 text-gray-400 text-sm">Aucun fournisseur carburant</div>}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="col-span-2">
          {!selected ? (
            <div className="card text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">⛽</div>
              <div className="font-semibold">Sélectionnez un fournisseur</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="card">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-black" style={{background:'#f97316'}}>
                      {selected.nom[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-xl text-gray-900">{selected.nom}</div>
                      <div className="text-xs text-orange-700 font-semibold mt-0.5">Fournisseur Carburant</div>
                    </div>
                  </div>
                  <button onClick={printFournisseur} className="btn-primary text-xs px-3 py-1.5" style={{background:'#f97316'}}>🖨️ PDF</button>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="text-center p-3 rounded-xl bg-orange-50 border border-orange-100">
                    <div className="text-xs text-orange-600 font-semibold">Achats période</div>
                    <div className="font-bold text-orange-700 text-lg">{fmtMoney(totalAchats)} DHS</div>
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
                      style={filterType===t?{background:'#f97316'}:{}}>
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
                <div className="card">
                  <h3 className="font-bold text-gray-900 mb-3">📒 Relevé Chronologique ({ledger.length})</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr>
                        <th className="th">Date</th>
                        <th className="th">Opération</th>
                        <th className="th">Camion</th>
                        <th className="th">Bon / Mode</th>
                        <th className="th">Note</th>
                        <th className="th text-right">Débit (+)</th>
                        <th className="th text-right">Crédit (−)</th>
                        <th className="th text-right">Solde</th>
                      </tr></thead>
                      <tbody>
                        {from && openingBalance !== 0 && (
                          <tr className="bg-gray-50">
                            <td className="td text-gray-500">{fmtDate(from)}</td>
                            <td className="td font-semibold text-gray-600">Solde d'ouverture</td>
                            <td className="td text-gray-400">—</td>
                            <td className="td text-gray-400">—</td>
                            <td className="td text-gray-400">—</td>
                            <td className="td text-right text-gray-400">—</td>
                            <td className="td text-right text-gray-400">—</td>
                            <td className={`td text-right font-bold ${openingBalance>=0?'text-red-600':'text-green-600'}`}>
                              {openingBalance>=0?'+ ':'− '}{fmtMoney(Math.abs(openingBalance))}
                            </td>
                          </tr>
                        )}
                        {ledger.map(e => (
                          <tr key={e.id} className={e.type==='purchase' ? 'hover:bg-orange-50' : 'hover:bg-green-50'}>
                            <td className="td text-gray-500">{fmtDate(e.date)}</td>
                            <td className="td">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${e.type==='purchase'?'bg-orange-100 text-orange-700':'bg-green-100 text-green-700'}`}>
                                {e.type==='purchase' ? '⛽' : '💸'} {e.label}
                              </span>
                              {e.type === 'purchase' && (e.qte > 0 || e.adblueQte > 0) && (
                                <div className="text-[10px] text-gray-400 mt-1 leading-tight">
                                  {e.qte > 0 && <div>{fmtD(e.qte)} L × {fmtMoney(e.prixUnitaire)} DH/L</div>}
                                  {e.adblueQte > 0 && <div>AdBlue: {fmtD(e.adblueQte)} L × {fmtMoney(e.adbluePrixUnitaire)} DH/L</div>}
                                </div>
                              )}
                            </td>
                            <td className="td text-xs text-gray-600">{e.camion}</td>
                            <td className="td text-xs text-gray-600">{e.bon}</td>
                            <td className="td text-xs text-gray-400">{e.note || '—'}</td>
                            <td className="td text-right font-bold text-orange-700">{e.debit ? `+ ${fmtMoney(e.debit)}` : '—'}</td>
                            <td className="td text-right font-bold text-green-600">{e.credit ? `− ${fmtMoney(e.credit)}` : '—'}</td>
                            <td className={`td text-right font-bold ${e.solde>=0?'text-red-600':'text-green-600'}`}>
                              {e.solde>=0?'+ ':'− '}{fmtMoney(Math.abs(e.solde))}
                            </td>
                          </tr>
                        ))}
                        {ledger.length === 0 && <tr><td colSpan={8} className="td text-center text-gray-400 py-8">Aucune opération pour cette période</td></tr>}
                      </tbody>
                      {ledger.length > 0 && (
                        <tfoot><tr>
                          <td className="tfoot-td" colSpan={5}>TOTAL période</td>
                          <td className="tfoot-td text-right text-orange-700">+ {fmtMoney(totalAchats)} DHS</td>
                          <td className="tfoot-td text-right text-green-700">− {fmtMoney(totalPaiements)} DHS</td>
                          <td className={`tfoot-td text-right ${closingBalance>=0?'text-red-600':'text-green-600'}`}>
                            {closingBalance>=0?'+ ':'− '}{fmtMoney(Math.abs(closingBalance))}
                          </td>
                        </tr></tfoot>
                      )}
                    </table>
                  </div>
                  {ledger.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="text-center p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                        <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Litres Gasoil</div>
                        <div className="font-bold text-gray-700 text-sm mt-0.5">{fmt(totalFuelLitres)} L</div>
                      </div>
                      {totalAdblueLitres > 0 && (
                        <div className="text-center p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Litres AdBlue</div>
                          <div className="font-bold text-gray-700 text-sm mt-0.5">{fmt(totalAdblueLitres)} L</div>
                        </div>
                      )}
                      <div className="text-center p-2.5 rounded-lg bg-orange-50 border border-orange-100">
                        <div className="text-[10px] text-orange-600 font-semibold uppercase tracking-wide">Remise Carburant</div>
                        <div className="font-bold text-orange-700 text-sm mt-0.5">− {fmtMoney(fuelDiscount)} DHS</div>
                      </div>
                      <div className="text-center p-2.5 rounded-lg bg-gray-100 border border-gray-200">
                        <div className="text-[10px] text-gray-600 font-semibold uppercase tracking-wide">Total Net Fournisseur</div>
                        <div className="font-bold text-gray-800 text-sm mt-0.5">{fmtMoney(netSupplierTotal)} DHS</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
