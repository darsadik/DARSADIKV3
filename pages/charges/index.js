import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmtMoney, fmtDate, today, startOfMonth, useIsMobile, openPrintWindow } from '../../lib/utils'
import { useVoyageTransactionEdit } from '../../lib/hooks/useVoyageTransactionEdit'
import EditTransactionModal from '../../components/voyage/EditTransactionModal'

const CATEGORIES = [
  { key: 'ouvriers',          label: "Ouvriers / Main d'œuvre",  icon: '👷' },
  { key: 'chauffeur',         label: 'Chauffeur',                 icon: '🧑‍✈️' },
  { key: 'nourriture',        label: 'Nourriture',                icon: '🍽️' },
  { key: 'autoroute',         label: 'Autoroute / Péage',         icon: '🛣️' },
  { key: 'gendarmerie',       label: 'Gendarmerie',               icon: '🚔' },
  { key: 'controle',          label: 'Contrôle / Police',         icon: '🛂' },
  { key: 'reparation_camion', label: 'Réparation camion',         icon: '🔧' },
  { key: 'pneus',             label: 'Pneus / Réparation',        icon: '🔩' },
  { key: 'chargement',        label: "Chargement / Teb'ia",       icon: '📦' },
  { key: 'lavage_vidange',    label: 'Lavage / Vidange',          icon: '🚿' },
  { key: 'transport',         label: 'Transport / Mrkob',         icon: '🚌' },
  { key: 'gardien',           label: 'Gardien / Sécurité',        icon: '💂' },
  { key: 'tractopelle',       label: 'Tractopelle / Trax',        icon: '🚜' },
  { key: 'balance',           label: 'Balance / Poids',           icon: '⚖️' },
  { key: 'samsar',            label: 'Samsar / Courtage',         icon: '🤝' },
  { key: 'adblue',            label: 'AdBlue',                    icon: '🧴' },
  { key: 'autres',            label: 'Autres charges',            icon: '➕' },
]


