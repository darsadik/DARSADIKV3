import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { fmt, fmtD, fmtDate } from '../../lib/utils'
import { fetchRemiseCarburantRate } from '../../lib/services/settings'
import { DEFAULT_REMISE_CARBURANT_RATE } from '../../lib/services/profitability'
import { buildVoyageKmFuelTimeline, buildTimelineDashboard, detectFuelAssignmentProblems, detectUnrealisticDistances, TIMELINE_STATUS } from '../../lib/services/voyageKmFuel'
import { detectProblems as detectOdometerProblems, buildOdometerRows } from '../../lib/services/kilometrage'
import VoyageFixModal from '../../components/carburant/VoyageFixModal'

const BADGE_TONE = { ok: 'badge-green', warning: 'badge-amber', error: 'badge-red' }
const SEVERITY_TONE = { error: 'badge-red', warning: 'badge-amber', info: 'badge-blue' }

function StatusBadge({ status }) {
  const m = TIMELINE_STATUS[status]
  if (!m) return null
  return <span className={BADGE_TONE[m.tone]}>{m.emoji} {m.label}</span>
}

function DashCard({ label, count, tone, active, onClick }) {
  const color = tone === 'error' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : 'text-emerald-600'
  return (
    <button onClick={onClick} className={`stat-card text-left ${active ? 'ring-2 ring-brand-500' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color}`}>{count}</div>
    </button>
  )
}

