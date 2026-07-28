import { useState, useEffect, useMemo, Fragment } from 'react'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { fmt, fmtD, fmtDate } from '../../lib/utils'
import {
  buildFuelCycles, buildFleetFuelStats, detectAlerts, STATUS_META,
} from '../../lib/services/fuelCycles'

const SEVERITY_META = {
  error:   { emoji: '🔴', label: 'Critique',    bg: 'bg-red-50',   text: 'text-red-700',   ring: 'ring-red-100' },
  warning: { emoji: '🟡', label: 'À surveiller', bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-100' },
  info:    { emoji: '🔵', label: 'Info',         bg: 'bg-blue-50',  text: 'text-blue-700',  ring: 'ring-blue-100' },
}

function AlertRow({ a }) {
  const m = SEVERITY_META[a.severity] || SEVERITY_META.info
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg ${m.bg} ${m.text} ring-1 ring-inset ${m.ring} text-xs`}>
      <span>{m.emoji}</span>
      <span className="flex-1">{a.message}</span>
    </div>
  )
}

function CycleCard({ cycle, onMergeChoice }) {
  const [expanded, setExpanded] = useState(false)
  const isOpen = cycle.statut === 'en_cours'
  return (
    <div className={`border rounded-xl p-3 ${isOpen ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100'}`}>
      <div className="flex items-center justify-between flex-wrap gap-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div>
          <span className="font-bold text-gray-900 text-sm">{fmtDate(cycle.dateDebut)} → {cycle.dateFin ? fmtDate(cycle.dateFin) : 'en cours'}</span>
          {isOpen && <span className="ml-2 bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">🔵 CYCLE EN COURS</span>}
          {cycle.merged && (
            <span className="ml-2 bg-purple-50 text-purple-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
              🔗 {cycle.pleins.length} pleins fusionnés {cycle.mergedManually ? '(manuel)' : '(auto)'}
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap text-xs">
          <span className="bg-gray-50 text-gray-700 font-semibold px-2 py-0.5 rounded-lg">
            {cycle.distance !== null ? `${fmt(cycle.distance)} km` : 'en attente'}
          </span>
          {cycle.coutKm !== null && (
            <span className="bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-lg">{cycle.coutKm.toFixed(2)} DHS/km</span>
          )}
          {cycle.consoL100 !== null && (
            <span className="bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-lg">{cycle.consoL100.toFixed(1)} L/100km</span>
          )}
          <span className="bg-red-50 text-red-600 font-bold px-2 py-0.5 rounded-lg">{fmt(cycle.coutTotal)} DHS</span>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
            <div className="bg-gray-50 rounded-lg p-1.5"><div className="text-[10px] text-gray-400">KM début</div><div className="text-xs font-bold">{fmt(cycle.kmDebut)}</div></div>
            <div className="bg-gray-50 rounded-lg p-1.5"><div className="text-[10px] text-gray-400">KM {isOpen ? 'actuel' : 'fin'}</div><div className="text-xs font-bold">{isOpen ? (cycle.kmActuel !== null ? fmt(cycle.kmActuel) : '—') : fmt(cycle.kmFin)}</div></div>
            <div className="bg-blue-50 rounded-lg p-1.5"><div className="text-[10px] text-blue-400">Litres Gasoil</div><div className="text-xs font-bold text-blue-700">{fmtD(cycle.litresGasoil)} L</div></div>
            <div className="bg-cyan-50 rounded-lg p-1.5"><div className="text-[10px] text-cyan-400">Litres AdBlue</div><div className="text-xs font-bold text-cyan-700">{cycle.litresAdblue ? `${fmtD(cycle.litresAdblue)} L` : '—'}</div></div>
          </div>

          {/* Pleins in this cycle-start group */}
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Pleins ({cycle.pleins.length})</div>
            <div className="space-y-1">
              {cycle.pleins.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-2 py-1.5 text-xs">
                  <div>
                    <span className="font-semibold text-gray-800">{fmtDate(p.date)}{p.heure ? ` ${p.heure}` : ''}</span>
                    <span className="text-gray-400 ml-2">{fmtD(p.qte)} L · KM {fmt(p.km)}</span>
                  </div>
                  {i > 0 && onMergeChoice && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => onMergeChoice(p.id, false)}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white border border-gray-200 hover:bg-gray-100"
                        title="Créer un nouveau cycle à partir de ce plein"
                      >✂️ Nouveau cycle</button>
                    </div>
                  )}
                  {i === 0 && cycle.pleins.length === 1 && onMergeChoice && (
                    <button
                      onClick={() => onMergeChoice(p.id, true)}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white border border-gray-200 hover:bg-gray-100"
                      title="Fusionner avec le plein précédent"
                    >🔗 Fusionner avec le précédent</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Voyages in this cycle */}
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Voyages du cycle ({cycle.nbVoyages})</div>
            {cycle.voyages.length === 0 ? (
              <div className="text-[10px] text-gray-400 italic">Aucun voyage dans ce cycle</div>
            ) : (
              <div className="space-y-1">
                {cycle.voyages.map(v => {
                  const part = cycle.coutKm !== null && v.vKm !== null ? v.vKm * cycle.coutKm : null
                  return (
                    <Link key={v.id} href={`/voyages/${v.id}`} className="flex items-center justify-between bg-slate-50 hover:bg-slate-100 rounded-lg px-2 py-1.5 text-xs transition-colors">
                      <div>
                        <span className="font-semibold text-gray-800">{v.reference || `#${v.id}`}</span>
                        <span className="text-gray-400 ml-2">{fmtDate(v.date_depart)}</span>
                        {v.destination && <span className="text-gray-400 ml-1">→ {v.destination}</span>}
                      </div>
                      <div className="flex gap-3 text-right">
                        <span className="text-blue-600 font-semibold">{v.vKm !== null ? `${fmt(v.vKm)} km` : '—'}</span>
                        <span className="text-amber-600 font-bold">{part !== null ? `${fmt(part)} DHS` : '—'}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function CarburantCycles() {
  const [camions, setCamions] = useState([])
  const [gasoil, setGasoil] = useState([])
  const [voyages, setVoyages] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCamion, setSelectedCamion] = useState('')
  const [thresholdPct, setThresholdPct] = useState(15)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ca }, { data: ga }, { data: vo }] = await Promise.all([
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('gasoil').select('*').order('date', { ascending: true }),
      supabase.from('voyages')
        .select('id,reference,date_depart,camion_id,camion_plaque,destination,km_depart,km_arrivee,deleted_at')
        .order('date_depart', { ascending: true }),
    ])
    setCamions(ca || [])
    setGasoil(ga || [])
    setVoyages(vo || [])
    setLoading(false)
  }

  const byCamion = useMemo(() => buildFuelCycles({ gasoil, voyages, camions }), [gasoil, voyages, camions])
  const fleetStats = useMemo(() => buildFleetFuelStats(byCamion), [byCamion])
  const alerts = useMemo(() => detectAlerts({ byCamion, thresholdPct }), [byCamion, thresholdPct])

  const visibleCamions = selectedCamion ? byCamion.filter(b => b.camionId === parseInt(selectedCamion)) : byCamion
  const visibleAlerts = selectedCamion ? alerts.filter(a => a.camionId === parseInt(selectedCamion)) : alerts

  async function handleMergeChoice(gasoilId, value) {
    await supabase.from('gasoil').update({ merge_with_previous: value }).eq('id', gasoilId)
    loadAll()
  }

  const globalTotals = fleetStats.reduce((acc, s) => ({
    kmTotal: acc.kmTotal + s.kmTotal,
    litresGasoil: acc.litresGasoil + s.litresGasoil,
    litresAdblue: acc.litresAdblue + s.litresAdblue,
    coutTotal: acc.coutTotal + s.coutTotal,
    nbCycles: acc.nbCycles + s.nbCycles,
    nbPleins: acc.nbPleins + s.nbPleins,
  }), { kmTotal: 0, litresGasoil: 0, litresAdblue: 0, coutTotal: 0, nbCycles: 0, nbPleins: 0 })

  return (
    <Layout title="Cycles Carburant" subtitle="Cycles de plein automatiques, coût/km réel et alertes par camion">

      {/* ── FILTERS ── */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-end gap-4 justify-between">
          <div>
            <label className="label">Camion</label>
            <select className="input" style={{ width: '240px' }} value={selectedCamion} onChange={e => setSelectedCamion(e.target.value)}>
              <option value="">Tous les camions</option>
              {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}{c.chauffeur ? ` — ${c.chauffeur}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Seuil d'alerte (%)</label>
            <input type="number" className="input" style={{ width: '90px' }} value={thresholdPct} min={1} max={100}
              onChange={e => setThresholdPct(parseFloat(e.target.value) || 15)} />
          </div>
          <div className="text-xs text-gray-400">
            <Link href="/gasoil" className="text-brand-600 font-semibold hover:underline">← Gasoil (pleins)</Link>
            {' · '}
            <Link href="/camions" className="text-brand-600 font-semibold hover:underline">Performance Camions →</Link>
          </div>
        </div>
      </div>

      {/* ── FLEET DASHBOARD ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <div className="stat-card border border-blue-100 bg-blue-50">
          <div className="stat-label text-blue-600">Total KM</div>
          <div className="stat-value text-blue-700">{fmt(globalTotals.kmTotal)}</div>
          <div className="stat-sub">Cycles clôturés</div>
        </div>
        <div className="stat-card border border-amber-100 bg-amber-50">
          <div className="stat-label text-amber-600">Litres Gasoil</div>
          <div className="stat-value text-amber-700">{fmt(globalTotals.litresGasoil)} L</div>
          <div className="stat-sub">Tous cycles</div>
        </div>
        <div className="stat-card border border-cyan-100 bg-cyan-50">
          <div className="stat-label text-cyan-600">Litres AdBlue</div>
          <div className="stat-value text-cyan-700">{fmt(globalTotals.litresAdblue)} L</div>
          <div className="stat-sub">Tous cycles</div>
        </div>
        <div className="stat-card border border-orange-100 bg-orange-50">
          <div className="stat-label text-orange-600">Coût total</div>
          <div className="stat-value text-orange-700">{fmt(globalTotals.coutTotal)}</div>
          <div className="stat-sub">DHS</div>
        </div>
        <div className="stat-card border border-gray-100">
          <div className="stat-label">Cycles</div>
          <div className="stat-value text-gray-700">{globalTotals.nbCycles}</div>
          <div className="stat-sub">{globalTotals.nbPleins} pleins</div>
        </div>
        <div className={`stat-card border ${visibleAlerts.length ? 'border-red-100 bg-red-50' : 'border-emerald-100 bg-emerald-50'}`}>
          <div className={`stat-label ${visibleAlerts.length ? 'text-red-600' : 'text-emerald-600'}`}>Alertes</div>
          <div className={`stat-value ${visibleAlerts.length ? 'text-red-700' : 'text-emerald-700'}`}>{visibleAlerts.length}</div>
          <div className="stat-sub">{visibleAlerts.length ? 'À vérifier' : '✓ Rien à signaler'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <div className="card text-center text-gray-400 py-10">Chargement...</div>
          ) : visibleCamions.length === 0 ? (
            <div className="card text-center text-gray-400 py-10">Aucune donnée carburant</div>
          ) : (
            visibleCamions.map(truck => (
              <div key={truck.camionId} className="card">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900">🚛 {truck.camionPlaque}</h2>
                  <Link href={`/camions/${truck.camionId}`} className="text-xs font-semibold text-brand-600 hover:underline">Fiche camion →</Link>
                </div>
                {truck.cycles.length === 0 ? (
                  <div className="text-center text-gray-400 text-xs py-6">
                    Aucun cycle détectable — enregistrez le KM compteur sur les pleins de ce camion
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...truck.cycles].reverse().map((c, i) => (
                      <CycleCard key={`${truck.camionId}-${c.dateDebut}-${i}`} cycle={c} onMergeChoice={handleMergeChoice} />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* ── ALERTS PANEL ── */}
        <div className="lg:col-span-1">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">⚠️ Alertes</h3>
            {visibleAlerts.length === 0 ? (
              <div className="text-center text-emerald-600 text-xs py-6">✓ Aucune alerte</div>
            ) : (
              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                {visibleAlerts.map((a, i) => <AlertRow key={i} a={a} />)}
              </div>
            )}
            <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400">
              Les alertes sont informatives — elles ne bloquent jamais l'enregistrement d'un plein ou d'un voyage.
            </div>
          </div>
        </div>
      </div>

    </Layout>
  )
}
