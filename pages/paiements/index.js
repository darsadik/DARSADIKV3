import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const today = () => new Date().toISOString().split('T')[0]
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

const PRINT_CSS = `
  body{font-family:Arial,sans-serif;padding:30px;font-size:13px;color:#111}
  h1{font-size:20px;margin-bottom:4px}.sub{color:#888;font-size:12px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;margin-top:14px}
  th{background:#f5f5f5;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;border-bottom:1px solid #ddd}
  td{padding:8px 10px;border-bottom:1px solid #f0f0f0}
  tfoot td{background:#f0fdf4;font-weight:800;border-top:2px solid #bbf7d0}
  .print-btn{padding:8px 16px;background:#1a5fa8;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px}
  @media print{.print-btn{display:none}}
`

export default function Paiements() {
  const { user } = useAuth()
  const [clients, setClients] = useState([])
  const [paiements, setPaiements] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filterClient, setFilterClient] = useState('')
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo, setFilterTo] = useState(today())
  const [form, setForm] = useState({ date: today(), client_id: '', mode: 'Espèce', montant: '', note: '' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: cl }, { data: pa }] = await Promise.all([
      supabase.from('clients').select('*').order('nom'),
      // ✅ date ASC — oldest to newest
      supabase.from('paiements').select('*').order('date', { ascending: true }),
    ])
    setClients(cl || [])
    setPaiements(pa || [])
    setLoading(false)
  }

  const selectedClient = clients.find(c => c.id === parseInt(form.client_id))
  const montant = parseFloat(form.montant) || 0
  const soldeApres = Math.max(0, (selectedClient?.solde || 0) - montant)

  async function savePaiement(e) {
    e.preventDefault()
    if (!form.client_id || !montant) return
    setSaving(true)
    const client = selectedClient
    await supabase.from('paiements').insert({
      date: form.date, client_id: parseInt(form.client_id),
      client_nom: client?.nom || '', mode: form.mode,
      montant, note: form.note
    })
    if (client) await supabase.from('clients').update({ solde: Math.max(0, (client.solde || 0) - montant) }).eq('id', client.id)
    setSaving(false)
    setForm({ date: today(), client_id: '', mode: 'Espèce', montant: '', note: '' })
    loadAll()
  }

  async function deletePaiement(id, clientId, montant) {
    if (!confirm('Supprimer ce paiement ?')) return
    const client = clients.find(c => c.id === clientId)
    await supabase.from('paiements').delete().eq('id', id)
    if (client) await supabase.from('clients').update({ solde: (client.solde || 0) + montant }).eq('id', clientId)
    loadAll()
  }

  // ✅ Filter then ensure ASC
  const filtered = paiements
    .filter(p => {
      if (filterClient && p.client_id !== parseInt(filterClient)) return false
      if (filterFrom && p.date < filterFrom) return false
      if (filterTo && p.date > filterTo) return false
      return true
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  const total = filtered.reduce((s, p) => s + (p.montant || 0), 0)

  function printPaiements() {
    const rows = filtered.map(p =>
      `<tr><td>${p.date}</td><td><b>${p.client_nom}</b></td>
      <td>${p.mode}</td>
      <td style="text-align:right;color:#16a34a"><b>− ${fmt(p.montant)}</b></td>
      <td style="color:#aaa">${p.note||'—'}</td></tr>`
    ).join('')

    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${PRINT_CSS}</style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div><h1>💰 DAR SADIK — Paiements</h1>
        <div class="sub">Période: ${filterFrom} → ${filterTo}${filterClient?' | Client: '+selectedClient?.nom:''} | Généré le ${new Date().toLocaleDateString('fr-MA')}</div></div>
        <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Client</th><th>Mode</th><th style="text-align:right">Montant DHS</th><th>Référence</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="3">TOTAL REÇU (${filtered.length} paiements)</td>
          <td style="text-align:right;color:#16a34a">− ${fmt(total)} DHS</td>
          <td></td>
        </tr></tfoot>
      </table>
    </body></html>`)
    win.document.close()
  }

  function exportCSV() {
    let csv = `Date,Client,Mode,Montant DHS,Référence\n`
    filtered.forEach(p => { csv += `${p.date},${p.client_nom},${p.mode},${p.montant||0},${p.note||''}\n` })
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `Paiements-${filterFrom}-${filterTo}.csv`; a.click()
  }

  return (
    <Layout title="Paiements" subtitle="Enregistrement et suivi des paiements clients">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* FORM */}
        <div className="lg:col-span-1">
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">💰 Nouveau paiement</h2>
            <form onSubmit={savePaiement} className="space-y-4">
              <div>
                <label className="label">Date</label>
                <input className="input" type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} required />
              </div>
              <div>
                <label className="label">Client</label>
                <select className="input" value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})} required>
                  <option value="">Sélectionner un client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nom} — {fmt(c.solde || 0)} DHS</option>)}
                </select>
              </div>
              <div>
                <label className="label">Mode de paiement</label>
                <select className="input" value={form.mode} onChange={e => setForm({...form, mode: e.target.value})}>
                  {['Espèce','Chèque','Virement','Versement chauffeur'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Montant (DHS)</label>
                <input className="input" type="number" placeholder="ex: 50000" value={form.montant} onChange={e => setForm({...form, montant: e.target.value})} required />
              </div>
              <div>
                <label className="label">Référence / Note</label>
                <input className="input" type="text" placeholder="ex: Chèque N° 123456" value={form.note} onChange={e => setForm({...form, note: e.target.value})} />
              </div>
              {selectedClient && montant > 0 && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Solde actuel</span>
                    <span className="font-bold text-red-600">{fmt(selectedClient.solde || 0)} DHS</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Paiement</span>
                    <span className="font-bold text-green-600">− {fmt(montant)} DHS</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
                    <span className="text-gray-700 font-semibold">Solde après</span>
                    <span className={`font-bold text-lg ${soldeApres > 0 ? 'text-amber-600' : 'text-green-600'}`}>{fmt(soldeApres)} DHS</span>
                  </div>
                </div>
              )}
              <button type="submit" disabled={saving} className="btn-success w-full justify-center">
                {saving ? 'Enregistrement...' : '✓ Enregistrer le paiement'}
              </button>
            </form>
          </div>
        </div>

        {/* HISTORY */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="font-semibold text-gray-900">Historique des paiements</h2>
              <div className="flex gap-2 flex-wrap">
                <button onClick={printPaiements} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ Imprimer / PDF</button>
                <button onClick={exportCSV} className="btn-primary text-xs px-3 py-1.5" style={{background:'#16a34a'}}>📥 CSV</button>
              </div>
            </div>

            {/* FILTERS */}
            <div className="flex flex-wrap gap-3 mb-4 items-end">
              <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} /></div>
              <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)} /></div>
              <div><label className="label">Client</label>
                <select className="input" value={filterClient} onChange={e=>setFilterClient(e.target.value)} style={{minWidth:'160px'}}>
                  <option value="">Tous les clients</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <button onClick={()=>{setFilterClient('');setFilterFrom(startOfMonth());setFilterTo(today())}} className="btn-secondary text-xs">↺</button>
            </div>

            <div className="text-sm font-bold text-green-600 mb-3">Total affiché : {fmt(total)} DHS ({filtered.length} paiements)</div>

            {loading ? (
              <div className="text-center text-gray-400 py-10">Chargement...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Client</th>
                      <th className="th">Mode</th>
                      <th className="th text-right">Montant DHS</th>
                      <th className="th">Note / Référence</th>
                      <th className="th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="td text-gray-500">{p.date}</td>
                        <td className="td font-semibold text-gray-900">{p.client_nom}</td>
                        <td className="td"><span className="badge-green">{p.mode}</span></td>
                        <td className="td text-right font-bold text-green-600">− {fmt(p.montant)}</td>
                        <td className="td text-gray-400 text-xs">{p.note || '—'}</td>
                        <td className="td">
                          <button className="btn-danger" onClick={() => deletePaiement(p.id, p.client_id, p.montant)}>✕</button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={6} className="td text-center text-gray-400 py-10">Aucun paiement pour cette période</td></tr>
                    )}
                  </tbody>
                  {filtered.length > 0 && (
                    <tfoot>
                      <tr>
                        <td className="tfoot-td" colSpan={3}>TOTAL REÇU ({filtered.length})</td>
                        <td className="tfoot-td text-right text-green-700">− {fmt(total)} DHS</td>
                        <td className="tfoot-td" colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
