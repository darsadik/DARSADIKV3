import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const fmt  = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtD = n => parseFloat(n || 0).toFixed(2)
const fmtDate = d => { if (!d) return '—'; const [y,m,j] = d.split('-'); return `${j}/${m}/${y}` }
const today = () => new Date().toISOString().split('T')[0]
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

// ── CATÉGORIES (issues des fichiers Excel DAR SADIK) ──────────────────────────
const CATEGORIES = [
  { key: 'ouvriers',          label: 'Ouvriers / Main d\'œuvre', arabic: 'خدامة',         icon: '👷' },
  { key: 'chauffeur',         label: 'Chauffeur',                arabic: 'صيار الشيفور',  icon: '🧑‍✈️' },
  { key: 'nourriture',        label: 'Nourriture',               arabic: 'الاكل',          icon: '🍽️' },
  { key: 'autoroute',         label: 'Autoroute / Péage',        arabic: 'لوطوروت',        icon: '🛣️' },
  { key: 'gendarmerie',       label: 'Gendarmerie',              arabic: 'الدرك',          icon: '🚔' },
  { key: 'controle',          label: 'Contrôle / Police',        arabic: 'كنطرول',         icon: '🛂' },
  { key: 'reparation_camion', label: 'Réparation camion',        arabic: 'صيار الكاميون', icon: '🔧' },
  { key: 'pneus',             label: 'Pneus / Réparation',       arabic: 'عجلات/اصلاح',   icon: '🔩' },
  { key: 'chargement',        label: 'Chargement / Teb\'ia',     arabic: 'تعبئة',          icon: '📦' },
  { key: 'lavage_vidange',    label: 'Lavage / Vidange',         arabic: 'لفاج/لكريس',    icon: '🚿' },
  { key: 'transport',         label: 'Transport / Mrkob',        arabic: 'مركوب',          icon: '🚌' },
  { key: 'gardien',           label: 'Gardien / Sécurité',       arabic: 'عساس',           icon: '💂' },
  { key: 'tractopelle',       label: 'Tractopelle / Trax',       arabic: 'طراكس',          icon: '🚜' },
  { key: 'balance',           label: 'Balance / Poids',          arabic: 'ميزان',          icon: '⚖️' },
  { key: 'samsar',            label: 'Samsar / Courtage',        arabic: 'SAMSAR',         icon: '🤝' },
  { key: 'adblue',            label: 'AdBlue',                   arabic: 'ادبلو',          icon: '🧴' },
  { key: 'autres',            label: 'Autres charges',           arabic: '—',              icon: '➕' },
]

const emptyForm = () => {
  const vals = {}
  CATEGORIES.forEach(c => { vals[c.key] = '' })
  return {
    date: today(),
    camion_id: '',
    note: '',
    ...vals,
  }
}

function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const check = () => setM(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return m
}

