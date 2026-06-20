import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmt, fmtDate, today, startOfMonth, useIsMobile, openPrintWindow } from '../../lib/utils'

export default function Retours() {
  const { user } = useAuth()
  const router   = useRouter()
  const isMobile = useIsMobile()
  const admin    = user?.email === 'abdelhafidbaadi@gmail.com'

  const [retours,      setRetours]      = useState([])
  const [camions,      setCamions]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [filterFrom,   setFilterFrom]   = useState(startOfMonth())
  const [filterTo,     setFilterTo]     = useState(today())
  const [filterCamion, setFilterCamion] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [editRow,      setEditRow]      = useState(null)
  const [editPaye,     setEditPaye]     = useState('')
  const [editSaving,   setEditSaving]   = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: r }, { data: ca }] = await Promise.all([
      supabase.from('retours_transport').select('*').order('date', { ascending: false }),
      supabase.from('camions').select('*').order('plaque'),
    ])
    setRetours(r || [])
    setCamions(ca || [])
    setLoading(false)
  }

  async function updatePaiement(r) {
    setEditSaving(true)
    const paye    = parseFloat(editPaye) || 0
    const restant = Math.max(0, (r.montant || 0) - paye)
    await supabase.from('retours_transport').update({ montant_paye: paye, restant }).eq('id', r.id)
    setEditRow(null)
    setEditSaving(false)
    loadAll()
  }

  async function deleteRetour(r) {
    if (!admin || !confirm('Delete this retour?')) return
    await supabase.from('retours_transport').delete().eq('id', r.id)
    loadAll()
  }

  function exportCSV() {
    const rows = [
      ['Date','Client','Destination','Camion','Montant DHS','Payé DHS','Restant DHS','Statut','Voyage','Note'],
      ...filtered.map(r => [
        fmtDate(r.date), r.client_nom, r.destination||'', r.camion_plaque||'',
        r.montant||0, r.montant_paye||0, r.restant||0,
        (r.restant||0)===0?'Payé':(r.montant_paye||0)>0?'Partiel':'Impayé',
        r.voyage_id||'', r.note||'',
      ])
    ]
    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'}))
    a.download = `Retours-${filterFrom}-${filterTo}.csv`
    a.click()
  }

  function printRetours() {
    const rows = filtered.map(r => {
      const s = getStatus(r)
      return `<tr>
        <td>${fmtDate(r.date)}</td><td><b>${r.client_nom}</b></td>
        <td>${r.destination||'—'}</td><td>${r.camion_plaque||'—'}</td>
        <td style="text-align:right"><b>${fmt(r.montant)} DHS</b></td>
        <td style="text-align:right;color:#16a34a">${fmt(r.montant_paye||0)} DHS</td>
        <td style="text-align:right;color:${(r.restant||0)>0?'#dc2626':'#16a34a'}">${fmt(r.restant||0)} DHS</td>
        <td><span style="background:${s.bg};color:${s.color};padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700">${s.label}</span></td>
        <td>${r.note||'—'}</td>
      </tr>`
    }).join('')
    openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>*{-webkit-print-color-adjust:exact !important}
    body{font-family:Arial,sans-serif;padding:28px;font-size:12px}
    h1{font-size:18px;margin:0 0 4px}
    table{width:100%;border-collapse:collapse}
    th{background:#1e3a5f !important;color:#fff !important;padding:8px;text-align:left;font-size:10px}
    td{padding:7px 8px;border-bottom:1px solid #e2e8f0;font-size:11px}
    tfoot td{background:#f1f5f9 !important;font-weight:800 !important}
    @media print{button{display:none !important}}</style></head><body>
    <h1>↩️ DAR SADIK — Retours Transport</h1>
    <div style="color:#555;font-size:11px;margin-bottom:16px">${fmtDate(filterFrom)} → ${fmtDate(filterTo)}</div>
    <table><thead><tr>
      <th>Date</th><th>Client</th><th>Destination</th><th>Camion</th>
      <th style="text-align:right">Montant</th><th style="text-align:right">Payé</th>
      <th style="text-align:right">Restant</th><th>Statut</th><th>Note</th>
    </tr></thead>
    <tbody>${rows||'<tr><td colspan="9" style="text-align:center">Aucun retour</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="4">TOTAL (${filtered.length})</td>
      <td style="text-align:right">${fmt(totalMontant)} DHS</td>
      <td style="text-align:right;color:#16a34a">${fmt(totalPaye)} DHS</td>
      <td style="text-align:right;color:#dc2626">${fmt(totalRestant)} DHS</td>
      <td colspan="2"></td>
    </tr></tfoot>
    </table></body></html>`)
  }

  const filtered = retours.filter(r => {
    if (filterFrom   && r.date < filterFrom) return false
    if (filterTo     && r.date > filterTo)   return false
    if (filterCamion && r.camion_plaque !== filterCamion) return false
    if (filterStatus) {
      const re = r.restant||0, pa = r.montant_paye||0
      if (filterStatus==='unpaid'  && pa !== 0) return false
      if (filterStatus==='partial' && !(pa>0 && re>0)) return false
      if (filterStatus==='paid'    && re !== 0) return false
    }
    return true
  })

  const totalMontant = filtered.reduce((s,r) => s+(r.montant||0), 0)
  const totalPaye    = filtered.reduce((s,r) => s+(r.montant_paye||0), 0)
  const totalRestant = filtered.reduce((s,r) => s+(r.restant||0), 0)
  const paidCount    = filtered.filter(r=>(r.restant||0)===0).length
  const unpaidCount  = filtered.filter(r=>(r.montant_paye||0)===0).length
  const uniqueCamions = [...new Set(retours.map(r=>r.camion_plaque).filter(Boolean))]

  function getStatus(r) {
    if ((r.restant||0)===0)       return { label:'✓ Payé',    bg:'#dcfce7', color:'#16a34a' }
    if ((r.montant_paye||0)>0)    return { label:'⚠ Partiel', bg:'#fef3c7', color:'#d97706' }
    return                               { label:'⬤ Impayé',  bg:'#fee2e2', color:'#dc2626' }
  }

  return (
    <Layout title="Retours Transport" subtitle="Suivi et encaissement des retours">

      {/* INFO BANNER */}
      <div className="card mb-4 flex items-center gap-3" style={{background:'#eff6ff',border:'1px solid #bfdbfe'}}>
        <span className="text-2xl">ℹ️</span>
        <div className="flex-1">
          <div className="font-semibold text-blue-800 text-sm">Saisie centralisée via Voyage</div>
          <div className="text-xs text-blue-600 mt-0.5">
            Les retours sont créés dans la page Voyage. Cette page est dédiée au suivi et aux rapports.
          </div>
        </div>
        <button onClick={() => router.push('/voyages')}
          className="btn-primary text-xs px-3 py-1.5" style={{background:'#1d4ed8'}}>
          → Aller aux Voyages
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card border border-blue-100 bg-blue-50">
          <div className="stat-label text-blue-600">Total revenus</div>
          <div className="stat-value text-blue-700">{fmt(totalMontant)} DHS</div>
          <div className="stat-sub">{filtered.length} retour(s)</div>
        </div>
        <div className="stat-card border border-green-100 bg-green-50">
          <div className="stat-label text-green-600">Encaissé</div>
          <div className="stat-value text-green-700">{fmt(totalPaye)} DHS</div>
          <div className="stat-sub">{paidCount} payé(s)</div>
        </div>
        <div className="stat-card border border-red-100 bg-red-50">
          <div className="stat-label text-red-600">Reste à encaisser</div>
          <div className="stat-value text-red-600">{fmt(totalRestant)} DHS</div>
          <div className="stat-sub">{unpaidCount} impayé(s)</div>
        </div>
        <div className="stat-card border border-purple-100 bg-purple-50">
          <div className="stat-label text-purple-600">Taux recouvrement</div>
          <div className="stat-value text-purple-700">
            {totalMontant > 0 ? Math.round(totalPaye/totalMontant*100) : 0}%
          </div>
          <div className="stat-sub">du total</div>
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
              <option value="">All</option>
              {uniqueCamions.map(c=><option key={c}>{c}</option>)}
            </select></div>
          <div><label className="label">Status</label>
            <select className="input" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
              <option value="">All</option>
              <option value="unpaid">⬤ Unpaid</option>
              <option value="partial">⚠ Partial</option>
              <option value="paid">✓ Paid</option>
            </select></div>
          <div className="flex gap-2 items-end">
            <button onClick={()=>{setFilterFrom(startOfMonth());setFilterTo(today());setFilterCamion('');setFilterStatus('')}}
              className="btn-secondary text-xs flex-1 justify-center">↺ Reset</button>
            <button onClick={printRetours} className="btn-primary text-xs px-2 py-1.5" style={{background:'#4f46e5'}}>🖨️</button>
            <button onClick={exportCSV} className="btn-primary text-xs px-2 py-1.5" style={{background:'#16a34a'}}>📊</button>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">↩️ Retours Transport</h3>
            <div className="text-xs text-gray-400 mt-1">
              {filtered.length} record(s) — Total: <b className="text-blue-700">{fmt(totalMontant)} DHS</b> ·
              Collected: <b className="text-green-600">{fmt(totalPaye)} DHS</b> ·
              Remaining: <b className="text-red-600">{fmt(totalRestant)} DHS</b>
            </div>
          </div>
        </div>

        {loading ? <div className="text-center py-10 text-gray-400">Loading...</div> : isMobile ? (
          <div className="space-y-3">
            {filtered.map(r => {
              const s = getStatus(r)
              return (
                <div key={r.id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-bold text-gray-900">{r.client_nom}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {fmtDate(r.date)}{r.camion_plaque ? ` · 🚛 ${r.camion_plaque}` : ''}
                      </div>
                      {r.destination && <div className="text-xs text-blue-600 mt-0.5">📍 {r.destination}</div>}
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded-full" style={{background:s.bg,color:s.color}}>{s.label}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-blue-50 rounded-lg p-2"><div className="text-gray-400">Total</div><div className="font-bold text-blue-700">{fmt(r.montant)} DHS</div></div>
                    <div className="bg-green-50 rounded-lg p-2"><div className="text-gray-400">Paid</div><div className="font-bold text-green-600">{fmt(r.montant_paye||0)} DHS</div></div>
                    <div className="bg-red-50 rounded-lg p-2"><div className="text-gray-400">Remaining</div><div className="font-bold text-red-600">{fmt(r.restant||0)} DHS</div></div>
                  </div>
                  {r.voyage_id && (
                    <button onClick={()=>router.push(`/voyages/${r.voyage_id}`)}
                      className="text-xs text-blue-600 hover:underline mt-2 block">
                      → Voyage #{r.voyage_id}
                    </button>
                  )}
                  {admin && (r.restant||0) > 0 && (
                    <div className="mt-2">
                      {editRow?.id === r.id ? (
                        <div className="flex gap-2">
                          <input type="text" inputMode="decimal" className="input text-xs flex-1"
                            value={editPaye} onChange={e=>setEditPaye(e.target.value)} placeholder="Amount paid"/>
                          <button onClick={()=>updatePaiement(r)} disabled={editSaving}
                            className="text-xs px-3 py-1 rounded-lg font-bold" style={{background:'#16a34a',color:'#fff'}}>✓</button>
                          <button onClick={()=>setEditRow(null)} className="btn-secondary text-xs px-2">✕</button>
                        </div>
                      ) : (
                        <button onClick={()=>{setEditRow(r);setEditPaye(String(r.montant_paye||0))}}
                          className="btn-secondary text-xs w-full justify-center" style={{color:'#16a34a',borderColor:'#16a34a'}}>
                          💰 Record payment
                        </button>
                      )}
                    </div>
                  )}
                  {admin && <div className="mt-2">
                    <button onClick={()=>deleteRetour(r)} className="btn-danger text-xs w-full justify-center">✕ Delete</button>
                  </div>}
                </div>
              )
            })}
            {filtered.length === 0 && <div className="text-center py-10 text-gray-400">No retours for this period</div>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className="th">Date</th><th className="th">Client</th>
                <th className="th">Destination</th><th className="th">Camion</th>
                <th className="th text-right">Total DHS</th>
                <th className="th text-right">Paid DHS</th>
                <th className="th text-right">Remaining DHS</th>
                <th className="th">Status</th><th className="th">Voyage</th>
                {admin && <th className="th"></th>}
              </tr></thead>
              <tbody>
                {filtered.map(r => {
                  const s = getStatus(r)
                  return (
                    <tr key={r.id} className="hover:bg-gray-50"
                      style={(r.restant||0)>0&&(r.montant_paye||0)===0?{background:'#fff5f5'}:{}}>
                      <td className="td text-gray-500">{fmtDate(r.date)}</td>
                      <td className="td font-semibold">{r.client_nom}</td>
                      <td className="td text-gray-500 text-xs">{r.destination||'—'}</td>
                      <td className="td text-gray-500 text-xs">{r.camion_plaque||'—'}</td>
                      <td className="td text-right font-bold text-blue-700">{fmt(r.montant)} DHS</td>
                      <td className="td text-right font-bold text-green-600">{fmt(r.montant_paye||0)} DHS</td>
                      <td className="td text-right font-bold" style={{color:(r.restant||0)>0?'#dc2626':'#16a34a'}}>
                        {fmt(r.restant||0)} DHS
                      </td>
                      <td className="td">
                        <span className="text-xs font-bold px-2 py-1 rounded-full"
                          style={{background:s.bg,color:s.color}}>{s.label}</span>
                      </td>
                      <td className="td">
                        {r.voyage_id ? (
                          <button onClick={()=>router.push(`/voyages/${r.voyage_id}`)}
                            className="text-xs text-blue-600 hover:underline font-semibold">
                            #{r.voyage_id}
                          </button>
                        ) : '—'}
                      </td>
                      {admin && (
                        <td className="td">
                          <div className="flex gap-1 items-center">
                            {(r.restant||0) > 0 && (
                              editRow?.id === r.id ? (
                                <div className="flex gap-1">
                                  <input type="text" inputMode="decimal" className="input text-xs" style={{width:80}}
                                    value={editPaye} onChange={e=>setEditPaye(e.target.value)}/>
                                  <button onClick={()=>updatePaiement(r)} disabled={editSaving}
                                    className="text-xs px-2 py-1 rounded-lg font-bold"
                                    style={{background:'#16a34a',color:'#fff'}}>✓</button>
                                  <button onClick={()=>setEditRow(null)} className="btn-secondary text-xs px-1">✕</button>
                                </div>
                              ) : (
                                <button onClick={()=>{setEditRow(r);setEditPaye(String(r.montant_paye||0))}}
                                  className="text-xs px-2 py-1 rounded-lg font-semibold"
                                  style={{background:'#dcfce7',color:'#16a34a',border:'1px solid #bbf7d0'}}>
                                  💰 Pay
                                </button>
                              )
                            )}
                            <button onClick={()=>deleteRetour(r)} className="btn-danger text-xs">✕</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={admin?10:9} className="td text-center text-gray-400 py-10">
                    No retours for this period
                  </td></tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot><tr>
                  <td className="tfoot-td" colSpan={4}>TOTAL ({filtered.length})</td>
                  <td className="tfoot-td text-right text-blue-700">{fmt(totalMontant)} DHS</td>
                  <td className="tfoot-td text-right text-green-600">{fmt(totalPaye)} DHS</td>
                  <td className="tfoot-td text-right text-red-600">{fmt(totalRestant)} DHS</td>
                  <td className="tfoot-td" colSpan={admin?3:2}></td>
                </tr></tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}
