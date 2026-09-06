import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { fmt, fmtD, fmtDate, today, startOfMonth } from '../../lib/utils'
import { buildConsumptionReport } from '../../lib/services/fuelConsumptionReport'
import { printFuelConsumptionReport } from '../../lib/printFuelConsumptionReport'

function StatusCell({ p }) {
  if (p.status === 'invalid') {
    return <span className="text-red-600 font-semibold whitespace-nowrap">N/A — KM invalide</span>
  }
  if (p.consoL100 === null) return <span className="text-gray-400">N/A</span>
  return <span className="font-bold text-slate-800">{p.consoL100.toFixed(2)}</span>
}

function TruckGroup({ t }) {
  return (
    <>
      <tr className="bg-slate-50">
        <td colSpan={8} className="px-3 py-2 text-xs font-black text-slate-700 uppercase tracking-wide">
          🚛 {t.camionPlaque}
          {t.hasOpeningReferenceOnly && (
            <span className="ml-2 text-[10px] font-semibold text-amber-600 normal-case">
              (premier plein connu du camion — sert de référence, sans période mesurable avant lui)
            </span>
          )}
          {t.unresolvedMissingKm > 0 && (
            <span className="ml-2 text-[10px] font-semibold text-amber-600 normal-case">
              ⚠ {t.unresolvedMissingKm} bon(s) sans KM en attente d'un relevé
            </span>
          )}
        </td>
      </tr>
      {t.periods.length === 0 ? (
        <tr>
          <td colSpan={8} className="px-3 py-3 text-center text-xs text-gray-400 italic">Aucune période mesurable sur cette sélection</td>
        </tr>
      ) : (
        t.periods.map(p => (
          <tr key={p.key} className={`border-b border-gray-50 hover:bg-slate-50 ${p.status === 'invalid' ? 'bg-red-50/40' : ''}`}>
            <td className="px-3 py-2 text-xs text-gray-500">{t.camionPlaque}</td>
            <td className="px-3 py-2 text-xs text-gray-600">{fmtDate(p.previousDate)}</td>
            <td className="px-3 py-2 text-xs text-right text-gray-600">{fmt(p.previousKm)}</td>
            <td className="px-3 py-2 text-xs text-gray-600">{fmtDate(p.date)}</td>
            <td className="px-3 py-2 text-xs text-right text-gray-600">{fmt(p.km)}</td>
            <td className="px-3 py-2 text-xs text-right font-semibold text-gray-700">{fmt(p.distance)} km</td>
            <td className="px-3 py-2 text-xs text-right font-semibold text-blue-700">{fmtD(p.liters)} L</td>
            <td className="px-3 py-2 text-xs text-right"><StatusCell p={p} /></td>
          </tr>
        ))
      )}
      <tr className="bg-slate-50/70 border-b-2 border-slate-200">
        <td colSpan={5} className="px-3 py-2 text-xs font-bold text-slate-600 text-right">{t.camionPlaque} — sous-total</td>
        <td className="px-3 py-2 text-xs text-right font-black text-slate-800">{fmt(t.summary.distanceTotal)} km</td>
        <td className="px-3 py-2 text-xs text-right font-black text-slate-800">{fmtD(t.summary.litresTotal)} L</td>
        <td className="px-3 py-2 text-xs text-right font-black text-slate-800">
          {t.summary.consoL100 !== null ? t.summary.consoL100.toFixed(2) : '—'}
        </td>
      </tr>
    </>
  )
}

