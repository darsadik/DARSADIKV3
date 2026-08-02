import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { fmt, fmtDate } from '../../lib/utils'
import {
  buildOdometerRows, buildTruckSummaries, detectProblems, buildDashboard,
  ROW_STATUS, TRUCK_STATUS,
} from '../../lib/services/kilometrage'
import { recalcOdometerChain } from '../../lib/services/voyage/updates'

const BADGE_TONE = { ok: 'badge-green', warning: 'badge-amber', error: 'badge-red', info: 'badge-blue' }
const SEVERITY_TONE = { error: 'badge-red', warning: 'badge-amber', info: 'badge-blue' }

function StatusBadge({ status, meta }) {
  const m = meta[status]
  if (!m) return null
  return <span className={BADGE_TONE[m.tone]}>{m.emoji} {m.label}</span>
}

function DashCard({ label, count, tone, active, onClick }) {
  return (
    <button onClick={onClick} className={`stat-card text-left ${active ? 'ring-2 ring-brand-500' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone === 'error' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : 'text-emerald-600'}`}>{count}</div>
    </button>
  )
}

export default function Kilometrage() {
  const [camions, setCamions] = useState([])
  const [voyages, setVoyages] = useState([])
  const [loading, setLoading] = useState(true)
  const [recalculating, setRecalculating] = useState(false)

  const [filterCamion, setFilterCamion] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ca }, { data: vo }] = await Promise.all([
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('voyages')
        .select('id,reference,date_depart,camion_id,camion_plaque,km_depart,km_arrivee,deleted_at')
        .order('date_depart', { ascending: true }),
    ])
    setCamions(ca || [])
    setVoyages(vo || [])
    setLoading(false)
  }

  const rows = useMemo(() => buildOdometerRows(voyages, camions), [voyages, camions])
  const truckSummaries = useMemo(() => buildTruckSummaries(rows), [rows])
  const problems = useMemo(() => detectProblems(rows), [rows])
  const dashboard = useMemo(() => buildDashboard(truckSummaries), [truckSummaries])

  const visibleRows = useMemo(() => rows
    .filter(r => !filterCamion || r.camionId === parseInt(filterCamion))
    .filter(r => !filterStatus || r.status === filterStatus)
    .filter(r => !search || r.reference.toLowerCase().includes(search.toLowerCase()) || r.plaque.toLowerCase().includes(search.toLowerCase())),
    [rows, filterCamion, filterStatus, search])

  const visibleProblems = useMemo(() =>
    filterCamion ? problems.filter(p => p.camionId === parseInt(filterCamion)) : problems,
    [problems, filterCamion])

  function clickDashCard(status) {
    setFilterCamion('')
    setFilterStatus(status)
  }

  function clickProblem(p) {
    setFilterCamion(String(p.camionId))
    setFilterStatus('')
  }

  async function recalcAll() {
    if (!confirm(`Recalculer la chaîne kilométrique pour les ${camions.length} camion(s) ?`)) return
    setRecalculating(true)
    try {
      await Promise.all(camions.map(c => recalcOdometerChain(c.id)))
      await loadAll()
    } catch (err) {
      alert('Erreur recalcul: ' + err.message)
    }
    setRecalculating(false)
  }

  async function recalcOne(camionId) {
    setRecalculating(true)
    try {
      await recalcOdometerChain(camionId)
      await loadAll()
    } catch (err) {
      alert('Erreur recalcul: ' + err.message)
    }
    setRecalculating(false)
  }

  return (
    <Layout title="Kilométrage" subtitle="Suivi de la chaîne d'odomètre par camion — la distance est toujours dérivée du KM, jamais saisie à la main">

      <div className="flex justify-end -mt-3 mb-3 text-xs text-gray-400">
        <Link href="/voyages/km-carburant" className="text-brand-600 font-semibold hover:underline">Truck Timeline & KM/Fuel Control Center →</Link>
      </div>

      {/* ── DASHBOARD ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <DashCard label="✓ Camions OK" count={dashboard.okTrucks.length} tone="ok"
          active={filterStatus === '' && !filterCamion} onClick={() => { setFilterStatus(''); setFilterCamion('') }} />
        <DashCard label="⚠ En attente du prochain KM" count={dashboard.waitingTrucks.length} tone="warning"
          active={filterStatus === 'waiting'} onClick={() => clickDashCard('waiting')} />
        <DashCard label="❌ KM manquant" count={dashboard.missingKmTrucks.length} tone="error"
          active={filterStatus === 'missing_km'} onClick={() => clickDashCard('missing_km')} />
        <DashCard label="❌ Erreurs de chronologie" count={dashboard.chronologyErrorTrucks.length} tone="error"
          active={filterStatus === 'broken_chronology'} onClick={() => clickDashCard('broken_chronology')} />
      </div>

      {/* ── PROBLEMS ── */}
      {visibleProblems.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Problèmes détectés ({visibleProblems.length})</h3>
            <button onClick={recalcAll} disabled={recalculating} className="btn-primary text-xs">
              {recalculating ? 'Recalcul...' : '↺ Recalculer la chaîne odomètre (tous les camions)'}
            </button>
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {visibleProblems.map((p, i) => (
              <button key={i} onClick={() => clickProblem(p)}
                className="w-full text-left flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-xs">
                <span className={SEVERITY_TONE[p.severity]}>{p.severity === 'error' ? '❌' : p.severity === 'warning' ? '⚠' : 'ℹ'}</span>
                <span className="flex-1 text-gray-700">{p.message}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── FILTERS ── */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Camion</label>
            <select className="input" value={filterCamion} onChange={e => setFilterCamion(e.target.value)} style={{ minWidth: '160px' }}>
              <option value="">Tous</option>
              {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Statut</label>
            <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ minWidth: '180px' }}>
              <option value="">Tous</option>
              {Object.entries(ROW_STATUS).map(([k, m]) => <option key={k} value={k}>{m.emoji} {m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Rechercher</label>
            <input className="input" placeholder="Voyage, camion..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '160px' }} />
          </div>
          <button onClick={() => { setFilterCamion(''); setFilterStatus(''); setSearch('') }} className="btn-secondary text-xs">↺ Réinitialiser</button>
          {filterCamion && (
            <button onClick={() => recalcOne(parseInt(filterCamion))} disabled={recalculating} className="btn-secondary text-xs ml-auto">
              {recalculating ? 'Recalcul...' : `↺ Recalculer ${camions.find(c => c.id === parseInt(filterCamion))?.plaque || ''}`}
            </button>
          )}
        </div>
      </div>

      {/* ── TRUCK SUMMARY STRIP ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        {truckSummaries.map(t => (
          <button key={t.camionId} onClick={() => { setFilterCamion(String(t.camionId)); setFilterStatus('') }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              filterCamion === String(t.camionId) ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {TRUCK_STATUS[t.status]?.emoji} {t.plaque}
          </button>
        ))}
      </div>

      {/* ── TABLE ── */}
      <div className="card">
        {loading ? (
          <div className="text-center text-gray-400 py-10">Chargement...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Voyage</th>
                  <th className="th">Camion</th>
                  <th className="th text-right">KM Départ</th>
                  <th className="th text-right">KM Suivant</th>
                  <th className="th text-right">Distance</th>
                  <th className="th">Statut</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(r => (
                  <tr key={r.voyageId} className={`hover:bg-gray-50 transition-colors ${r.status === 'broken_chronology' ? 'bg-red-50/50' : ''}`}>
                    <td className="td text-gray-500">{fmtDate(r.date)}</td>
                    <td className="td">
                      <Link href={`/voyages/${r.voyageId}`} className="font-semibold text-brand-600 hover:underline">{r.reference}</Link>
                      {r.outOfSync && <span className="badge-amber ml-2 text-[10px]">désynchronisé</span>}
                    </td>
                    <td className="td text-gray-700">{r.plaque}</td>
                    <td className="td text-right">{r.kmDepart !== null ? fmt(r.kmDepart) : <span className="text-slate-300">—</span>}</td>
                    <td className="td text-right">{r.kmNext !== null ? fmt(r.kmNext) : <span className="text-slate-300">—</span>}</td>
                    <td className={`td text-right font-semibold ${r.distance < 0 ? 'text-red-600' : r.distance === 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                      {r.distance !== null ? `${fmt(r.distance)} km` : <span className="text-slate-300 font-normal">—</span>}
                    </td>
                    <td className="td"><StatusBadge status={r.status} meta={ROW_STATUS} /></td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr><td colSpan={7} className="td text-center text-gray-400 py-10">Aucun voyage trouvé</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}
