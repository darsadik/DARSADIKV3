import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtDate = d => { if (!d) return '—'; const [y,m,j] = d.split('-'); return `${j}/${m}/${y}` }
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

export default function Paiements() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const [clients, setClients] = useState([])
  const [paiements, setPaiements] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filterClient, setFilterClient] = useState('')
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo, setFilterTo] = useState(today())
  const [showForm, setShowForm] = useState(false)
  const [filterMode, setFilterMode] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [camions, setCamions] = useState([])
  const [form, setForm] = useState({ date: today(), client_id: '', mode: 'Espèce', montant: '', note: '', camion_id: '' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: cl }, { data: pa }, { data: ca }] = await Promise.all([
      supabase.from('clients').select('*').order('nom'),
      supabase.from('paiements').select('*').order('date', { ascending: true }),
      supabase.from('camions').select('*').order('plaque'),
    ])
    setClients(cl || [])
    setPaiements(pa || [])
    setCamions(ca || [])
    setLoading(false)
  }

  const selectedClient = clients.find(c => c.id === parseInt(form.client_id))
  const montant = parseFloat(form.montant) || 0
  // No Math.max clamp: negative solde = avance/crédit client
  const soldeApres = (selectedClient?.solde || 0) - montant

  async function savePaiement(e) {
    e.preventDefault()
    if (!form.client_id || !montant) return
    setSaving(true)
    const client = selectedClient
    const camion = camions.find(c => c.id === parseInt(form.camion_id))
    await supabase.from('paiements').insert({
      date: form.date, client_id: parseInt(form.client_id),
      client_nom: client?.nom || '', mode: form.mode,
      montant, note: form.note,
      camion_id: form.camion_id ? parseInt(form.camion_id) : null,
      camion_plaque: camion?.plaque || null,
    })
    // No Math.max clamp: if paiement > solde, solde goes negative = avance client (crédit)
    if (client) await supabase.from('clients').update({ solde: (client.solde || 0) - montant }).eq('id', client.id)
    setSaving(false)
    setForm({ date: today(), client_id: '', mode: 'Espèce', montant: '', note: '', camion_id: '' })
    setShowForm(false)
    loadAll()
  }

  async function deletePaiement(id, clientId, m) {
    if (!confirm('Supprimer ce paiement ?')) return
    const client = clients.find(c => c.id === clientId)
    await supabase.from('paiements').delete().eq('id', id)
    if (client) await supabase.from('clients').update({ solde: (client.solde || 0) + m }).eq('id', clientId)
    loadAll()
  }

  const filtered = paiements
    .filter(p => {
      if (filterClient && p.client_id !== parseInt(filterClient)) return false
      if (filterFrom && p.date < filterFrom) return false
      if (filterTo && p.date > filterTo) return false
      if (filterMode && p.mode !== filterMode) return false
      return true
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  const total = filtered.reduce((s, p) => s + (p.montant || 0), 0)

  function printPaiements() {
    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      body { font-family: Arial, sans-serif; padding: 28px; font-size: 12px; color: #000 !important; background: #fff !important; margin: 0; }
      h1 { font-size: 18px; margin: 0 0 4px; color: #000 !important; }
      .sub { color: #555 !important; font-size: 11px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { background: #1e293b !important; color: #fff !important; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #000 !important; }
      tr:nth-child(even) td { background: #f8fafc !important; }
      tfoot td { background: #f1f5f9 !important; font-weight: 800 !important; border-top: 2px solid #334155 !important; }
      @media print { button { display: none !important; } body { padding: 0; } }
    </style></head><body>
    <h1>DAR SADIK — Paiements ${filterFrom} → ${filterTo}</h1>
    <div class="sub">Généré le ${new Date().toLocaleDateString('fr-MA')}</div>
    <table><thead><tr><th>Date</th><th>Client</th><th>Mode</th><th>Camion</th><th style="text-align:right">Montant DHS</th><th>Référence</th></tr></thead>
    <tbody>${filtered.map(p=>`<tr><td>${fmtDate(p.date)}</td><td><b>${p.client_nom}</b></td><td>${p.mode}</td><td>${p.camion_plaque||'—'}</td><td style="text-align:right;color:green"><b>− ${fmt(p.montant)}</b></td><td>${p.note||'—'}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="4">TOTAL (${filtered.length})</td><td style="text-align:right;color:green">− ${fmt(total)} DHS</td><td></td></tr></tfoot>
    </table></body></html>`)
    win.document.close(); win.print()
  }

  function exportCSV() {
    let csv = `Date,Client,Mode,Montant DHS,Référence\n`
    filtered.forEach(p => { csv += `${fmtDate(p.date)},${p.client_nom},${p.mode},${p.montant||0},${p.note||''}\n` })
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `Paiements-${filterFrom}-${filterTo}.csv`; a.click()
  }

  const FormContent = (
    <form onSubmit={savePaiement} className="space-y-4">
      <div><label className="label">Date</label>
        <input className="input" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required /></div>
      <div><label className="label">Client</label>
        <select className="input" value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})} required>
          <option value="">Sélectionner...</option>
          {clients.map(c=><option key={c.id} value={c.id}>{c.nom} — {fmt(c.solde||0)} DHS</option>)}
        </select>
      </div>
      <div><label className="label">Mode de paiement</label>
        <select className="input" value={form.mode} onChange={e=>setForm({...form,mode:e.target.value})}>
          {['Espèce','Chèque','Virement','Paiement fournisseur'].map(m=><option key={m}>{m}</option>)}
        </select>
      </div>
      <div><label className="label">🚛 Camion transporteur (optionnel)</label>
        <select className="input" value={form.camion_id} onChange={e=>setForm({...form,camion_id:e.target.value})}>
          <option value="">— Sans camion —</option>
          {camions.map(c=><option key={c.id} value={c.id}>{c.plaque}{c.chauffeur ? ` — ${c.chauffeur}` : ''}</option>)}
        </select>
      </div>
      <div><label className="label">Montant (DHS)</label>
        <input className="input" type="number" placeholder="50000" value={form.montant} onChange={e=>setForm({...form,montant:e.target.value})} required /></div>
      <div><label className="label">Référence / Note</label>
        <input className="input" placeholder="Chèque N° 123456" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} /></div>
      {selectedClient && montant > 0 && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Solde actuel</span>
            <span className="font-bold text-red-600">{fmt(selectedClient.solde||0)} DHS</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Paiement</span>
            <span className="font-bold text-green-600">− {fmt(montant)} DHS</span>
          </div>
          <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
            <span className="text-gray-700 font-semibold">{soldeApres < 0 ? "🟢 Avance client (crédit)" : "Solde après"}</span>
            <span className={`font-bold text-lg ${soldeApres > 0 ? "text-amber-600" : "text-green-600"}`}>{soldeApres < 0 ? `+${fmt(Math.abs(soldeApres))} DHS` : `${fmt(soldeApres)} DHS`}</span>
          </div>
          {soldeApres < 0 && (
            <div className="text-xs text-green-700 bg-green-50 rounded-lg p-2 mt-1">
              ✅ Ce client aura une avance de <b>{fmt(Math.abs(soldeApres))} DHS</b> déduite des prochaines ventes.
            </div>
          )}
        </div>
      )}
      <button type="submit" disabled={saving} className="btn-success w-full justify-center">
        {saving?'Enregistrement...':'✓ Enregistrer le paiement'}
      </button>
    </form>
  )

  return (
    <Layout title="Paiements" subtitle="Enregistrement et suivi des paiements clients">

      {isMobile ? (
        // ── MOBILE LAYOUT ──
        <div>
          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="stat-card border border-green-100 bg-green-50 text-center">
              <div className="stat-label text-green-600">Total reçu</div>
              <div className="stat-value text-green-700" style={{fontSize:20}}>{fmt(total)} DHS</div>
            </div>
            <div className="stat-card border border-blue-100 bg-blue-50 text-center">
              <div className="stat-label text-blue-600">Paiements</div>
              <div className="stat-value text-blue-700" style={{fontSize:20}}>{filtered.length}</div>
            </div>
          </div>

          {/* New paiement button */}
          <button onClick={() => setShowForm(!showForm)}
            className="w-full mb-4 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all">
            {showForm ? '▲ Fermer' : '💰 + Nouveau paiement'}
          </button>

          {showForm && (
            <div className="card mb-4">{FormContent}</div>
          )}

          {/* Filters collapsible */}
          <button className="mobile-collapse-btn mb-2" onClick={() => setShowFilters(!showFilters)}>
            <span>🔍 Filtres ({filterFrom} → {filterTo})</span>
            <span>{showFilters ? '▲' : '▼'}</span>
          </button>
          {showFilters && (
            <div className="card mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} /></div>
                <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)} /></div>
              </div>
              <div><label className="label">Mode de paiement</label>
                <select className="input" value={filterMode} onChange={e=>setFilterMode(e.target.value)}>
                  <option value="">Tous les modes</option>
                  {['Espèce','Chèque','Virement','Paiement fournisseur'].map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div><label className="label">Client</label>
                <select className="input" value={filterClient} onChange={e=>setFilterClient(e.target.value)}>
                  <option value="">Tous</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>{setFilterClient('');setFilterMode('');setFilterFrom(startOfMonth());setFilterTo(today());setShowFilters(false)}} className="btn-secondary text-xs flex-1 justify-center">↺ Reset</button>
                <button onClick={printPaiements} className="btn-primary text-xs flex-1 justify-center" style={{background:'#4f46e5'}}>🖨️ PDF</button>
                <button onClick={exportCSV} className="btn-primary text-xs flex-1 justify-center" style={{background:'#16a34a'}}>📥 CSV</button>
              </div>
            </div>
          )}

          {/* Mobile cards */}
          {loading ? (
            <div className="text-center text-gray-400 py-10">Chargement...</div>
          ) : (
            <div className="mobile-card-list">
              {filtered.map(p => (
                <div key={p.id} className="mobile-row-card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">{p.client_nom}</div>
                      <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>{fmtDate(p.date)}</div>
                    </div>
                    <div style={{color:'#16a34a',fontWeight:700,fontSize:16}}>− {fmt(p.montant)} DHS</div>
                  </div>
                  <div className="card-meta">
                    <span>💳 {p.mode}</span>
                    {p.camion_plaque && <span>🚛 {p.camion_plaque}</span>}
                    {p.note && <span>📄 {p.note}</span>}
                  </div>
                  <div className="card-actions">
                    <button className="btn-danger" onClick={() => deletePaiement(p.id, p.client_id, p.montant)}>✕ Supprimer</button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="text-center text-gray-400 py-10">Aucun paiement pour cette période</div>}
            </div>
          )}
        </div>
      ) : (
        // ── DESKTOP LAYOUT (unchanged) ──
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">💰 Nouveau paiement</h2>
              {FormContent}
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="card">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h2 className="font-semibold text-gray-900">Historique des paiements</h2>
                <div className="flex gap-2">
                  <button onClick={printPaiements} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ PDF</button>
                  <button onClick={exportCSV} className="btn-primary text-xs px-3 py-1.5" style={{background:'#16a34a'}}>📥 CSV</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 mb-4 items-end">
                <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} /></div>
                <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)} /></div>
                <div><label className="label">Mode de paiement</label>
                <select className="input" value={filterMode} onChange={e=>setFilterMode(e.target.value)}>
                  <option value="">Tous les modes</option>
                  {['Espèce','Chèque','Virement','Paiement fournisseur'].map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div><label className="label">Client</label>
                  <select className="input" value={filterClient} onChange={e=>setFilterClient(e.target.value)} style={{minWidth:'160px'}}>
                    <option value="">Tous</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                <button onClick={()=>{setFilterClient('');setFilterFrom(startOfMonth());setFilterTo(today())}} className="btn-secondary text-xs">↺</button>
              </div>
              <div className="text-sm font-bold text-green-600 mb-3">Total : {fmt(total)} DHS ({filtered.length} paiements)</div>
              {loading ? <div className="text-center text-gray-400 py-10">Chargement...</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr>
                      <th className="th">Date</th><th className="th">Client</th><th className="th">Mode</th>
                      <th className="th">Camion</th>
                      <th className="th text-right">Montant DHS</th><th className="th">Note</th><th className="th"></th>
                    </tr></thead>
                    <tbody>
                      {filtered.map(p=>(
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="td text-gray-500">{fmtDate(p.date)}</td>
                          <td className="td font-semibold">{p.client_nom}</td>
                          <td className="td"><span className="badge-green">{p.mode}</span></td>
                          <td className="td text-gray-500 text-xs">{p.camion_plaque || '—'}</td>
                          <td className="td text-right font-bold text-green-600">− {fmt(p.montant)}</td>
                          <td className="td text-gray-400 text-xs">{p.note||'—'}</td>
                          <td className="td"><button className="btn-danger" onClick={()=>deletePaiement(p.id,p.client_id,p.montant)}>✕</button></td>
                        </tr>
                      ))}
                      {filtered.length===0&&<tr><td colSpan={7} className="td text-center text-gray-400 py-10">Aucun paiement</td></tr>}
                    </tbody>
                    {filtered.length>0&&<tfoot><tr>
                      <td className="tfoot-td" colSpan={4}>TOTAL REÇU ({filtered.length})</td>
                      <td className="tfoot-td text-right text-green-700">− {fmt(total)} DHS</td>
                      <td className="tfoot-td" colSpan={2}></td>
                    </tr></tfoot>}
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
