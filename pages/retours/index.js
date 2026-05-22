import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const ADMIN = 'abdelhafidbaadi@gmail.com'
const fmt     = n => Math.round(n || 0).toLocaleString('fr-MA')

// ── Print via hidden iframe — stays on same page (PWA safe) ──
function printViaIframe(htmlContent) {
  const existing = document.getElementById('__print_iframe')
  if (existing) existing.remove()
  const iframe = document.createElement('iframe')
  iframe.id = '__print_iframe'
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;opacity:0;'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow.document
  doc.open(); doc.write(htmlContent); doc.close()
  setTimeout(() => {
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
  }, 300)
}

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

const emptyForm = { date: today(), client_nom: '', camion_id: '', montant: '', montant_paye: '', note: '', destination: '' }

export default function Retours() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const admin    = user?.email === ADMIN

  const [retours,       setRetours]       = useState([])
  const [camions,       setCamions]       = useState([])
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [showForm,      setShowForm]      = useState(false)
  const [form,          setForm]          = useState(emptyForm)
  const [msg,           setMsg]           = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [filterFrom,    setFilterFrom]    = useState(startOfMonth())
  const [filterTo,      setFilterTo]      = useState(today())
  const [filterCamion,  setFilterCamion]  = useState('')
  const [filterStatus,  setFilterStatus]  = useState('')
  const [editPayeId,    setEditPayeId]    = useState(null)
  const [editPayeVal,   setEditPayeVal]   = useState('')
  const [editSaving,    setEditSaving]    = useState(false)

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

  async function saveRetour(e) {
    e.preventDefault()
    if (!form.client_nom.trim() || !form.montant) { setMsg('❌ Client et montant requis'); return }
    setSaving(true)
    const montant      = parseFloat(form.montant)      || 0
    const montant_paye = parseFloat(form.montant_paye) || 0
    const restant      = Math.max(0, montant - montant_paye)
    const ca           = camions.find(c => c.id === parseInt(form.camion_id))
    const { error } = await supabase.from('retours_transport').insert({
      date: form.date, client_nom: form.client_nom.trim(),
      destination: form.destination || null,
      camion_id: form.camion_id ? parseInt(form.camion_id) : null,
      camion_plaque: ca?.plaque || null, chauffeur: ca?.chauffeur || null,
      montant, montant_paye, restant,
      note: form.note || null,
    })
    setSaving(false)
    if (error) { setMsg('❌ ' + error.message) }
    else {
      setMsg('✅ Retour enregistré !')
      setForm(emptyForm); setShowForm(false)
      setTimeout(() => setMsg(''), 2500)
      loadAll()
    }
  }

  async function savePayment(id, montantTotal) {
    setEditSaving(true)
    const paye    = parseFloat(editPayeVal) || 0
    const restant = Math.max(0, montantTotal - paye)
    await supabase.from('retours_transport').update({ montant_paye: paye, restant }).eq('id', id)
    setEditSaving(false); setEditPayeId(null); loadAll()
  }

  async function deleteRetour(id) {
    if (!admin) return
    if (deleteConfirm !== id) {
      setDeleteConfirm(id); setTimeout(() => setDeleteConfirm(null), 3000); return
    }
    setDeleteConfirm(null)
    await supabase.from('retours_transport').delete().eq('id', id)
    loadAll()
  }

  const filtered = retours.filter(r => {
    if (filterFrom   && r.date < filterFrom) return false
    if (filterTo     && r.date > filterTo)   return false
    if (filterCamion && r.camion_plaque !== filterCamion) return false
    if (filterStatus) {
      const re = r.restant || 0; const pa = r.montant_paye || 0
      if (filterStatus === 'unpaid'  && !(pa === 0)) return false
      if (filterStatus === 'partial' && !(pa > 0 && re > 0)) return false
      if (filterStatus === 'paid'    && !(re === 0)) return false
    }
    return true
  })

  const totalMontant = filtered.reduce((s,r) => s + (r.montant || 0), 0)
  const totalPaye    = filtered.reduce((s,r) => s + (r.montant_paye || 0), 0)
  const totalRestant = filtered.reduce((s,r) => s + (r.restant || 0), 0)
  const unpaidCount  = filtered.filter(r => (r.montant_paye||0) === 0).length
  const partialCount = filtered.filter(r => (r.montant_paye||0) > 0 && (r.restant||0) > 0).length
  const paidCount    = filtered.filter(r => (r.restant||0) === 0).length
  const uniqueCamions = [...new Set(retours.map(r => r.camion_plaque).filter(Boolean))]

  function getStatus(r) {
    if ((r.restant||0) === 0)         return { label: '✓ Payé',     bg: '#dcfce7', color: '#16a34a' }
    if ((r.montant_paye||0) > 0)      return { label: '⚠ Partiel',  bg: '#fef3c7', color: '#d97706' }
    return                                   { label: '⬤ Impayé',   bg: '#fee2e2', color: '#dc2626' }
  }


  function exportCSV() {
    const rows = [
      ['Date','Client','Destination','Camion','Chauffeur','Montant DHS','Paye DHS','Restant DHS','Statut','Note'],
      ...filtered.map(r => [
        fmtDate(r.date), r.client_nom, r.destination||'', r.camion_plaque||'', r.chauffeur||'',
        r.montant||0, r.montant_paye||0, r.restant||0,
        (r.restant||0)===0?'Paye':(r.montant_paye||0)>0?'Partiel':'Impaye',
        r.note||'',
      ]),
    ]
    const csv = rows.map(r => r.map(cell => '"'+String(cell).replace(/"/g,'""')+'"').join(',')).join('\n')
    const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'})
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'Retours-'+filterFrom+'-'+filterTo+'.csv'; a.click()
  }

  function printRetours() {
    const rows = filtered.map(r => {
      const s = getStatus(r)
      return `<tr>
        <td>${fmtDate(r.date)}</td><td><b>${r.client_nom}</b></td>
        <td>${r.destination||'—'}</td><td>${r.camion_plaque||'—'}</td><td>${r.chauffeur||'—'}</td>
        <td style="text-align:right"><b>${fmt(r.montant)} DHS</b></td>
        <td style="text-align:right;color:#16a34a">${fmt(r.montant_paye||0)} DHS</td>
        <td style="text-align:right;color:${(r.restant||0)>0?'#dc2626':'#16a34a'}">${fmt(r.restant||0)} DHS</td>
        <td><span style="background:${s.bg};color:${s.color};padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700">${s.label}</span></td>
        <td>${r.note||'—'}</td></tr>`
    }).join('')
    const _now = new Date()
    const printDateTime = _now.toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' à ' + String(_now.getHours()).padStart(2,'0') + ':' + String(_now.getMinutes()).padStart(2,'0')
        printViaIframe(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Retours Transport — DAR SADIK</title>
    <style>
      * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; box-sizing:border-box; }
      body { font-family:Arial,sans-serif; padding:30px 36px; font-size:12px; color:#1e293b; background:#fff; margin:0; }
      .kpi { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
      .kpi-box { border:1px solid #e2e8f0; border-radius:8px; padding:12px; text-align:center; background:#f8fafc; }
      .kpi-lbl { font-size:9px; text-transform:uppercase; font-weight:700; color:#64748b; margin-bottom:4px; }
      .kpi-val { font-size:16px; font-weight:800; }
      table { width:100%; border-collapse:collapse; margin-bottom:10px; }
      th { background:#1a5fa8 !important; color:#fff !important; padding:9px 12px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; text-align:left; border:1px solid #1355a0; }
      td { padding:8px 12px; font-size:11px; color:#1e293b; border:1px solid #e2e8f0; vertical-align:middle; }
      tr:nth-child(even) td { background:#f8fafc !important; }
      tfoot td { background:#e8f0fe !important; font-weight:800 !important; border:1px solid #c7d8f7; border-top:2px solid #1a5fa8 !important; color:#1e293b !important; font-size:12px; }
      b, strong { color:#1e293b !important; font-weight:800; }
      @media print { button { display:none !important; } body { padding:12px 18px; } }
      @page { size:A4; margin:10mm 12mm; }
    </style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;margin-bottom:4px"><div><div style="font-size:26px;font-weight:900;color:#1a3a6b;letter-spacing:-0.5px;line-height:1.1">DAR SADIK</div><div style="font-size:15px;font-weight:700;color:#1a5fa8;direction:rtl">دار صديق</div><div style="font-size:11px;color:#475569;margin-top:2px;direction:rtl">بائع جميع مواد البناء</div></div><div style="text-align:right;padding-top:4px"><div style="font-size:11px;color:#334155;margin-bottom:4px;font-weight:600">📞 Mohamed: 06 61 32 56 65 &nbsp;·&nbsp; Sadik: 06 61 97 87 47 &nbsp;·&nbsp; Bureau: 06 62 82 88 20</div><div style="font-size:11px;color:#334155;margin-bottom:4px">✉️ Dar.sadik@hotmail.com</div><div style="font-size:11px;color:#64748b">📍 Selouane - Nador</div></div></div>
    <div style="height:3px;background:linear-gradient(90deg,#1a5fa8,#3b82f6);border-radius:2px;margin-bottom:20px"></div>
    <div style="font-size:16px;font-weight:800;color:#1e293b;margin-bottom:4px">🚛 Retours Transport</div>
    <div style="font-size:11px;color:#64748b;margin-bottom:18px">Période : ${fmtDate(filterFrom)} → ${fmtDate(filterTo)}</div>
    <div class="kpi">
      <div class="kpi-box"><div class="kpi-lbl">Total revenus</div><div class="kpi-val" style="color:#1d4ed8">${fmt(totalMontant)} DHS</div></div>
      <div class="kpi-box"><div class="kpi-lbl">Encaissé</div><div class="kpi-val" style="color:#16a34a">${fmt(totalPaye)} DHS</div></div>
      <div class="kpi-box"><div class="kpi-lbl">Reste à encaisser</div><div class="kpi-val" style="color:#dc2626">${fmt(totalRestant)} DHS</div></div>
      <div class="kpi-box"><div class="kpi-lbl">Taux recouvrement</div><div class="kpi-val" style="color:#7c3aed">${totalMontant>0?Math.round(totalPaye/totalMontant*100):0}%</div></div>
    </div>
    <table><thead><tr><th>Date</th><th>Client</th><th>Destination</th><th>Camion</th><th>Chauffeur</th>
    <th style="text-align:right">Montant DHS</th><th style="text-align:right">Payé DHS</th>
    <th style="text-align:right">Restant DHS</th><th>Statut</th><th>Note</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="10" style="text-align:center;color:#aaa">Aucun retour</td></tr>'}</tbody>
    ${filtered.length>0?`<tfoot><tr><td colspan="5">TOTAL (${filtered.length})</td>
    <td style="text-align:right">${fmt(totalMontant)} DHS</td>
    <td style="text-align:right;color:#16a34a">${fmt(totalPaye)} DHS</td>
    <td style="text-align:right;color:#dc2626">${fmt(totalRestant)} DHS</td>
    <td colspan="2"></td></tr></tfoot>`:''}
    </table>
    <div style="margin-top:28px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8"><span>DAR SADIK — دار صديق — Selouane, Nador</span><span>Généré le ${printDateTime}</span></div>
    </body></html>`)

  }

  return (
    <Layout title="Retours Transport" subtitle="Service de transport — suivi des revenus et paiements">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card border border-blue-100 bg-blue-50">
          <div className="stat-label text-blue-600">Total revenus</div>
          <div className="stat-value text-blue-700">{fmt(totalMontant)} DHS</div>
          <div className="stat-sub">{filtered.length} opération(s)</div>
        </div>
        <div className="stat-card border border-green-100 bg-green-50">
          <div className="stat-label text-green-600">Encaissé</div>
          <div className="stat-value text-green-700">{fmt(totalPaye)} DHS</div>
          <div className="stat-sub">{paidCount} payé(s) complètement</div>
        </div>
        <div className="stat-card border border-red-100 bg-red-50">
          <div className="stat-label text-red-600">Reste à encaisser</div>
          <div className="stat-value text-red-600">{fmt(totalRestant)} DHS</div>
          <div className="stat-sub">{unpaidCount} impayé(s) · {partialCount} partiel(s)</div>
        </div>
        <div className="stat-card border border-purple-100 bg-purple-50">
          <div className="stat-label text-purple-600">Taux recouvrement</div>
          <div className="stat-value text-purple-700">{totalMontant > 0 ? Math.round(totalPaye/totalMontant*100) : 0}%</div>
          <div className="stat-sub">du total encaissé</div>
        </div>
      </div>

      {/* NEW BUTTON */}
      {admin && (
        <button onClick={() => setShowForm(!showForm)}
          className={`mb-4 btn-primary justify-center${isMobile?' w-full':''}`}
          style={{background:'#1d4ed8'}}>
          {showForm ? '▲ Fermer' : '🚛 + Nouveau retour transport'}
        </button>
      )}

      {/* FORM */}
      {showForm && admin && (
        <div className="card mb-4" style={{borderLeft:'4px solid #1d4ed8'}}>
          <h3 className="font-bold text-gray-900 mb-4">🚛 Enregistrer un retour transport</h3>
          <form onSubmit={saveRetour}>
            <div className={`grid ${isMobile?'grid-cols-1':'grid-cols-2 lg:grid-cols-3'} gap-3 mb-3`}>
              <div><label className="label">Date</label>
                <input type="date" className="input" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required /></div>
              <div><label className="label">Client / Entreprise</label>
                <input className="input" placeholder="Nom du client ou entreprise" value={form.client_nom} onChange={e=>setForm({...form,client_nom:e.target.value})} required /></div>
              <div><label className="label">Destination (optionnel)</label>
                <input className="input" placeholder="ex: Oujda, Berkane..." value={form.destination} onChange={e=>setForm({...form,destination:e.target.value})} /></div>
              <div><label className="label">Camion</label>
                <select className="input" value={form.camion_id} onChange={e=>setForm({...form,camion_id:e.target.value})}>
                  <option value="">— Sans camion —</option>
                  {camions.map(c=><option key={c.id} value={c.id}>{c.plaque}{c.chauffeur?` — ${c.chauffeur}`:''}</option>)}
                </select></div>
              <div><label className="label">Montant total (DHS)</label>
                <input type="text" inputMode="decimal" className="input" placeholder="ex: 2000" value={form.montant} onChange={e=>setForm({...form,montant:e.target.value})} required /></div>
              <div><label className="label">Montant payé (DHS)</label>
                <input type="text" inputMode="decimal" className="input" placeholder="0 si impayé" value={form.montant_paye} onChange={e=>setForm({...form,montant_paye:e.target.value})} /></div>
            </div>
            <div className="mb-3"><label className="label">Note (optionnel)</label>
              <input className="input" placeholder="Marchandise, référence..." value={form.note} onChange={e=>setForm({...form,note:e.target.value})} /></div>
            {form.montant && (
              <div className="grid grid-cols-3 gap-3 p-3 rounded-xl mb-3" style={{background:'#eff6ff',border:'1px solid #bfdbfe'}}>
                <div className="text-center"><div className="text-xs text-gray-400">Montant</div><div className="font-bold text-blue-700">{fmt(parseFloat(form.montant)||0)} DHS</div></div>
                <div className="text-center"><div className="text-xs text-gray-400">Payé</div><div className="font-bold text-green-600">{fmt(parseFloat(form.montant_paye)||0)} DHS</div></div>
                <div className="text-center"><div className="text-xs text-gray-400">Restant</div>
                  <div className="font-bold" style={{color:Math.max(0,(parseFloat(form.montant)||0)-(parseFloat(form.montant_paye)||0))>0?'#dc2626':'#16a34a'}}>
                    {fmt(Math.max(0,(parseFloat(form.montant)||0)-(parseFloat(form.montant_paye)||0)))} DHS</div></div>
              </div>
            )}
            {msg && <div className={`text-sm font-semibold p-2 rounded-lg mb-3 ${msg.startsWith('✅')?'bg-green-50 text-green-700':'bg-red-50 text-red-700'}`}>{msg}</div>}
            <button type="submit" disabled={saving} className={`btn-primary${isMobile?' w-full justify-center':''}`} style={{background:'#1d4ed8'}}>
              {saving?'Enregistrement...':'✓ Enregistrer'}
            </button>
          </form>
        </div>
      )}

      {/* FILTERS */}
      <div className="card mb-4">
        <div className={`grid ${isMobile?'grid-cols-2':'grid-cols-2 lg:grid-cols-5'} gap-3 items-end`}>
          <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} /></div>
          <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)} /></div>
          <div><label className="label">Camion</label>
            <select className="input" value={filterCamion} onChange={e=>setFilterCamion(e.target.value)}>
              <option value="">Tous</option>{uniqueCamions.map(c=><option key={c}>{c}</option>)}
            </select></div>
          <div><label className="label">Statut</label>
            <select className="input" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
              <option value="">Tous</option>
              <option value="unpaid">⬤ Impayé</option>
              <option value="partial">⚠ Partiel</option>
              <option value="paid">✓ Payé</option>
            </select></div>
          <div className="flex gap-2 items-end">
            <button onClick={()=>{setFilterFrom(startOfMonth());setFilterTo(today());setFilterCamion('');setFilterStatus('')}} className="btn-secondary text-xs flex-1 justify-center">↺ Reset</button>
            <button onClick={printRetours} className="btn-primary text-xs flex-1 justify-center" style={{background:'#4f46e5'}}>🖨️ PDF</button>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">🚛 Historique retours transport</h3>
            <div className="text-xs text-gray-400 mt-1">
              {filtered.length} opération(s) — Total: <b className="text-blue-700">{fmt(totalMontant)} DHS</b> · Encaissé: <b className="text-green-600">{fmt(totalPaye)} DHS</b> · Restant: <b className="text-red-600">{fmt(totalRestant)} DHS</b>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="text-center py-10 text-gray-400">Chargement...</div>
        ) : isMobile ? (
          <div className="space-y-3">
            {filtered.map(r => {
              const s = getStatus(r)
              return (
                <div key={r.id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-bold text-gray-900">{r.client_nom}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{fmtDate(r.date)}{r.camion_plaque?` · 🚛 ${r.camion_plaque}`:''}</div>
                      {r.destination && <div className="text-xs text-blue-600 mt-0.5">📍 {r.destination}</div>}
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded-full" style={{background:s.bg,color:s.color}}>{s.label}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs mt-2">
                    <div className="bg-blue-50 rounded-lg p-2"><div className="text-gray-400">Montant</div><div className="font-bold text-blue-700">{fmt(r.montant)} DHS</div></div>
                    <div className="bg-green-50 rounded-lg p-2"><div className="text-gray-400">Payé</div><div className="font-bold text-green-600">{fmt(r.montant_paye||0)} DHS</div></div>
                    <div className="bg-red-50 rounded-lg p-2"><div className="text-gray-400">Restant</div><div className="font-bold text-red-600">{fmt(r.restant||0)} DHS</div></div>
                  </div>
                  {r.note && <div className="text-xs text-gray-400 mt-2">📝 {r.note}</div>}
                  {admin && (r.restant||0) > 0 && (
                    <div className="mt-2">
                      {editPayeId === r.id ? (
                        <div className="flex gap-2">
                          <input type="text" inputMode="decimal" className="input text-xs flex-1" placeholder="Montant payé" value={editPayeVal} onChange={e=>setEditPayeVal(e.target.value)} />
                          <button onClick={()=>savePayment(r.id,r.montant)} disabled={editSaving} className="btn-primary text-xs px-2">✓</button>
                          <button onClick={()=>setEditPayeId(null)} className="btn-secondary text-xs px-2">✕</button>
                        </div>
                      ) : (
                        <button onClick={()=>{setEditPayeId(r.id);setEditPayeVal(String(r.montant_paye||0))}} className="btn-secondary text-xs w-full justify-center" style={{color:'#16a34a',borderColor:'#16a34a'}}>
                          💰 Enregistrer paiement
                        </button>
                      )}
                    </div>
                  )}
                  {admin && (
                    <div className="mt-2">
                      {deleteConfirm===r.id
                        ? <button onClick={()=>deleteRetour(r.id)} className="text-xs px-2 py-1 rounded-lg font-bold w-full" style={{background:'#dc2626',color:'#fff'}}>Confirmer ✕</button>
                        : <button onClick={()=>deleteRetour(r.id)} className="btn-danger text-xs w-full justify-center">✕ Supprimer</button>}
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
                  <th className="th">Date</th><th className="th">Client / Entreprise</th>
                  <th className="th">Destination</th><th className="th">Camion</th><th className="th">Chauffeur</th>
                  <th className="th text-right">Montant DHS</th>
                  <th className="th text-right">Payé DHS</th>
                  <th className="th text-right">Restant DHS</th>
                  <th className="th">Statut</th><th className="th">Note</th>
                  {admin && <th className="th"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const s = getStatus(r)
                  return (
                    <tr key={r.id} className="hover:bg-gray-50" style={(r.restant||0)>0&&(r.montant_paye||0)===0?{background:'#fff5f5'}:{}}>
                      <td className="td text-gray-500">{fmtDate(r.date)}</td>
                      <td className="td font-semibold">{r.client_nom}</td>
                      <td className="td text-gray-500 text-xs">{r.destination||'—'}</td>
                      <td className="td text-gray-500 text-xs">{r.camion_plaque||'—'}</td>
                      <td className="td text-gray-500 text-xs">{r.chauffeur||'—'}</td>
                      <td className="td text-right font-bold text-blue-700">{fmt(r.montant)} DHS</td>
                      <td className="td text-right font-bold text-green-600">{fmt(r.montant_paye||0)} DHS</td>
                      <td className="td text-right font-bold" style={{color:(r.restant||0)>0?'#dc2626':'#16a34a'}}>{fmt(r.restant||0)} DHS</td>
                      <td className="td"><span className="text-xs font-bold px-2 py-1 rounded-full" style={{background:s.bg,color:s.color}}>{s.label}</span></td>
                      <td className="td text-gray-400 text-xs">{r.note||'—'}</td>
                      {admin && (
                        <td className="td">
                          <div className="flex gap-1 items-center">
                            {(r.restant||0) > 0 && (
                              editPayeId === r.id ? (
                                <div className="flex gap-1">
                                  <input type="text" inputMode="decimal" className="input text-xs" style={{width:80}} value={editPayeVal} onChange={e=>setEditPayeVal(e.target.value)} />
                                  <button onClick={()=>savePayment(r.id,r.montant)} disabled={editSaving} className="text-xs px-2 py-1 rounded-lg font-bold" style={{background:'#16a34a',color:'#fff'}}>✓</button>
                                  <button onClick={()=>setEditPayeId(null)} className="btn-secondary text-xs px-1">✕</button>
                                </div>
                              ) : (
                                <button onClick={()=>{setEditPayeId(r.id);setEditPayeVal(String(r.montant_paye||0))}} className="text-xs px-2 py-1 rounded-lg font-semibold" style={{background:'#dcfce7',color:'#16a34a',border:'1px solid #bbf7d0'}}>
                                  💰 Payer
                                </button>
                              )
                            )}
                            {deleteConfirm===r.id
                              ? <button onClick={()=>deleteRetour(r.id)} className="text-xs px-2 py-1 rounded-lg font-bold" style={{background:'#dc2626',color:'#fff'}}>Confirmer ✕</button>
                              : <button onClick={()=>deleteRetour(r.id)} className="btn-danger text-xs">✕</button>}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
                {filtered.length === 0 && <tr><td colSpan={admin?11:10} className="td text-center text-gray-400 py-10">Aucun retour pour cette période</td></tr>}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr>
                    <td className="tfoot-td" colSpan={5}>TOTAL ({filtered.length})</td>
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
