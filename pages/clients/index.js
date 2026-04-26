import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const today = () => new Date().toISOString().split('T')[0]
const startOfWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().split('T')[0] }
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

export default function Clients() {
  const { user } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [clientVentes, setClientVentes] = useState([])
  const [clientPaiements, setClientPaiements] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nom: '', depot: 'EL HAJEB', tel: '', solde: 0 })
  const [showCustomDepot, setShowCustomDepot] = useState(false)
  const [customDepotValue, setCustomDepotValue] = useState('')
  const DEFAULT_DEPOTS = ['EL HAJEB', 'BERKANE', 'AHFIR', 'TAOUIMA', 'ZAIO']
  const getAllDepots = () => {
    const fromClients = clients.map(c => c.depot).filter(Boolean)
    return [...new Set([...DEFAULT_DEPOTS, ...fromClients])].sort()
  }
  const [saving, setSaving] = useState(false)

  // DATE FILTER STATE
  const [filterType, setFilterType] = useState('all') // all | day | week | month | custom
  const [filterDate, setFilterDate] = useState(today())
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo, setFilterTo] = useState(today())

  useEffect(() => { loadClients() }, [])

  async function loadClients() {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').order('solde', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  async function selectClient(client) {
    setSelected(client)
    setLoadingDetail(true)
    const [{ data: ventes }, { data: paiements }] = await Promise.all([
      supabase.from('ventes').select('*').eq('client_id', client.id).order('date', { ascending: true }),
      supabase.from('paiements').select('*').eq('client_id', client.id).order('date', { ascending: true }),
    ])
    setClientVentes(ventes || [])
    setClientPaiements(paiements || [])
    setLoadingDetail(false)
  }

  async function addClient(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('clients').insert({ ...form, solde: parseFloat(form.solde) || 0 })
    setSaving(false)
    setShowForm(false)
    setForm({ nom: '', depot: 'EL HAJEB', tel: '', solde: 0 })
    loadClients()
  }

  async function deleteClient(id) {
    if (!confirm('Supprimer ce client ?')) return
    await supabase.from('clients').delete().eq('id', id)
    if (selected?.id === id) setSelected(null)
    loadClients()
  }

  async function editSolde(client) {
    const v = prompt(`Modifier le solde de ${client.nom} (actuel: ${fmt(client.solde)} DHS) :`, client.solde || 0)
    if (v === null) return
    const n = parseFloat(v)
    if (isNaN(n)) return
    await supabase.from('clients').update({ solde: n }).eq('id', client.id)
    loadClients()
    if (selected?.id === client.id) setSelected({ ...selected, solde: n })
  }

  // ---- DATE FILTER LOGIC ----
  function getDateRange() {
    if (filterType === 'all') return { from: null, to: null }
    if (filterType === 'day') return { from: filterDate, to: filterDate }
    if (filterType === 'week') return { from: startOfWeek(), to: today() }
    if (filterType === 'month') return { from: startOfMonth(), to: today() }
    if (filterType === 'custom') return { from: filterFrom, to: filterTo }
    return { from: null, to: null }
  }

  function filterByDate(items) {
    const { from, to } = getDateRange()
    if (!from && !to) return items
    return items.filter(item => {
      const d = item.date
      return (!from || d >= from) && (!to || d <= to)
    })
  }

  function getFilterLabel() {
    const { from, to } = getDateRange()
    if (!from) return 'Toutes les dates'
    if (filterType === 'day') return `Jour: ${filterDate}`
    if (filterType === 'week') return `Cette semaine`
    if (filterType === 'month') return `Ce mois`
    return `Du ${from} au ${to}`
  }

  const filteredVentes = filterByDate(clientVentes)
  const filteredPaiements = filterByDate(clientPaiements)

  // ---- PRINT ----
  function printClient() {
    const totalVentes = filteredVentes.reduce((s, v) => s + (v.total_vente || 0), 0)
    const totalMarge = filteredVentes.reduce((s, v) => s + (v.marge || 0), 0)
    const totalPaiements = filteredPaiements.reduce((s, p) => s + (p.montant || 0), 0)
    const date = new Date().toLocaleDateString('fr-MA', { day: 'numeric', month: 'long', year: 'numeric' })
    const periode = getFilterLabel()

    const win = window.open('', '_blank')
    win.document.write(`
      <!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8">
      <title>Fiche Client — ${selected.nom}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:30px;color:#111;font-size:13px}
        h1{font-size:22px;margin-bottom:4px}
        .sub{color:#888;font-size:13px;margin-bottom:20px}
        .badge{display:inline-block;background:#eff6ff;color:#1d4ed8;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;margin-bottom:16px}
        .info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px}
        .info-box{background:#f5f5f5;border-radius:8px;padding:12px;text-align:center}
        .info-box .lbl{font-size:11px;color:#888;text-transform:uppercase;margin-bottom:4px}
        .info-box .val{font-size:20px;font-weight:800}
        .red{color:#dc2626}.green{color:#16a34a}.blue{color:#1d4ed8}
        h2{font-size:15px;margin:20px 0 8px;border-bottom:2px solid #eee;padding-bottom:6px}
        table{width:100%;border-collapse:collapse;margin-bottom:20px}
        th{background:#f5f5f5;text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;color:#888;border-bottom:1px solid #ddd}
        td{padding:8px 10px;border-bottom:1px solid #f0f0f0}
        tfoot td{background:#eff6ff;font-weight:800;color:#1d4ed8;border-top:2px solid #bfdbfe}
        .footer{margin-top:30px;padding-top:12px;border-top:1px solid #ddd;color:#aaa;font-size:11px;text-align:center}
        @media print{button{display:none}}
      </style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
        <div>
          <h1>🏗️ DAR SADIK — Fiche Client</h1>
          <div class="sub">Selouane — Nador | Imprimé le ${date}</div>
        </div>
        <button onclick="window.print()" style="padding:10px 20px;background:#1a5fa8;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer">🖨️ Imprimer</button>
      </div>

      <div style="background:#1a5fa8;color:white;border-radius:12px;padding:16px 20px;margin-bottom:12px;display:flex;align-items:center;gap:16px">
        <div style="width:50px;height:50px;background:rgba(255,255,255,0.2);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900">${selected.nom[0]}</div>
        <div>
          <div style="font-size:20px;font-weight:800">${selected.nom}</div>
          <div style="opacity:0.8;margin-top:2px">Dépôt: ${selected.depot || '—'} ${selected.tel ? `| 📞 ${selected.tel}` : ''}</div>
        </div>
      </div>

      <div class="badge">📅 Période: ${periode}</div>

      <div class="info-grid">
        <div class="info-box"><div class="lbl">Solde dû</div><div class="val red">${fmt(selected.solde || 0)} DHS</div></div>
        <div class="info-box"><div class="lbl">Total ventes</div><div class="val blue">${fmt(totalVentes)} DHS</div></div>
        <div class="info-box"><div class="lbl">Total payé</div><div class="val green">${fmt(totalPaiements)} DHS</div></div>
      </div>

      <h2>📦 Ventes (${filteredVentes.length})</h2>
      <table>
        <thead><tr><th>Date</th><th>Transport</th><th>Produit</th><th style="text-align:right">Qté</th><th style="text-align:right">Prix/u DHS</th><th style="text-align:right">Total DHS</th></tr></thead>
        <tbody>${filteredVentes.map(v=>`<tr><td>${v.date}</td><td>${v.camion_plaque||'—'}</td><td><b>${v.type_brique||'—'}</b></td><td style="text-align:right">${fmt(v.qte)}</td><td style="text-align:right">${parseFloat(v.prix_vente||0).toFixed(2)}</td><td style="text-align:right"><b>${fmt(v.total_vente)}</b></td></tr>`).join('')}
        ${filteredVentes.length===0?'<tr><td colspan="6" style="text-align:center;color:#aaa;padding:20px">Aucune vente pour cette période</td></tr>':''}
        </tbody>
        ${filteredVentes.length>0?`<tfoot><tr><td colspan="3">TOTAL</td><td style="text-align:right">${fmt(filteredVentes.reduce((s,v)=>s+(v.qte||0),0))}</td><td></td><td style="text-align:right">${fmt(totalVentes)} DHS</td></tr></tfoot>`:''}
      </table>

      <h2>💰 Paiements (${filteredPaiements.length})</h2>
      <table>
        <thead><tr><th>Date</th><th>Mode</th><th style="text-align:right">Montant DHS</th><th>Note</th></tr></thead>
        <tbody>${filteredPaiements.map(p=>`<tr><td>${p.date}</td><td>${p.mode}</td><td style="text-align:right;color:#16a34a"><b>− ${fmt(p.montant)}</b></td><td style="color:#aaa">${p.note||'—'}</td></tr>`).join('')}
        ${filteredPaiements.length===0?'<tr><td colspan="4" style="text-align:center;color:#aaa;padding:20px">Aucun paiement pour cette période</td></tr>':''}
        </tbody>
        ${filteredPaiements.length>0?`<tfoot><tr><td colspan="2">TOTAL REÇU</td><td style="text-align:right;color:#16a34a">− ${fmt(totalPaiements)} DHS</td><td></td></tr></tfoot>`:''}
      </table>
      <div class="footer">DAR SADIK — Selouane, Nador | Document généré automatiquement</div>
      </body></html>`)
    win.document.close()
  }

  // ---- EXPORT CSV ----
  function exportClientExcel() {
    const totalVentes = filteredVentes.reduce((s, v) => s + (v.total_vente || 0), 0)
    const totalPaiements = filteredPaiements.reduce((s, p) => s + (p.montant || 0), 0)
    const periode = getFilterLabel()

    let csv = `FICHE CLIENT — DAR SADIK\n`
    csv += `Nom,${selected.nom}\nDépôt,${selected.depot||''}\nTéléphone,${selected.tel||''}\nSolde DHS,${selected.solde||0}\nPériode,${periode}\nTotal Ventes DHS,${totalVentes}\nTotal Paiements DHS,${totalPaiements}\n\n`
    csv += `VENTES\nDate,Transport,Type,Quantité,Prix Vente/u,Total DHS\n`
    filteredVentes.forEach(v => {
      csv += `${v.date},${v.camion_plaque},${v.type_brique||''},${v.qte||0},${v.prix_vente||0},${v.total_vente||0}\n`
    })
    csv += `\nPAIEMENTS\nDate,Mode,Montant DHS,Note\n`
    filteredPaiements.forEach(p => {
      csv += `${p.date},${p.mode},${p.montant||0},${p.note||''}\n`
    })

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Client-${selected.nom}-${periode.replace(/[^a-zA-Z0-9]/g,'-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = clients.filter(c => !search || (c.nom + c.depot).toLowerCase().includes(search.toLowerCase()))
  const totalCreances = filtered.reduce((s, c) => s + (c.solde || 0), 0)
  const totalVentesClient = filteredVentes.reduce((s, v) => s + (v.total_vente || 0), 0)
  const totalPaiementsClient = filteredPaiements.reduce((s, p) => s + (p.montant || 0), 0)

  return (
    <Layout title="Clients" subtitle="Gestion des clients et suivi des comptes">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* CLIENT LIST */}
        <div className="lg:col-span-1">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Liste clients</h2>
              <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs px-3 py-1.5">+ Nouveau</button>
            </div>

            {showForm && (
              <form onSubmit={addClient} className="bg-blue-50 rounded-xl p-4 mb-4 space-y-3">
                <div>
                  <label className="label">Nom complet</label>
                  <input className="input" placeholder="Nom du client" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Dépôt</label>
                    {!showCustomDepot ? (
                      <div className="flex gap-1">
                        <select className="input flex-1" value={form.depot} onChange={e => setForm({...form, depot: e.target.value})}>
                          {getAllDepots().map(d => <option key={d}>{d}</option>)}
                        </select>
                        <button type="button" title="Ajouter un nouveau dépôt"
                          onClick={() => setShowCustomDepot(true)}
                          className="btn-secondary text-xs px-2">+ Nouveau</button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <input className="input flex-1" placeholder="Nom du dépôt..." value={customDepotValue}
                          onChange={e => setCustomDepotValue(e.target.value.toUpperCase())} />
                        <button type="button" className="btn-primary text-xs px-2"
                          onClick={() => { if(customDepotValue.trim()) { setForm({...form, depot: customDepotValue.trim()}); setShowCustomDepot(false) } }}>
                          ✓
                        </button>
                        <button type="button" className="btn-secondary text-xs px-2"
                          onClick={() => setShowCustomDepot(false)}>✕</button>
                      </div>
                    )}
                    {showCustomDepot && <div className="text-xs text-gray-400 mt-1">Tapez le nom du nouveau dépôt</div>}
                  </div>
                  <div>
                    <label className="label">Téléphone</label>
                    <input className="input" placeholder="06 ..." value={form.tel} onChange={e => setForm({...form, tel: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="label">Solde initial (DHS)</label>
                  <input className="input" type="number" value={form.solde} onChange={e => setForm({...form, solde: e.target.value})} />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={saving} className="btn-primary text-xs">{saving ? 'Enregistrement...' : '✓ Enregistrer'}</button>
                  <button type="button" className="btn-secondary text-xs" onClick={() => setShowForm(false)}>Annuler</button>
                </div>
              </form>
            )}

            <input className="input mb-3" placeholder="Rechercher un client..." value={search} onChange={e => setSearch(e.target.value)} />

            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {loading ? (
                <div className="text-center text-gray-400 py-6">Chargement...</div>
              ) : filtered.map(c => {
                const s = c.solde || 0
                const isActive = selected?.id === c.id
                return (
                  <div key={c.id} onClick={() => selectClient(c)}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border
                      ${isActive ? 'bg-brand-50 border-brand-200' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'}`}>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-sm truncate ${isActive ? 'text-brand-700' : 'text-gray-900'}`}>{c.nom}</div>
                      <div className="text-xs text-gray-400">{c.depot}</div>
                    </div>
                    <div className={`text-xs font-bold ${s >= 100000 ? 'text-red-600' : s >= 30000 ? 'text-amber-600' : s > 0 ? 'text-blue-600' : 'text-green-600'}`}>
                      {fmt(s)} DHS
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && <div className="text-center text-gray-400 py-6">Aucun client</div>}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-sm">
              <span className="text-gray-500 font-medium">Total créances</span>
              <span className="font-bold text-red-600">{fmt(totalCreances)} DHS</span>
            </div>
          </div>
        </div>

        {/* CLIENT DETAIL */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="card flex flex-col items-center justify-center py-20 text-center">
              <div className="text-4xl mb-4">👈</div>
              <div className="text-gray-500 font-medium">Sélectionnez un client</div>
              <div className="text-gray-400 text-sm mt-1">pour voir son historique complet</div>
            </div>
          ) : (
            <div className="space-y-4">

              {/* CLIENT HEADER */}
              <div className="card">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-brand-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                      <span className="text-brand-700 font-black text-xl">{selected.nom[0]}</span>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selected.nom}</h2>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="badge-gray">{selected.depot}</span>
                        {selected.tel && <span className="text-sm text-gray-500">📞 {selected.tel}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={printClient} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ Imprimer</button>
                    <button onClick={exportClientExcel} className="btn-primary text-xs px-3 py-1.5" style={{background:'#16a34a'}}>📥 Excel</button>
                    <button onClick={() => editSolde(selected)} className="btn-secondary text-xs">✎ Solde</button>
                    <button onClick={() => deleteClient(selected.id)} className="btn-danger">✕</button>
                  </div>
                </div>

                {/* DATE FILTER BAR */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">📅 Filtrer par période</div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {[
                      { key: 'all', label: 'Tout' },
                      { key: 'day', label: 'Jour' },
                      { key: 'week', label: 'Semaine' },
                      { key: 'month', label: 'Mois' },
                      { key: 'custom', label: 'Personnalisé' },
                    ].map(f => (
                      <button key={f.key} onClick={() => setFilterType(f.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all
                          ${filterType === f.key ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {filterType === 'day' && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Date:</label>
                      <input type="date" className="input text-xs" style={{width:'160px'}} value={filterDate} onChange={e => setFilterDate(e.target.value)} />
                    </div>
                  )}
                  {filterType === 'custom' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-xs text-gray-500">Du:</label>
                      <input type="date" className="input text-xs" style={{width:'150px'}} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
                      <label className="text-xs text-gray-500">Au:</label>
                      <input type="date" className="input text-xs" style={{width:'150px'}} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
                    </div>
                  )}
                  {filterType !== 'all' && (
                    <div className="mt-2 text-xs text-brand-600 font-semibold">
                      📅 Période affichée: {getFilterLabel()}
                    </div>
                  )}
                </div>

                {/* TOTALS */}
                <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-1">Solde dû</div>
                    <div className={`text-2xl font-bold ${(selected.solde || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(selected.solde || 0)} DHS</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-1">Ventes {filterType !== 'all' ? '(période)' : ''}</div>
                    <div className="text-2xl font-bold text-blue-600">{fmt(totalVentesClient)} DHS</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-1">Payé {filterType !== 'all' ? '(période)' : ''}</div>
                    <div className="text-2xl font-bold text-green-600">{fmt(totalPaiementsClient)} DHS</div>
                  </div>
                </div>
              </div>

              {loadingDetail ? (
                <div className="card text-center py-10 text-gray-400">Chargement...</div>
              ) : (
                <>
                  {/* VENTES */}
                  <div className="card">
                    <h3 className="font-semibold text-gray-900 mb-3">📦 Ventes ({filteredVentes.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="th">Date</th><th className="th">Transport</th>
                            <th className="th">Type</th><th className="th text-right">Qté</th>
                            <th className="th text-right">Prix/u DHS</th><th className="th text-right">Total DHS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredVentes.map(v => (
                            <tr key={v.id} className="hover:bg-gray-50">
                              <td className="td text-gray-500">{v.date}</td>
                              <td className="td">{v.camion_plaque}</td>
                              <td className="td"><span className="badge-gray">{v.type_brique || '—'}</span></td>
                              <td className="td text-right">{fmt(v.qte)}</td>
                              <td className="td text-right">{parseFloat(v.prix_vente||0).toFixed(2)}</td>
                              <td className="td text-right font-bold">{fmt(v.total_vente)}</td>
                            </tr>
                          ))}
                          {filteredVentes.length === 0 && <tr><td colSpan={7} className="td text-center text-gray-400 py-6">Aucune vente pour cette période</td></tr>}
                        </tbody>
                        {filteredVentes.length > 0 && (
                          <tfoot>
                            <tr>
                              <td className="tfoot-td" colSpan={3}>TOTAL</td>
                              <td className="tfoot-td text-right">{fmt(filteredVentes.reduce((s,v)=>s+(v.qte||0),0))}</td>
                              <td className="tfoot-td"></td>
                              <td className="tfoot-td text-right">{fmt(totalVentesClient)} DHS</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  {/* PAIEMENTS */}
                  <div className="card">
                    <h3 className="font-semibold text-gray-900 mb-3">💰 Paiements ({filteredPaiements.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="th">Date</th><th className="th">Mode</th>
                            <th className="th text-right">Montant DHS</th><th className="th">Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPaiements.map(p => (
                            <tr key={p.id} className="hover:bg-gray-50">
                              <td className="td text-gray-500">{p.date}</td>
                              <td className="td"><span className="badge-green">{p.mode}</span></td>
                              <td className="td text-right font-bold text-green-600">− {fmt(p.montant)}</td>
                              <td className="td text-gray-400 text-xs">{p.note || '—'}</td>
                            </tr>
                          ))}
                          {filteredPaiements.length === 0 && <tr><td colSpan={4} className="td text-center text-gray-400 py-6">Aucun paiement pour cette période</td></tr>}
                        </tbody>
                        {filteredPaiements.length > 0 && (
                          <tfoot>
                            <tr>
                              <td className="tfoot-td" colSpan={2}>TOTAL REÇU</td>
                              <td className="tfoot-td text-right text-green-700">− {fmt(totalPaiementsClient)} DHS</td>
                              <td className="tfoot-td"></td>
                            </tr>
                          </tfoot>
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
