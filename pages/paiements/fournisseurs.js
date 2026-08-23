import { useState, useEffect, useMemo } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { fmtMoney, fmtDate, today, startOfMonth } from '../../lib/utils'

// Same three "sortant" fournisseur types as the OutgoingSection of /paiements
// (pages/paiements/index.js) — this page is a filtered read-only register of
// the exact same `paiements` rows, never a parallel data source.
const OUT_TYPES = {
  fourn_brique:  { label: 'Brique',    icon: '🏭', color: '#1d4ed8' },
  fourn_grignon: { label: 'Grignon',   icon: '🌿', color: '#15803d' },
  gasoil:        { label: 'Carburant', icon: '⛽', color: '#f97316' },
}

const MODES = ['Espèce', 'Chèque', 'Virement']

function startOfWeek() {
  const d = new Date()
  const day = d.getDay() // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day // back to Monday
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

export default function PaiementsFournisseurs() {
  const [paiements, setPaiements] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [gFournisseurs, setGFournisseurs] = useState([])
  const [gasoilFournisseurs, setGasoilFournisseurs] = useState([])
  const [loading, setLoading] = useState(true)

  const [filterTiers, setFilterTiers] = useState('') // `${type_compte}:${id}` or ''
  const [filterMode, setFilterMode] = useState('')   // '' | 'Espèce' | 'Chèque' | 'Virement'
  const [dateRange, setDateRange] = useState('all')  // 'all' | 'week' | 'month' | 'custom'
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo, setFilterTo] = useState(today())

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: pa }, { data: fo }, { data: gf }, { data: gaf }] = await Promise.all([
      supabase.from('paiements').select('*').order('date', { ascending: false }),
      supabase.from('fournisseurs').select('*').order('nom'),
      supabase.from('grignon_fournisseurs').select('*').order('nom'),
      supabase.from('gasoil_fournisseurs').select('*').order('nom'),
    ])
    setPaiements(pa || [])
    setFournisseurs(fo || [])
    setGFournisseurs(gf || [])
    setGasoilFournisseurs(gaf || [])
    setLoading(false)
  }

  // Identical predicate to `outgoingPayments` in pages/paiements/index.js —
  // any row created/edited/deleted there is reflected here automatically.
  const supplierPayments = useMemo(() => paiements.filter(p =>
    p.sens === 'sortant' || ['fourn_brique', 'fourn_grignon', 'gasoil'].includes(p.type_compte)
  ), [paiements])

  const rangeFrom = dateRange === 'month' ? startOfMonth() : dateRange === 'week' ? startOfWeek() : dateRange === 'custom' ? filterFrom : ''
  const rangeTo = dateRange === 'custom' ? filterTo : today()

  const filtered = useMemo(() => supplierPayments.filter(p => {
    if (filterMode && p.mode !== filterMode) return false
    if (filterTiers) {
      const [type, id] = filterTiers.split(':')
      if (p.type_compte !== type) return false
      const idCol = type === 'fourn_brique' ? p.fournisseur_id : type === 'fourn_grignon' ? p.grignon_fourn_id : p.gasoil_fourn_id
      if (String(idCol) !== id) return false
    }
    if (dateRange !== 'all') {
      if (rangeFrom && p.date < rangeFrom) return false
      if (rangeTo && p.date > rangeTo) return false
    }
    return true
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || 0) - (a.id || 0)), [supplierPayments, filterMode, filterTiers, dateRange, rangeFrom, rangeTo])

  const total = filtered.reduce((s, p) => s + (p.montant || 0), 0)

  function resetFilters() {
    setFilterTiers('')
    setFilterMode('')
    setDateRange('all')
    setFilterFrom(startOfMonth())
    setFilterTo(today())
  }

  const modeBadgeColor = mode => {
    if (mode === 'Espèce') return 'bg-green-100 text-green-700'
    if (mode === 'Chèque') return 'bg-amber-100 text-amber-700'
    if (mode === 'Virement') return 'bg-blue-100 text-blue-700'
    return 'bg-slate-100 text-slate-600'
  }
  const chequeStatusBadge = status => {
    if (status === 'validated') return { label: '✅', cls: 'bg-green-50 text-green-700' }
    if (status === 'rejected') return { label: '❌', cls: 'bg-red-50 text-red-700' }
    return { label: '⏳', cls: 'bg-amber-50 text-amber-700' }
  }

  return (
    <Layout title="Paiements Fournisseurs" subtitle="Registre des paiements émis aux fournisseurs — Brique, Grignon & Carburant">

      {/* TOTAL */}
      <div className="card mb-6" style={{ background: 'linear-gradient(135deg,#1e3a5f,#334155)' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Total Paiements Fournisseurs</div>
            <div className="text-white text-3xl font-extrabold mt-1 tracking-tight">{fmtMoney(total)} DH</div>
          </div>
          <div className="text-white/80 text-sm font-semibold">{filtered.length} paiement{filtered.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[220px] flex-1">
            <label className="label">Fournisseur</label>
            <select className="input" value={filterTiers} onChange={e => setFilterTiers(e.target.value)}>
              <option value="">Tous les fournisseurs</option>
              <optgroup label="🏭 Fournisseurs Brique">
                {fournisseurs.map(f => <option key={`b${f.id}`} value={`fourn_brique:${f.id}`}>{f.nom}</option>)}
              </optgroup>
              <optgroup label="🌿 Fournisseurs Grignon">
                {gFournisseurs.map(f => <option key={`g${f.id}`} value={`fourn_grignon:${f.id}`}>{f.nom}</option>)}
              </optgroup>
              <optgroup label="⛽ Fournisseurs Carburant">
                {gasoilFournisseurs.map(f => <option key={`c${f.id}`} value={`gasoil:${f.id}`}>{f.nom}</option>)}
              </optgroup>
            </select>
          </div>

          <div className="min-w-[160px]">
            <label className="label">Mode de paiement</label>
            <select className="input" value={filterMode} onChange={e => setFilterMode(e.target.value)}>
              <option value="">Tous</option>
              {MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="min-w-[280px]">
            <label className="label">Période</label>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {[['all', 'Toutes'], ['week', 'Cette semaine'], ['month', 'Ce mois'], ['custom', 'Personnalisé']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setDateRange(k)}
                  className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${dateRange === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {dateRange === 'custom' && (
            <>
              <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} /></div>
              <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e => setFilterTo(e.target.value)} /></div>
            </>
          )}

          <button onClick={resetFilters} className="btn-secondary text-xs">↺ Réinitialiser</button>
        </div>
      </div>

      {/* TABLE */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              <th className="th">Date</th>
              <th className="th">Fournisseur</th>
              <th className="th">Mode</th>
              <th className="th">Référence / N° Chèque</th>
              <th className="th text-right">Montant DHS</th>
              <th className="th">Note</th>
            </tr></thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="td text-center text-gray-400 py-10">Chargement...</td></tr>
              )}
              {!loading && filtered.map(p => {
                const t = OUT_TYPES[p.type_compte] || OUT_TYPES.fourn_brique
                const nom = p.fournisseur_nom || p.client_nom || '—'
                const cs = p.mode === 'Chèque' && p.cheque_status ? chequeStatusBadge(p.cheque_status) : null
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="td text-gray-500 whitespace-nowrap">{fmtDate(p.date)}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white shrink-0" style={{ background: t.color }}>{t.icon} {t.label}</span>
                        <span className="font-semibold text-gray-900">{nom}</span>
                      </div>
                    </td>
                    <td className="td whitespace-nowrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${modeBadgeColor(p.mode)}`}>{p.mode}</span>
                      {cs && <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cs.cls}`}>{cs.label}</span>}
                    </td>
                    <td className="td text-xs font-mono text-gray-600">{p.cheque_number || '—'}</td>
                    <td className="td text-right font-bold text-red-600 whitespace-nowrap">− {fmtMoney(p.montant)} DHS</td>
                    <td className="td text-gray-400 text-xs max-w-[220px] truncate">{p.note || '—'}</td>
                  </tr>
                )
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="td text-center text-gray-400 py-10">Aucun paiement fournisseur pour ces filtres</td></tr>
              )}
            </tbody>
            {!loading && filtered.length > 0 && (
              <tfoot><tr>
                <td className="tfoot-td" colSpan={4}>TOTAL ({filtered.length} paiement{filtered.length !== 1 ? 's' : ''})</td>
                <td className="tfoot-td text-right text-red-600">− {fmtMoney(total)} DHS</td>
                <td className="tfoot-td"></td>
              </tr></tfoot>
            )}
          </table>
        </div>
      </div>
    </Layout>
  )
}
