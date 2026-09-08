import { useState, useMemo } from 'react'
import { fmt, fmtMoney, fmtDate, today, startOfMonth } from '../../lib/utils'
import { buildVoyageFuelReport, voyageReportStatus, hasRealLiters } from '../../lib/services/voyageFuelReport'
import { printVoyageFuelReport } from '../../lib/printVoyageFuelReport'

const NOTE_TONE = {
  date: 'text-amber-600',
  missing: 'text-red-600',
  pending: 'text-slate-400 italic',
  ok: '',
}

function VoyageRow({ row }) {
  const st = voyageReportStatus(row)
  const hasLiters = hasRealLiters(row)
  const conso = hasLiters && row.distance > 0 ? (row.litersLinked / row.distance) * 100 : null
  return (
    <tr className={`border-b border-slate-50 ${st.tone !== 'ok' ? 'bg-amber-50/30' : ''}`}>
      <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{fmtDate(row.date)}</td>
      <td className="py-1.5 pr-3 text-slate-600 whitespace-nowrap">{row.reference}</td>
      <td className="py-1.5 pr-3 text-slate-700">
        {row.destination || '—'}
        {row.clientNames && row.clientNames.length > 0 && (
          <div className="text-[10px] text-slate-400">{row.clientNames.join(', ')}</div>
        )}
      </td>
      <td className="py-1.5 pr-3 text-right text-slate-600">{row.distance !== null ? `${fmt(row.distance)} km` : '—'}</td>
      <td className="py-1.5 pr-3 text-right text-slate-600">{hasLiters ? `${fmtMoney(row.litersLinked)} L` : '—'}</td>
      <td className="py-1.5 pr-3 text-right font-semibold text-slate-700">{conso !== null ? fmtMoney(conso) : '—'}</td>
      <td className="py-1.5 text-right">
        <div className="font-semibold text-slate-800">{row.fuelCost > 0 ? `${fmtMoney(row.fuelCost)} DH` : '—'}</div>
        {st.tone !== 'ok' && <div className={`text-[9px] font-semibold ${NOTE_TONE[st.tone]}`}>{st.text}</div>}
      </td>
    </tr>
  )
}

