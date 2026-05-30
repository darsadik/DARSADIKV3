import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const ADMIN   = 'abdelhafidbaadi@gmail.com'
const fmt     = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtD    = n => parseFloat(n || 0).toFixed(2)
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

const PRINT_CSS = [
  '* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }',
  'body { font-family: Arial, sans-serif; padding: 28px; font-size: 12px; color: #1e293b; background: #fff; margin: 0; }',
  'h1 { font-size: 18px; margin: 0 0 4px; }',
  '.sub { color: #555; font-size: 11px; margin-bottom: 16px; }',
  'table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }',
  'th { background: #1e3a5f !important; color: #fff !important; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; }',
  'td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }',
  'tr:nth-child(even) td { background: #f8fafc !important; }',
  'tfoot td { background: #f1f5f9 !important; font-weight: 800 !important; border-top: 2px solid #1e3a5f !important; }',
  '.ch { background: #1e3a5f !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; }',
  '.gt { background: #1e3a5f !important; color: #fff !important; padding: 12px 16px; border-radius: 6px; margin-top: 16px; display: flex; justify-content: space-between; align-items: center; }',
  '.footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #888; font-size: 10px; text-align: center; }',
  '@media print { button { display: none !important; } body { padding: 0; } }',
].join('\n')

function openPrint(html) {
  const old = document.getElementById('__po')
  if (old) old.remove()
  const ov = document.createElement('div')
  ov.id = '__po'
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#1e293b;display:flex;flex-direction:column'
  const bar = document.createElement('div')
  bar.style.cssText = 'display:flex;gap:8px;padding:10px 16px;background:#0f172a;flex-shrink:0'
  bar.innerHTML = '<button onclick="document.getElementById(\'__pf\').contentWindow.print()" style="padding:7px 18px;background:#1a5fa8;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">🖨️ Imprimer</button>'
    + '<button onclick="document.getElementById(\'__po\').remove()" style="padding:7px 18px;background:#ef4444;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">✕ Fermer</button>'
  const fr = document.createElement('iframe')
  fr.id = '__pf'
  fr.style.cssText = 'flex:1;border:none;width:100%;background:#fff'
  ov.appendChild(bar); ov.appendChild(fr)
  document.body.appendChild(ov)
  fr.contentWindow.document.write(html)
  fr.contentWindow.document.close()
}

