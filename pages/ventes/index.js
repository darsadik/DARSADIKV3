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
  const [fournTab, setFournTab] = useState('produit')

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
    <style>
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      body { font-family: Arial, sans-serif; padding: 28px; font-size: 12px; color: #000 !important; background: #fff !important; margin: 0; }
      h1 { font-size: 18px; margin: 0 0 4px; color: #000 !important; }
      h2 { font-size: 15px; color: #000 !important; }
      .sub, .subtitle { color: #555 !important; font-size: 11px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { background: #1e293b !important; color: #fff !important; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #000 !important; }
      tr:nth-child(even) td { background: #f8fafc !important; }
      tfoot td { background: #f1f5f9 !important; font-weight: 800 !important; color: #000 !important; border-top: 2px solid #334155 !important; font-size: 12px; }
      b, strong { color: #000 !important; font-weight: 800; }
      .right, [style*="text-align:right"], [style*="text-align: right"] { text-align: right; }
      .header-block { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #1e293b; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; background: #e2e8f0 !important; color: #000 !important; border: 1px solid #cbd5e1; }
      .fourn-block { margin-bottom: 24px; page-break-inside: avoid; }
      .fourn-header { background: #1e293b !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .fourn-title { font-size: 13px; font-weight: 800; color: #fff !important; }
      .prod-block { margin-bottom: 12px; }
      .prod-header { background: #f1f5f9 !important; border-left: 4px solid #1e293b; padding: 5px 10px; font-weight: 700; font-size: 11px; color: #000 !important; margin-bottom: 4px; border-radius: 0 4px 4px 0; }
      .grand-tfoot td { background: #e2e8f0 !important; font-weight: 900 !important; color: #000 !important; border-top: 3px solid #1e293b !important; font-size: 13px; }
      .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #888 !important; font-size: 10px; text-align: center; }
      .camion-header { background: #0f172a !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
      .info-box { background: #f8fafc !important; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
      .info-box b { display: block; margin-bottom: 4px; color: #000 !important; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
      .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 50px; }
      .sig { text-align: center; border-top: 1px solid #94a3b8; padding-top: 8px; color: #555 !important; font-size: 11px; }
      @media print {
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        button, .no-print { display: none !important; }
        body { padding: 0; }
      }
</style></head><body>
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
    { key: 'fournisseur', label: '🏭 Fournisseur', },
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

  // ── FOURNISSEUR VIEW ─────────────────────────────────────────
  const [fFilterFrom, setFFilterFrom] = useState(startOfMonth())
  const [fFilterTo,   setFFilterTo]   = useState(today())
  const [fFilterFourn, setFFilterFourn] = useState('')

  const fQuick = (label) => {
    const now = new Date()
    const pad = n => String(n).padStart(2,'0')
    if (label === 'today') {
      const d = today(); setFFilterFrom(d); setFFilterTo(d)
    } else if (label === 'week') {
      const day = now.getDay() || 7
      const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      setFFilterFrom(mon.toISOString().split('T')[0])
      setFFilterTo(sun.toISOString().split('T')[0])
    } else if (label === 'month') {
      setFFilterFrom(`${now.getFullYear()}-${pad(now.getMonth()+1)}-01`)
      setFFilterTo(today())
    } else if (label === 'year') {
      setFFilterFrom(`${now.getFullYear()}-01-01`)
      setFFilterTo(`${now.getFullYear()}-12-31`)
    }
  }

  const fFiltered = ventes.filter(v => {
    if (fFilterFrom && v.date < fFilterFrom) return false
    if (fFilterTo   && v.date > fFilterTo)   return false
    if (fFilterFourn && v.fournisseur !== fFilterFourn) return false
    return true
  }).slice().sort((a,b) => a.date.localeCompare(b.date))

  function buildFournisseurReportHTML() {
    const byFourn = {}
    fFiltered.forEach(v => {
      const f = v.fournisseur || 'Sans fournisseur'
      if (!byFourn[f]) byFourn[f] = { ops: [] }
      byFourn[f].ops.push(v)
    })

    const css = `
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      body { font-family: Arial, sans-serif; padding: 28px; font-size: 12px; color: #000 !important; background: #fff !important; margin: 0; }
      h1 { font-size: 18px; margin: 0 0 4px; color: #000 !important; }
      h2 { font-size: 15px; color: #000 !important; }
      .sub, .subtitle { color: #555 !important; font-size: 11px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { background: #1e293b !important; color: #fff !important; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #000 !important; }
      tr:nth-child(even) td { background: #f8fafc !important; }
      tfoot td { background: #f1f5f9 !important; font-weight: 800 !important; color: #000 !important; border-top: 2px solid #334155 !important; font-size: 12px; }
      b, strong { color: #000 !important; font-weight: 800; }
      .right, [style*="text-align:right"], [style*="text-align: right"] { text-align: right; }
      .header-block { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #1e293b; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; background: #e2e8f0 !important; color: #000 !important; border: 1px solid #cbd5e1; }
      .fourn-block { margin-bottom: 24px; page-break-inside: avoid; }
      .fourn-header { background: #1e293b !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .fourn-title { font-size: 13px; font-weight: 800; color: #fff !important; }
      .prod-block { margin-bottom: 12px; }
      .prod-header { background: #f1f5f9 !important; border-left: 4px solid #1e293b; padding: 5px 10px; font-weight: 700; font-size: 11px; color: #000 !important; margin-bottom: 4px; border-radius: 0 4px 4px 0; }
      .grand-tfoot td { background: #e2e8f0 !important; font-weight: 900 !important; color: #000 !important; border-top: 3px solid #1e293b !important; font-size: 13px; }
      .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #888 !important; font-size: 10px; text-align: center; }
      .camion-header { background: #0f172a !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
      .info-box { background: #f8fafc !important; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
      .info-box b { display: block; margin-bottom: 4px; color: #000 !important; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
      .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 50px; }
      .sig { text-align: center; border-top: 1px solid #94a3b8; padding-top: 8px; color: #555 !important; font-size: 11px; }
      @media print {
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        button, .no-print { display: none !important; }
        body { padding: 0; }
      }
`

    const sections = Object.entries(byFourn).map(([fourn, data]) => {
      const totQte   = data.ops.reduce((s,v)=>s+(v.qte||0),0)
      const totAchat = data.ops.reduce((s,v)=>s+(v.total_achat||0),0)
      const rows = data.ops.map(v => `<tr>
        <td>${v.date}</td>
        <td><b>${fourn}</b></td>
        <td>${v.type_brique||'—'}</td>
        <td style="text-align:right">${fmt(v.qte)}</td>
        <td style="text-align:right">${fmtD(v.prix_achat)}</td>
        <td style="text-align:right"><b>${fmt(v.total_achat)}</b></td>
      </tr>`).join('')
      return `
        <div class="fourn-block">
          <div class="fourn-header">
            <div class="fourn-title">🏭 ${fourn}</div>
            <div style="font-size:11px;opacity:.9">${data.ops.length} op. · ${fmt(totQte)} briques · ${fmt(totAchat)} DHS</div>
          </div>
          <table>
            <thead><tr>
              <th>Date</th><th>Fournisseur</th><th>Produit</th>
              <th style="text-align:right">Quantité</th>
              <th style="text-align:right">Prix achat/u DHS</th>
              <th style="text-align:right">Total DHS</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr>
              <td colspan="3">TOTAL (${data.ops.length})</td>
              <td style="text-align:right">${fmt(totQte)}</td>
              <td></td>
              <td style="text-align:right">${fmt(totAchat)} DHS</td>
            </tr></tfoot>
          </table>
        </div>`
    }).join('')

    return `<!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8">
      <title>DAR SADIK — Rapport Fournisseurs</title>
      <style>
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      body { font-family: Arial, sans-serif; padding: 28px; font-size: 12px; color: #000 !important; background: #fff !important; margin: 0; }
      h1 { font-size: 18px; margin: 0 0 4px; color: #000 !important; }
      h2 { font-size: 15px; color: #000 !important; }
      .sub, .subtitle { color: #555 !important; font-size: 11px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { background: #1e293b !important; color: #fff !important; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #000 !important; }
      tr:nth-child(even) td { background: #f8fafc !important; }
      tfoot td { background: #f1f5f9 !important; font-weight: 800 !important; color: #000 !important; border-top: 2px solid #334155 !important; font-size: 12px; }
      b, strong { color: #000 !important; font-weight: 800; }
      .right, [style*="text-align:right"], [style*="text-align: right"] { text-align: right; }
      .header-block { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #1e293b; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; background: #e2e8f0 !important; color: #000 !important; border: 1px solid #cbd5e1; }
      .fourn-block { margin-bottom: 24px; page-break-inside: avoid; }
      .fourn-header { background: #1e293b !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .fourn-title { font-size: 13px; font-weight: 800; color: #fff !important; }
      .prod-block { margin-bottom: 12px; }
      .prod-header { background: #f1f5f9 !important; border-left: 4px solid #1e293b; padding: 5px 10px; font-weight: 700; font-size: 11px; color: #000 !important; margin-bottom: 4px; border-radius: 0 4px 4px 0; }
      .grand-tfoot td { background: #e2e8f0 !important; font-weight: 900 !important; color: #000 !important; border-top: 3px solid #1e293b !important; font-size: 13px; }
      .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #888 !important; font-size: 10px; text-align: center; }
      .camion-header { background: #0f172a !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
      .info-box { background: #f8fafc !important; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
      .info-box b { display: block; margin-bottom: 4px; color: #000 !important; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
      .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 50px; }
      .sig { text-align: center; border-top: 1px solid #94a3b8; padding-top: 8px; color: #555 !important; font-size: 11px; }
      @media print {
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        button, .no-print { display: none !important; }
        body { padding: 0; }
      }
</style>
    </head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
        <div>
          <h1>🏭 DAR SADIK — Rapport Fournisseurs (Achats)</h1>
          <div class="sub">Période: ${fFilterFrom} → ${fFilterTo} | ${Object.keys(byFourn).length} fournisseur(s) | Généré le ${new Date().toLocaleDateString('fr-MA')}</div>
        </div>
        <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
      </div>
      ${sections || '<p style="color:#aaa;text-align:center;padding:40px">Aucune donnée pour cette période</p>'}
      <div class="footer">DAR SADIK — Selouane, Nador | Document généré automatiquement</div>
    </body></html>`
  }

  function printFournisseurReport() {
    const win = window.open('', '_blank')
    win.document.write(buildFournisseurReportHTML())
    win.document.close()
    setTimeout(() => win.print(), 400)
  }

  async function downloadFournisseurPDF() {
    if (!window.html2pdf) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
        s.onload = resolve; s.onerror = reject
        document.head.appendChild(s)
      })
    }
    const tmp = document.createElement('div')
    tmp.innerHTML = buildFournisseurReportHTML()
    const body = tmp.querySelector('body')
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px;background:#fff'
    container.innerHTML = body ? body.innerHTML : tmp.innerHTML
    container.querySelectorAll('.print-btn').forEach(el => el.remove())
    document.body.appendChild(container)
    await window.html2pdf().set({
      margin: [10,10,10,10],
      filename: `Fournisseurs-${fFilterFrom}-${fFilterTo}.pdf`,
      image: { type:'jpeg', quality:0.98 },
      html2canvas: { scale:2, useCORS:true },
      jsPDF: { unit:'mm', format:'a4', orientation:'portrait' },
      pagebreak: { mode:['avoid-all','css'] },
    }).from(container).save()
    document.body.removeChild(container)
  }

  function FournisseurView() {

    // ── GROUP BY PRODUIT (type_brique) ──
    // For each product: per-day quantities + total briques + total price
    const byProduit = {}
    fFiltered.forEach(v => {
      const prod = v.type_brique || 'Sans produit'
      if (!byProduit[prod]) byProduit[prod] = { days: {}, totalQte: 0, totalAchat: 0, ops: [] }
      byProduit[prod].totalQte   += v.qte || 0
      byProduit[prod].totalAchat += v.total_achat || 0
      byProduit[prod].ops.push(v)
      const day = v.date
      if (!byProduit[prod].days[day]) byProduit[prod].days[day] = { qte: 0, total: 0, prix: v.prix_achat || 0 }
      byProduit[prod].days[day].qte   += v.qte || 0
      byProduit[prod].days[day].total += v.total_achat || 0
    })

    // Grand totals across all products
    const grandTotalQte   = Object.values(byProduit).reduce((s, p) => s + p.totalQte, 0)
    const grandTotalAchat = Object.values(byProduit).reduce((s, p) => s + p.totalAchat, 0)

    const byFourn = {}
    fFiltered.forEach(v => {
      const f = v.fournisseur || 'Sans fournisseur'
      if (!byFourn[f]) byFourn[f] = { ops: [], totQte: 0, totAchat: 0 }
      byFourn[f].ops.push(v)
      byFourn[f].totQte   += v.qte || 0
      byFourn[f].totAchat += v.total_achat || 0
    })

    const quickBtns = [
      { label: "Aujourd'hui", key: 'today' },
      { label: 'Cette semaine', key: 'week' },
      { label: 'Ce mois', key: 'month' },
      { label: 'Cette année', key: 'year' },
    ]

    // ── PRODUIT VIEW (inside FournisseurView) ──
    function ProduitView() {
      return (
        <div className="space-y-4">
          {/* Grand total bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="stat-card border border-blue-100 bg-blue-50 col-span-2">
              <div className="stat-label text-blue-600">Total toutes briques</div>
              <div className="stat-value text-blue-700">{fmt(grandTotalQte)} briques</div>
              <div className="stat-sub">{Object.keys(byProduit).length} produit(s)</div>
            </div>
            <div className="stat-card border border-amber-100 bg-amber-50 col-span-2">
              <div className="stat-label text-amber-600">Total achat global</div>
              <div className="stat-value text-amber-700">{fmt(grandTotalAchat)} DHS</div>
              <div className="stat-sub">Tous produits confondus</div>
            </div>
          </div>

          {/* One card per product */}
          {Object.entries(byProduit)
            .sort((a, b) => b[1].totalQte - a[1].totalQte)
            .map(([prod, data]) => (
            <div key={prod} className="card">
              {/* Product header */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2"
                style={{background:'#1a5fa8',borderRadius:10,padding:'10px 16px',color:'#fff',margin:'-16px -16px 16px -16px'}}>
                <div>
                  <div className="font-bold text-lg">📦 {prod}</div>
                  <div className="text-xs opacity-80">{data.ops.length} opération(s)</div>
                </div>
                <div className="flex gap-4 text-sm text-right">
                  <div>
                    <div className="opacity-70 text-xs">Total briques</div>
                    <div className="font-bold text-base">{fmt(data.totalQte)}</div>
                  </div>
                  <div>
                    <div className="opacity-70 text-xs">Total achat</div>
                    <div className="font-bold text-base">{fmt(data.totalAchat)} DHS</div>
                  </div>
                </div>
              </div>

              {/* Daily breakdown table */}
              <div className="text-xs font-bold text-gray-400 uppercase mb-2">📅 Quantités journalières</div>
              {isMobile ? (
                <div className="space-y-2">
                  {Object.entries(data.days)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([day, d]) => (
                    <div key={day} className="flex items-center justify-between py-2 border-b border-gray-50">
                      <div>
                        <div className="font-semibold text-gray-900">{day}</div>
                        <div className="text-xs text-gray-400">{fmtD(d.prix)} DHS/u</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-blue-700">{fmt(d.qte)} briques</div>
                        <div className="text-xs text-amber-600">{fmt(d.total)} DHS</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="th">Date</th>
                        <th className="th">Produit</th>
                        <th className="th text-right">Quantité (briques)</th>
                        <th className="th text-right">Prix achat/u DHS</th>
                        <th className="th text-right">Total DHS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.days)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([day, d]) => (
                        <tr key={day} className="hover:bg-gray-50">
                          <td className="td font-semibold text-gray-700">{day}</td>
                          <td className="td"><span className="badge-blue">{prod}</span></td>
                          <td className="td text-right font-bold text-blue-700">{fmt(d.qte)}</td>
                          <td className="td text-right text-gray-500">{fmtD(d.prix)}</td>
                          <td className="td text-right font-bold text-amber-700">{fmt(d.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="tfoot-td" colSpan={2}>TOTAL {prod} ({Object.keys(data.days).length} jour(s))</td>
                        <td className="tfoot-td text-right">{fmt(data.totalQte)}</td>
                        <td className="tfoot-td"></td>
                        <td className="tfoot-td text-right">{fmt(data.totalAchat)} DHS</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ))}

          {/* Grand total footer */}
          {Object.keys(byProduit).length > 1 && (
            <div className="card" style={{background:'#fefce8',border:'2px solid #fde68a'}}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="font-bold text-amber-900 text-lg">🧾 TOTAL GÉNÉRAL — Tous produits</div>
                <div className="flex gap-6">
                  <div className="text-center">
                    <div className="text-xs text-amber-600">Total briques</div>
                    <div className="text-2xl font-bold text-amber-800">{fmt(grandTotalQte)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-amber-600">Total achat DHS</div>
                    <div className="text-2xl font-bold text-amber-800">{fmt(grandTotalAchat)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {Object.keys(byProduit).length === 0 && (
            <div className="card text-center py-10 text-gray-400">Aucune donnée pour cette période</div>
          )}
        </div>
      )
    }

    return (
      <div className="space-y-4">

        {/* Fournisseur-specific filters */}
        <div className="card">
          <div className="flex flex-wrap gap-2 mb-3">
            {quickBtns.map(q => (
              <button key={q.key} onClick={() => fQuick(q.key)}
                className="px-3 py-1.5 rounded-lg border text-xs font-bold bg-white text-gray-600 border-gray-200 hover:bg-brand-50 hover:border-brand-300 transition-all">
                {q.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div><label className="label">Du</label>
              <input type="date" className="input" value={fFilterFrom} onChange={e=>setFFilterFrom(e.target.value)} />
            </div>
            <div><label className="label">Au</label>
              <input type="date" className="input" value={fFilterTo} onChange={e=>setFFilterTo(e.target.value)} />
            </div>
            <div><label className="label">Fournisseur</label>
              <select className="input" value={fFilterFourn} onChange={e=>setFFilterFourn(e.target.value)}>
                <option value="">Tous</option>
                {uniqueFourns.map(f=><option key={f}>{f}</option>)}
              </select>
            </div>
            <button onClick={()=>{setFFilterFrom(startOfMonth());setFFilterTo(today());setFFilterFourn('')}}
              className="btn-secondary text-xs">↺ Réinitialiser</button>
          </div>
          <div className="mt-2 text-xs text-gray-400">
            {fFiltered.length} opération(s) — {fmt(fFiltered.reduce((s,v)=>s+(v.qte||0),0))} briques — {fmt(fFiltered.reduce((s,v)=>s+(v.total_achat||0),0))} DHS achat
          </div>
        </div>

        {/* Print + PDF */}
        <div className="flex gap-2 justify-end">
          <button onClick={printFournisseurReport}
            className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>
            🖨️ Imprimer
          </button>
          <button onClick={downloadFournisseurPDF}
            className="btn-primary text-xs px-3 py-1.5" style={{background:'#dc2626'}}>
            📄 Télécharger PDF
          </button>
        </div>

        {/* Sub-tabs: Par produit / Par fournisseur */}
        <div className="flex gap-2">
          {[
            { key: 'produit',      label: '📦 Par produit' },
            { key: 'fournisseur',  label: '🏭 Par fournisseur' },
          ].map(t => (
            <button key={t.key} onClick={() => setFournTab(t.key)}
              className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all ${fournTab===t.key?'bg-brand-500 text-white border-brand-500':'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {fournTab === 'produit' && <ProduitView />}

        {fournTab === 'fournisseur' && <div className="space-y-4">
        {/* Per-fournisseur tables */}
        {Object.entries(byFourn).map(([fourn, data]) => (
          <div key={fourn} className="card">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="font-bold text-lg text-brand-700">🏭 {fourn}</h3>
              <div className="flex gap-4 text-sm">
                <span className="text-gray-500">Qté: <b className="text-gray-900">{fmt(data.totQte)} briques</b></span>
                <span className="text-gray-500">Achat: <b className="text-amber-700">{fmt(data.totAchat)} DHS</b></span>
              </div>
            </div>

            {isMobile ? (
              <div className="space-y-2">
                {data.ops.map(v => (
                  <div key={v.id} className="mobile-row-card">
                    <div className="card-header">
                      <div>
                        <div className="card-title">{v.type_brique||'—'}</div>
                        <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>{v.date}</div>
                      </div>
                      <div className="card-amount">{fmt(v.total_achat)} DHS</div>
                    </div>
                    <div className="card-meta">
                      <span>📏 {fmt(v.qte)} briques</span>
                      <span>💲 {fmtD(v.prix_achat)} DHS/u</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Fournisseur</th>
                      <th className="th">Produit</th>
                      <th className="th text-right">Quantité</th>
                      <th className="th text-right">Prix achat/u DHS</th>
                      <th className="th text-right">Total DHS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ops.map(v => (
                      <tr key={v.id} className="hover:bg-gray-50">
                        <td className="td text-gray-500">{v.date}</td>
                        <td className="td font-semibold">{fourn}</td>
                        <td className="td"><span className="badge-blue">{v.type_brique||'—'}</span></td>
                        <td className="td text-right">{fmt(v.qte)}</td>
                        <td className="td text-right text-gray-500">{fmtD(v.prix_achat)}</td>
                        <td className="td text-right font-bold text-amber-700">{fmt(v.total_achat)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="tfoot-td" colSpan={3}>TOTAL ({data.ops.length})</td>
                      <td className="tfoot-td text-right">{fmt(data.totQte)}</td>
                      <td className="tfoot-td"></td>
                      <td className="tfoot-td text-right">{fmt(data.totAchat)} DHS</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        ))}
        {Object.keys(byFourn).length === 0 && <div className="card text-center py-10 text-gray-400">Aucune donnée pour cette période</div>}
        </div>}

      </div>
    )
  }

  // ── CAMION REPORT HTML (shared by print + PDF) ──────────────
  function buildCamionReportHTML() {
    const byCamion = {}
    filtered.forEach(v => {
      const p = v.camion_plaque || 'Sans camion'
      if (!byCamion[p]) byCamion[p] = { voyages: 0, qte: 0, vente: 0, chauffeur: v.chauffeur || '', types: {}, ops: [] }
      byCamion[p].voyages += 1
      byCamion[p].qte    += v.qte || 0
      byCamion[p].vente  += v.total_vente || 0
      const tb = v.type_brique || 'Sans type'
      if (!byCamion[p].types[tb]) byCamion[p].types[tb] = 0
      byCamion[p].types[tb] += v.qte || 0
      byCamion[p].ops.push(v)
    })

    const css = `
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      body { font-family: Arial, sans-serif; padding: 28px; font-size: 12px; color: #000 !important; background: #fff !important; margin: 0; }
      h1 { font-size: 18px; margin: 0 0 4px; color: #000 !important; }
      h2 { font-size: 15px; color: #000 !important; }
      .sub, .subtitle { color: #555 !important; font-size: 11px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { background: #1e293b !important; color: #fff !important; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #000 !important; }
      tr:nth-child(even) td { background: #f8fafc !important; }
      tfoot td { background: #f1f5f9 !important; font-weight: 800 !important; color: #000 !important; border-top: 2px solid #334155 !important; font-size: 12px; }
      b, strong { color: #000 !important; font-weight: 800; }
      .right, [style*="text-align:right"], [style*="text-align: right"] { text-align: right; }
      .header-block { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #1e293b; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; background: #e2e8f0 !important; color: #000 !important; border: 1px solid #cbd5e1; }
      .fourn-block { margin-bottom: 24px; page-break-inside: avoid; }
      .fourn-header { background: #1e293b !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .fourn-title { font-size: 13px; font-weight: 800; color: #fff !important; }
      .prod-block { margin-bottom: 12px; }
      .prod-header { background: #f1f5f9 !important; border-left: 4px solid #1e293b; padding: 5px 10px; font-weight: 700; font-size: 11px; color: #000 !important; margin-bottom: 4px; border-radius: 0 4px 4px 0; }
      .grand-tfoot td { background: #e2e8f0 !important; font-weight: 900 !important; color: #000 !important; border-top: 3px solid #1e293b !important; font-size: 13px; }
      .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #888 !important; font-size: 10px; text-align: center; }
      .camion-header { background: #0f172a !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
      .info-box { background: #f8fafc !important; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
      .info-box b { display: block; margin-bottom: 4px; color: #000 !important; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
      .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 50px; }
      .sig { text-align: center; border-top: 1px solid #94a3b8; padding-top: 8px; color: #555 !important; font-size: 11px; }
      @media print {
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        button, .no-print { display: none !important; }
        body { padding: 0; }
      }
`

    const camionBlocks = Object.entries(byCamion)
      .sort((a, b) => b[1].qte - a[1].qte)
      .map(([plaque, data]) => {
        const opRows = data.ops
          .slice().sort((a, b) => a.date.localeCompare(b.date))
          .map(v => `<tr>
            <td>${v.date}</td>
            <td><b>${v.type_brique || '—'}</b></td>
            <td style="text-align:right">${fmt(v.qte)}</td>
            <td>${v.client_nom || '—'}</td>
            <td>${v.fournisseur || '—'}</td>
            <td><span style="background:${v.client_nom?'#eff6ff':'#f0fdf4'};color:${v.client_nom?'#1d4ed8':'#15803d'};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${v.client_nom ? 'Vente' : 'Achat'}</span></td>
          </tr>`).join('')

        const productPills = Object.entries(data.types)
          .map(([tb, q]) => `<span class="product-pill">${tb} — ${fmt(q)}</span>`).join('')

        return `
          <div class="camion-block">
            <div class="camion-header">
              <div>
                <div class="camion-title">🚛 ${plaque}</div>
                ${data.chauffeur ? `<div class="camion-sub">👤 ${data.chauffeur}</div>` : ''}
              </div>
              <div style="text-align:right;font-size:11px;opacity:.9">
                ${data.voyages} voyage(s) · ${fmt(data.qte)} briques · ${fmt(data.vente)} DHS
              </div>
            </div>
            <div class="stats">
              <div class="stat-box"><div class="lbl">Voyages</div><div class="val">${data.voyages}</div></div>
              <div class="stat-box"><div class="lbl">Briques</div><div class="val">${fmt(data.qte)}</div></div>
              <div class="stat-box"><div class="lbl">Total DHS</div><div class="val">${fmt(data.vente)}</div></div>
            </div>
            <div class="products">${productPills}</div>
            <table>
              <thead><tr>
                <th>Date</th><th>Produit</th><th style="text-align:right">Quantité</th>
                <th>Client</th><th>Fournisseur</th><th>Type</th>
              </tr></thead>
              <tbody>${opRows}</tbody>
              <tfoot><tr>
                <td colspan="2">TOTAL (${data.ops.length} op.)</td>
                <td style="text-align:right">${fmt(data.qte)}</td>
                <td colspan="3"></td>
              </tr></tfoot>
            </table>
          </div>`
      }).join('')

    return `<!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8">
      <title>DAR SADIK — Rapport Camions</title>
      <style>
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      body { font-family: Arial, sans-serif; padding: 28px; font-size: 12px; color: #000 !important; background: #fff !important; margin: 0; }
      h1 { font-size: 18px; margin: 0 0 4px; color: #000 !important; }
      h2 { font-size: 15px; color: #000 !important; }
      .sub, .subtitle { color: #555 !important; font-size: 11px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { background: #1e293b !important; color: #fff !important; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #000 !important; }
      tr:nth-child(even) td { background: #f8fafc !important; }
      tfoot td { background: #f1f5f9 !important; font-weight: 800 !important; color: #000 !important; border-top: 2px solid #334155 !important; font-size: 12px; }
      b, strong { color: #000 !important; font-weight: 800; }
      .right, [style*="text-align:right"], [style*="text-align: right"] { text-align: right; }
      .header-block { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #1e293b; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; background: #e2e8f0 !important; color: #000 !important; border: 1px solid #cbd5e1; }
      .fourn-block { margin-bottom: 24px; page-break-inside: avoid; }
      .fourn-header { background: #1e293b !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .fourn-title { font-size: 13px; font-weight: 800; color: #fff !important; }
      .prod-block { margin-bottom: 12px; }
      .prod-header { background: #f1f5f9 !important; border-left: 4px solid #1e293b; padding: 5px 10px; font-weight: 700; font-size: 11px; color: #000 !important; margin-bottom: 4px; border-radius: 0 4px 4px 0; }
      .grand-tfoot td { background: #e2e8f0 !important; font-weight: 900 !important; color: #000 !important; border-top: 3px solid #1e293b !important; font-size: 13px; }
      .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #888 !important; font-size: 10px; text-align: center; }
      .camion-header { background: #0f172a !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
      .info-box { background: #f8fafc !important; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
      .info-box b { display: block; margin-bottom: 4px; color: #000 !important; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
      .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 50px; }
      .sig { text-align: center; border-top: 1px solid #94a3b8; padding-top: 8px; color: #555 !important; font-size: 11px; }
      @media print {
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        button, .no-print { display: none !important; }
        body { padding: 0; }
      }
</style>
    </head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
        <div>
          <h1>🚛 DAR SADIK — Rapport Camions</h1>
          <div class="sub">Période: ${filterFrom} → ${filterTo} | ${Object.keys(byCamion).length} camion(s) | Généré le ${new Date().toLocaleDateString('fr-MA')}</div>
        </div>
        <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
      </div>
      ${camionBlocks || '<p style="color:#aaa;text-align:center;padding:40px">Aucune donnée pour cette période</p>'}
      <div class="footer">DAR SADIK — Selouane, Nador | Document généré automatiquement</div>
    </body></html>`
  }

  function printCamionReport() {
    const win = window.open('', '_blank')
    win.document.write(buildCamionReportHTML())
    win.document.close()
    setTimeout(() => win.print(), 400)
  }

  async function downloadCamionPDF() {
    // inject html2pdf from CDN if not already loaded
    if (!window.html2pdf) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
        s.onload = resolve
        s.onerror = reject
        document.head.appendChild(s)
      })
    }

    // build a hidden container with the report HTML
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px;background:#fff'
    container.innerHTML = buildCamionReportHTML()
    // strip the outer html/body tags — html2pdf works on a div
    const tmp = document.createElement('div')
    tmp.innerHTML = buildCamionReportHTML()
    const body = tmp.querySelector('body')
    container.innerHTML = body ? body.innerHTML : tmp.innerHTML
    // remove the print button inside
    container.querySelectorAll('.print-btn').forEach(el => el.remove())
    document.body.appendChild(container)

    const filename = `Camions-${filterFrom}-${filterTo}.pdf`
    await window.html2pdf().set({
      margin:      [10, 10, 10, 10],
      filename,
      image:       { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:   { mode: ['avoid-all', 'css'] },
    }).from(container).save()

    document.body.removeChild(container)
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
        {/* Print + PDF buttons */}
        <div className="flex gap-2 justify-end">
          <button onClick={printCamionReport}
            className="btn-primary text-xs px-3 py-1.5"
            style={{background:'#4f46e5'}}>
            🖨️ Imprimer
          </button>
          <button onClick={downloadCamionPDF}
            className="btn-primary text-xs px-3 py-1.5"
            style={{background:'#dc2626'}}>
            📄 Télécharger PDF
          </button>
        </div>
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