function TruckPreview({ t }) {
  return (
    <div className="card mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3 pb-3 border-b border-slate-100">
        <div className="text-sm font-black text-slate-800">🚛 CAMION {t.camion.plaque}</div>
        <div className="text-xs text-slate-400">{t.voyagesCount} voyage{t.voyagesCount > 1 ? 's' : ''}</div>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
        <div className="rounded-xl p-2.5 text-center bg-slate-50">
          <div className="text-[10px] text-slate-400 uppercase tracking-wide">Voyages</div>
          <div className="text-sm font-black text-slate-800">{t.voyagesCount}</div>
        </div>
        <div className="rounded-xl p-2.5 text-center bg-blue-50">
          <div className="text-[10px] text-blue-500 uppercase tracking-wide">KM total</div>
          <div className="text-sm font-black text-blue-700">{fmt(t.kmTotal)}</div>
        </div>
        <div className="rounded-xl p-2.5 text-center bg-cyan-50">
          <div className="text-[10px] text-cyan-600 uppercase tracking-wide">Gasoil</div>
          <div className="text-sm font-black text-cyan-700">{fmtMoney(t.litersTotal)} L</div>
        </div>
        <div className="rounded-xl p-2.5 text-center bg-indigo-100 ring-1 ring-indigo-200">
          <div className="text-[10px] text-indigo-600 uppercase tracking-wide font-bold">L/100 KM</div>
          <div className="text-base font-black text-indigo-700">{t.consoL100 !== null ? fmtMoney(t.consoL100) : '—'}</div>
        </div>
        <div className="rounded-xl p-2.5 text-center bg-red-50">
          <div className="text-[10px] text-red-500 uppercase tracking-wide">Coût Gasoil</div>
          <div className="text-sm font-black text-red-700">{fmtMoney(t.coutTotal)} DH</div>
        </div>
        <div className="rounded-xl p-2.5 text-center bg-amber-50">
          <div className="text-[10px] text-amber-600 uppercase tracking-wide">DH/KM</div>
          <div className="text-sm font-black text-amber-700">{t.coutKm !== null ? fmtMoney(t.coutKm) : '—'}</div>
        </div>
      </div>

      {t.rows.length === 0 ? (
        <div className="text-center text-slate-400 text-xs py-4">Aucun voyage sur la période sélectionnée</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-100">
                <th className="text-left pb-2 pr-3">Date</th>
                <th className="text-left pb-2 pr-3">Voyage</th>
                <th className="text-left pb-2 pr-3">Destination</th>
                <th className="text-right pb-2 pr-3">KM</th>
                <th className="text-right pb-2 pr-3">Gasoil</th>
                <th className="text-right pb-2 pr-3">L/100 KM</th>
                <th className="text-right pb-2">Coût</th>
              </tr>
            </thead>
            <tbody>{t.rows.map(row => <VoyageRow key={row.voyageId} row={row} />)}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Report configuration + on-screen preview + Print/PDF for the Truck Control
// Center. Reuses `voyageRows` — the page's own buildVoyageKmFuelTimeline()
// output, already built once — never a second engine call. Print and Export
// PDF both call the exact same printVoyageFuelReport() with the exact same
// already-built report data (§15 — no difference between the two).
export default function VoyageFuelReportPanel({ camions, voyageRows }) {
  const propreCamions = useMemo(() => (camions || []).filter(c => c.type_camion !== 'loue'), [camions])
  const allIds = useMemo(() => propreCamions.map(c => c.id), [propreCamions])

  const [selectedIds, setSelectedIds] = useState(null) // null = every Camion Propre
  const [from, setFrom] = useState(startOfMonth())
  const [to, setTo] = useState(today())
  const [showPicker, setShowPicker] = useState(false)

  const effectiveSelected = selectedIds === null ? allIds : selectedIds

  function toggleCamion(id) {
    setSelectedIds(prev => {
      const base = prev === null ? allIds : prev
      const set = new Set(base)
      if (set.has(id)) set.delete(id); else set.add(id)
      return [...set]
    })
  }

  const report = useMemo(() => buildVoyageFuelReport({
    voyageRows, camions, selectedCamionIds: selectedIds, from, to,
  }), [voyageRows, camions, selectedIds, from, to])

  const truckLabel = useMemo(() => {
    if (effectiveSelected.length === 0) return 'Aucun camion sélectionné'
    if (effectiveSelected.length === allIds.length) return 'Tous les Camions Propre'
    const plaques = propreCamions.filter(c => effectiveSelected.includes(c.id)).map(c => c.plaque)
    return plaques.length <= 5 ? plaques.join(', ') : `${plaques.length} camions sélectionnés`
  }, [effectiveSelected, allIds, propreCamions])

  const nothingSelected = effectiveSelected.length === 0

  function handlePrint() {
    printVoyageFuelReport({ byTruck: report.byTruck, fleetTotals: report.fleetTotals, from, to, truckLabel })
  }

  return (
    <div>
      <div className="card mb-6">
        <div className="text-sm font-black text-slate-800 mb-3">📄 RAPPORT CARBURANT</div>
        <div className="flex flex-wrap items-end gap-4 justify-between">
          <div className="flex flex-wrap items-end gap-3">
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
                    {propreCamions.map(c => (
                      <label key={c.id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={effectiveSelected.includes(c.id)} onChange={() => toggleCamion(c.id)} />
                        {c.plaque}
                      </label>
                    ))}
                    {propreCamions.length === 0 && <div className="text-xs text-gray-400 italic">Aucun camion propre enregistré</div>}
                  </div>
                  <button type="button" onClick={() => setShowPicker(false)} className="btn-secondary w-full justify-center text-xs mt-3">Fermer</button>
                </div>
              )}
            </div>
            <div>
              <label className="label">Date début</label>
              <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Date fin</label>
              <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePrint} disabled={nothingSelected} className="btn-secondary whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
              🖨️ Imprimer
            </button>
            <button onClick={handlePrint} disabled={nothingSelected} className="btn-primary whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
              📄 Export PDF
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="stat-card border border-slate-100">
          <div className="stat-label">Voyages</div>
          <div className="stat-value text-gray-700">{report.fleetTotals.voyagesCount}</div>
          <div className="stat-sub">Période sélectionnée</div>
        </div>
        <div className="stat-card border border-blue-100 bg-blue-50">
          <div className="stat-label text-blue-600">Total KM</div>
          <div className="stat-value text-blue-700">{fmt(report.fleetTotals.kmTotal)}</div>
        </div>
        <div className="stat-card border border-cyan-100 bg-cyan-50">
          <div className="stat-label text-cyan-600">Total Gasoil</div>
          <div className="stat-value text-cyan-700">{fmtMoney(report.fleetTotals.litersTotal)} L</div>
        </div>
        <div className="stat-card border border-indigo-200 bg-indigo-100">
          <div className="stat-label text-indigo-600">L/100 KM</div>
          <div className="stat-value text-indigo-700">{report.fleetTotals.consoL100 !== null ? fmtMoney(report.fleetTotals.consoL100) : '—'}</div>
          <div className="stat-sub">Σlitres ÷ Σkm — jamais une moyenne</div>
        </div>
        <div className="stat-card border border-orange-100 bg-orange-50">
          <div className="stat-label text-orange-600">Coût Gasoil</div>
          <div className="stat-value text-orange-700">{fmtMoney(report.fleetTotals.coutTotal)} DH</div>
          <div className="stat-sub">{report.fleetTotals.coutKm !== null ? `${fmtMoney(report.fleetTotals.coutKm)} DH/km` : ''}</div>
        </div>
      </div>

      {nothingSelected ? (
        <div className="card text-center text-gray-400 py-10">Sélectionnez au moins un camion pour afficher le rapport.</div>
      ) : report.byTruck.length === 0 ? (
        <div className="card text-center text-gray-400 py-10">Aucun camion propre enregistré</div>
      ) : (
        report.byTruck.map(t => <TruckPreview key={t.camionId} t={t} />)
      )}
    </div>
  )
}
