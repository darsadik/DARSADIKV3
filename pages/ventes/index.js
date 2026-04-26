import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const ADMIN = 'abdelhafidbaadi@gmail.com'
const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtD = n => parseFloat(n || 0).toFixed(2)
const today = () => new Date().toISOString().split('T')[0]
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

export default function Ventes() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const admin = user?.email === ADMIN
  const [ventes, setVentes] = useState([])
  const [clients, setClients] = useState([])
  const [camions, setCamions] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [typeBriques, setTypeBriques] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('client')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ date: today(), client_id: '', camion_id: '', fournisseur_id: '', type_brique_id: '', qte: '', prix_vente: '', prix_achat: '', bon: '', note: '' })
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo, setFilterTo] = useState(today())
  const [filterClient, setFilterClient] = useState('')
  const [filterFourn, setFilterFourn] = useState('')
  const [filterCamion, setFilterCamion] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: v }, { data: cl }, { data: ca }, { data: fo }, { data: ty }] = await Promise.all([
      supabase.from('ventes').select('*').order('date', { ascending: true }),
      supabase.from('clients').select('*').order('nom'),
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('fournisseurs').select('*').order('nom'),
      supabase.from('type_briques').select('*').order('nom'),
    ])
    setVentes(v || []); setClients(cl || []); setCamions(ca || [])
    setFournisseurs(fo || []); setTypeBriques(ty || [])
    setLoading(false)
  }

  const filtered = ventes.filter(v => {
    if (filterFrom && v.date < filterFrom) return false
    if (filterTo && v.date > filterTo) return false
    if (filterClient && v.client_id !== parseInt(filterClient)) return false
    if (filterFourn && v.fournisseur !== filterFourn) return false
    if (filterCamion && v.camion_plaque !== filterCamion) return false
    return true
  })

  const tv = Math.round((parseFloat(form.qte)||0) * (parseFloat(form.prix_vente)||0) * 100) / 100
  const ta = Math.round((parseFloat(form.qte)||0) * (parseFloat(form.prix_achat)||0) * 100) / 100
  const mg = Math.round(tv - ta, 2)

  async function saveVente(e) {
    e.preventDefault()
    if (!admin) return
    setSaving(true)
    const cl = clients.find(c => c.id === parseInt(form.client_id))
    const ca = camions.find(c => c.id === parseInt(form.camion_id))
    const fo = fournisseurs.find(f => f.id === parseInt(form.fournisseur_id))
    const ty = typeBriques.find(t => t.id === parseInt(form.type_brique_id))
    await supabase.from('ventes').insert({
      date: form.date,
      client_id: parseInt(form.client_id), client_nom: cl?.nom || '',
      camion_id: parseInt(form.camion_id), camion_plaque: ca?.plaque || '', chauffeur: ca?.chauffeur || '',
      fournisseur_id: parseInt(form.fournisseur_id) || null, fournisseur: fo?.nom || '',
      type_brique_id: parseInt(form.type_brique_id) || null, type_brique: ty?.nom || '',
      qte: parseFloat(form.qte), prix_vente: parseFloat(form.prix_vente),
      prix_achat: parseFloat(form.prix_achat) || 0,
      total_vente: tv, total_achat: ta, marge: mg,
      bon: form.bon, note: form.note,
    })
    if (cl) await supabase.from('clients').update({ solde: (cl.solde || 0) + tv }).eq('id', cl.id)
    setSaving(false); setShowForm(false)
    setForm({ date: today(), client_id: '', camion_id: '', fournisseur_id: '', type_brique_id: '', qte: '', prix_vente: '', prix_achat: '', bon: '', note: '' })
    loadAll()
  }

  async function deleteVente(v) {
    if (!admin) return
    if (!confirm('Supprimer cette vente ?')) return
    await supabase.from('ventes').delete().eq('id', v.id)
    const cl = clients.find(c => c.id === v.client_id)
    if (cl) await supabase.from('clients').update({ solde: Math.max(0, (cl.solde || 0) - v.total_vente) }).eq('id', cl.id)
    loadAll()
  }

  function printClientView() {
    const tQ = filtered.reduce((s,v)=>s+(v.qte||0),0)
    const tV = filtered.reduce((s,v)=>s+(v.total_vente||0),0)
    const win = window.open('','_blank')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ventes</title>
    <style>body{font-family:Arial;padding:30px;font-size:13px}table{width:100%;border-collapse:collapse}
    th{background:#f5f5f5;padding:8px;font-size:11px;text-align:left;border-bottom:1px solid #ddd}
    td{padding:8px;border-bottom:1px solid #f0f0f0}tfoot td{background:#eff6ff;font-weight:800;border-top:2px solid #bfdbfe}
    @media print{button{display:none}}</style></head><body>
    <h1>DAR SADIK — Ventes ${filterFrom} → ${filterTo}</h1>
    <table><thead><tr><th>Date</th><th>Client</th><th>Produit</th><th>Transport</th><th>Qté</th><th>Prix/u</th><th>Total DHS</th></tr></thead>
    <tbody>${filtered.map(v=>`<tr><td>${v.date}</td><td><b>${v.client_nom}</b></td><td>${v.type_brique||'—'}</td><td>${v.camion_plaque}</td><td style="text-align:right">${fmt(v.qte)}</td><td style="text-align:right">${fmtD(v.prix_vente)}</td><td style="text-align:right"><b>${fmt(v.total_vente)}</b></td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="4">TOTAL (${filtered.length})</td><td style="text-align:right">${fmt(tQ)}</td><td></td><td style="text-align:right">${fmt(tV)} DHS</td></tr></tfoot>
    </table></body></html>`)
    win.document.close()
    win.print()
  }

  function exportClientCSV() {
    let csv = `Date,Client,Produit,Transport,Quantité,Prix unitaire DHS,Total DHS\n`
    filtered.forEach(v => { csv += `${v.date},${v.client_nom},${v.type_brique||''},${v.camion_plaque},${v.qte||0},${v.prix_vente||0},${v.total_vente||0}\n` })
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `Ventes-${filterFrom}-${filterTo}.csv`; a.click()
  }

  const uniqueCamions = [...new Set(ventes.map(v=>v.camion_plaque).filter(Boolean))]
  const uniqueFourns = [...new Set(ventes.map(v=>v.fournisseur).filter(Boolean))]

  const tabs = [
    { key: 'client', label: '👥 Clients' },
    { key: 'fournisseur', label: '🏭 Fournisseur', adminOnly: true },
    { key: 'camion', label: '🚛 Camions' },
    ...(admin ? [{ key: 'saisie', label: '➕ Saisie' }] : []),
  ].filter(t => !t.adminOnly || admin)

  // ── MOBILE CARD for a vente ──
  function VenteCard({ v }) {
    return (
      <div className="mobile-row-card">
        <div className="card-header">
          <div>
            <div className="card-title">{v.client_nom}</div>
            <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>{v.date}</div>
          </div>
          <div className="card-amount">{fmt(v.total_vente)} DHS</div>
        </div>
        <div className="card-meta">
          {v.type_brique && <span>📦 {v.type_brique}</span>}
          <span>🚛 {v.camion_plaque}</span>
          <span>📏 {fmt(v.qte)} briques</span>
          {v.fournisseur && <span>🏭 {v.fournisseur}</span>}
          {v.bon && <span>📄 BON {v.bon}</span>}
        </div>
        {admin && (
          <div className="card-actions">
            <button onClick={() => deleteVente(v)} className="btn-danger">✕ Supprimer</button>
          </div>
        )}
      </div>
    )
  }

  // ── CLIENT VIEW ──
  function ClientView() {
    const tQ = filtered.reduce((s,v)=>s+(v.qte||0),0)
    const tV = filtered.reduce((s,v)=>s+(v.total_vente||0),0)

    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-bold text-gray-900">{filtered.length} ventes</h3>
          <div className="flex gap-2">
            <button onClick={printClientView} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ PDF</button>
            <button onClick={exportClientCSV} className="btn-primary text-xs px-3 py-1.5" style={{background:'#16a34a'}}>📥 Excel</button>
          </div>
        </div>

        {isMobile ? (
          <>
            {filtered.length === 0 ? (
              <div className="text-center text-gray-400 py-10">Aucune vente</div>
            ) : (
              <div className="mobile-card-list">
                {filtered.slice().reverse().map(v => <VenteCard key={v.id} v={v} />)}
              </div>
            )}
            {filtered.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400">Total briques</div>
                  <div className="text-lg font-bold text-blue-600">{fmt(tQ)}</div>
                </div>
                <div className="bg-brand-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400">Total DHS</div>
                  <div className="text-lg font-bold text-brand-600">{fmt(tV)}</div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Date</th><th className="th">Client</th><th className="th">Produit</th>
                  <th className="th">Transport</th><th className="th text-right">Quantité</th>
                  <th className="th text-right">Prix/u DHS</th><th className="th text-right">Total DHS</th>
                  {admin && <th className="th"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="td text-gray-500">{v.date}</td>
                    <td className="td font-semibold">{v.client_nom}</td>
                    <td className="td"><span className="badge-gray">{v.type_brique||'—'}</span></td>
                    <td className="td text-gray-500">{v.camion_plaque}</td>
                    <td className="td text-right">{fmt(v.qte)}</td>
                    <td className="td text-right">{fmtD(v.prix_vente)}</td>
                    <td className="td text-right font-bold">{fmt(v.total_vente)}</td>
                    {admin && <td className="td"><button onClick={() => deleteVente(v)} className="btn-danger text-xs">✕</button></td>}
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={8} className="td text-center text-gray-400 py-8">Aucune vente</td></tr>}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr>
                    <td className="tfoot-td" colSpan={4}>TOTAL ({filtered.length})</td>
                    <td className="tfoot-td text-right">{fmt(tQ)}</td>
                    <td className="tfoot-td"></td>
                    <td className="tfoot-td text-right">{fmt(tV)} DHS</td>
                    {admin && <td className="tfoot-td"></td>}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    )
  }

  // ── FOURNISSEUR VIEW ──
  function FournisseurView() {
    if (!admin) return (
      <div className="card flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <div className="text-xl font-bold text-gray-900">Accès restreint</div>
        <div className="text-gray-500 mt-2">Réservé à l'administrateur</div>
      </div>
    )
    const byFourn = {}
    filtered.forEach(v => {
      const f = v.fournisseur || 'Sans fournisseur'
      if (!byFourn[f]) byFourn[f] = { days: {}, totals: {} }
      if (!byFourn[f].days[v.date]) byFourn[f].days[v.date] = {}
      const tb = v.type_brique || 'Sans type'
      if (!byFourn[f].days[v.date][tb]) byFourn[f].days[v.date][tb] = 0
      byFourn[f].days[v.date][tb] += v.qte || 0
      if (!byFourn[f].totals[tb]) byFourn[f].totals[tb] = { qte: 0, vente: 0, achat: 0, marge: 0 }
      byFourn[f].totals[tb].qte += v.qte || 0
      byFourn[f].totals[tb].vente += v.total_vente || 0
      byFourn[f].totals[tb].achat += v.total_achat || 0
      byFourn[f].totals[tb].marge += v.marge || 0
    })

    return (
      <div className="space-y-6">
        {Object.entries(byFourn).map(([fourn, data]) => {
          const allTypes = [...new Set(filtered.filter(v=>(v.fournisseur||'Sans fournisseur')===fourn).map(v=>v.type_brique||'Sans type'))]
          return (
            <div key={fourn} className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg text-brand-700">🏭 {fourn}</h3>
              </div>

              {isMobile ? (
                // Mobile: cards per day
                <div className="space-y-3">
                  <div className="text-xs font-bold text-gray-500 uppercase mb-2">📅 Journalier</div>
                  {Object.entries(data.days).sort(([a],[b])=>b.localeCompare(a)).map(([date, types]) => {
                    const totalDay = Object.values(types).reduce((s,q)=>s+q,0)
                    return (
                      <div key={date} className="mobile-row-card">
                        <div className="card-header">
                          <div className="card-title">{date}</div>
                          <div className="card-amount">{fmt(totalDay)} briques</div>
                        </div>
                        <div className="card-meta">
                          {Object.entries(types).map(([tb, q]) => (
                            <span key={tb}>{tb}: {fmt(q)}</span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  <div className="text-xs font-bold text-gray-500 uppercase mt-4 mb-2">📦 Récapitulatif</div>
                  {Object.entries(data.totals).map(([tb, d]) => (
                    <div key={tb} className="mobile-row-card">
                      <div className="card-header">
                        <div className="card-title">{tb}</div>
                        <div style={{color:'#16a34a',fontWeight:700}}>{fmt(d.marge)} DHS marge</div>
                      </div>
                      <div className="card-meta">
                        <span>📏 {fmt(d.qte)} briques</span>
                        <span>💸 Achat: {fmt(d.achat)} DHS</span>
                        <span>💰 Vente: {fmt(d.vente)} DHS</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // Desktop: tables
                <>
                  <div className="text-xs font-bold text-gray-500 uppercase mb-2">📅 Suivi journalier</div>
                  <div className="overflow-x-auto mb-4">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="th">Date</th>
                          {allTypes.map(tb => <th key={tb} className="th text-right">{tb}</th>)}
                          <th className="th text-right">Total jour</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(data.days).sort(([a],[b])=>a.localeCompare(b)).map(([date, types]) => {
                          const totalDay = Object.values(types).reduce((s,q)=>s+q,0)
                          return (
                            <tr key={date} className="hover:bg-gray-50">
                              <td className="td font-semibold">{date}</td>
                              {allTypes.map(tb => <td key={tb} className="td text-right">{types[tb] ? fmt(types[tb]) : '—'}</td>)}
                              <td className="td text-right font-bold text-brand-600">{fmt(totalDay)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-xs font-bold text-gray-500 uppercase mb-2">📦 Récapitulatif</div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="th">Produit</th><th className="th text-right">Qté</th>
                          <th className="th text-right">Achat DHS</th><th className="th text-right">Vente DHS</th>
                          <th className="th text-right">Marge DHS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(data.totals).map(([tb, d]) => (
                          <tr key={tb} className="hover:bg-gray-50">
                            <td className="td"><span className="badge-blue">{tb}</span></td>
                            <td className="td text-right font-bold">{fmt(d.qte)}</td>
                            <td className="td text-right">{fmt(d.achat)}</td>
                            <td className="td text-right font-bold">{fmt(d.vente)}</td>
                            <td className="td text-right font-bold text-green-600">{fmt(d.marge)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="tfoot-td">TOTAL</td>
                          <td className="tfoot-td text-right">{fmt(Object.values(data.totals).reduce((s,d)=>s+d.qte,0))}</td>
                          <td className="tfoot-td text-right">{fmt(Object.values(data.totals).reduce((s,d)=>s+d.achat,0))}</td>
                          <td className="tfoot-td text-right">{fmt(Object.values(data.totals).reduce((s,d)=>s+d.vente,0))}</td>
                          <td className="tfoot-td text-right text-green-700">{fmt(Object.values(data.totals).reduce((s,d)=>s+d.marge,0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          )
        })}
        {Object.keys(byFourn).length === 0 && <div className="card text-center py-10 text-gray-400">Aucune donnée</div>}
      </div>
    )
  }

  // ── CAMION VIEW ──
  function CamionView() {
    const byCamion = {}
    filtered.forEach(v => {
      const p = v.camion_plaque || 'Sans camion'
      if (!byCamion[p]) byCamion[p] = { voyages: 0, qte: 0, vente: 0, dates: new Set(), types: {}, chauffeur: v.chauffeur || '' }
      byCamion[p].voyages += 1
      byCamion[p].qte += v.qte || 0
      byCamion[p].vente += v.total_vente || 0
      byCamion[p].dates.add(v.date)
      const tb = v.type_brique || 'Sans type'
      if (!byCamion[p].types[tb]) byCamion[p].types[tb] = 0
      byCamion[p].types[tb] += v.qte || 0
    })

    return (
      <div className="space-y-4">
        {Object.entries(byCamion).sort((a,b) => b[1].qte - a[1].qte).map(([plaque, data]) => (
          <div key={plaque} className="card">
            <div className={`${isMobile ? 'space-y-3' : 'flex items-start justify-between'} mb-4`}>
              <div>
                <div className="text-lg font-bold text-gray-900">🚛 {plaque}</div>
                {data.chauffeur && <div className="text-sm text-gray-500 mt-1">👤 {data.chauffeur}</div>}
              </div>
              <div className={`grid grid-cols-3 gap-3 ${isMobile ? '' : 'text-center'}`}>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400">Voyages</div>
                  <div className="text-xl font-bold text-blue-600">{data.voyages}</div>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400">Briques</div>
                  <div className="text-xl font-bold text-green-600">{fmt(data.qte)}</div>
                </div>
                <div className="bg-brand-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400">DHS</div>
                  <div className="text-xl font-bold text-brand-600">{fmt(data.vente)}</div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(data.types).map(([tb, q]) => (
                <div key={tb} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <span className="font-bold">{tb}</span>
                  <span className="text-gray-400 ml-2">{fmt(q)}</span>
                </div>
              ))}
            </div>
            {!isMobile && (
              <div className="flex flex-wrap gap-1">
                {[...data.dates].sort().map(d => (
                  <span key={d} className="text-xs bg-brand-50 text-brand-700 border border-brand-200 rounded px-2 py-1">{d}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {Object.keys(byCamion).length === 0 && <div className="card text-center py-10 text-gray-400">Aucune donnée</div>}
      </div>
    )
  }

  return (
    <Layout title="Ventes" subtitle="Gestion et analyse des ventes">

      {/* TABS */}
      <div className={isMobile ? 'mobile-tabs mb-4' : 'flex flex-wrap gap-2 mb-4'}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={isMobile
              ? (view === t.key ? 'active' : '')
              : `px-4 py-2 rounded-xl border text-sm font-bold transition-all ${view===t.key?'bg-brand-500 text-white border-brand-500':'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`
            }>
            {t.label}
          </button>
        ))}
      </div>

      {/* FILTERS */}
      {isMobile ? (
        <div className="mb-4">
          <button className="mobile-collapse-btn" onClick={() => setShowFilters(!showFilters)}>
            <span>🔍 Filtres ({filterFrom} → {filterTo})</span>
            <span>{showFilters ? '▲' : '▼'}</span>
          </button>
          {showFilters && (
            <div className="card mt-2 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} /></div>
                <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)} /></div>
              </div>
              <div><label className="label">Client</label>
                <select className="input" value={filterClient} onChange={e=>setFilterClient(e.target.value)}>
                  <option value="">Tous</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div><label className="label">Camion</label>
                <select className="input" value={filterCamion} onChange={e=>setFilterCamion(e.target.value)}>
                  <option value="">Tous</option>{uniqueCamions.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <button onClick={()=>{setFilterClient('');setFilterFourn('');setFilterCamion('');setFilterFrom(startOfMonth());setFilterTo(today());setShowFilters(false)}}
                className="btn-secondary w-full justify-center text-xs">↺ Réinitialiser</button>
            </div>
          )}
          <div className="text-xs text-gray-400 mt-2 px-1">{filtered.length} vente(s) — {fmt(filtered.reduce((s,v)=>s+(v.total_vente||0),0))} DHS</div>
        </div>
      ) : (
        <div className="card mb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} /></div>
            <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)} /></div>
            <div><label className="label">Client</label>
              <select className="input" value={filterClient} onChange={e=>setFilterClient(e.target.value)}>
                <option value="">Tous</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            {admin && <div><label className="label">Fournisseur</label>
              <select className="input" value={filterFourn} onChange={e=>setFilterFourn(e.target.value)}>
                <option value="">Tous</option>{uniqueFourns.map(f=><option key={f}>{f}</option>)}
              </select>
            </div>}
            <div><label className="label">Camion</label>
              <select className="input" value={filterCamion} onChange={e=>setFilterCamion(e.target.value)}>
                <option value="">Tous</option>{uniqueCamions.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <button onClick={()=>{setFilterClient('');setFilterFourn('');setFilterCamion('');setFilterFrom(startOfMonth());setFilterTo(today())}}
              className="btn-secondary text-xs">↺ Réinitialiser</button>
          </div>
          <div className="mt-2 text-xs text-gray-400">{filtered.length} vente(s) — {fmt(filtered.reduce((s,v)=>s+(v.qte||0),0))} briques — {fmt(filtered.reduce((s,v)=>s+(v.total_vente||0),0))} DHS</div>
        </div>
      )}

      {/* SAISIE FORM */}
      {view === 'saisie' && admin && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">➕ Nouvelle vente</h3>
            {isMobile && <button className="btn-secondary text-xs" onClick={() => setShowForm(!showForm)}>{showForm ? '▲' : '▼'}</button>}
          </div>
          {(!isMobile || showForm) && (
            <form onSubmit={saveVente}>
              <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4'} gap-3 mb-3`}>
                <div><label className="label">Date</label><input type="date" className="input" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required /></div>
                <div><label className="label">Client</label>
                  <select className="input" value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})} required>
                    <option value="">Sélectionner...</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                <div><label className="label">Camion</label>
                  <select className="input" value={form.camion_id} onChange={e=>setForm({...form,camion_id:e.target.value})} required>
                    <option value="">Sélectionner...</option>{camions.map(c=><option key={c.id} value={c.id}>{c.plaque}{c.chauffeur?` — ${c.chauffeur}`:''}</option>)}
                  </select>
                </div>
                <div><label className="label">Fournisseur</label>
                  <select className="input" value={form.fournisseur_id} onChange={e=>setForm({...form,fournisseur_id:e.target.value})}>
                    <option value="">Sélectionner...</option>{fournisseurs.map(f=><option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select>
                </div>
              </div>
              <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'} gap-3 mb-3`}>
                <div><label className="label">Type brique</label>
                  <select className="input" value={form.type_brique_id} onChange={e=>setForm({...form,type_brique_id:e.target.value})}>
                    <option value="">Sélectionner...</option>{typeBriques.map(t=><option key={t.id} value={t.id}>{t.nom}</option>)}
                  </select>
                </div>
                <div><label className="label">Quantité</label><input type="number" className="input" placeholder="6000" value={form.qte} onChange={e=>setForm({...form,qte:e.target.value})} required /></div>
                <div><label className="label">Prix vente/u</label><input type="number" step="0.01" className="input" placeholder="1.85" value={form.prix_vente} onChange={e=>setForm({...form,prix_vente:e.target.value})} required /></div>
                <div><label className="label">Prix achat/u</label><input type="number" step="0.01" className="input" placeholder="1.30" value={form.prix_achat} onChange={e=>setForm({...form,prix_achat:e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className="label">BON N°</label><input className="input" placeholder="2849" value={form.bon} onChange={e=>setForm({...form,bon:e.target.value})} /></div>
                <div><label className="label">Note</label><input className="input" placeholder="optionnel" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} /></div>
              </div>
              {form.qte && form.prix_vente && (
                <div className="grid grid-cols-3 gap-3 bg-brand-50 rounded-xl p-4 mb-4 text-center">
                  <div><div className="text-xs text-gray-400">Total vente</div><div className="text-lg font-bold text-brand-600">{fmt(tv)} DHS</div></div>
                  <div><div className="text-xs text-gray-400">Total achat</div><div className="text-lg font-bold text-gray-500">{fmt(ta)} DHS</div></div>
                  <div><div className="text-xs text-gray-400">Marge</div><div className={`text-lg font-bold ${mg>=0?'text-green-600':'text-red-600'}`}>{fmt(mg)} DHS</div></div>
                </div>
              )}
              <button type="submit" disabled={saving} className={`btn-primary ${isMobile ? 'w-full justify-center' : ''}`}>
                {saving ? 'Enregistrement...' : '✓ Enregistrer'}
              </button>
            </form>
          )}
        </div>
      )}

      {loading ? (
        <div className="card text-center py-10 text-gray-400">Chargement...</div>
      ) : (
        <>
          {view === 'client' && <ClientView />}
          {view === 'fournisseur' && <FournisseurView />}
          {view === 'camion' && <CamionView />}
        </>
      )}
    </Layout>
  )
}