export default function VoyageKmCarburant() {
  const [camions, setCamions] = useState([])
  const [voyages, setVoyages] = useState([])
  const [gasoil, setGasoil] = useState([])
  const [voyageGasoilRows, setVoyageGasoilRows] = useState([])
  const [remiseRate, setRemiseRate] = useState(DEFAULT_REMISE_CARBURANT_RATE)
  const [loading, setLoading] = useState(true)

  const [filterCamion, setFilterCamion] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [fixingVoyageId, setFixingVoyageId] = useState(null)

  useEffect(() => { loadAll(); fetchRemiseCarburantRate().then(setRemiseRate) }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ca }, { data: vo }, { data: ga }, { data: vg }] = await Promise.all([
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('voyages')
        .select('id,reference,date_depart,camion_id,camion_plaque,km_depart,km_arrivee,fuel_mode,manual_distance_km,manual_cost_per_km,manual_fuel_cost,deleted_at')
        .order('date_depart', { ascending: true }),
      supabase.from('gasoil').select('id,camion_id,camion_plaque,km,total,qte,adblue_total,date,heure'),
      supabase.from('voyage_gasoil').select('id,voyage_id,gasoil_id,date_gasoil,qte_litres,prix_unitaire,total,is_split'),
    ])
    setCamions(ca || [])
    setVoyages(vo || [])
    setGasoil(ga || [])
    setVoyageGasoilRows(vg || [])
    setLoading(false)
  }

  const rows = useMemo(() => buildVoyageKmFuelTimeline({
    voyages, camions, gasoil, voyageGasoilRows, remiseRate,
  }), [voyages, camions, gasoil, voyageGasoilRows, remiseRate])

  const dashboard = useMemo(() => buildTimelineDashboard(rows), [rows])

  const odometerProblems = useMemo(() => {
    const active = voyages.filter(v => !v.deleted_at)
    return detectOdometerProblems(buildOdometerRows(active, camions))
  }, [voyages, camions])
  const fuelProblems = useMemo(() => detectFuelAssignmentProblems({ gasoil, voyageGasoilRows }), [gasoil, voyageGasoilRows])
  const distanceProblems = useMemo(() => detectUnrealisticDistances(rows), [rows])
  const allProblems = useMemo(() => {
    const order = { error: 0, warning: 1, info: 2 }
    return [...odometerProblems, ...fuelProblems, ...distanceProblems].sort((a, b) => order[a.severity] - order[b.severity])
  }, [odometerProblems, fuelProblems, distanceProblems])

  const visibleRows = useMemo(() => rows
    .filter(r => !filterCamion || r.camionId === parseInt(filterCamion))
    .filter(r => !filterStatus || r.status === filterStatus)
    .filter(r => !search || r.reference.toLowerCase().includes(search.toLowerCase()) || r.plaque.toLowerCase().includes(search.toLowerCase())),
    [rows, filterCamion, filterStatus, search])

  const visibleProblems = useMemo(() =>
    filterCamion ? allProblems.filter(p => p.camionId === parseInt(filterCamion)) : allProblems,
    [allProblems, filterCamion])

  function clickDashCard(status) {
    setFilterCamion('')
    setFilterStatus(status)
  }

  return (
    <Layout title="Voyage KM & Fuel Manager" subtitle="Vue unifiée par voyage — KM départ/arrivée, distance, carburant assigné et coût/km. Cliquez « Corriger » pour éditer un voyage directement depuis cette liste.">

      {/* ── DASHBOARD ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <DashCard label="Voyages" count={dashboard.total} tone="ok"
          active={!filterStatus && !filterCamion} onClick={() => { setFilterStatus(''); setFilterCamion('') }} />
        {Object.entries(TIMELINE_STATUS).map(([key, meta]) => (
          <DashCard key={key} label={`${meta.emoji} ${meta.label}`} count={dashboard.byStatus[key] || 0}
            tone={meta.tone} active={filterStatus === key} onClick={() => clickDashCard(key)} />
        ))}
      </div>

      {/* ── PROBLEMS ── */}
      {visibleProblems.length > 0 && (
        <div className="card mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Problèmes détectés ({visibleProblems.length})</h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {visibleProblems.map((p, i) => (
              <div key={i} className="w-full flex items-start gap-2 px-3 py-2 rounded-lg text-xs">
                <span className={SEVERITY_TONE[p.severity]}>{p.severity === 'error' ? '❌' : p.severity === 'warning' ? '⚠' : 'ℹ'}</span>
                <span className="flex-1 text-gray-700">{p.message}</span>
              </div>
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
            <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ minWidth: '200px' }}>
              <option value="">Tous</option>
              {Object.entries(TIMELINE_STATUS).map(([k, m]) => <option key={k} value={k}>{m.emoji} {m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Rechercher</label>
            <input className="input" placeholder="Voyage, camion..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '160px' }} />
          </div>
          <button onClick={() => { setFilterCamion(''); setFilterStatus(''); setSearch('') }} className="btn-secondary text-xs">↺ Réinitialiser</button>
        </div>
      </div>

      {/* ── TIMELINE TABLE ── */}
      <div className="card">
        {loading ? (
          <div className="text-center text-gray-400 py-10">Chargement...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Camion</th>
                  <th className="th">Chauffeur</th>
                  <th className="th">Voyage</th>
                  <th className="th text-right">KM Départ</th>
                  <th className="th text-right">KM Arrivée</th>
                  <th className="th text-right">Distance</th>
                  <th className="th">Plein lié</th>
                  <th className="th text-right">Litres</th>
                  <th className="th text-right">Coût carburant</th>
                  <th className="th text-right">Coût/km</th>
                  <th className="th">Statut</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(r => (
                  <tr key={r.voyageId} className={`hover:bg-gray-50 transition-colors ${r.status === 'cannot_calculate' ? 'bg-red-50/50' : ''}`}>
                    <td className="td text-gray-500">{fmtDate(r.date)}</td>
                    <td className="td text-gray-700">{r.plaque}</td>
                    <td className="td text-gray-500">{r.chauffeur}</td>
                    <td className="td">
                      <Link href={`/voyages/${r.voyageId}`} className="font-semibold text-brand-600 hover:underline">{r.reference}</Link>
                      {r.outOfSync && <span className="badge-amber ml-2 text-[10px]">désynchronisé</span>}
                    </td>
                    <td className="td text-right">{r.kmDepart !== null ? fmt(r.kmDepart) : <span className="text-slate-300">—</span>}</td>
                    <td className="td text-right">
                      {r.kmArrivee !== null ? fmt(r.kmArrivee) : (
                        r.isLastForTruck ? <span className="text-amber-500 text-[10px]">en attente</span> : <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className={`td text-right font-semibold ${r.distance < 0 ? 'text-red-600' : r.distance === 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                      {r.distance !== null ? `${fmt(r.distance)} km` : <span className="text-slate-300 font-normal">—</span>}
                    </td>
                    <td className="td text-gray-500 text-xs">{r.fillLabel || <span className="text-slate-300">—</span>}</td>
                    <td className="td text-right">{r.litersLinked !== null ? `${fmtD(r.litersLinked)} L` : <span className="text-slate-300">—</span>}</td>
                    <td className="td text-right font-semibold text-amber-700">{r.fuelCost ? `${fmt(r.fuelCost)} DHS` : <span className="text-slate-300 font-normal">—</span>}</td>
                    <td className="td text-right">{r.costPerKm !== null ? `${fmtD(r.costPerKm)} DHS` : <span className="text-slate-300">—</span>}</td>
                    <td className="td"><StatusBadge status={r.status} /></td>
                    <td className="td">
                      <button onClick={() => setFixingVoyageId(r.voyageId)}
                        className="text-xs font-semibold text-brand-600 hover:underline whitespace-nowrap">
                        Corriger
                      </button>
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr><td colSpan={13} className="td text-center text-gray-400 py-10">Aucun voyage trouvé</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {fixingVoyageId && (
        <VoyageFixModal
          voyageId={fixingVoyageId}
          onClose={() => setFixingVoyageId(null)}
          onSaved={loadAll}
        />
      )}
    </Layout>
  )
}
