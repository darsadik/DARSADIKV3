import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmt, fmtD, fmtDate, today, startOfMonth, useIsMobile, openPrintWindow } from '../../lib/utils'
import { ADMIN_EMAIL } from '../../lib/config'

const ADMIN = ADMIN_EMAIL

const PRINT_CSS = `
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { font-family: Arial, sans-serif; padding: 28px; font-size: 12px; color: #1e293b; background: #fff; margin: 0; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .sub { color: #555; font-size: 11px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th { background: #1e3a5f !important; color: #fff !important; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
      tr:nth-child(even) td { background: #f8fafc !important; }
      tfoot td { background: #f1f5f9 !important; font-weight: 800 !important; border-top: 2px solid #1e3a5f !important; }
      .fourn-header, .client-header { background: #1e3a5f !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; }
      .grand-total { background: #1e3a5f !important; color: #fff !important; padding: 12px 16px; border-radius: 6px; margin-top: 16px; }
      .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #888; font-size: 10px; text-align: center; }
      @media print { button { display: none !important; } body { padding: 0; } }
`


  function printAchats() {
    const sections = Object.values(byFourn).sort((a,b)=>b.total-a.total).map(f => {
      const rows = f.ops.sort((a,b)=>(b.date_achat||'').localeCompare(a.date_achat||'')).map(a => `<tr>
        <td>${fmtDate(a.date_achat)}</td>
        <td>${a.voyages?.reference || a.voyage_id || '—'}</td>
        <td>${a.type_brique || tab}</td>
        <td style="text-align:right">${fmt(a.qte)}</td>
        <td style="text-align:right">${fmtD(a.prix_achat)}</td>
        <td style="text-align:right"><b>${fmt(a.total_achat)} DHS</b></td>
        <td>${a.note||'—'}</td>
      </tr>`).join('')
      return `<div style="margin-bottom:20px;page-break-inside:avoid">
        <div class="fourn-header">
          <div class="fourn-title">🏭 ${f.nom}</div>
          <div style="color:#fff;font-size:11px">${f.ops.length} achat(s) · ${fmt(f.qte)} ${tab==='grignon'?'kg':'u'} · ${fmt(f.total)} DHS</div>
        </div>
        <table><thead><tr>
          <th>Date</th><th>Voyage</th><th>Produit</th>
          <th style="text-align:right">Qté</th><th style="text-align:right">Prix/u</th>
          <th style="text-align:right">Total DHS</th><th>Note</th>
        </tr></thead><tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="3">TOTAL ${f.nom}</td>
          <td style="text-align:right">${fmt(f.qte)}</td>
          <td></td>
          <td style="text-align:right">${fmt(f.total)} DHS</td>
          <td></td>
        </tr></tfoot></table>
      </div>`
    }).join('')

    openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Achats ${tab}</title>
    <style>${PRINT_CSS}</style></head><body>
    <h1>📦 DAR SADIK — Achats ${tab === 'brique' ? 'Briques' : 'Grignon'}</h1>
    <div class="sub">Période: ${fmtDate(filterFrom)} → ${fmtDate(filterTo)} · ${filteredVoy.length} opération(s) · Généré le ${new Date().toLocaleDateString('fr-MA')}</div>
    ${sections || '<p style="color:#aaa;text-align:center">Aucun achat</p>'}
    <div class="grand-total">
      <div><b>TOTAL GÉNÉRAL — ${tab === 'brique' ? 'ACHATS BRIQUES' : 'ACHATS GRIGNON'}</b><br>
      <span style="font-size:11px;opacity:0.8">${filteredVoy.length} opération(s) · ${Object.keys(byFourn).length} fournisseur(s) · ${fmt(totalQte)} ${tab==='grignon'?'kg':'u'}</span></div>
      <div style="font-size:22px;font-weight:900">${fmt(totalAchat)} DHS</div>
    </div>
    <div class="footer">DAR SADIK — Selouane, Nador | Dar.sadik@hotmail.com | 06 61 97 87 47</div>
    </body></html>`)
  }

export default function Achats() {
  const { user } = useAuth()
  const router   = useRouter()
  const isMobile = useIsMobile()
  const admin    = user?.email === ADMIN

  const [tab,          setTab]          = useState('brique')
  const [voyAchats,    setVoyAchats]    = useState([])
  const [ventesLegacy, setVentesLegacy] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [gFournisseurs,setGFournisseurs]= useState([])
  const [camions,      setCamions]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [filterFrom,   setFilterFrom]   = useState(startOfMonth())
  const [filterTo,     setFilterTo]     = useState(today())
  const [filterFourn,  setFilterFourn]  = useState('')
  const [filterCamion, setFilterCamion] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [
      { data: vach },
      { data: fo   },
      { data: gfo  },
      { data: ca   },
      { data: vleg },
    ] = await Promise.all([
      supabase.from('voyage_achats').select('*, voyages(reference,date_depart,camion_plaque,chauffeur)').order('date_achat', { ascending: false }),
      supabase.from('fournisseurs').select('*').order('nom'),
      supabase.from('grignon_fournisseurs').select('*').order('nom'),
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('ventes').select('*').not('fournisseur_id','is',null).order('date', { ascending: false }),
    ])
    setVoyAchats(vach || [])
    setFournisseurs(fo || [])
    setGFournisseurs(gfo || [])
    setCamions(ca || [])
    setVentesLegacy(vleg || [])
    setLoading(false)
  }

  async function deleteVoyAchat(row) {
    if (!admin || !confirm('Delete this achat from voyage?')) return
    await supabase.from('voyage_achats').delete().eq('id', row.id)
    if (row.fournisseur_id) {
      const tbl = row.type_produit === 'grignon' ? 'grignon_fournisseurs' : 'fournisseurs'
      const { data: f } = await supabase.from(tbl).select('solde').eq('id', row.fournisseur_id).single()
      if (f) await supabase.from(tbl).update({ solde: Math.max(0, (f.solde||0) - (row.total_achat||0)) }).eq('id', row.fournisseur_id)
    }
    loadAll()
  }

  // ── Filter voyage_achats ──
  const legacyBrique = tab === 'brique' ? (ventesLegacy||[]).filter(v => !v.voyage_id).map(v => ({
    id: `leg_${v.id}`, date_achat: v.date_fournisseur || v.date,
    type_produit: 'brique', fournisseur_nom: v.fournisseur || '',
    type_brique: v.type_brique, qte: v.qte, prix_achat: v.prix_achat,
    total_achat: v.total_achat || 0, voyage_id: null, voyages: null,
    note: v.note, _source: 'legacy',
  })) : []

  const filteredVoy = [
    ...voyAchats.filter(a => {
      if (tab === 'brique'  && a.type_produit !== 'brique')  return false
      if (tab === 'grignon' && a.type_produit !== 'grignon') return false
      if (filterFrom  && a.date_achat < filterFrom)  return false
      if (filterTo    && a.date_achat > filterTo)    return false
      if (filterFourn && a.fournisseur_nom !== filterFourn) return false
      if (filterCamion && a.voyages?.camion_plaque !== filterCamion) return false
      return true
    }),
    ...legacyBrique.filter(a => {
      if (filterFrom && a.date_achat < filterFrom) return false
      if (filterTo   && a.date_achat > filterTo)   return false
      if (filterFourn && a.fournisseur_nom !== filterFourn) return false
      return true
    }),
  ].sort((a,b) => (b.date_achat||'').localeCompare(a.date_achat||''))

  const totalQte   = filteredVoy.reduce((s,a) => s+(a.qte||0), 0)
  const totalAchat = filteredVoy.reduce((s,a) => s+(a.total_achat||0), 0)

  // Group by fournisseur
  const byFourn = {}
  filteredVoy.forEach(a => {
    const f = a.fournisseur_nom || 'Sans fournisseur'
    if (!byFourn[f]) byFourn[f] = { nom: f, qte: 0, total: 0, ops: [] }
    byFourn[f].qte   += a.qte || 0
    byFourn[f].total += a.total_achat || 0
    byFourn[f].ops.push(a)
  })

  const uniqueFourns  = [...new Set([
    ...voyAchats.filter(a=>a.type_produit===tab).map(a=>a.fournisseur_nom),
    ...(tab==='brique' ? (ventesLegacy||[]).map(v=>v.fournisseur) : []),
  ].filter(Boolean))].sort()
  const uniqueCamions = [...new Set(voyAchats.map(a=>a.voyages?.camion_plaque).filter(Boolean))].sort()

  function exportCSV() {
    const rows = [
      ['Date','Voyage','Type','Fournisseur','Camion','Produit','Qté','Prix/u','Total DHS','Note'],
      ...filteredVoy.map(a => [
        fmtDate(a.date_achat),
        a.voyages?.reference || a.voyage_id || '',
        a.type_produit,
        a.fournisseur_nom || '',
        a.voyages?.camion_plaque || '',
        a.type_brique || '',
        a.qte || 0,
        fmtD(a.prix_achat),
        a.total_achat || 0,
        a.note || '',
      ])
    ]
    const csv = rows.map(r => r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'}))
    a.download = `Achats-${tab}-${filterFrom}-${filterTo}.csv`
    a.click()
  }

  const TABS = [
    { key: 'brique',  label: '🧱 Achats Briques',  color: '#1e3a5f' },
    { key: 'grignon', label: '🫒 Achats Grignon',  color: '#92400e' },
  ]

  return (
    <Layout title="Achats" subtitle="Suivi centralisé des achats — briques et grignon">

      {/* INFO BANNER */}
      <div className="card mb-4 flex items-center gap-3" style={{background:'#eff6ff',border:'1px solid #bfdbfe'}}>
        <span className="text-2xl">ℹ️</span>
        <div className="flex-1">
          <div className="font-semibold text-blue-800 text-sm">Données issues des Voyages</div>
          <div className="text-xs text-blue-600 mt-0.5">
            Les achats sont saisis dans Voyage → distribués automatiquement ici pour suivi et vérification.
          </div>
        </div>
        <button onClick={() => router.push('/voyages')}
          className="btn-primary text-xs px-3 py-1.5" style={{background:'#1d4ed8'}}>
          → Voyages
        </button>
      </div>

      {/* TABS */}
      <div className="flex gap-2 mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setFilterFrom(startOfMonth()); setFilterTo(today()); setFilterFourn(''); setFilterCamion('') }}
            className={`text-sm font-semibold px-5 py-2.5 rounded-xl border transition-all ${
              tab===t.key ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200'
            }`}
            style={tab===t.key ? {background:t.color} : {}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="stat-card border border-blue-100 bg-blue-50">
          <div className="stat-label text-blue-600">Total achats</div>
          <div className="stat-value text-blue-700">{fmt(totalAchat)} DHS</div>
          <div className="stat-sub">{filteredVoy.length} opération(s)</div>
        </div>
        <div className="stat-card border border-orange-100 bg-orange-50">
          <div className="stat-label text-orange-600">Quantité totale</div>
          <div className="stat-value text-orange-700">{fmt(totalQte)} {tab==='grignon'?'kg':'u'}</div>
          <div className="stat-sub">{Object.keys(byFourn).length} fournisseur(s)</div>
        </div>
        <div className="stat-card border border-gray-100 bg-gray-50">
          <div className="stat-label text-gray-600">Prix moyen</div>
          <div className="stat-value text-gray-700">
            {totalQte > 0 ? fmtD(totalAchat/totalQte) : '0.00'} DHS/{tab==='grignon'?'kg':'u'}
          </div>
          <div className="stat-sub">Moyenne pondérée</div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="card mb-4">
        <div className={`grid ${isMobile?'grid-cols-2':'grid-cols-2 lg:grid-cols-5'} gap-3 items-end`}>
          <div><label className="label">From</label>
            <input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)}/></div>
          <div><label className="label">To</label>
            <input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)}/></div>
          <div><label className="label">Fournisseur</label>
            <select className="input" value={filterFourn} onChange={e=>setFilterFourn(e.target.value)}>
              <option value="">All</option>
              {uniqueFourns.map(f=><option key={f}>{f}</option>)}
            </select></div>
          <div><label className="label">Camion</label>
            <select className="input" value={filterCamion} onChange={e=>setFilterCamion(e.target.value)}>
              <option value="">All</option>
              {uniqueCamions.map(c=><option key={c}>{c}</option>)}
            </select></div>
          <div className="flex gap-2 items-end">
            <button onClick={()=>{setFilterFrom(startOfMonth());setFilterTo(today());setFilterFourn('');setFilterCamion('')}}
              className="btn-secondary text-xs flex-1 justify-center">↺ Reset</button>
            <button onClick={printAchats} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ PDF</button>
            <button onClick={exportCSV} className="btn-primary text-xs px-3 py-1.5" style={{background:'#16a34a'}}>📊 CSV</button>
          </div>
        </div>
      </div>

      {/* BY FOURNISSEUR */}
      {loading ? <div className="card text-center py-10 text-gray-400">Loading...</div> : (
        <div className="space-y-4">
          {Object.values(byFourn).sort((a,b)=>b.total-a.total).map(f => (
            <div key={f.nom} className="card">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-bold text-gray-900">🏭 {f.nom}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {f.ops.length} achat(s) · {fmt(f.qte)} {tab==='grignon'?'kg':'u'}
                  </div>
                </div>
                <div className="font-bold text-lg text-blue-700">{fmt(f.total)} DHS</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr>
                    <th className="th">Date</th>
                    <th className="th">Voyage</th>
                    <th className="th">Produit</th>
                    <th className="th text-right">Qté</th>
                    <th className="th text-right">Prix/u</th>
                    <th className="th text-right">Total DHS</th>
                    <th className="th">Note</th>
                    {admin && <th className="th"></th>}
                  </tr></thead>
                  <tbody>
                    {f.ops.sort((a,b)=>(b.date_achat||'').localeCompare(a.date_achat||'')).map(a => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="td text-gray-500">{fmtDate(a.date_achat)}</td>
                        <td className="td">
                          {a.voyage_id ? (
                            <button onClick={()=>router.push(`/voyages/${a.voyage_id}`)}
                              className="text-xs text-blue-600 hover:underline font-semibold">
                              {a.voyages?.reference || `#${a.voyage_id}`}
                            </button>
                          ) : '—'}
                        </td>
                        <td className="td text-xs">
                          <span className="badge-gray">{a.type_brique || tab}</span>
                        </td>
                        <td className="td text-right font-semibold">{fmt(a.qte)}</td>
                        <td className="td text-right text-gray-500">{fmtD(a.prix_achat)}</td>
                        <td className="td text-right font-bold text-blue-700">{fmt(a.total_achat)} DHS</td>
                        <td className="td text-gray-400 text-xs">{a.note||'—'}</td>
                        {admin && (
                          <td className="td">
                            <button onClick={()=>deleteVoyAchat(a)} className="btn-danger text-xs">✕</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr>
                    <td className="tfoot-td" colSpan={3}>TOTAL {f.nom}</td>
                    <td className="tfoot-td text-right">{fmt(f.qte)}</td>
                    <td className="tfoot-td"></td>
                    <td className="tfoot-td text-right text-blue-700">{fmt(f.total)} DHS</td>
                    <td className="tfoot-td" colSpan={admin?2:1}></td>
                  </tr></tfoot>
                </table>
              </div>
            </div>
          ))}
          {filteredVoy.length === 0 && (
            <div className="card text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">📦</div>
              <div className="font-semibold">No achats for this period</div>
              <button onClick={() => router.push('/voyages')}
                className="btn-primary text-sm mt-4" style={{background:'#1d4ed8'}}>
                → Create a Voyage to add achats
              </button>
            </div>
          )}

          {/* Grand total */}
          {filteredVoy.length > 0 && (
            <div className="card" style={{background:'#1e3a5f',color:'#fff'}}>
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-bold text-lg">TOTAL {tab === 'brique' ? 'ACHATS BRIQUES' : 'ACHATS GRIGNON'}</div>
                  <div className="text-blue-200 text-sm mt-0.5">
                    {filteredVoy.length} opération(s) · {fmt(totalQte)} {tab==='grignon'?'kg':'unités'} · {Object.keys(byFourn).length} fournisseur(s)
                  </div>
                </div>
                <div className="text-3xl font-bold text-white">{fmt(totalAchat)} DHS</div>
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