export default function RapportConsommation() {
  const [camions, setCamions] = useState([])
  const [gasoil, setGasoil] = useState([])
  const [voyages, setVoyages] = useState([])
  const [loading, setLoading] = useState(true)

  // null = every truck selected (default); an array (possibly empty) narrows
  // to exactly those ids — see buildConsumptionReport for why the two are
  // never conflated.
  const [selectedIds, setSelectedIds] = useState(null)
  const [from, setFrom] = useState(startOfMonth())
  const [to, setTo] = useState(today())
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ca }, { data: ga }, { data: vo }] = await Promise.all([
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('gasoil').select('*').order('date', { ascending: true }),
      supabase.from('voyages')
        .select('id,camion_id,date_depart,km_depart,km_arrivee,deleted_at')
        .order('date_depart', { ascending: true }),
    ])
    setCamions(ca || [])
    setGasoil(ga || [])
    setVoyages(vo || [])
    setLoading(false)
  }

  const allIds = useMemo(() => camions.map(c => c.id), [camions])
  const effectiveSelected = selectedIds === null ? allIds : selectedIds

  function toggleCamion(id) {
    setSelectedIds(prev => {
      const base = prev === null ? allIds : prev
      const set = new Set(base)
      if (set.has(id)) set.delete(id); else set.add(id)
      return [...set]
    })
  }

  const report = useMemo(() => buildConsumptionReport({
    camions, gasoil, voyages, selectedCamionIds: selectedIds, from, to,
  }), [camions, gasoil, voyages, selectedIds, from, to])

  const truckLabel = useMemo(() => {
    if (effectiveSelected.length === 0) return 'Aucun camion sélectionné'
    if (effectiveSelected.length === allIds.length) return 'Tous les camions'
    const plaques = camions.filter(c => effectiveSelected.includes(c.id)).map(c => c.plaque)
    return plaques.length <= 5 ? plaques.join(', ') : `${plaques.length} camions sélectionnés`
  }, [effectiveSelected, allIds, camions])

  function handleExportPdf() {
    printFuelConsumptionReport({ byTruck: report.byTruck, fleetTotals: report.fleetTotals, from, to, truckLabel })
  }

  const nothingSelected = effectiveSelected.length === 0

  return (
    <Layout title="Truck Fuel Consumption Report" subtitle="Consommation mesurée par période Plein complet → Plein complet — chronologique et continue sur l'historique de chaque camion">

      <div className="flex justify-end mb-3 text-xs text-gray-400">
        <Link href="/carburant" className="text-brand-600 font-semibold hover:underline">← Contrôle KM & Carburant</Link>
        {' · '}
        <Link href="/gasoil" className="text-brand-600 font-semibold hover:underline">Gasoil →</Link>
      </div>

      {/* ── FILTERS ── */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-end gap-4 justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Du</label>
              <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Au</label>
              <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <div className="relative">
              <label className="label">Camions</label>
              <button type="button" onClick={() => setShowPicker(s => !s)} className="input text-left" style={{ minWidth: '220px' }}>
                {truckLabel}
              </button>
              {showPicker && (
                <div className="absolute z-10 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-3 max-h-80 overflow-y-auto">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
                    <button type="button" onClick={() => setSelectedIds(null)} className="text-xs font-semibold text-brand-600 hover:underline">Tout sélectionner</button>
                    <button type="button" onClick={() => setSelectedIds([])} className="text-xs font-semibold text-gray-400 hover:underline">Tout désélectionner</button>
                  </div>
                  <div className="space-y-1.5">
                    {camions.map(c => (
                      <label key={c.id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={effectiveSelected.includes(c.id)} onChange={() => toggleCamion(c.id)} />
                        {c.plaque}
                      </label>
                    ))}
                    {camions.length === 0 && <div className="text-xs text-gray-400 italic">Aucun camion enregistré</div>}
                  </div>
                  <button type="button" onClick={() => setShowPicker(false)} className="btn-secondary w-full justify-center text-xs mt-3">Fermer</button>
                </div>
              )}
            </div>
          </div>
          <button onClick={handleExportPdf} disabled={nothingSelected} className="btn-secondary whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
            🖨️ Export PDF
          </button>
        </div>
      </div>

      {/* ── FLEET SUMMARY (weighted — never an average of individual L/100km values) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="stat-card border border-blue-100 bg-blue-50">
          <div className="stat-label text-blue-600">Distance totale</div>
          <div className="stat-value text-blue-700">{fmt(report.fleetTotals.distanceTotal)} km</div>
          <div className="stat-sub">Période sélectionnée</div>
        </div>
        <div className="stat-card border border-cyan-100 bg-cyan-50">
          <div className="stat-label text-cyan-600">Litres consommés</div>
          <div className="stat-value text-cyan-700">{fmt(report.fleetTotals.litresTotal)} L</div>
          <div className="stat-sub">Périodes mesurées</div>
        </div>
        <div className="stat-card border border-purple-100 bg-purple-50">
          <div className="stat-label text-purple-600">Consommation moyenne pondérée</div>
          <div className="stat-value text-purple-700">{report.fleetTotals.consoL100 !== null ? report.fleetTotals.consoL100.toFixed(2) : '—'}</div>
          <div className="stat-sub">L/100km — Σlitres ÷ Σkm, jamais une moyenne de moyennes</div>
        </div>
      </div>

      {/* ── REPORT TABLE ── */}
      <div className="card">
        {loading ? (
          <div className="text-center text-gray-400 py-10">Chargement...</div>
        ) : nothingSelected ? (
          <div className="text-center text-gray-400 py-10">Sélectionnez au moins un camion pour afficher le rapport.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                  <th className="text-left px-3 pb-2">Camion</th>
                  <th className="text-left px-3 pb-2">Plein précédent</th>
                  <th className="text-right px-3 pb-2">KM précédent</th>
                  <th className="text-left px-3 pb-2">Plein clôture</th>
                  <th className="text-right px-3 pb-2">KM clôture</th>
                  <th className="text-right px-3 pb-2">Distance</th>
                  <th className="text-right px-3 pb-2">Litres consommés</th>
                  <th className="text-right px-3 pb-2">Consommation (L/100km)</th>
                </tr>
              </thead>
              <tbody>
                {report.byTruck.map(t => <TruckGroup key={t.camionId} t={t} />)}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400">
          Chaque ligne mesure la période entre deux pleins avec KM connu (Plein complet → Plein complet), sur l'historique complet du camion — jamais réinitialisée au début du mois. "N/A" signifie une donnée insuffisante ou un KM invalide, jamais une valeur inventée.
        </div>
      </div>

    </Layout>
  )
}
