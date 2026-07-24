import { useState, useEffect, useMemo, Fragment } from 'react'
import Link from 'next/link'
import Layout from '../../components/Layout'
import PerfChart from '../../components/camions/PerfChart'
import { supabase } from '../../lib/supabase'
import { fmt, fmtD, fmtDate, today } from '../../lib/utils'
import {
  buildFuelCycles, historicalAverages, buildPeriodStats, globalStats,
  statusForCycle, periodRange, STATUS_META,
} from '../../lib/camionPerformance'

const PERIODS = [
  { id: 'semaine', label: 'Semaine' },
  { id: 'mois', label: 'Mois' },
  { id: 'annee', label: 'Année' },
  { id: 'perso', label: 'Personnalisé' },
]

function StatBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.normal
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${m.bg} ${m.text} ring-1 ring-inset ${m.ring}`}>
      {m.emoji} {m.label}
    </span>
  )
}

export default function PerformanceCamions() {
  const [camions, setCamions] = useState([])
  const [gasoil, setGasoil] = useState([])
  const [voyages, setVoyages] = useState([])
  const [loading, setLoading] = useState(true)

  const [periodKind, setPeriodKind] = useState('mois')
  const [customFrom, setCustomFrom] = useState(today())
  const [customTo, setCustomTo] = useState(today())
  const [thresholdPct, setThresholdPct] = useState(15)
  const [graphCamion, setGraphCamion] = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ca }, { data: ga }, { data: vo }] = await Promise.all([
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('gasoil').select('*').order('date', { ascending: true }),
      supabase.from('voyages').select('id,reference,date_depart,camion_id,camion_plaque').order('date_depart', { ascending: true }),
    ])
    setCamions(ca || [])
    setGasoil(ga || [])
    setVoyages(vo || [])
    setLoading(false)
  }

  const { from, to } = periodRange(periodKind, customFrom, customTo)

  const cycles = useMemo(() => buildFuelCycles(gasoil), [gasoil])
  const hist = useMemo(() => historicalAverages(cycles), [cycles])
  const rows = useMemo(
    () => buildPeriodStats({ camions, gasoil, voyages, cycles, from, to, thresholdPct }),
    [camions, gasoil, voyages, cycles, from, to, thresholdPct]
  )
  const stats = useMemo(() => globalStats(rows), [rows])

  const periodLabel = `${fmtDate(from)} → ${fmtDate(to)}`

  const graphCycles = useMemo(() => {
    const inRange = cycles.filter(c => c.dateFin >= from && c.dateFin <= to)
    return (graphCamion ? inRange.filter(c => c.camionId === parseInt(graphCamion)) : inRange)
  }, [cycles, from, to, graphCamion])

  const coutPoints = graphCycles.map(c => ({
    label: fmtDate(c.dateFin),
    sub: graphCamion ? fmtDate(c.dateFin) : `${c.camionPlaque} · ${fmtDate(c.dateFin)}`,
    value: c.coutKm,
    status: statusForCycle(c, hist, thresholdPct),
  }))
  const consoPoints = graphCycles.map(c => ({
    label: fmtDate(c.dateFin),
    sub: graphCamion ? fmtDate(c.dateFin) : `${c.camionPlaque} · ${fmtDate(c.dateFin)}`,
    value: c.consoL100,
    status: statusForCycle(c, hist, thresholdPct),
  }))

  return (
    <Layout title="Performance Camions" subtitle="Analyse de consommation et suivi des performances carburant">

      {/* ── FILTERS ── */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-end gap-4 justify-between">
          <div>
            <label className="label">Période</label>
            <div className="flex gap-2 flex-wrap">
              {PERIODS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPeriodKind(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    periodKind === p.id ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {periodKind === 'perso' && (
            <div className="flex gap-3">
              <div><label className="label">Du</label><input type="date" className="input" value={customFrom} onChange={e => setCustomFrom(e.target.value)} /></div>
              <div><label className="label">Au</label><input type="date" className="input" value={customTo} onChange={e => setCustomTo(e.target.value)} /></div>
            </div>
          )}

          <div>
            <label className="label">Seuil d'alerte (%)</label>
            <input
              type="number" className="input" style={{ width: '90px' }}
              value={thresholdPct} min={1} max={100}
              onChange={e => setThresholdPct(parseFloat(e.target.value) || 15)}
            />
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-400">📅 Période sélectionnée : {periodLabel} — comparaison à la moyenne historique de chaque camion</div>
      </div>

      {/* ── GLOBAL STATS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card border border-blue-100 bg-blue-50">
          <div className="stat-label text-blue-600">Total KM</div>
          <div className="stat-value text-blue-700">{fmt(stats.totalKm)}</div>
          <div className="stat-sub">Parcourus (période)</div>
        </div>
        <div className="stat-card border border-amber-100 bg-amber-50">
          <div className="stat-label text-amber-600">Total litres</div>
          <div className="stat-value text-amber-700">{fmt(stats.totalLitres)} L</div>
          <div className="stat-sub">Consommés</div>
        </div>
        <div className="stat-card border border-orange-100 bg-orange-50">
          <div className="stat-label text-orange-600">Total DH carburant</div>
          <div className="stat-value text-orange-700">{fmt(stats.totalDh)}</div>
          <div className="stat-sub">Dépensés</div>
        </div>
        <div className="stat-card border border-purple-100 bg-purple-50">
          <div className="stat-label text-purple-600">Conso. moyenne</div>
          <div className="stat-value text-purple-700">{stats.avgConso !== null ? stats.avgConso.toFixed(1) : '—'}</div>
          <div className="stat-sub">L/100km (flotte)</div>
        </div>
        <div className="stat-card border border-gray-100">
          <div className="stat-label">Coût moyen/km</div>
          <div className="stat-value text-gray-700">{stats.avgCoutKm !== null ? stats.avgCoutKm.toFixed(2) : '—'}</div>
          <div className="stat-sub">DH/km (flotte)</div>
        </div>
        <div className="stat-card border border-emerald-100 bg-emerald-50">
          <div className="stat-label text-emerald-600">🏆 Le plus économique</div>
          <div className="stat-value text-emerald-700" style={{ fontSize: '18px' }}>{stats.mostEconomical?.plaque || '—'}</div>
          <div className="stat-sub">{stats.mostEconomical ? `${stats.mostEconomical.consoL100.toFixed(1)} L/100km` : 'Aucune donnée'}</div>
        </div>
        <div className="stat-card border border-red-100 bg-red-50">
          <div className="stat-label text-red-600">⚠️ Le plus coûteux</div>
          <div className="stat-value text-red-700" style={{ fontSize: '18px' }}>{stats.mostCostly?.plaque || '—'}</div>
          <div className="stat-sub">{stats.mostCostly ? `${stats.mostCostly.coutKm.toFixed(2)} DH/km` : 'Aucune donnée'}</div>
        </div>
        <div className="stat-card border border-rose-100 bg-rose-50">
          <div className="stat-label text-rose-600">🔴 Le plus d'alertes</div>
          <div className="stat-value text-rose-700" style={{ fontSize: '18px' }}>{stats.mostAlerts?.plaque || '—'}</div>
          <div className="stat-sub">{stats.mostAlerts ? `${stats.mostAlerts.alertCycles} cycle(s) signalé(s)` : 'Aucune alerte'}</div>
        </div>
      </div>

      {/* ── MAIN TABLE ── */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">🚛 Performance par camion</h2>
        {loading ? (
          <div className="text-center text-gray-400 py-10">Chargement...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th"></th>
                  <th className="th">Camion</th>
                  <th className="th">Période</th>
                  <th className="th text-right">Km parcourus</th>
                  <th className="th text-right">Litres</th>
                  <th className="th text-right">DH</th>
                  <th className="th text-right">L/100km</th>
                  <th className="th text-right">DH/km</th>
                  <th className="th text-right">Pleins</th>
                  <th className="th text-right">Voyages</th>
                  <th className="th">Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <Fragment key={r.camionId}>
                    <tr className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setExpanded(expanded === r.camionId ? null : r.camionId)}>
                      <td className="td text-gray-400">{expanded === r.camionId ? '▾' : '▸'}</td>
                      <td className="td font-bold text-gray-900">{r.plaque}<div className="text-xs font-normal text-gray-400">{r.chauffeur || '—'}</div></td>
                      <td className="td text-xs text-gray-400">{periodLabel}</td>
                      <td className="td text-right font-medium">{r.kmTotal ? fmt(r.kmTotal) : '—'}</td>
                      <td className="td text-right">{r.litresTotal ? fmtD(r.litresTotal) : '—'}</td>
                      <td className="td text-right font-semibold text-amber-600">{r.dhTotal ? fmt(r.dhTotal) : '—'}</td>
                      <td className="td text-right font-bold">{r.consoL100 !== null ? r.consoL100.toFixed(1) : '—'}</td>
                      <td className="td text-right font-bold">{r.coutKm !== null ? r.coutKm.toFixed(2) : '—'}</td>
                      <td className="td text-right">{r.nbPleins}</td>
                      <td className="td text-right">{r.nbVoyages}</td>
                      <td className="td"><StatBadge status={r.status} /></td>
                    </tr>
                    {expanded === r.camionId && (
                      <tr key={`${r.camionId}-detail`}>
                        <td></td>
                        <td colSpan={10} className="pb-4 pt-1 px-4">
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Historique des cycles ({r.cyclesInRange.length})
                              </div>
                              <Link href={`/camions/${r.camionId}`} className="text-xs font-semibold text-brand-600 hover:underline">
                                Voir la fiche complète →
                              </Link>
                            </div>
                            {r.cyclesInRange.length === 0 ? (
                              <div className="text-xs text-gray-400 italic py-2">Aucun cycle carburant sur cette période (KM compteur requis sur les pleins)</div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full">
                                  <thead>
                                    <tr>
                                      <th className="th">Cycle</th>
                                      <th className="th text-right">Km</th>
                                      <th className="th text-right">Litres</th>
                                      <th className="th text-right">L/100</th>
                                      <th className="th text-right">DH/km</th>
                                      <th className="th">Statut</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.cyclesInRange.map((c, i) => (
                                      <tr key={c.key}>
                                        <td className="td text-xs text-gray-500">{fmtDate(c.dateDebut)} → {fmtDate(c.dateFin)}</td>
                                        <td className="td text-right">{fmt(c.kmParcourus)}</td>
                                        <td className="td text-right">{fmtD(c.litres)}</td>
                                        <td className="td text-right font-semibold">{c.consoL100.toFixed(1)}</td>
                                        <td className="td text-right font-semibold">{c.coutKm.toFixed(2)}</td>
                                        <td className="td"><StatBadge status={statusForCycle(c, hist, thresholdPct)} /></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={11} className="td text-center text-gray-400 py-10">Aucun camion</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── GRAPHS ── */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-semibold text-gray-900">📊 Évolution</h2>
          <select className="input" style={{ width: '220px' }} value={graphCamion} onChange={e => setGraphCamion(e.target.value)}>
            <option value="">Tous les camions</option>
            {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PerfChart title="Évolution du coût (DH/km)" points={coutPoints} color="#2563eb" unit="DH/km" />
          <PerfChart title="Évolution de la consommation (L/100km)" points={consoPoints} color="#d97706" unit="L/100km" />
        </div>
      </div>

    </Layout>
  )
}
