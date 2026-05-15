import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const ADMIN = 'abdelhafidbaadi@gmail.com'
const fmt     = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtDate = d => { if (!d) return '—'; const [y,m,j] = d.split('-'); return `${j}/${m}/${y}` }
const today   = () => new Date().toISOString().split('T')[0]
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const check = () => setM(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return m
}

export default function Retours() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const admin = user?.email === ADMIN

  const [retours, setRetours]       = useState([])
  const [camions, setCamions]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo,   setFilterTo]   = useState(today())
  const [filterCamion, setFilterCamion] = useState('')
  const [filterStatus, setFilterStatus] = useState('') // '' | 'unpaid' | 'partial' | 'paid'

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: v }, { data: ca }] = await Promise.all([
      supabase.from('ventes').select('*').not('retour_client', 'is', null).order('date', { ascending: false }),
      supabase.from('camions').select('*').order('plaque'),
    ])
    setRetours(v || [])
    setCamions(ca || [])
    setLoading(false)
  }

  // Update retour payment on an existing vente
  async function updateRetourPaye(id, currentMontant, newPaye) {
    const paye    = parseFloat(newPaye) || 0
    const montant = parseFloat(currentMontant) || 0
    const restant = Math.max(0, montant - paye)
    await supabase.from('ventes').update({
      retour_paye:    paye,
      retour_restant: restant,
    }).eq('id', id)
    loadAll()
  }

  const filtered = retours.filter(v => {
    if (filterFrom   && v.date < filterFrom)   return false
    if (filterTo     && v.date > filterTo)     return false
    if (filterCamion && v.camion_plaque !== filterCamion) return false
    if (filterStatus) {
      const restant = v.retour_restant || 0
      const montant = v.retour_montant || 0
      const paye    = v.retour_paye || 0
      if (filterStatus === 'unpaid'  && !(paye === 0 && montant > 0)) return false
      if (filterStatus === 'partial' && !(paye > 0 && restant > 0))   return false
      if (filterStatus === 'paid'    && !(restant === 0 && montant > 0)) return false
    }
    return true
  })

  const totalMontant  = filtered.reduce((s,v) => s + (v.retour_montant || 0), 0)
  const totalPaye     = filtered.reduce((s,v) => s + (v.retour_paye || 0), 0)
  const totalRestant  = filtered.reduce((s,v) => s + (v.retour_restant || 0), 0)
  const unpaidCount   = filtered.filter(v => (v.retour_paye || 0) === 0).length
  const partialCount  = filtered.filter(v => (v.retour_paye || 0) > 0 && (v.retour_restant || 0) > 0).length
  const paidCount     = filtered.filter(v => (v.retour_restant || 0) === 0).length

  const uniqueCamions = [...new Set(retours.map(v => v.camion_plaque).filter(Boolean))]

  function getStatusBadge(v) {
    const restant = v.retour_restant || 0
    const montant = v.retour_montant || 0
    const paye    = v.retour_paye || 0
    if (restant === 0 && montant > 0) return { label: '✓ Payé', bg: '#dcfce7', color: '#16a34a' }
    if (paye > 0 && restant > 0)      return { label: '⚠ Partiel', bg: '#fef3c7', color: '#d97706' }
    return { label: '⬤ Impayé', bg: '#fee2e2', color: '#dc2626' }
  }

  function printRetours() {
    const rows = filtered.map(v => {
      const s = getStatusBadge(v)
      return `<tr>
        <td>${fmtDate(v.date)}</td>
        <td><b>${v.client_nom}</b></td>
        <td>${v.camion_plaque || '—'}</td>
        <td><b>${v.retour_client}</b></td>
        <td style="text-align:right">${fmt(v.retour_montant)} DHS</td>
        <td style="text-align:right;color:#16a34a">${fmt(v.retour_paye || 0)} DHS</td>
        <td style="text-align:right;color:${(v.retour_restant||0) > 0 ? '#dc2626' : '#16a34a'}">${fmt(v.retour_restant || 0)} DHS</td>
        <td><span style="background:${s.bg};color:${s.color};padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700">${s.label}</span></td>
        <td>${v.retour_note || '—'}</td>
      </tr>`
    }).join('')

    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Retours Transport</title>
    <style>
      * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
      body { font-family:Arial,sans-serif; padding:28px; font-size:12px; color:#1e293b; background:#fff; margin:0; }
      h1 { font-size:18px; margin:0 0 4px; } .sub { color:#555; font-size:11px; margin-bottom:16px; }
      .summary { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
      .sum-box { border:1px solid #e2e8f0; border-radius:8px; padding:12px; text-align:center; }
      .sum-lbl { font-size:9px; text-transform:uppercase; font-weight:700; color:#6b7280; margin-bottom:4px; }
      .sum-val { font-size:16px; font-weight:800; }
      table { width:100%; border-collapse:collapse; margin-bottom:8px; }
      th { background:#1a5fa8 !important; color:#fff !important; padding:8px 10px; text-align:left; font-size:11px; font-weight:700; }
      td { padding:7px 10px; border-bottom:1px solid #e2e8f0; font-size:11px; }
      tr:nth-child(even) td { background:#f8fafc !important; }
      tfoot td { background:#f1f5f9 !important; font-weight:800 !important; border-top:2px solid #1a5fa8 !important; }
      @media print { button { display:none !important; } body { padding:0; } }
    </style></head><body>
    <h1>↩️ DAR SADIK — Retours Transport</h1>
    <div class="sub">Période: ${fmtDate(filterFrom)} → ${fmtDate(filterTo)} | Généré le ${new Date().toLocaleDateString('fr-MA')}</div>
    <div class="summary">
      <div class="sum-box"><div class="sum-lbl">Total montant</div><div class="sum-val" style="color:#1d4ed8">${fmt(totalMontant)} DHS</div></div>
      <div class="sum-box"><div class="sum-lbl">Total payé</div><div class="sum-val" style="color:#16a34a">${fmt(totalPaye)} DHS</div></div>
      <div class="sum-box"><div class="sum-lbl">Total restant</div><div class="sum-val" style="color:#dc2626">${fmt(totalRestant)} DHS</div></div>
      <div class="sum-box"><div class="sum-lbl">Impayés</div><div class="sum-val" style="color:#dc2626">${unpaidCount}</div></div>
    </div>
    <table><thead><tr>
      <th>Date</th><th>Client vente</th><th>Camion</th><th>Client retour</th>
      <th style="text-align:right">Montant DHS</th>
      <th style="text-align:right">Payé DHS</th>
      <th style="text-align:right">Restant DHS</th>
      <th>Statut</th><th>Note</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="9" style="text-align:center;color:#aaa">Aucun retour</td></tr>'}</tbody>
    ${filtered.length > 0 ? `<tfoot><tr>
      <td colspan="4">TOTAL (${filtered.length})</td>
      <td style="text-align:right">${fmt(totalMontant)} DHS</td>
      <td style="text-align:right;color:#16a34a">${fmt(totalPaye)} DHS</td>
      <td style="text-align:right;color:#dc2626">${fmt(totalRestant)} DHS</td>
      <td colspan="2"></td>
    </tr></tfoot>` : ''}
    </table></body></html>`)
    win.document.close()
    win.print()
  }

  // Inline paye editing
  const [editPayeId, setEditPayeId]     = useState(null)
  const [editPayeVal, setEditPayeVal]   = useState('')

  return (
    <Layout title="Retours Transport" subtitle="Suivi des retours et créances">

      {/* FILTERS */}
      <div className="card mb-4">
        <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-5'} gap-3 items-end`}>
          <div><label className="label">Du</label>
            <input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} /></div>
          <div><label className="label">Au</label>
            <input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)} /></div>
          <div><label className="label">Camion</label>
            <select className="input" value={filterCamion} onChange={e=>setFilterCamion(e.target.value)}>
              <option value="">Tous</option>
              {uniqueCamions.map(c=><option key={c}>{c}</option>)}
            </select></div>
          <div><label className="label">Statut</label>
            <select className="input" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
              <option value="">Tous</option>
              <option value="unpaid">⬤ Impayé</option>
              <option value="partial">⚠ Partiel</option>
              <option value="paid">✓ Payé</option>
            </select></div>
          <div>
            <button onClick={()=>{setFilterFrom(startOfMonth());setFilterTo(today());setFilterCamion('');setFilterStatus('')}}
              className="btn-secondary text-xs w-full justify-center mt-5">↺ Réinitialiser</button>
          </div>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card border border-blue-100 bg-blue-50">
          <div className="stat-label text-blue-600">Total retours</div>
          <div className="stat-value text-blue-700">{fmt(totalMontant)} DHS</div>
          <div className="stat-sub">{filtered.length} opération(s)</div>
        </div>
        <div className="stat-card border border-green-100 bg-green-50">
          <div className="stat-label text-green-600">Total payé</div>
          <div className="stat-value text-green-700">{fmt(totalPaye)} DHS</div>
          <div className="stat-sub">{paidCount} payé(s) complètement</div>
        </div>
        <div className="stat-card border border-red-100 bg-red-50">
          <div className="stat-label text-red-600">Reste à encaisser</div>
          <div className="stat-value text-red-600">{fmt(totalRestant)} DHS</div>
          <div className="stat-sub">{unpaidCount} impayé(s) · {partialCount} partiel(s)</div>
        </div>
        <div className="stat-card border border-orange-100 bg-orange-50">
          <div className="stat-label text-orange-600">Taux recouvrement</div>
          <div className="stat-value text-orange-700">
            {totalMontant > 0 ? Math.round(totalPaye / totalMontant * 100) : 0}%
          </div>
          <div className="stat-sub">du total encaissé</div>
        </div>
      </div>

      {/* TABLE */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">↩️ Historique retours transport</h3>
            <div className="text-xs text-gray-400 mt-1">{filtered.length} retour(s)</div>
          </div>
          <button onClick={printRetours} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ Imprimer / PDF</button>
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-400">Chargement...</div>
        ) : isMobile ? (
          <div className="space-y-3">
            {filtered.map(v => {
              const s = getStatusBadge(v)
              return (
                <div key={v.id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-bold text-gray-900">{v.retour_client}</div>
                      <div className="text-xs text-gray-400">{fmtDate(v.date)} — {v.camion_plaque}</div>
                      <div className="text-xs text-gray-500 mt-1">🧾 {v.client_nom}</div>
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded-full" style={{background:s.bg,color:s.color}}>{s.label}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs mt-2">
                    <div className="bg-blue-50 rounded-lg p-2">
                      <div className="text-gray-400">Montant</div>
                      <div className="font-bold text-blue-700">{fmt(v.retour_montant)} DHS</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2">
                      <div className="text-gray-400">Payé</div>
                      <div className="font-bold text-green-600">{fmt(v.retour_paye||0)} DHS</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-2">
                      <div className="text-gray-400">Restant</div>
                      <div className="font-bold text-red-600">{fmt(v.retour_restant||0)} DHS</div>
                    </div>
                  </div>
                  {v.retour_note && <div className="text-xs text-gray-400 mt-2">📝 {v.retour_note}</div>}
                  {admin && (v.retour_restant || 0) > 0 && (
                    <div className="mt-2">
                      {editPayeId === v.id ? (
                        <div className="flex gap-2">
                          <input type="text" inputMode="decimal" className="input text-xs flex-1" placeholder="Montant payé"
                            value={editPayeVal} onChange={e=>setEditPayeVal(e.target.value)} />
                          <button onClick={()=>{updateRetourPaye(v.id, v.retour_montant, editPayeVal);setEditPayeId(null)}}
                            className="btn-primary text-xs px-2">✓</button>
                          <button onClick={()=>setEditPayeId(null)} className="btn-secondary text-xs px-2">✕</button>
                        </div>
                      ) : (
                        <button onClick={()=>{setEditPayeId(v.id);setEditPayeVal(String(v.retour_paye||0))}}
                          className="btn-secondary text-xs w-full justify-center" style={{color:'#16a34a',borderColor:'#16a34a'}}>
                          💰 Enregistrer paiement
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {filtered.length === 0 && <div className="text-center py-10 text-gray-400">Aucun retour pour cette période</div>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Client vente</th>
                  <th className="th">Camion</th>
                  <th className="th">Client retour</th>
                  <th className="th text-right">Montant DHS</th>
                  <th className="th text-right">Payé DHS</th>
                  <th className="th text-right">Restant DHS</th>
                  <th className="th">Statut</th>
                  <th className="th">Note</th>
                  {admin && <th className="th"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => {
                  const s = getStatusBadge(v)
                  return (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="td text-gray-500">{fmtDate(v.date)}</td>
                      <td className="td text-gray-500">{v.client_nom}</td>
                      <td className="td text-gray-500">{v.camion_plaque||'—'}</td>
                      <td className="td font-semibold">{v.retour_client}</td>
                      <td className="td text-right font-bold text-blue-700">{fmt(v.retour_montant)} DHS</td>
                      <td className="td text-right font-bold text-green-600">{fmt(v.retour_paye||0)} DHS</td>
                      <td className="td text-right font-bold" style={{color:(v.retour_restant||0)>0?'#dc2626':'#16a34a'}}>
                        {fmt(v.retour_restant||0)} DHS
                      </td>
                      <td className="td">
                        <span className="text-xs font-bold px-2 py-1 rounded-full" style={{background:s.bg,color:s.color}}>{s.label}</span>
                      </td>
                      <td className="td text-gray-400 text-xs">{v.retour_note||'—'}</td>
                      {admin && <td className="td">
                        {(v.retour_restant||0) > 0 && (
                          editPayeId === v.id ? (
                            <div className="flex gap-1">
                              <input type="text" inputMode="decimal" className="input text-xs" style={{width:80}}
                                value={editPayeVal} onChange={e=>setEditPayeVal(e.target.value)} />
                              <button onClick={()=>{updateRetourPaye(v.id,v.retour_montant,editPayeVal);setEditPayeId(null)}}
                                className="text-xs px-2 py-1 rounded-lg font-bold" style={{background:'#16a34a',color:'#fff'}}>✓</button>
                              <button onClick={()=>setEditPayeId(null)} className="btn-secondary text-xs px-1">✕</button>
                            </div>
                          ) : (
                            <button onClick={()=>{setEditPayeId(v.id);setEditPayeVal(String(v.retour_paye||0))}}
                              className="text-xs px-2 py-1 rounded-lg font-semibold" style={{background:'#dcfce7',color:'#16a34a',border:'1px solid #bbf7d0'}}>
                              💰 Payer
                            </button>
                          )
                        )}
                      </td>}
                    </tr>
                  )
                })}
                {filtered.length === 0 && <tr><td colSpan={admin?10:9} className="td text-center text-gray-400 py-10">Aucun retour pour cette période</td></tr>}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr>
                    <td className="tfoot-td" colSpan={4}>TOTAL ({filtered.length})</td>
                    <td className="tfoot-td text-right text-blue-700">{fmt(totalMontant)} DHS</td>
                    <td className="tfoot-td text-right text-green-600">{fmt(totalPaye)} DHS</td>
                    <td className="tfoot-td text-right text-red-600">{fmt(totalRestant)} DHS</td>
                    <td className="tfoot-td" colSpan={admin?3:2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}