export default function Livraisons() {
  const { user } = useAuth()
  const router   = useRouter()
  const isMobile = useIsMobile()
  const admin    = user?.email === ADMIN

  const [tab,          setTab]          = useState('brique')
  const [livraisons,   setLivraisons]   = useState([])
  const [loading,      setLoading]      = useState(true)
  const [filterFrom,   setFilterFrom]   = useState(startOfMonth())
  const [filterTo,     setFilterTo]     = useState(today())
  const [filterClient, setFilterClient] = useState('')
  const [filterCamion, setFilterCamion] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const { data } = await supabase
      .from('voyage_livraisons')
      .select('*, voyages(id, reference, date_depart, camion_plaque, chauffeur)')
      .order('date_livraison', { ascending: false })
    setLivraisons(data || [])
    setLoading(false)
  }

  const filtered = livraisons.filter(l => {
    if (tab === 'brique'  && l.type_produit !== 'brique')  return false
    if (tab === 'grignon' && l.type_produit !== 'grignon') return false
    if (filterFrom   && l.date_livraison < filterFrom) return false
    if (filterTo     && l.date_livraison > filterTo)   return false
    if (filterClient && String(l.client_id) !== filterClient) return false
    if (filterCamion && l.voyages?.camion_plaque !== filterCamion) return false
    return true
  })

  const totalVente = filtered.reduce((s,l) => s+(l.total_vente||0), 0)
  const totalAchat = filtered.reduce((s,l) => s+(l.qte||0)*(l.prix_achat||0), 0)
  const totalMarge = totalVente - totalAchat
  const totalQte   = filtered.reduce((s,l) => s+(l.qte||0), 0)

  const byClient = {}
  filtered.forEach(l => {
    const key = l.client_nom || 'Sans client'
    if (!byClient[key]) byClient[key] = { nom: key, client_id: l.client_id, qte: 0, vente: 0, achat: 0, ops: [] }
    byClient[key].qte   += l.qte || 0
    byClient[key].vente += l.total_vente || 0
    byClient[key].achat += (l.qte||0) * (l.prix_achat||0)
    byClient[key].ops.push(l)
  })

  const uniqueClients = [...new Map(
    livraisons.filter(l=>l.type_produit===tab && l.client_id)
      .map(l=>[l.client_id, {id:l.client_id, nom:l.client_nom}])
  ).values()]
  const uniqueCamions = [...new Set(livraisons.map(l=>l.voyages?.camion_plaque).filter(Boolean))].sort()

  function exportCSV() {
    const rows = [
      ['Date','Voyage','Client','Produit','Qte','Prix vente','Prix achat','Total vente','Marge','Note'],
      ...filtered.map(l => [
        fmtDate(l.date_livraison), l.voyages?.reference||l.voyage_id||'', l.client_nom||'',
        l.type_brique||l.type_produit, l.qte||0, fmtD(l.prix_vente), fmtD(l.prix_achat||0),
        l.total_vente||0, ((l.total_vente||0)-(l.qte||0)*(l.prix_achat||0)).toFixed(2), l.note||'',
      ])
    ]
    const csv = rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'}))
    a.download = `Livraisons-${tab}-${filterFrom}-${filterTo}.csv`
    a.click()
  }

  function printLivraisons() {
    const sections = Object.values(byClient).sort((a,b)=>b.vente-a.vente).map(cl => {
      const marge = cl.vente - cl.achat
      const rows = cl.ops.sort((a,b)=>b.date_livraison.localeCompare(a.date_livraison)).map(l => {
        const m = (l.total_vente||0)-(l.qte||0)*(l.prix_achat||0)
        return '<tr>'
          + '<td>' + fmtDate(l.date_livraison) + '</td>'
          + '<td>' + (l.voyages?.reference||l.voyage_id||'—') + '</td>'
          + '<td>' + (l.type_brique||l.type_produit||'—') + '</td>'
          + '<td style="text-align:right">' + fmt(l.qte) + '</td>'
          + '<td style="text-align:right">' + fmtD(l.prix_vente) + '</td>'
          + '<td style="text-align:right"><b>' + fmt(l.total_vente) + ' DHS</b></td>'
          + '<td style="text-align:right;color:#7c3aed">' + fmt(m) + ' DHS</td>'
          + '<td>' + (l.note||'—') + '</td>'
          + '</tr>'
      }).join('')
      return '<div style="margin-bottom:20px;page-break-inside:avoid">'
        + '<div class="ch"><div style="font-size:13px;font-weight:800;color:#fff">👤 ' + cl.nom + '</div>'
        + '<div style="color:#fff;font-size:11px">' + cl.ops.length + ' livraison(s) · CA: ' + fmt(cl.vente) + ' DHS · Marge: ' + fmt(marge) + ' DHS</div></div>'
        + '<table><thead><tr>'
        + '<th>Date</th><th>Voyage</th><th>Produit</th>'
        + '<th style="text-align:right">Qté</th><th style="text-align:right">Prix/u</th>'
        + '<th style="text-align:right">Total DHS</th><th style="text-align:right">Marge</th><th>Note</th>'
        + '</tr></thead><tbody>' + rows + '</tbody>'
        + '<tfoot><tr><td colspan="3">TOTAL ' + cl.nom + '</td>'
        + '<td style="text-align:right">' + fmt(cl.qte) + '</td><td></td>'
        + '<td style="text-align:right">' + fmt(cl.vente) + ' DHS</td>'
        + '<td style="text-align:right;color:#7c3aed">' + fmt(marge) + ' DHS</td><td></td>'
        + '</tr></tfoot></table></div>'
    }).join('')

    const label = tab === 'brique' ? 'Livraisons Briques' : 'Livraisons Grignon'
    openPrint('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + label + '</title>'
      + '<style>' + PRINT_CSS + '</style></head><body>'
      + '<h1>🚚 DAR SADIK — ' + label + '</h1>'
      + '<div class="sub">Période: ' + fmtDate(filterFrom) + ' → ' + fmtDate(filterTo)
      + ' · ' + filtered.length + ' livraison(s) · Généré le ' + new Date().toLocaleDateString('fr-MA') + '</div>'
      + (sections || '<p style="color:#aaa;text-align:center">Aucune livraison</p>')
      + '<div class="gt">'
      + '<div><b>TOTAL ' + label.toUpperCase() + '</b><br>'
      + '<span style="font-size:11px;opacity:0.8">' + filtered.length + ' livraison(s) · '
      + Object.keys(byClient).length + ' client(s) · ' + fmt(totalQte) + (tab==='grignon'?' kg':' u') + '</span></div>'
      + '<div style="text-align:right">'
      + '<div style="font-size:10px;opacity:0.7">CA / Coût / Marge</div>'
      + '<div style="font-size:18px;font-weight:900">' + fmt(totalVente) + ' / ' + fmt(totalAchat) + ' / ' + fmt(totalMarge) + ' DHS</div>'
      + '</div></div>'
      + '<div class="footer">DAR SADIK — Selouane, Nador | Dar.sadik@hotmail.com | 06 61 97 87 47</div>'
      + '</body></html>')
  }

  const TABS = [
    { key: 'brique',  label: '🧱 Livraisons Briques', color: '#1e3a5f' },
    { key: 'grignon', label: '🫒 Livraisons Grignon',  color: '#92400e' },
  ]

  return (
    <Layout title="Livraisons" subtitle="Suivi centralisé des livraisons clients">

      <div className="card mb-4 flex items-center gap-3" style={{background:'#eff6ff',border:'1px solid #bfdbfe'}}>
        <span className="text-2xl">ℹ️</span>
        <div className="flex-1">
          <div className="font-semibold text-blue-800 text-sm">Données issues des Voyages</div>
          <div className="text-xs text-blue-600 mt-0.5">Les livraisons sont saisies dans Voyage → distribuées automatiquement ici.</div>
        </div>
        <button onClick={() => router.push('/voyages')} className="btn-primary text-xs px-3 py-1.5" style={{background:'#1d4ed8'}}>→ Voyages</button>
      </div>

      <div className="flex gap-2 mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`text-sm font-semibold px-5 py-2.5 rounded-xl border transition-all ${tab===t.key?'text-white border-transparent':'bg-white text-gray-600 border-gray-200'}`}
            style={tab===t.key?{background:t.color}:{}}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card border border-green-100 bg-green-50">
          <div className="stat-label text-green-600">Chiffre d'affaires</div>
          <div className="stat-value text-green-700">{fmt(totalVente)} DHS</div>
          <div className="stat-sub">{filtered.length} livraison(s)</div>
        </div>
        <div className="stat-card border border-red-100 bg-red-50">
          <div className="stat-label text-red-600">Coût achats</div>
          <div className="stat-value text-red-600">{fmt(totalAchat)} DHS</div>
          <div className="stat-sub">{fmt(totalQte)} {tab==='grignon'?'kg':'u'}</div>
        </div>
        <div className="stat-card border border-purple-100 bg-purple-50">
          <div className="stat-label text-purple-600">Marge brute</div>
          <div className="stat-value text-purple-700">{fmt(totalMarge)} DHS</div>
          <div className="stat-sub">{totalVente>0?Math.round(totalMarge/totalVente*100):0}%</div>
        </div>
        <div className="stat-card border border-blue-100 bg-blue-50">
          <div className="stat-label text-blue-600">Clients actifs</div>
          <div className="stat-value text-blue-700">{Object.keys(byClient).length}</div>
          <div className="stat-sub">sur la période</div>
        </div>
      </div>

      <div className="card mb-4">
        <div className={`grid ${isMobile?'grid-cols-2':'grid-cols-2 lg:grid-cols-5'} gap-3 items-end`}>
          <div><label className="label">From</label><input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)}/></div>
          <div><label className="label">To</label><input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)}/></div>
          <div><label className="label">Client</label>
            <select className="input" value={filterClient} onChange={e=>setFilterClient(e.target.value)}>
              <option value="">All</option>
              {uniqueClients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
            </select></div>
          <div><label className="label">Camion</label>
            <select className="input" value={filterCamion} onChange={e=>setFilterCamion(e.target.value)}>
              <option value="">All</option>
              {uniqueCamions.map(c=><option key={c}>{c}</option>)}
            </select></div>
          <div className="flex gap-2 items-end">
            <button onClick={()=>{setFilterFrom(startOfMonth());setFilterTo(today());setFilterClient('');setFilterCamion('')}}
              className="btn-secondary text-xs flex-1 justify-center">↺ Reset</button>
            <button onClick={printLivraisons} className="btn-primary text-xs px-2 py-1.5" style={{background:'#4f46e5'}}>🖨️</button>
            <button onClick={exportCSV} className="btn-primary text-xs px-2 py-1.5" style={{background:'#16a34a'}}>📊</button>
          </div>
        </div>
      </div>

      {loading ? <div className="card text-center py-10 text-gray-400">Loading...</div> : (
        <div className="space-y-4">
          {Object.values(byClient).sort((a,b)=>b.vente-a.vente).map(cl => {
            const marge = cl.vente - cl.achat
            return (
              <div key={cl.nom} className="card">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <div className="font-bold text-gray-900">👤 {cl.nom}</div>
                    <div className="text-xs text-gray-400">{cl.ops.length} livraison(s) · {fmt(cl.qte)} {tab==='grignon'?'kg':'u'}</div>
                  </div>
                  <div className="flex gap-4 text-center flex-wrap">
                    <div><div className="text-xs text-gray-400">CA</div><div className="font-bold text-green-600">{fmt(cl.vente)} DHS</div></div>
                    <div><div className="text-xs text-gray-400">Marge</div><div className="font-bold text-purple-600">{fmt(marge)} DHS</div></div>
                    <div><div className="text-xs text-gray-400">%</div><div className="font-bold text-gray-700">{cl.vente>0?Math.round(marge/cl.vente*100):0}%</div></div>
                    {cl.client_id && <button onClick={()=>router.push('/clients')} className="btn-secondary text-xs self-center">→ Compte</button>}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr>
                      <th className="th">Date</th><th className="th">Voyage</th><th className="th">Produit</th>
                      <th className="th text-right">Qté</th><th className="th text-right">Prix/u</th>
                      <th className="th text-right">Total DHS</th><th className="th text-right">Marge</th><th className="th">Note</th>
                    </tr></thead>
                    <tbody>
                      {cl.ops.sort((a,b)=>b.date_livraison.localeCompare(a.date_livraison)).map(l => {
                        const m = (l.total_vente||0)-(l.qte||0)*(l.prix_achat||0)
                        return (
                          <tr key={l.id} className="hover:bg-gray-50">
                            <td className="td text-gray-500">{fmtDate(l.date_livraison)}</td>
                            <td className="td">{l.voyage_id?<button onClick={()=>router.push(`/voyages/${l.voyage_id}`)} className="text-xs text-blue-600 hover:underline font-semibold">{l.voyages?.reference||`#${l.voyage_id}`}</button>:'—'}</td>
                            <td className="td text-xs"><span className="badge-gray">{l.type_brique||l.type_produit}</span></td>
                            <td className="td text-right font-semibold">{fmt(l.qte)}</td>
                            <td className="td text-right text-gray-500">{fmtD(l.prix_vente)}</td>
                            <td className="td text-right font-bold text-green-600">{fmt(l.total_vente)} DHS</td>
                            <td className="td text-right font-semibold text-purple-600">{fmt(m)} DHS</td>
                            <td className="td text-gray-400 text-xs">{l.note||'—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot><tr>
                      <td className="tfoot-td" colSpan={3}>TOTAL {cl.nom}</td>
                      <td className="tfoot-td text-right">{fmt(cl.qte)}</td>
                      <td className="tfoot-td"></td>
                      <td className="tfoot-td text-right text-green-700">{fmt(cl.vente)} DHS</td>
                      <td className="tfoot-td text-right text-purple-700">{fmt(marge)} DHS</td>
                      <td className="tfoot-td"></td>
                    </tr></tfoot>
                  </table>
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="card text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">🚚</div>
              <div className="font-semibold">No livraisons for this period</div>
              <button onClick={()=>router.push('/voyages')} className="btn-primary text-sm mt-4" style={{background:'#1d4ed8'}}>→ Create a Voyage</button>
            </div>
          )}
          {filtered.length > 0 && (
            <div className="card" style={{background:'#1e3a5f',color:'#fff'}}>
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div>
                  <div className="font-bold text-lg">TOTAL {tab==='brique'?'LIVRAISONS BRIQUES':'LIVRAISONS GRIGNON'}</div>
                  <div className="text-blue-200 text-sm">{filtered.length} livraison(s) · {Object.keys(byClient).length} client(s) · {fmt(totalQte)} {tab==='grignon'?'kg':'u'}</div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div><div className="text-blue-300 text-xs">CA</div><div className="font-bold text-xl">{fmt(totalVente)} DHS</div></div>
                  <div><div className="text-blue-300 text-xs">Coût</div><div className="font-bold text-xl text-red-300">{fmt(totalAchat)} DHS</div></div>
                  <div><div className="text-blue-300 text-xs">Marge</div><div className="font-bold text-xl text-green-300">{fmt(totalMarge)} DHS</div></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