export default function Charges() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const [charges, setCharges]     = useState([])
  const [camions, setCamions]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [expandedId, setExpandedId]   = useState(null)

  // ── FILTERS ──
  const [filterFrom, setFilterFrom]     = useState(startOfMonth())
  const [filterTo, setFilterTo]         = useState(today())
  const [filterCamion, setFilterCamion] = useState('')

  // ── FORM ──
  const [form, setForm] = useState(emptyForm())

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ch }, { data: ca }] = await Promise.all([
      supabase.from('charges').select('*').order('date', { ascending: false }),
      supabase.from('camions').select('*').order('plaque'),
    ])
    setCharges(ch || [])
    setCamions(ca || [])
    setLoading(false)
  }

  // ── TOTAL FORM ──
  const totalForm = CATEGORIES.reduce((s, c) => s + (parseFloat(form[c.key]) || 0), 0)

  // ── SAVE ──
  async function saveCharge(e) {
    e.preventDefault()
    if (!form.camion_id) return
    setSaving(true)

    const camion = camions.find(c => c.id === parseInt(form.camion_id))

    const payload = {
      date:          form.date,
      camion_id:     parseInt(form.camion_id),
      camion_plaque: camion?.plaque || '',
      note:          form.note,
      total:         totalForm,
    }
    CATEGORIES.forEach(c => {
      payload[c.key] = parseFloat(form[c.key]) || 0
    })

    await supabase.from('charges').insert(payload)
    setSaving(false)
    setForm(emptyForm())
    setShowForm(false)
    loadAll()
  }

  // ── DELETE ──
  async function deleteCharge(id) {
    if (!confirm('Supprimer cette fiche de charges ?')) return
    await supabase.from('charges').delete().eq('id', id)
    loadAll()
  }

  // ── FILTER ──
  const filtered = charges.filter(c => {
    if (filterFrom   && c.date < filterFrom)  return false
    if (filterTo     && c.date > filterTo)    return false
    if (filterCamion && c.camion_plaque !== filterCamion) return false
    return true
  })

  const totalCharges = filtered.reduce((s, c) => s + (c.total || 0), 0)

  // ── STATS PAR CAMION ──
  const byCamion = {}
  filtered.forEach(c => {
    if (!byCamion[c.camion_plaque]) byCamion[c.camion_plaque] = 0
    byCamion[c.camion_plaque] += (c.total || 0)
  })

  // ── STATS PAR CATÉGORIE ──
  const byCategory = {}
  CATEGORIES.forEach(cat => {
    byCategory[cat.key] = filtered.reduce((s, c) => s + (c[cat.key] || 0), 0)
  })
  const topCategories = CATEGORIES
    .map(c => ({ ...c, total: byCategory[c.key] }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total)

  // ── PRINT ──
  function printCharges() {
    const _now = new Date()
    const printDateTime = _now.toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' à ' + String(_now.getHours()).padStart(2,'0') + ':' + String(_now.getMinutes()).padStart(2,'0')
    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>Charges Transport — DAR SADIK</title>
    <style>
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; padding: 30px 36px; font-size: 12px; color: #1e293b; background: #fff; margin: 0; }
      table { width:100%; border-collapse:collapse; margin-bottom:10px; }
      th { background:#1a5fa8 !important; color:#fff !important; padding:9px 12px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; text-align:left; border:1px solid #1355a0; }
      td { padding:8px 12px; font-size:11px; color:#1e293b; border:1px solid #e2e8f0; vertical-align:middle; }
      tr:nth-child(even) td { background:#f8fafc !important; }
      tfoot td { background:#e8f0fe !important; font-weight:800 !important; border:1px solid #c7d8f7; border-top:2px solid #1a5fa8 !important; color:#1e293b !important; font-size:12px; }
      b, strong { color:#1e293b !important; font-weight:800; }
      .num { text-align:right; font-family:monospace; }
      .muted { color:#94a3b8; font-size:10px; }
      .section-title { font-size:13px; font-weight:700; color:#1e293b; border-bottom:2px solid #e2e8f0; padding-bottom:6px; margin:20px 0 10px; }
      .cat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:16px; }
      .cat-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; }
      .cat-label { font-size:9px; color:#64748b; text-transform:uppercase; font-weight:600; }
      .cat-val { font-size:14px; font-weight:800; color:#1e293b; margin-top:3px; }
      @media print { button { display:none !important; } body { padding:12px 18px; } }
      @page { size:A4; margin:10mm 12mm; }
    </style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;margin-bottom:4px"><div><div style="font-size:26px;font-weight:900;color:#1a3a6b;letter-spacing:-0.5px;line-height:1.1">DAR SADIK</div><div style="font-size:15px;font-weight:700;color:#1a5fa8;direction:rtl">دار صديق</div><div style="font-size:11px;color:#475569;margin-top:2px;direction:rtl">بائع جميع مواد البناء</div></div><div style="text-align:right;padding-top:4px"><div style="font-size:11px;color:#334155;margin-bottom:4px;font-weight:600">📞 Mohamed: 06 61 32 56 65 &nbsp;·&nbsp; Sadik: 06 61 97 87 47 &nbsp;·&nbsp; Bureau: 06 62 82 88 20</div><div style="font-size:11px;color:#334155;margin-bottom:4px">✉️ Dar.sadik@hotmail.com</div><div style="font-size:11px;color:#64748b">📍 Selouane - Nador</div></div></div>
    <div style="height:3px;background:linear-gradient(90deg,#1a5fa8,#3b82f6);border-radius:2px;margin-bottom:20px"></div>
    <div style="font-size:16px;font-weight:800;color:#1e293b;margin-bottom:4px">🚛 Charges Transport</div>
    <div style="font-size:11px;color:#64748b;margin-bottom:18px">Période : ${filterFrom} → ${filterTo}${filterCamion ? ' · Camion : '+filterCamion : ''} &nbsp;·&nbsp; Total : ${fmt(totalCharges)} DHS &nbsp;·&nbsp; ${filtered.length} fiches</div>

    <h2>📊 Répartition par catégorie</h2>
    <div class="cat-grid">
    ${topCategories.map(c => `<div class="cat-box">
      <div class="cat-label">${c.icon} ${c.label}</div>
      <div class="cat-val">${fmt(c.total)} DHS</div>
    </div>`).join('')}
    </div>

    <h2>🚛 Répartition par camion</h2>
    <table><thead><tr><th>Camion</th><th class="num">Total DHS</th><th class="num">% du total</th></tr></thead>
    <tbody>${Object.entries(byCamion).sort((a,b)=>b[1]-a[1]).map(([p,t]) => `<tr>
      <td>${p}</td><td class="num"><b>${fmt(t)}</b></td>
      <td class="num">${totalCharges > 0 ? ((t/totalCharges)*100).toFixed(1) : 0}%</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr><td><b>TOTAL</b></td><td class="num"><b>${fmt(totalCharges)} DHS</b></td><td></td></tr></tfoot>
    </table>

    <h2>📋 Détail des fiches</h2>
    <table><thead><tr>
      <th>Date</th><th>Camion</th>
      ${topCategories.map(c => `<th class="num">${c.icon} ${c.label.split('/')[0]}</th>`).join('')}
      <th class="num">TOTAL</th><th>Note</th>
    </tr></thead><tbody>
    ${filtered.map(ch => `<tr>
      <td>${fmtDate(ch.date)}</td><td><b>${ch.camion_plaque}</b></td>
      ${topCategories.map(c => `<td class="num">${ch[c.key] > 0 ? fmt(ch[c.key]) : '—'}</td>`).join('')}
      <td class="num"><b>${fmt(ch.total)}</b></td>
      <td>${ch.note||'—'}</td>
    </tr>`).join('')}
    </tbody><tfoot><tr>
      <td colspan="2"><b>TOTAL (${filtered.length})</b></td>
      ${topCategories.map(c => `<td class="num"><b>${fmt(byCategory[c.key])}</b></td>`).join('')}
      <td class="num"><b>${fmt(totalCharges)} DHS</b></td><td></td>
    </tr></tfoot></table>
    <div style="margin-top:28px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8"><span>DAR SADIK — دار صديق — Selouane, Nador</span><span>Généré le ${printDateTime}</span></div>
    </body></html>`)
    win.document.close(); win.print()
  }

  // ── CSV ──
  function exportCSV() {
    let csv = `Date,Camion,${CATEGORIES.map(c=>c.label).join(',')},Total DHS,Note\n`
    filtered.forEach(ch => {
      csv += `${fmtDate(ch.date)},${ch.camion_plaque},${CATEGORIES.map(c=>ch[c.key]||0).join(',')},${ch.total||0},"${ch.note||''}"\n`
    })
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `Charges-${filterFrom}-${filterTo}.csv`; a.click()
  }

  // ── FORM UI ──
  const FormContent = (
    <form onSubmit={saveCharge} className="space-y-4">

      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Date</label>
          <input className="input" type="date" value={form.date}
            onChange={e => setForm({...form, date: e.target.value})} required />
        </div>
        <div><label className="label">Camion</label>
          <select className="input" value={form.camion_id}
            onChange={e => setForm({...form, camion_id: e.target.value})} required>
            <option value="">Sélectionner...</option>
            {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}</option>)}
          </select>
        </div>
      </div>

      {/* ── CHARGES PAR CATÉGORIE ── */}
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="text-xs font-bold text-gray-600 mb-3 flex items-center justify-between">
          <span>💸 Charges par catégorie</span>
          {totalForm > 0 && (
            <span className="bg-red-100 text-red-700 font-bold px-3 py-1 rounded-full text-sm">
              Total : {fmt(totalForm)} DHS
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2">
          {CATEGORIES.map(cat => (
            <div key={cat.key} className="flex items-center gap-2">
              <span className="text-base w-6 text-center flex-shrink-0">{cat.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-700 truncate">{cat.label}</div>
                <div className="text-xs text-gray-400">{cat.arabic}</div>
              </div>
              <input
                type="number"
                className="input text-right font-mono"
                style={{width:'110px', flexShrink:0}}
                placeholder="0"
                value={form[cat.key]}
                onChange={e => setForm({...form, [cat.key]: e.target.value})}
              />
            </div>
          ))}
        </div>
      </div>

      <div><label className="label">Note</label>
        <input className="input" placeholder="Remarque..." value={form.note}
          onChange={e => setForm({...form, note: e.target.value})} />
      </div>

      {/* ── TOTAL PREVIEW ── */}
      {totalForm > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-xs text-red-500 mb-2 font-semibold">Récap. des charges saisies</div>
          <div className="space-y-1">
            {CATEGORIES.filter(c => parseFloat(form[c.key]) > 0).map(c => (
              <div key={c.key} className="flex justify-between text-sm">
                <span className="text-gray-600">{c.icon} {c.label}</span>
                <span className="font-bold text-red-700">{fmt(parseFloat(form[c.key]))}</span>
              </div>
            ))}
            <div className="flex justify-between text-base border-t border-red-200 pt-2 mt-2">
              <span className="font-bold text-gray-900">TOTAL</span>
              <span className="font-black text-red-700">{fmt(totalForm)} DHS</span>
            </div>
          </div>
        </div>
      )}

      <button type="submit" disabled={saving || !form.camion_id || totalForm === 0}
        className="btn-success w-full justify-center">
        {saving ? 'Enregistrement...' : '✓ Enregistrer les charges'}
      </button>
    </form>
  )

  return (
    <Layout title="Charges" subtitle="Suivi des charges de transport par voyage">

      {isMobile ? (
        // ══ MOBILE ══════════════════════════════════════════════
        <div>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="stat-card border border-red-100 bg-red-50 text-center">
              <div className="stat-label text-red-600">Total charges</div>
              <div className="stat-value text-red-700" style={{fontSize:18}}>{fmt(totalCharges)} DHS</div>
            </div>
            <div className="stat-card border border-gray-100 bg-gray-50 text-center">
              <div className="stat-label text-gray-600">Fiches</div>
              <div className="stat-value text-gray-700" style={{fontSize:18}}>{filtered.length}</div>
            </div>
          </div>

          <button onClick={() => setShowForm(!showForm)}
            className="w-full mb-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all">
            {showForm ? '▲ Fermer' : '💸 + Nouvelle fiche charges'}
          </button>
          {showForm && <div className="card mb-4">{FormContent}</div>}

          <button className="mobile-collapse-btn mb-2" onClick={() => setShowFilters(!showFilters)}>
            <span>🔍 Filtres</span><span>{showFilters ? '▲' : '▼'}</span>
          </button>
          {showFilters && (
            <div className="card mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} /></div>
                <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e => setFilterTo(e.target.value)} /></div>
              </div>
              <div><label className="label">Camion</label>
                <select className="input" value={filterCamion} onChange={e => setFilterCamion(e.target.value)}>
                  <option value="">Tous</option>
                  {camions.map(c => <option key={c.id} value={c.plaque}>{c.plaque}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setFilterFrom(startOfMonth()); setFilterTo(today()); setFilterCamion('') }}
                  className="btn-secondary text-xs flex-1 justify-center">↺ Reset</button>
                <button onClick={printCharges} className="btn-primary text-xs flex-1 justify-center" style={{background:'#4f46e5'}}>🖨️ PDF</button>
                <button onClick={exportCSV} className="btn-primary text-xs flex-1 justify-center" style={{background:'#16a34a'}}>📥 CSV</button>
              </div>
            </div>
          )}

          {/* Top catégories mobile */}
          {topCategories.length > 0 && (
            <div className="card mb-4">
              <div className="text-xs font-bold text-gray-600 mb-3">📊 Top charges</div>
              <div className="space-y-2">
                {topCategories.slice(0,5).map(c => (
                  <div key={c.key} className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">{c.icon} {c.label}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 rounded-full bg-red-100 w-16">
                        <div className="h-1.5 rounded-full bg-red-500"
                          style={{width: `${totalCharges > 0 ? Math.min(100,(c.total/totalCharges)*100) : 0}%`}} />
                      </div>
                      <span className="text-xs font-bold text-red-700 w-20 text-right">{fmt(c.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mobile list */}
          {loading ? <div className="text-center text-gray-400 py-10">Chargement...</div> : (
            <div className="mobile-card-list">
              {filtered.map(ch => (
                <div key={ch.id} className="mobile-row-card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">🚛 {ch.camion_plaque}</div>
                      <div style={{fontSize:12, color:'#6b7280', marginTop:2}}>{fmtDate(ch.date)}</div>
                    </div>
                    <div style={{color:'#dc2626', fontWeight:700, fontSize:16}}>{fmt(ch.total)} DHS</div>
                  </div>

                  {/* Mini détail */}
                  <div className="card-meta flex-wrap">
                    {CATEGORIES.filter(c => ch[c.key] > 0).map(c => (
                      <span key={c.key} className="text-xs bg-gray-50 px-1.5 py-0.5 rounded">
                        {c.icon} {fmt(ch[c.key])}
                      </span>
                    ))}
                  </div>

                  {/* Expand */}
                  <button onClick={() => setExpandedId(expandedId === ch.id ? null : ch.id)}
                    className="text-xs text-blue-500 mt-1">
                    {expandedId === ch.id ? '▲ Réduire' : '▼ Voir détail'}
                  </button>

                  {expandedId === ch.id && (
                    <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                      {CATEGORIES.filter(c => ch[c.key] > 0).map(c => (
                        <div key={c.key} className="flex justify-between text-xs">
                          <span className="text-gray-500">{c.icon} {c.label}</span>
                          <span className="font-bold text-red-700">{fmt(ch[c.key])} DHS</span>
                        </div>
                      ))}
                      {ch.note && <div className="text-xs text-gray-400 pt-1">📝 {ch.note}</div>}
                    </div>
                  )}

                  <div className="card-actions">
                    <button className="btn-danger" onClick={() => deleteCharge(ch.id)}>✕ Supprimer</button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="text-center text-gray-400 py-10">Aucune charge pour cette sélection</div>
              )}
            </div>
          )}
        </div>

      ) : (
        // ══ DESKTOP ══════════════════════════════════════════════
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── LEFT: FORM + STATS ── */}
          <div className="lg:col-span-1 space-y-4">
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">💸 Nouvelle fiche charges</h2>
              {FormContent}
            </div>

            {/* Répartition par catégorie */}
            {topCategories.length > 0 && (
              <div className="card">
                <h3 className="font-semibold text-gray-900 text-sm mb-3">📊 Charges par catégorie</h3>
                <div className="space-y-2">
                  {topCategories.map(c => (
                    <div key={c.key} className="flex items-center gap-2">
                      <span className="text-sm w-5">{c.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-600 truncate">{c.label}</div>
                        <div className="h-1.5 rounded-full bg-gray-100 mt-0.5">
                          <div className="h-1.5 rounded-full bg-red-400"
                            style={{width:`${totalCharges>0?Math.min(100,(c.total/totalCharges)*100):0}%`}} />
                        </div>
                      </div>
                      <span className="text-xs font-bold text-red-700 flex-shrink-0 w-24 text-right">{fmt(c.total)} DHS</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm border-t border-gray-100 pt-2 mt-2">
                    <span className="font-bold text-gray-900">TOTAL</span>
                    <span className="font-black text-red-700">{fmt(totalCharges)} DHS</span>
                  </div>
                </div>
              </div>
            )}

            {/* Répartition par camion */}
            {Object.keys(byCamion).length > 0 && (
              <div className="card">
                <h3 className="font-semibold text-gray-900 text-sm mb-3">🚛 Charges par camion</h3>
                <div className="space-y-2">
                  {Object.entries(byCamion).sort((a,b)=>b[1]-a[1]).map(([plaque, total]) => (
                    <div key={plaque} className="flex justify-between items-center text-sm py-1 border-b border-gray-100">
                      <span className="font-medium text-gray-800">{plaque}</span>
                      <div className="text-right">
                        <div className="font-bold text-red-700">{fmt(total)} DHS</div>
                        <div className="text-xs text-gray-400">
                          {totalCharges > 0 ? ((total/totalCharges)*100).toFixed(1) : 0}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: TABLE ── */}
          <div className="lg:col-span-2">
            <div className="card">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h2 className="font-semibold text-gray-900">Historique des charges</h2>
                <div className="flex gap-2">
                  <button onClick={printCharges} className="btn-primary text-xs px-3 py-1.5" style={{background:'#4f46e5'}}>🖨️ PDF</button>
                  <button onClick={exportCSV} className="btn-primary text-xs px-3 py-1.5" style={{background:'#16a34a'}}>📥 CSV</button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-4 items-end">
                <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} /></div>
                <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e => setFilterTo(e.target.value)} /></div>
                <div><label className="label">Camion</label>
                  <select className="input" value={filterCamion} onChange={e => setFilterCamion(e.target.value)} style={{minWidth:'130px'}}>
                    <option value="">Tous</option>
                    {camions.map(c => <option key={c.id} value={c.plaque}>{c.plaque}</option>)}
                  </select>
                </div>
                <button onClick={() => { setFilterFrom(startOfMonth()); setFilterTo(today()); setFilterCamion('') }}
                  className="btn-secondary text-xs">↺</button>
              </div>

              {/* Summary */}
              <div className="flex gap-4 mb-3 text-sm flex-wrap items-center">
                <span className="font-bold text-red-600">Total charges : {fmt(totalCharges)} DHS</span>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">{filtered.length} fiche(s)</span>
              </div>

              {/* Table */}
              {loading ? (
                <div className="text-center text-gray-400 py-10">Chargement...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr>
                      <th className="th">Date</th>
                      <th className="th">Camion</th>
                      <th className="th text-right">Total DHS</th>
                      <th className="th">Détail charges</th>
                      <th className="th">Note</th>
                      <th className="th"></th>
                    </tr></thead>
                    <tbody>
                      {filtered.map(ch => (
                        <tr key={ch.id} className="hover:bg-gray-50">
                          <td className="td text-gray-500">{fmtDate(ch.date)}</td>
                          <td className="td font-semibold">{ch.camion_plaque}</td>
                          <td className="td text-right font-black text-red-600 text-base">{fmt(ch.total)} DHS</td>
                          <td className="td">
                            <div className="flex flex-wrap gap-1">
                              {CATEGORIES.filter(c => ch[c.key] > 0).map(c => (
                                <span key={c.key}
                                  className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded-md whitespace-nowrap"
                                  title={c.label}>
                                  {c.icon} {c.label.split('/')[0]} <b>{fmt(ch[c.key])}</b>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="td text-gray-400 text-xs">{ch.note || '—'}</td>
                          <td className="td">
                            <button className="btn-danger" onClick={() => deleteCharge(ch.id)}>✕</button>
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr><td colSpan={6} className="td text-center text-gray-400 py-10">
                          Aucune charge pour cette sélection
                        </td></tr>
                      )}
                    </tbody>
                    {filtered.length > 0 && (
                      <tfoot><tr>
                        <td className="tfoot-td" colSpan={2}>TOTAL ({filtered.length} fiches)</td>
                        <td className="tfoot-td text-right text-red-700">{fmt(totalCharges)} DHS</td>
                        <td className="tfoot-td" colSpan={3}></td>
                      </tr></tfoot>
                    )}
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