export default function Charges() {
  const { user } = useAuth()
  const router   = useRouter()
  const isMobile = useIsMobile()

  const [voyageChg,    setVoyageChg]    = useState([])
  const [camions,      setCamions]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [activeTab,    setActiveTab]    = useState('voyage')
  const [filterFrom,   setFilterFrom]   = useState(startOfMonth())
  const [filterTo,     setFilterTo]     = useState(today())
  const [filterCamion, setFilterCamion] = useState('')
  const [filterCat,    setFilterCat]    = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: vch }, { data: ca }] = await Promise.all([
      supabase.from('voyage_charges').select('*, voyages(id, reference, date_depart, camion_id, camion_plaque)').order('date_charge', { ascending: false }),
      supabase.from('camions').select('*').order('plaque'),
    ])
    setVoyageChg(vch || [])
    setCamions(ca || [])
    setLoading(false)
  }

  // ── EDIT (same modal as the voyage page) — rows here are already the true
  // voyage_charges row, no mirror to resolve. ──
  const {
    editRow: voyEditRow, editForm: voyEditForm, setEditForm: setVoyEditForm,
    editSaving: voyEditSaving, editError: voyEditError,
    openEdit: openVoyEdit, closeEdit: closeVoyEdit, save: saveVoyEdit,
  } = useVoyageTransactionEdit({ onSaved: loadAll })
  useEffect(() => { if (voyEditError) alert(voyEditError) }, [voyEditError])

  // Filter voyage charges
  const filteredVoyage = voyageChg.filter(c => {
    if (filterFrom   && c.date_charge < filterFrom) return false
    if (filterTo     && c.date_charge > filterTo)   return false
    if (filterCat    && c.categorie !== filterCat)  return false
    if (filterCamion && c.voyages?.camion_plaque !== filterCamion) return false
    return true
  })

  // ── BY CAMION ANALYTICS ──────────────────────────────────────────────────────
  const uniqueCamionPlaques = [...new Set(
    voyageChg.map(c => c.voyages?.camion_plaque).filter(Boolean)
  )].sort()

  // Group by camion → then by month → then by day
  const byCamion = {}
  filteredVoyage.forEach(c => {
    const plaque = c.voyages?.camion_plaque || 'Sans camion'
    const month  = c.date_charge ? c.date_charge.slice(0,7) : '—'  // YYYY-MM
    const day    = c.date_charge || '—'

    if (!byCamion[plaque]) byCamion[plaque] = { plaque, total: 0, byMonth: {}, items: [] }
    byCamion[plaque].total += c.montant || 0
    byCamion[plaque].items.push(c)

    if (!byCamion[plaque].byMonth[month]) byCamion[plaque].byMonth[month] = { total: 0, byDay: {} }
    byCamion[plaque].byMonth[month].total += c.montant || 0

    if (!byCamion[plaque].byMonth[month].byDay[day]) byCamion[plaque].byMonth[month].byDay[day] = 0
    byCamion[plaque].byMonth[month].byDay[day] += c.montant || 0
  })

  // Month label helper
  const MONTHS_FR = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc']
  const fmtMonth = ym => {
    if (!ym || ym === '—') return '—'
    const [y, m] = ym.split('-')
    return MONTHS_FR[parseInt(m)-1] + ' ' + y
  }

  // KPIs from voyage charges
  const totalVoyage  = filteredVoyage.reduce((s,c) => s+(c.montant||0), 0)
  const totalEntrepr = filteredVoyage.filter(c=>!c.facture_client).reduce((s,c) => s+(c.montant||0), 0)
  const totalClient  = filteredVoyage.filter(c=>c.facture_client).reduce((s,c) => s+(c.montant||0), 0)

  // Group by category for breakdown
  const byCategory = {}
  filteredVoyage.forEach(c => {
    const cat = CATEGORIES.find(x=>x.key===c.categorie) || { key: c.categorie, label: c.description||c.categorie, icon: '➕' }
    if (!byCategory[cat.key]) byCategory[cat.key] = { ...cat, total: 0, count: 0, items: [] }
    byCategory[cat.key].total += c.montant || 0
    byCategory[cat.key].count++
    byCategory[cat.key].items.push(c)
  })

  function exportCSV() {
    const rows = [
      ['Date','Voyage','Catégorie','Description','Montant DHS','Facturé client','Client'],
      ...filteredVoyage.map(c => [
        fmtDate(c.date_charge),
        c.voyages?.reference || c.voyage_id || '',
        c.categorie, c.description||'',
        c.montant||0,
        c.facture_client ? 'Oui' : 'Non',
        c.client_nom||'',
      ])
    ]
    const csv = rows.map(r => r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'}))
    a.download = `Charges-${filterFrom}-${filterTo}.csv`
    a.click()
  }

  function printCharges() {
    const rows = filteredVoyage.map(c => `<tr>
      <td>${fmtDate(c.date_charge)}</td>
      <td>${c.voyages?.reference||'—'}</td>
      <td>${c.description||c.categorie||'—'}</td>
      <td>${c.facture_client?`✓ ${c.client_nom||''}`:'—'}</td>
      <td style="text-align:right"><b>${fmtMoney(c.montant)} DHS</b></td>
    </tr>`).join('')
    openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>*{-webkit-print-color-adjust:exact !important}
    body{font-family:Arial,sans-serif;padding:28px;font-size:12px}
    h1{font-size:18px;margin:0 0 4px}
    table{width:100%;border-collapse:collapse}
    th{background:#1e3a5f !important;color:#fff !important;padding:8px;text-align:left;font-size:10px}
    td{padding:7px 8px;border-bottom:1px solid #e2e8f0;font-size:11px}
    tfoot td{background:#f1f5f9 !important;font-weight:800 !important}
    @media print{button{display:none !important}}</style></head><body>
    <h1>💸 DAR SADIK — Charges Voyages</h1>
    <div style="color:#555;font-size:11px;margin-bottom:16px">${fmtDate(filterFrom)} → ${fmtDate(filterTo)}</div>
    <table><thead><tr>
      <th>Date</th><th>Voyage</th><th>Description</th><th>Facturé client</th>
      <th style="text-align:right">Montant</th>
    </tr></thead>
    <tbody>${rows||'<tr><td colspan="5" style="text-align:center">Aucune charge</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="4">TOTAL (${filteredVoyage.length})</td>
      <td style="text-align:right">${fmtMoney(totalVoyage)} DHS</td>
    </tr></tfoot></table></body></html>`)
  }

  const tabs = [
    { key: 'voyage',   label: `🚛 By Voyage (${filteredVoyage.length})` },
    { key: 'camion',   label: `🚚 By Camion (${Object.keys(byCamion).length})` },
    { key: 'category', label: `📊 By Category` },
  ]

  return (
    <Layout title="Charges" subtitle="Suivi des charges et dépenses par voyage">
      <EditTransactionModal
        editRow={voyEditRow} editForm={voyEditForm} setEditForm={setVoyEditForm}
        onSave={saveVoyEdit} onCancel={closeVoyEdit} saving={voyEditSaving}
      />

      {/* INFO BANNER */}
      <div className="card mb-4 flex items-center gap-3" style={{background:'#eff6ff',border:'1px solid #bfdbfe'}}>
        <span className="text-2xl">ℹ️</span>
        <div className="flex-1">
          <div className="font-semibold text-blue-800 text-sm">Saisie centralisée via Voyage</div>
          <div className="text-xs text-blue-600 mt-0.5">
            Les charges sont enregistrées dans la page Voyage. Cette page est dédiée au suivi et aux rapports.
          </div>
        </div>
        <button onClick={() => router.push('/voyages')}
          className="btn-primary text-xs px-3 py-1.5" style={{background:'#1d4ed8'}}>
          → Aller aux Voyages
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="stat-card border border-red-100 bg-red-50">
          <div className="stat-label text-red-600">Total charges</div>
          <div className="stat-value text-red-600">{fmtMoney(totalVoyage)} DHS</div>
          <div className="stat-sub">{filteredVoyage.length} opération(s)</div>
        </div>
        <div className="stat-card border border-orange-100 bg-orange-50">
          <div className="stat-label text-orange-600">Coûts entreprise</div>
          <div className="stat-value text-orange-700">{fmtMoney(totalEntrepr)} DHS</div>
          <div className="stat-sub">Non facturées au client</div>
        </div>
        <div className="stat-card border border-amber-100 bg-amber-50">
          <div className="stat-label text-amber-600">Facturées client</div>
          <div className="stat-value text-amber-700">{fmtMoney(totalClient)} DHS</div>
          <div className="stat-sub">Charges récupérées</div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="card mb-4">
        <div className={`grid ${isMobile?'grid-cols-2':'grid-cols-2 lg:grid-cols-5'} gap-3 items-end`}>
          <div><label className="label">From</label>
            <input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)}/></div>
          <div><label className="label">To</label>
            <input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)}/></div>
          <div><label className="label">Camion</label>
            <select className="input" value={filterCamion} onChange={e=>setFilterCamion(e.target.value)}>
              <option value="">All camions</option>
              {uniqueCamionPlaques.map(p=><option key={p}>{p}</option>)}
            </select></div>
          <div><label className="label">Category</label>
            <select className="input" value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map(c=><option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
            </select></div>
          <div className="flex gap-2 items-end">
            <button onClick={()=>{setFilterFrom(startOfMonth());setFilterTo(today());setFilterCamion('');setFilterCat('')}}
              className="btn-secondary text-xs flex-1 justify-center">↺ Reset</button>
            <button onClick={printCharges} className="btn-primary text-xs px-2 py-1.5" style={{background:'#4f46e5'}}>🖨️</button>
            <button onClick={exportCSV} className="btn-primary text-xs px-2 py-1.5" style={{background:'#16a34a'}}>📊</button>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`text-sm font-semibold px-4 py-2 rounded-xl border transition-all ${
              activeTab===t.key ? 'bg-brand-700 text-white border-brand-700' : 'bg-white text-gray-600 border-gray-200'
            }`}>{t.label}</button>
        ))}
      </div>

      {loading ? <div className="card text-center py-10 text-gray-400">Loading...</div> : (
        <>
          {/* BY VOYAGE */}
          {activeTab === 'voyage' && (
            <div className="card">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr>
                    <th className="th">Date</th>
                    <th className="th">Voyage</th>
                    <th className="th">Category</th>
                    <th className="th">Description</th>
                    <th className="th">Billed to client</th>
                    <th className="th text-right">Amount DHS</th>
                    {activeTab==='voyage' && <th className="th"></th>}
                  </tr></thead>
                  <tbody>
                    {filteredVoyage.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50"
                        style={c.facture_client?{background:'#fffbeb'}:{}}>
                        <td className="td text-gray-500">{fmtDate(c.date_charge)}</td>
                        <td className="td">
                          {c.voyage_id ? (
                            <button onClick={()=>router.push(`/voyages/${c.voyage_id}`)}
                              className="text-xs text-blue-600 hover:underline font-semibold">
                              {c.voyages?.reference || `#${c.voyage_id}`}
                            </button>
                          ) : '—'}
                        </td>
                        <td className="td">
                          <span className="text-xs font-semibold">
                            {CATEGORIES.find(x=>x.key===c.categorie)?.icon} {c.categorie}
                          </span>
                        </td>
                        <td className="td text-gray-500 text-xs">{c.description||'—'}</td>
                        <td className="td">
                          {c.facture_client
                            ? <span className="text-xs font-semibold text-amber-700">✓ {c.client_nom||'client'}</span>
                            : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="td text-right font-bold text-red-600">{fmtMoney(c.montant)} DHS</td>
                        <td className="td whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button onClick={()=>openVoyEdit('charge', c, c.voyages?.camion_id)}
                              className="text-xs text-blue-500 hover:underline">✎ Modifier</button>
                            <button onClick={()=>router.push(`/voyages/${c.voyage_id}`)}
                              className="text-xs text-blue-500 hover:underline">→ Voyage</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredVoyage.length === 0 && (
                      <tr><td colSpan={7} className="td text-center text-gray-400 py-10">
                        No charges for this period
                      </td></tr>
                    )}
                  </tbody>
                  {filteredVoyage.length > 0 && (
                    <tfoot><tr>
                      <td className="tfoot-td" colSpan={5}>TOTAL ({filteredVoyage.length})</td>
                      <td className="tfoot-td text-right text-red-600">{fmtMoney(totalVoyage)} DHS</td>
                      <td className="tfoot-td"></td>
                    </tr></tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* BY CAMION */}
          {activeTab === 'camion' && (
            <div className="space-y-4">
              {Object.values(byCamion).sort((a,b)=>b.total-a.total).map(cam => (
                <div key={cam.plaque} className="card">
                  {/* Camion header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">🚛</div>
                      <div>
                        <div className="font-bold text-gray-900 text-lg">{cam.plaque}</div>
                        <div className="text-xs text-gray-400">{cam.items.length} opération(s)</div>
                      </div>
                    </div>
                    <div className="text-xl font-bold text-red-600">{fmtMoney(cam.total)} DHS</div>
                  </div>

                  {/* Monthly breakdown */}
                  <div className="space-y-3">
                    {Object.entries(cam.byMonth).sort((a,b)=>b[0].localeCompare(a[0])).map(([month, mData]) => (
                      <div key={month}>
                        {/* Month row */}
                        <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                          style={{background:'#f8fafc',borderLeft:'3px solid #dc2626'}}>
                          <span className="font-semibold text-gray-700 text-sm">📅 {fmtMonth(month)}</span>
                          <span className="font-bold text-red-600">{fmtMoney(mData.total)} DHS</span>
                        </div>

                        {/* Daily breakdown */}
                        <div className="ml-4 mt-1 space-y-0.5">
                          {Object.entries(mData.byDay).sort((a,b)=>b[0].localeCompare(a[0])).map(([day, total]) => (
                            <div key={day} className="flex items-center justify-between px-3 py-1.5
                              text-xs text-gray-500 border-b border-gray-50 hover:bg-gray-50 rounded">
                              <span>{fmtDate(day)}</span>
                              <span className="font-semibold text-gray-700">{fmtMoney(total)} DHS</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Category breakdown for this camion */}
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Breakdown by category</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {(() => {
                        const catTotals = {}
                        cam.items.forEach(item => {
                          const cat = CATEGORIES.find(x=>x.key===item.categorie) || {key:item.categorie,label:item.categorie,icon:'➕'}
                          if (!catTotals[cat.key]) catTotals[cat.key] = { ...cat, total: 0 }
                          catTotals[cat.key].total += item.montant || 0
                        })
                        return Object.values(catTotals).sort((a,b)=>b.total-a.total).map(cat => (
                          <div key={cat.key} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 text-xs">
                            <span>{cat.icon} {cat.label}</span>
                            <span className="font-bold text-red-600">{fmtMoney(cat.total)}</span>
                          </div>
                        ))
                      })()}
                    </div>
                  </div>
                </div>
              ))}
              {Object.keys(byCamion).length === 0 && (
                <div className="card text-center py-10 text-gray-400">No charges for this period</div>
              )}
            </div>
          )}

          {/* BY CATEGORY */}
          {activeTab === 'category' && (
            <div className="space-y-3">
              {Object.values(byCategory).sort((a,b)=>b.total-a.total).map(cat => (
                <div key={cat.key} className="card">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{cat.icon}</span>
                      <div>
                        <div className="font-bold text-gray-900">{cat.label}</div>
                        <div className="text-xs text-gray-400">{cat.count} opération(s)</div>
                      </div>
                    </div>
                    <div className="text-lg font-bold text-red-600">{fmtMoney(cat.total)} DHS</div>
                  </div>
                  <div className="space-y-1">
                    {cat.items.map(c => (
                      <div key={c.id} className="flex justify-between items-center text-xs text-gray-500 py-1 border-t border-gray-50">
                        <span>{fmtDate(c.date_charge)}</span>
                        <span>{c.voyages?.reference ? (
                          <button onClick={()=>router.push(`/voyages/${c.voyage_id}`)}
                            className="text-blue-500 hover:underline">{c.voyages.reference}</button>
                        ) : '—'}</span>
                        <span className="font-semibold text-red-600">{fmtMoney(c.montant)} DHS</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(byCategory).length === 0 && (
                <div className="card text-center py-10 text-gray-400">No charges for this period</div>
              )}
            </div>
          )}
        </>
      )}
    </Layout>
  )
}
