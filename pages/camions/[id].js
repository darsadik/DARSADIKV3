import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import PerfChart from '../../components/camions/PerfChart'
import { supabase } from '../../lib/supabase'
import { fmt, fmtD, fmtDate, today } from '../../lib/utils'
import {
  buildFuelCycles, historicalAverages, buildPeriodStats,
  statusForCycle, periodRange, STATUS_META,
} from '../../lib/camionPerformance'

const EPOCH = '1970-01-01'

const PERIODS = [
  { id: 'tout', label: 'Tout l\'historique' },
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

export default function FicheCamion() {
  const router = useRouter()
  const { id } = router.query

  const [camions, setCamions] = useState([])
  const [gasoil, setGasoil] = useState([])
  const [voyages, setVoyages] = useState([])
  const [loading, setLoading] = useState(true)

  const [periodKind, setPeriodKind] = useState('tout')
  const [customFrom, setCustomFrom] = useState(today())
  const [customTo, setCustomTo] = useState(today())
  const [thresholdPct, setThresholdPct] = useState(15)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ca }, { data: ga }, { data: vo }] = await Promise.all([
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('gasoil').select('*').order('date', { ascending: true }),
      supabase.from('voyages').select('id,reference,date_depart,camion_id,camion_plaque,destination').order('date_depart', { ascending: true }),
    ])
    setCamions(ca || [])
    setGasoil(ga || [])
    setVoyages(vo || [])
    setLoading(false)
  }

  const camionId = parseInt(id)
  const camion = camions.find(c => c.id === camionId)

  const cycles = useMemo(() => buildFuelCycles(gasoil).filter(c => c.camionId === camionId), [gasoil, camionId])
  const allCycles = useMemo(() => buildFuelCycles(gasoil), [gasoil])
  const hist = useMemo(() => historicalAverages(allCycles), [allCycles])

  // ── All-time KPIs (section "Fiche camion") ──
  const topStats = useMemo(() => {
    if (!camion) return null
    return buildPeriodStats({
      camions: [camion], gasoil, voyages, cycles: allCycles,
      from: EPOCH, to: today(), thresholdPct,
    })[0]
  }, [camion, gasoil, voyages, allCycles, thresholdPct])

  // ── Period-filtered history + graphs ──
  const { from, to } = periodKind === 'tout' ? { from: EPOCH, to: today() } : periodRange(periodKind, customFrom, customTo)
  const cyclesInRange = useMemo(
    () => cycles.filter(c => c.dateFin >= from && c.dateFin <= to),
    [cycles, from, to]
  )

  const coutPoints = cyclesInRange.map(c => ({
    label: fmtDate(c.dateFin), value: c.coutKm, status: statusForCycle(c, hist, thresholdPct),
  }))
  const consoPoints = cyclesInRange.map(c => ({
    label: fmtDate(c.dateFin), value: c.consoL100, status: statusForCycle(c, hist, thresholdPct),
  }))

  if (loading) {
    return <Layout title="Fiche camion"><div className="text-center text-gray-400 py-16">Chargement...</div></Layout>
  }

  if (!camion) {
    return (
      <Layout title="Fiche camion">
        <div className="card text-center py-16">
          <div className="text-gray-400 mb-3">Camion introuvable</div>
          <Link href="/camions" className="btn-secondary inline-flex">← Retour</Link>
        </div>
      </Layout>
    )
  }

  return (
    <Layout title={`Fiche camion — ${camion.plaque}`} subtitle="Performance carburant détaillée">

      <Link href="/camions" className="text-sm text-brand-600 hover:underline mb-4 inline-block">← Retour à Performance Camions</Link>

      {/* ── HEADER ── */}
      <div className="card mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-2xl">🚛</div>
          <div>
            <div className="text-xl font-black text-gray-900">{camion.plaque}</div>
            <div className="text-sm text-gray-500">{camion.chauffeur || 'Chauffeur non renseigné'} · {camion.depot}</div>
          </div>
        </div>
        {camion.type_camion === 'loue'
          ? <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-700">🔑 Loué</span>
          : <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700">🏢 Propre</span>
        }
      </div>

      {/* ── ALL-TIME KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-label">KM total</div>
          <div className="stat-value text-gray-800">{topStats.kmTotal ? fmt(topStats.kmTotal) : '—'}</div>
          <div className="stat-sub">Distance suivie</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Voyages</div>
          <div className="stat-value text-gray-800">{topStats.nbVoyages}</div>
          <div className="stat-sub">Total effectués</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Cycles carburant</div>
          <div className="stat-value text-gray-800">{cycles.length}</div>
          <div className="stat-sub">Intervalles entre pleins</div>
        </div>
        <div className="stat-card border border-amber-100 bg-amber-50">
          <div className="stat-label text-amber-600">Litres consommés</div>
          <div className="stat-value text-amber-700">{fmt(topStats.litresTotal)} L</div>
          <div className="stat-sub">{topStats.nbPleins} pleins</div>
        </div>
        <div className="stat-card border border-orange-100 bg-orange-50">
          <div className="stat-label text-orange-600">DH consommés</div>
          <div className="stat-value text-orange-700">{fmt(topStats.dhTotal)}</div>
          <div className="stat-sub">Total carburant</div>
        </div>
        <div className="stat-card border border-purple-100 bg-purple-50">
          <div className="stat-label text-purple-600">Conso. moyenne</div>
          <div className="stat-value text-purple-700">{topStats.consoL100 !== null ? topStats.consoL100.toFixed(1) : '—'}</div>
          <div className="stat-sub">L/100km</div>
        </div>
        <div className="stat-card border border-blue-100 bg-blue-50">
          <div className="stat-label text-blue-600">Coût moyen/km</div>
          <div className="stat-value text-blue-700">{topStats.coutKm !== null ? topStats.coutKm.toFixed(2) : '—'}</div>
          <div className="stat-sub">DH/km</div>
        </div>
        <div className={`stat-card border ${topStats.alertCycles > 0 ? 'border-rose-100 bg-rose-50' : 'border-emerald-100 bg-emerald-50'}`}>
          <div className={`stat-label ${topStats.alertCycles > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>Alertes</div>
          <div className={`stat-value ${topStats.alertCycles > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{topStats.alertCycles}</div>
          <div className="stat-sub">Cycles signalés</div>
        </div>
      </div>

      {/* ── FILTERS (history + graphs) ── */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-end gap-4 justify-between">
          <div>
            <label className="label">Période affichée</label>
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
      </div>

      {/* ── GRAPHS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <PerfChart title="Évolution du coût (DH/km)" points={coutPoints} color="#2563eb" unit="DH/km" />
        <PerfChart title="Évolution de la consommation (L/100km)" points={consoPoints} color="#d97706" unit="L/100km" />
      </div>

      {/* ── FULL CYCLE HISTORY ── */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">📋 Historique des cycles ({cyclesInRange.length})</h2>
        {cyclesInRange.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-10">
            Aucun cycle carburant sur cette période — enregistrez le KM compteur sur les pleins pour activer le suivi
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Cycle</th>
                  <th className="th text-right">Km début</th>
                  <th className="th text-right">Km fin</th>
                  <th className="th text-right">Km parcourus</th>
                  <th className="th text-right">Litres</th>
                  <th className="th text-right">DH</th>
                  <th className="th text-right">L/100km</th>
                  <th className="th text-right">DH/km</th>
                  <th className="th">Statut</th>
                </tr>
              </thead>
              <tbody>
                {[...cyclesInRange].reverse().map(c => (
                  <tr key={c.key} className="hover:bg-gray-50 transition-colors">
                    <td className="td text-xs text-gray-500">{fmtDate(c.dateDebut)} → {fmtDate(c.dateFin)}</td>
                    <td className="td text-right text-gray-400">{fmt(c.kmDebut)}</td>
                    <td className="td text-right text-gray-400">{fmt(c.kmFin)}</td>
                    <td className="td text-right font-medium">{fmt(c.kmParcourus)}</td>
                    <td className="td text-right">{fmtD(c.litres)}</td>
                    <td className="td text-right font-semibold text-amber-600">{fmt(c.dh)}</td>
                    <td className="td text-right font-bold">{c.consoL100.toFixed(1)}</td>
                    <td className="td text-right font-bold">{c.coutKm.toFixed(2)}</td>
                    <td className="td"><StatBadge status={statusForCycle(c, hist, thresholdPct)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
          Un cycle = intervalle entre deux pleins consécutifs avec KM compteur renseigné. Statut basé sur l'écart à la moyenne historique du camion (seuil {thresholdPct}%).
        </div>
      </div>

    </Layout>
  )
}
