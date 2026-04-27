import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const ADMIN = 'abdelhafidbaadi@gmail.com'
const fmt  = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtD = n => parseFloat(n || 0).toFixed(2)
const today = () => new Date().toISOString().split('T')[0]
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

const PRINT_CSS = `
  body{font-family:Arial,sans-serif;padding:30px;font-size:13px;color:#111}
  h1{font-size:20px;margin-bottom:4px}.sub{color:#888;font-size:12px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  th{background:#f5f5f5;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;border-bottom:1px solid #ddd}
  td{padding:8px 10px;border-bottom:1px solid #f0f0f0}
  tfoot td{background:#fefce8;font-weight:800;color:#92400e;border-top:2px solid #fde68a}
  .section-title{font-size:14px;font-weight:700;margin:24px 0 8px;border-bottom:2px solid #eee;padding-bottom:6px}
  .print-btn{padding:8px 16px;background:#1a5fa8;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px}
  @media print{.print-btn{display:none}}
`

function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const check = () => setM(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return m
}

export default function Grignon() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const admin = user?.email === ADMIN

  // ── Grignon-isolated data (never mixed with main project) ──
  const [operations, setOperations]     = useState([])
  const [clients, setClients]           = useState([])       // grignon_clients
  const [camions, setCamions]           = useState([])       // grignon_camions
  const [fournisseurs, setFournisseurs] = useState([])       // grignon_fournisseurs
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)

  // ui
  const [view, setView]                 = useState('dashboard') // dashboard | client | fournisseur | camion | saisie
  const [filterFrom, setFilterFrom]     = useState(startOfMonth())
  const [filterTo, setFilterTo]         = useState(today())
  const [filterClient, setFilterClient] = useState('')
  const [filterFourn, setFilterFourn]   = useState('')
  const [filterCamion, setFilterCamion] = useState('')
  const [showFilters, setShowFilters]   = useState(false)

  // client/fournisseur/camion management
  const [newClientNom, setNewClientNom]           = useState('')
  const [newFournNom, setNewFournNom]             = useState('')
  const [newCamionPlaque, setNewCamionPlaque]     = useState('')
  const [newCamionChauffeur, setNewCamionChauffeur] = useState('')

  // form
  const [form, setForm] = useState({
    date: today(), client_id: '', camion_id: '', fournisseur_id: '',
    qte: '', prix_achat: '', prix_vente: '', note: ''
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    // ALL queries use grignon_* tables — completely isolated from main project
    const [{ data: ops }, { data: cl }, { data: ca }, { data: fo }] = await Promise.all([
      supabase.from('grignon_operations').select('*').order('date', { ascending: true }),
      supabase.from('grignon_clients').select('*').order('nom'),
      supabase.from('grignon_camions').select('*').order('plaque'),
      supabase.from('grignon_fournisseurs').select('*').order('nom'),
    ])
    setOperations(ops || [])
    setClients(cl || [])
    setCamions(ca || [])
    setFournisseurs(fo || [])
    setLoading(false)
  }

  // ── computed preview ──
  const qte      = parseFloat(form.qte) || 0
  const pAchat   = parseFloat(form.prix_achat) || 0
  const pVente   = parseFloat(form.prix_vente) || 0
  const totAchat = Math.round(qte * pAchat * 100) / 100
  const totVente = Math.round(qte * pVente * 100) / 100
  const marge    = Math.round((totVente - totAchat) * 100) / 100

  async function saveOperation(e) {
    e.preventDefault()
    if (!admin) return
    setSaving(true)
    const cl = clients.find(c => c.id === parseInt(form.client_id))
    const ca = camions.find(c => c.id === parseInt(form.camion_id))
    const fo = fournisseurs.find(f => f.id === parseInt(form.fournisseur_id))

    // inserts into grignon_operations — never touches main tables
    await supabase.from('grignon_operations').insert({
      date:            form.date,
      client_id:       form.client_id   ? parseInt(form.client_id)   : null,
      client_nom:      cl?.nom  || '',
      camion_id:       form.camion_id   ? parseInt(form.camion_id)   : null,
      camion_plaque:   ca?.plaque || '',
      chauffeur:       ca?.chauffeur || '',
      fournisseur_id:  form.fournisseur_id ? parseInt(form.fournisseur_id) : null,
      fournisseur_nom: fo?.nom  || '',
      qte,
      prix_achat:  pAchat,
      prix_vente:  pVente,
      total_achat: totAchat,
      total_vente: totVente,
      marge,
      note: form.note,
    })

    // update grignon client solde — NOT main clients table
    if (cl && totVente > 0) {
      await supabase.from('grignon_clients').update({ solde: (cl.solde || 0) + totVente }).eq('id', cl.id)
    }

    setSaving(false)
    setForm({ date: today(), client_id: '', camion_id: '', fournisseur_id: '', qte: '', prix_achat: '', prix_vente: '', note: '' })
    loadAll()
  }

  async function deleteOperation(op) {
    if (!admin) return
    if (!confirm('Supprimer cette opération ?')) return
    await supabase.from('grignon_operations').delete().eq('id', op.id)
    if (op.client_id && op.total_vente) {
      const cl = clients.find(c => c.id === op.client_id)
      if (cl) await supabase.from('grignon_clients').update({ solde: Math.max(0, (cl.solde || 0) - op.total_vente) }).eq('id', cl.id)
    }
    loadAll()
  }

  // ── Grignon client management ──
  async function addClient(e) {
    e.preventDefault()
    if (!admin || !newClientNom.trim()) return
    await supabase.from('grignon_clients').insert({ nom: newClientNom.trim(), solde: 0 })
    setNewClientNom('')
    loadAll()
  }

  async function deleteClient(id) {
    if (!admin || !confirm('Supprimer ce client grignon ?')) return
    await supabase.from('grignon_clients').delete().eq('id', id)
    loadAll()
  }

  // ── Grignon fournisseur management ──
  async function addFournisseur(e) {
    e.preventDefault()
    if (!admin || !newFournNom.trim()) return
    await supabase.from('grignon_fournisseurs').insert({ nom: newFournNom.trim() })
    setNewFournNom('')
    loadAll()
  }

  async function deleteFournisseur(id) {
    if (!admin || !confirm('Supprimer ce fournisseur grignon ?')) return
    await supabase.from('grignon_fournisseurs').delete().eq('id', id)
    loadAll()
  }

  // ── Grignon camion management ──
  async function addCamion(e) {
    e.preventDefault()
    if (!admin || !newCamionPlaque.trim()) return
    await supabase.from('grignon_camions').insert({ plaque: newCamionPlaque.trim(), chauffeur: newCamionChauffeur.trim() })
    setNewCamionPlaque('')
    setNewCamionChauffeur('')
    loadAll()
  }

  async function deleteCamion(id) {
    if (!admin || !confirm('Supprimer ce camion grignon ?')) return
    await supabase.from('grignon_camions').delete().eq('id', id)
    loadAll()
  }

  // ── filtering ──
  const applyFilters = (list) => list.filter(op => {
    if (filterFrom  && op.date < filterFrom) return false
    if (filterTo    && op.date > filterTo)   return false
    if (filterClient && op.client_id !== parseInt(filterClient)) return false
    if (filterFourn  && op.fournisseur_nom !== filterFourn) return false
    if (filterCamion && op.camion_plaque  !== filterCamion) return false
    return true
  })

  const filtered = applyFilters(operations)
  const uniqueFourns  = [...new Set(operations.map(o => o.fournisseur_nom).filter(Boolean))]
  const uniqueCamions = [...new Set(operations.map(o => o.camion_plaque).filter(Boolean))]

  // ── Grignon KPIs — fully isolated from main dashboard ──
  const totalKg    = operations.reduce((s, o) => s + (o.qte || 0), 0)
  const totalAchat = operations.reduce((s, o) => s + (o.total_achat || 0), 0)
  const totalVente = operations.reduce((s, o) => s + (o.total_vente || 0), 0)
  const totalMarge = operations.reduce((s, o) => s + (o.marge || 0), 0)
  const totalClients = clients.length
  const totalCreances = clients.reduce((s, c) => s + (c.solde || 0), 0)

  // month stats for dashboard
  const thisMonth = startOfMonth()
  const monthOps  = operations.filter(o => o.date >= thisMonth)
  const monthKg   = monthOps.reduce((s, o) => s + (o.qte || 0), 0)
  const monthAchat= monthOps.reduce((s, o) => s + (o.total_achat || 0), 0)
  const monthVente= monthOps.reduce((s, o) => s + (o.total_vente || 0), 0)
  const monthMarge= monthOps.reduce((s, o) => s + (o.marge || 0), 0)

  // top clients by volume
  const byClient = {}
  filtered.forEach(op => {
    const n = op.client_nom || 'Sans client'
    if (!byClient[n]) byClient[n] = { vente: 0, qte: 0 }
    byClient[n].vente += op.total_vente || 0
    byClient[n].qte   += op.qte || 0
  })
  const topClients = Object.entries(byClient).sort((a,b) => b[1].vente - a[1].vente).slice(0, 5)

  // top fournisseurs
  const byFourn = {}
  filtered.forEach(op => {
    const n = op.fournisseur_nom || 'Sans fournisseur'
    if (!byFourn[n]) byFourn[n] = { achat: 0, qte: 0 }
    byFourn[n].achat += op.total_achat || 0
    byFourn[n].qte   += op.qte || 0
  })
  const topFourns = Object.entries(byFourn).sort((a,b) => b[1].achat - a[1].achat).slice(0, 5)

  // ── TABS ──
  const tabs = [
    { key: 'dashboard',    label: '📊 Tableau de bord' },
    { key: 'client',       label: '👤 Clients' },
    { key: 'fournisseur',  label: '🏭 Fournisseurs', adminOnly: true },
    { key: 'camion',       label: '🚛 Camions' },
    ...(admin ? [
      { key: 'gestion',   label: '⚙️ Gestion' },
      { key: 'saisie',    label: '➕ Saisie' },
    ] : []),
  ].filter(t => !t.adminOnly || admin)

  // ── PRINT HELPERS ──
  function printClientView() {
    const rows = filtered.map(op => `
      <tr>
        <td>${op.date}</td>
        <td><b>${op.client_nom || '—'}</b></td>
        <td style="text-align:right">${fmtD(op.qte)} kg</td>
        <td style="text-align:right">${fmtD(op.prix_vente)}</td>
        <td style="text-align:right"><b>${fmt(op.total_vente)}</b></td>
        <td>${op.camion_plaque || '—'}</td>
      </tr>`).join('')
    const totQte   = filtered.reduce((s, o) => s + (o.qte || 0), 0)
    const totVente = filtered.reduce((s, o) => s + (o.total_vente || 0), 0)
    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Grignon (Fitour) — Ventes Clients</title>
      <style>${PRINT_CSS}</style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div><h1>🫒 DAR SADIK — Grignon (Fitour) · Ventes Clients</h1>
        <div class="sub">Période: ${filterFrom} → ${filterTo} | Généré le ${new Date().toLocaleDateString('fr-MA')}</div></div>
        <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
      </div>
      <table>
        <thead><tr>
          <th>Date</th><th>Client</th>
          <th style="text-align:right">Qté (kg)</th>
          <th style="text-align:right">Prix/kg DHS</th>
          <th style="text-align:right">Total DHS</th>
          <th>Transport</th>
        </tr></thead>
        <tbody>${rows}${filtered.length===0?'<tr><td colspan="6" style="text-align:center;color:#aaa;padding:20px">Aucune opération</td></tr>':''}</tbody>
        ${filtered.length>0?`<tfoot><tr>
          <td colspan="2">TOTAL (${filtered.length})</td>
          <td style="text-align:right">${fmtD(totQte)} kg</td>
          <td></td>
          <td style="text-align:right">${fmt(totVente)} DHS</td>
          <td></td>
        </tr></tfoot>`:''}
      </table>
      </body></html>`)
    win.document.close()
  }

  function printFournisseurView() {
    const byF = {}
    filtered.forEach(op => {
      const f = op.fournisseur_nom || 'Sans fournisseur'
      if (!byF[f]) byF[f] = { days: {}, total_qte: 0, total_achat: 0 }
      byF[f].total_qte   += op.qte || 0
      byF[f].total_achat += op.total_achat || 0
      if (!byF[f].days[op.date]) byF[f].days[op.date] = { qte: 0, total: 0, prix: op.prix_achat }
      byF[f].days[op.date].qte   += op.qte || 0
      byF[f].days[op.date].total += op.total_achat || 0
    })
    const sections = Object.entries(byF).map(([fourn, data]) => {
      const dayRows = Object.entries(data.days).sort(([a],[b])=>a.localeCompare(b)).map(([date, d]) =>
        `<tr><td>${date}</td><td style="text-align:right">${fmtD(d.qte)} kg</td>
         <td style="text-align:right">${fmtD(d.prix)}</td>
         <td style="text-align:right"><b>${fmt(d.total)}</b></td></tr>`
      ).join('')
      return `
        <div class="section-title">🏭 ${fourn}</div>
        <table>
          <thead><tr><th>Date</th><th style="text-align:right">Qté (kg)</th><th style="text-align:right">Prix/kg DHS</th><th style="text-align:right">Total Achat DHS</th></tr></thead>
          <tbody>${dayRows}</tbody>
          <tfoot><tr><td>TOTAL</td><td style="text-align:right">${fmtD(data.total_qte)} kg</td><td></td><td style="text-align:right">${fmt(data.total_achat)} DHS</td></tr></tfoot>
        </table>`
    }).join('')
    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Grignon (Fitour) — Achats Fournisseurs</title>
      <style>${PRINT_CSS}</style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div><h1>🫒 DAR SADIK — Grignon (Fitour) · Achats Fournisseurs</h1>
        <div class="sub">Période: ${filterFrom} → ${filterTo} | Généré le ${new Date().toLocaleDateString('fr-MA')}</div></div>
        <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
      </div>
      ${sections || '<p style="color:#aaa">Aucune donnée pour cette période</p>'}
      </body></html>`)
    win.document.close()
  }

  function printCamionView() {
    const byCamion = {}
    filtered.forEach(op => {
      const p = op.camion_plaque || 'Sans camion'
      if (!byCamion[p]) byCamion[p] = []
      byCamion[p].push(op)
    })
    const sections = Object.entries(byCamion).map(([plaque, ops]) => {
      const rows = ops.map(op => `<tr>
        <td>${op.date}</td>
        <td>${op.fournisseur_nom||'—'}</td>
        <td>${op.client_nom||'—'}</td>
        <td style="text-align:right">${fmtD(op.qte)} kg</td>
        <td>${op.client_id ? 'Vente' : 'Achat'}</td>
      </tr>`).join('')
      const totKg = ops.reduce((s,o)=>s+(o.qte||0),0)
      return `
        <div class="section-title">🚛 ${plaque}</div>
        <table>
          <thead><tr><th>Date</th><th>Fournisseur</th><th>Client</th><th style="text-align:right">Qté (kg)</th><th>Type</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td colspan="3">TOTAL (${ops.length} op.)</td><td style="text-align:right">${fmtD(totKg)} kg</td><td></td></tr></tfoot>
        </table>`
    }).join('')
    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Grignon (Fitour) — Camions</title>
      <style>${PRINT_CSS}</style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div><h1>🫒 DAR SADIK — Grignon (Fitour) · Suivi Camions</h1>
        <div class="sub">Période: ${filterFrom} → ${filterTo} | Généré le ${new Date().toLocaleDateString('fr-MA')}</div></div>
        <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
      </div>
      ${sections || '<p style="color:#aaa">Aucune donnée pour cette période</p>'}
      </body></html>`)
    win.document.close()
  }

  // ──────────────────────────────────────────────────────────
  //  DASHBOARD — fully separate from main project dashboard
  // ──────────────────────────────────────────────────────────
  function DashboardView() {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">🫒</span>
          <h2 className="text-xl font-bold text-gray-900">Tableau de bord — Grignon (Fitour)</h2>
          <span className="ml-2 text-xs bg-amber-100 text-amber-700 rounded-full px-3 py-1 font-semibold">Module isolé</span>
        </div>

        {/* All-time KPIs */}
        <div>
          <div className="text-xs font-bold text-gray-400 uppercase mb-2">Totaux globaux</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="stat-card border border-amber-100 bg-amber-50">
              <div className="stat-label text-amber-600">Total quantité</div>
              <div className="stat-value text-amber-700">{fmtD(totalKg)} kg</div>
              <div className="stat-sub">Tous grignons traités</div>
            </div>
            <div className="stat-card border border-blue-100 bg-blue-50">
              <div className="stat-label text-blue-600">Total achats</div>
              <div className="stat-value text-blue-700">{fmt(totalAchat)} DHS</div>
              <div className="stat-sub">Fournisseurs grignon</div>
            </div>
            <div className="stat-card border border-purple-100 bg-purple-50">
              <div className="stat-label text-purple-600">Total ventes</div>
              <div className="stat-value text-purple-700">{fmt(totalVente)} DHS</div>
              <div className="stat-sub">Clients grignon</div>
            </div>
            <div className="stat-card border border-green-100 bg-green-50">
              <div className="stat-label text-green-600">Marge brute</div>
              <div className="stat-value text-green-700">{fmt(totalMarge)} DHS</div>
              <div className="stat-sub">{totalVente > 0 ? Math.round(totalMarge / totalVente * 100) : 0}% marge</div>
            </div>
            <div className="stat-card border border-orange-100 bg-orange-50">
              <div className="stat-label text-orange-600">Créances clients</div>
              <div className="stat-value text-orange-700">{fmt(totalCreances)} DHS</div>
              <div className="stat-sub">{totalClients} client(s)</div>
            </div>
            <div className="stat-card border border-gray-100 bg-gray-50">
              <div className="stat-label text-gray-500">Opérations</div>
              <div className="stat-value text-gray-700">{operations.length}</div>
              <div className="stat-sub">Total enregistrées</div>
            </div>
          </div>
        </div>

        {/* Month KPIs */}
        <div>
          <div className="text-xs font-bold text-gray-400 uppercase mb-2">Ce mois-ci</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="stat-card border border-amber-100 bg-amber-50">
              <div className="stat-label text-amber-600">Quantité</div>
              <div className="stat-value text-amber-700">{fmtD(monthKg)} kg</div>
            </div>
            <div className="stat-card border border-blue-100 bg-blue-50">
              <div className="stat-label text-blue-600">Achats</div>
              <div className="stat-value text-blue-700">{fmt(monthAchat)} DHS</div>
            </div>
            <div className="stat-card border border-purple-100 bg-purple-50">
              <div className="stat-label text-purple-600">Ventes</div>
              <div className="stat-value text-purple-700">{fmt(monthVente)} DHS</div>
            </div>
            <div className="stat-card border border-green-100 bg-green-50">
              <div className="stat-label text-green-600">Marge</div>
              <div className="stat-value text-green-700">{fmt(monthMarge)} DHS</div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Top clients */}
          <div className="card">
            <h3 className="font-bold text-gray-900 mb-4">👤 Top clients grignon</h3>
            {topClients.length === 0 ? (
              <div className="text-center text-gray-400 py-6">Aucun client</div>
            ) : (
              <div className="space-y-2">
                {topClients.map(([nom, d]) => (
                  <div key={nom} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="font-semibold text-gray-900">{nom}</div>
                      <div className="text-xs text-gray-400">{fmtD(d.qte)} kg</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-purple-700">{fmt(d.vente)} DHS</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top fournisseurs */}
          <div className="card">
            <h3 className="font-bold text-gray-900 mb-4">🏭 Top fournisseurs grignon</h3>
            {topFourns.length === 0 ? (
              <div className="text-center text-gray-400 py-6">Aucun fournisseur</div>
            ) : (
              <div className="space-y-2">
                {topFourns.map(([nom, d]) => (
                  <div key={nom} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="font-semibold text-gray-900">{nom}</div>
                      <div className="text-xs text-gray-400">{fmtD(d.qte)} kg</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-amber-700">{fmt(d.achat)} DHS</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent ops */}
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-4">📋 Dernières opérations grignon</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Client</th>
                  <th className="th">Fournisseur</th>
                  <th className="th text-right">Qté</th>
                  <th className="th text-right">Vente</th>
                  <th className="th text-right">Marge</th>
                </tr>
              </thead>
              <tbody>
                {[...operations].reverse().slice(0, 8).map(op => (
                  <tr key={op.id} className="hover:bg-gray-50">
                    <td className="td text-gray-500">{op.date}</td>
                    <td className="td font-semibold">{op.client_nom || '—'}</td>
                    <td className="td text-gray-500">{op.fournisseur_nom || '—'}</td>
                    <td className="td text-right">{fmtD(op.qte)} kg</td>
                    <td className="td text-right font-bold text-purple-700">{fmt(op.total_vente)}</td>
                    <td className="td text-right font-bold text-green-600">{fmt(op.marge)}</td>
                  </tr>
                ))}
                {operations.length === 0 && (
                  <tr><td colSpan={6} className="td text-center text-gray-400 py-8">Aucune opération</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // ── VIEW COMPONENTS ──
  function ClientView() {
    const totQte   = filtered.reduce((s,o)=>s+(o.qte||0),0)
    const totVente = filtered.reduce((s,o)=>s+(o.total_vente||0),0)
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-bold text-gray-900">{filtered.length} opération(s)</h3>
          <div className="flex gap-2">
            <button onClick={printClientView} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ PDF</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th">Client</th>
                <th className="th text-right">Qté (kg)</th>
                <th className="th text-right">Prix/kg DHS</th>
                <th className="th text-right">Total DHS</th>
                <th className="th">Transport</th>
                {admin && <th className="th"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(op => (
                <tr key={op.id} className="hover:bg-gray-50">
                  <td className="td text-gray-500">{op.date}</td>
                  <td className="td font-semibold">{op.client_nom || '—'}</td>
                  <td className="td text-right">{fmtD(op.qte)}</td>
                  <td className="td text-right text-gray-500">{fmtD(op.prix_vente)}</td>
                  <td className="td text-right font-bold">{fmt(op.total_vente)}</td>
                  <td className="td text-gray-500">{op.camion_plaque || '—'}</td>
                  {admin && <td className="td"><button onClick={() => deleteOperation(op)} className="btn-danger text-xs">✕</button></td>}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="td text-center text-gray-400 py-8">Aucune opération</td></tr>}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr>
                  <td className="tfoot-td" colSpan={2}>TOTAL ({filtered.length})</td>
                  <td className="tfoot-td text-right">{fmtD(totQte)} kg</td>
                  <td className="tfoot-td"></td>
                  <td className="tfoot-td text-right">{fmt(totVente)} DHS</td>
                  <td className="tfoot-td" colSpan={admin ? 2 : 1}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    )
  }

  function FournisseurView() {
    if (!admin) return (
      <div className="card flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <div className="text-xl font-bold text-gray-900">Accès restreint</div>
        <div className="text-gray-500 mt-2">Réservé à l'administrateur</div>
      </div>
    )
    const byF = {}
    filtered.forEach(op => {
      const f = op.fournisseur_nom || 'Sans fournisseur'
      if (!byF[f]) byF[f] = { days: {}, total_qte: 0, total_achat: 0, total_vente: 0, total_marge: 0 }
      byF[f].total_qte   += op.qte || 0
      byF[f].total_achat += op.total_achat || 0
      byF[f].total_vente += op.total_vente || 0
      byF[f].total_marge += op.marge || 0
      if (!byF[f].days[op.date]) byF[f].days[op.date] = { qte: 0, total_achat: 0, prix: op.prix_achat }
      byF[f].days[op.date].qte         += op.qte || 0
      byF[f].days[op.date].total_achat += op.total_achat || 0
    })
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <button onClick={printFournisseurView} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ PDF Fournisseurs</button>
        </div>
        {Object.entries(byF).map(([fourn, data]) => (
          <div key={fourn} className="card">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="font-bold text-lg text-brand-700">🏭 {fourn}</h3>
              <div className="flex gap-4 text-sm">
                <span className="text-gray-500">Total: <b className="text-gray-900">{fmtD(data.total_qte)} kg</b></span>
                <span className="text-gray-500">Achat: <b className="text-amber-700">{fmt(data.total_achat)} DHS</b></span>
                <span className="text-gray-500">Marge: <b className="text-green-600">{fmt(data.total_marge)} DHS</b></span>
              </div>
            </div>
            <div className="text-xs font-bold text-gray-500 uppercase mb-2">📅 Suivi journalier</div>
            <div className="overflow-x-auto mb-4">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Date</th>
                    <th className="th text-right">Qté (kg)</th>
                    <th className="th text-right">Prix/kg DHS</th>
                    <th className="th text-right">Total Achat DHS</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.days).sort(([a],[b])=>a.localeCompare(b)).map(([date, d]) => (
                    <tr key={date} className="hover:bg-gray-50">
                      <td className="td font-semibold">{date}</td>
                      <td className="td text-right">{fmtD(d.qte)}</td>
                      <td className="td text-right text-gray-500">{fmtD(d.prix)}</td>
                      <td className="td text-right font-bold text-amber-700">{fmt(d.total_achat)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="tfoot-td">TOTAL</td>
                    <td className="tfoot-td text-right">{fmtD(data.total_qte)} kg</td>
                    <td className="tfoot-td"></td>
                    <td className="tfoot-td text-right">{fmt(data.total_achat)} DHS</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ))}
        {Object.keys(byF).length === 0 && <div className="card text-center py-10 text-gray-400">Aucune donnée</div>}
      </div>
    )
  }

  function CamionView() {
    const byCamion = {}
    filtered.forEach(op => {
      const p = op.camion_plaque || 'Sans camion'
      if (!byCamion[p]) byCamion[p] = { ops: [], total_qte: 0, chauffeur: op.chauffeur || '' }
      byCamion[p].ops.push(op)
      byCamion[p].total_qte += op.qte || 0
    })
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <button onClick={printCamionView} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ PDF Camions</button>
        </div>
        {Object.entries(byCamion).sort((a,b) => b[1].total_qte - a[1].total_qte).map(([plaque, data]) => (
          <div key={plaque} className="card">
            <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
              <div>
                <div className="text-lg font-bold text-gray-900">🚛 {plaque}</div>
                {data.chauffeur && <div className="text-sm text-gray-500 mt-1">👤 {data.chauffeur}</div>}
              </div>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-amber-50 rounded-xl p-3">
                  <div className="text-xs text-gray-400">Opérations</div>
                  <div className="text-xl font-bold text-amber-600">{data.ops.length}</div>
                </div>
                <div className="bg-green-50 rounded-xl p-3">
                  <div className="text-xs text-gray-400">Total kg</div>
                  <div className="text-xl font-bold text-green-600">{fmtD(data.total_qte)}</div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Fournisseur</th>
                    <th className="th">Client</th>
                    <th className="th text-right">Qté (kg)</th>
                    <th className="th">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ops.map(op => (
                    <tr key={op.id} className="hover:bg-gray-50">
                      <td className="td text-gray-500">{op.date}</td>
                      <td className="td text-gray-600">{op.fournisseur_nom || '—'}</td>
                      <td className="td font-semibold">{op.client_nom || '—'}</td>
                      <td className="td text-right">{fmtD(op.qte)}</td>
                      <td className="td">
                        <span className={op.client_id ? 'badge-blue' : 'badge-gray'}>
                          {op.client_id ? 'Vente' : 'Achat'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="tfoot-td" colSpan={3}>TOTAL ({data.ops.length})</td>
                    <td className="tfoot-td text-right">{fmtD(data.total_qte)} kg</td>
                    <td className="tfoot-td"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ))}
        {Object.keys(byCamion).length === 0 && <div className="card text-center py-10 text-gray-400">Aucune donnée</div>}
      </div>
    )
  }

  // ── Gestion tab: manage grignon clients / fournisseurs / camions ──
  function GestionView() {
    if (!admin) return (
      <div className="card flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <div className="text-xl font-bold text-gray-900">Accès restreint</div>
      </div>
    )
    return (
      <div className="space-y-6">
        {/* Clients */}
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-4">👤 Clients Grignon</h3>
          <form onSubmit={addClient} className="flex gap-2 mb-4">
            <input className="input flex-1" placeholder="Nom du client grignon" value={newClientNom} onChange={e=>setNewClientNom(e.target.value)} required />
            <button type="submit" className="btn-primary">+ Ajouter</button>
          </form>
          <div className="space-y-2">
            {clients.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                <div>
                  <span className="font-semibold">{c.nom}</span>
                  <span className="ml-3 text-xs text-orange-600">Solde: {fmt(c.solde)} DHS</span>
                </div>
                <button onClick={() => deleteClient(c.id)} className="btn-danger text-xs">✕</button>
              </div>
            ))}
            {clients.length === 0 && <div className="text-gray-400 text-sm">Aucun client grignon</div>}
          </div>
        </div>

        {/* Fournisseurs */}
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-4">🏭 Fournisseurs Grignon</h3>
          <form onSubmit={addFournisseur} className="flex gap-2 mb-4">
            <input className="input flex-1" placeholder="Nom du fournisseur grignon" value={newFournNom} onChange={e=>setNewFournNom(e.target.value)} required />
            <button type="submit" className="btn-primary">+ Ajouter</button>
          </form>
          <div className="space-y-2">
            {fournisseurs.map(f => (
              <div key={f.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                <span className="font-semibold">{f.nom}</span>
                <button onClick={() => deleteFournisseur(f.id)} className="btn-danger text-xs">✕</button>
              </div>
            ))}
            {fournisseurs.length === 0 && <div className="text-gray-400 text-sm">Aucun fournisseur grignon</div>}
          </div>
        </div>

        {/* Camions */}
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-4">🚛 Camions Grignon</h3>
          <form onSubmit={addCamion} className="flex gap-2 mb-4 flex-wrap">
            <input className="input" placeholder="Plaque" value={newCamionPlaque} onChange={e=>setNewCamionPlaque(e.target.value)} required />
            <input className="input" placeholder="Chauffeur (optionnel)" value={newCamionChauffeur} onChange={e=>setNewCamionChauffeur(e.target.value)} />
            <button type="submit" className="btn-primary">+ Ajouter</button>
          </form>
          <div className="space-y-2">
            {camions.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                <div>
                  <span className="font-semibold">{c.plaque}</span>
                  {c.chauffeur && <span className="ml-2 text-xs text-gray-500">— {c.chauffeur}</span>}
                </div>
                <button onClick={() => deleteCamion(c.id)} className="btn-danger text-xs">✕</button>
              </div>
            ))}
            {camions.length === 0 && <div className="text-gray-400 text-sm">Aucun camion grignon</div>}
          </div>
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────
  //  RENDER
  // ──────────────────────────────────────────────────────────
  return (
    <Layout title="Grignon (Fitour)" subtitle="Module isolé — achats, ventes et transport">

      {/* Module badge */}
      <div className="flex items-center gap-3 mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl">
        <span className="text-2xl">🫒</span>
        <div>
          <div className="font-bold text-amber-800">Module Grignon (Fitour)</div>
          <div className="text-xs text-amber-600">Clients, fournisseurs et camions séparés du projet principal</div>
        </div>
      </div>

      {/* Grignon KPI summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card border border-amber-100 bg-amber-50">
          <div className="stat-label text-amber-600">Total kg</div>
          <div className="stat-value text-amber-700">{fmtD(totalKg)} kg</div>
          <div className="stat-sub">Grignon traités</div>
        </div>
        <div className="stat-card border border-blue-100 bg-blue-50">
          <div className="stat-label text-blue-600">Total achats</div>
          <div className="stat-value text-blue-700">{fmt(totalAchat)} DHS</div>
          <div className="stat-sub">Fournisseurs</div>
        </div>
        <div className="stat-card border border-purple-100 bg-purple-50">
          <div className="stat-label text-purple-600">Total ventes</div>
          <div className="stat-value text-purple-700">{fmt(totalVente)} DHS</div>
          <div className="stat-sub">Clients</div>
        </div>
        <div className="stat-card border border-green-100 bg-green-50">
          <div className="stat-label text-green-600">Marge brute</div>
          <div className="stat-value text-green-700">{fmt(totalMarge)} DHS</div>
          <div className="stat-sub">{totalVente > 0 ? Math.round(totalMarge / totalVente * 100) : 0}%</div>
        </div>
      </div>

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

      {/* FILTERS — only shown for data views */}
      {['client','fournisseur','camion'].includes(view) && (
        isMobile ? (
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
                <div><label className="label">Client grignon</label>
                  <select className="input" value={filterClient} onChange={e=>setFilterClient(e.target.value)}>
                    <option value="">Tous</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                <div><label className="label">Camion grignon</label>
                  <select className="input" value={filterCamion} onChange={e=>setFilterCamion(e.target.value)}>
                    <option value="">Tous</option>{uniqueCamions.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <button onClick={()=>{setFilterClient('');setFilterFourn('');setFilterCamion('');setFilterFrom(startOfMonth());setFilterTo(today());setShowFilters(false)}}
                  className="btn-secondary w-full justify-center text-xs">↺ Réinitialiser</button>
              </div>
            )}
            <div className="text-xs text-gray-400 mt-2 px-1">{filtered.length} opération(s) — {fmtD(filtered.reduce((s,o)=>s+(o.qte||0),0))} kg</div>
          </div>
        ) : (
          <div className="card mb-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} /></div>
              <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)} /></div>
              <div><label className="label">Client grignon</label>
                <select className="input" value={filterClient} onChange={e=>setFilterClient(e.target.value)}>
                  <option value="">Tous</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              {admin && <div><label className="label">Fournisseur grignon</label>
                <select className="input" value={filterFourn} onChange={e=>setFilterFourn(e.target.value)}>
                  <option value="">Tous</option>{uniqueFourns.map(f=><option key={f}>{f}</option>)}
                </select>
              </div>}
              <div><label className="label">Camion grignon</label>
                <select className="input" value={filterCamion} onChange={e=>setFilterCamion(e.target.value)}>
                  <option value="">Tous</option>{uniqueCamions.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <button onClick={()=>{setFilterClient('');setFilterFourn('');setFilterCamion('');setFilterFrom(startOfMonth());setFilterTo(today())}}
                className="btn-secondary text-xs">↺ Réinitialiser</button>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              {filtered.length} opération(s) — {fmtD(filtered.reduce((s,o)=>s+(o.qte||0),0))} kg — ventes: {fmt(filtered.reduce((s,o)=>s+(o.total_vente||0),0))} DHS
            </div>
          </div>
        )
      )}

      {/* SAISIE FORM */}
      {view === 'saisie' && admin && (
        <div className="card mb-4">
          <h3 className="font-bold text-gray-900 mb-4">➕ Nouvelle opération grignon (fitour)</h3>
          <form onSubmit={saveOperation}>
            <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4'} gap-3 mb-3`}>
              <div><label className="label">Date</label>
                <input type="date" className="input" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required />
              </div>
              <div><label className="label">Client grignon</label>
                <select className="input" value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})}>
                  <option value="">— Sans client —</option>
                  {clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div><label className="label">Fournisseur grignon</label>
                <select className="input" value={form.fournisseur_id} onChange={e=>setForm({...form,fournisseur_id:e.target.value})}>
                  <option value="">— Sans fournisseur —</option>
                  {fournisseurs.map(f=><option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
              </div>
              <div><label className="label">Camion grignon</label>
                <select className="input" value={form.camion_id} onChange={e=>setForm({...form,camion_id:e.target.value})}>
                  <option value="">— Sans camion —</option>
                  {camions.map(c=><option key={c.id} value={c.id}>{c.plaque}{c.chauffeur?` — ${c.chauffeur}`:''}</option>)}
                </select>
              </div>
            </div>
            <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-3'} gap-3 mb-3`}>
              <div><label className="label">Quantité (kg)</label>
                <input type="number" step="0.01" className="input" placeholder="ex: 500" value={form.qte} onChange={e=>setForm({...form,qte:e.target.value})} required />
              </div>
              <div><label className="label">Prix achat / kg (DHS)</label>
                <input type="number" step="0.01" className="input" placeholder="ex: 30.00" value={form.prix_achat} onChange={e=>setForm({...form,prix_achat:e.target.value})} />
              </div>
              <div><label className="label">Prix vente / kg (DHS)</label>
                <input type="number" step="0.01" className="input" placeholder="ex: 35.00" value={form.prix_vente} onChange={e=>setForm({...form,prix_vente:e.target.value})} />
              </div>
            </div>
            <div className="mb-3">
              <label className="label">Note (optionnel)</label>
              <input className="input" placeholder="..." value={form.note} onChange={e=>setForm({...form,note:e.target.value})} />
            </div>

            {/* PREVIEW */}
            {qte > 0 && (pAchat > 0 || pVente > 0) && (
              <div className="grid grid-cols-3 gap-3 bg-amber-50 rounded-xl p-4 mb-4 text-center">
                <div><div className="text-xs text-gray-400">Total achat</div><div className="text-lg font-bold text-amber-700">{fmt(totAchat)} DHS</div></div>
                <div><div className="text-xs text-gray-400">Total vente</div><div className="text-lg font-bold text-blue-700">{fmt(totVente)} DHS</div></div>
                <div><div className="text-xs text-gray-400">Marge</div><div className={`text-lg font-bold ${marge>=0?'text-green-600':'text-red-600'}`}>{fmt(marge)} DHS</div></div>
              </div>
            )}

            <button type="submit" disabled={saving} className={`btn-primary ${isMobile ? 'w-full justify-center' : ''}`}>
              {saving ? 'Enregistrement...' : '✓ Enregistrer'}
            </button>
          </form>
        </div>
      )}

      {/* VIEWS */}
      {loading ? (
        <div className="card text-center py-10 text-gray-400">Chargement...</div>
      ) : (
        <>
          {view === 'dashboard'    && <DashboardView />}
          {view === 'client'       && <ClientView />}
          {view === 'fournisseur'  && <FournisseurView />}
          {view === 'camion'       && <CamionView />}
          {view === 'gestion'      && <GestionView />}
        </>
      )}
    </Layout>
  )
}
