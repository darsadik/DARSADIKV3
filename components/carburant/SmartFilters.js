import { CYCLE_STATUS_META } from '../../lib/services/fuelCycles'

// ── Smart Filters (spec §9) — every filter here operates purely on data the
// page already computed via useMemo (byCamion/enriched/missingData/
// mergeSuggestions). No filter here triggers a refetch or rebuilds the
// engine output — display-layer filtering only (§12).

const TOGGLES = [
  { key: 'issues', label: 'Seulement les problèmes' },
  { key: 'missingKm', label: 'KM manquant' },
  { key: 'missingRefills', label: 'Pleins manquants' },
  { key: 'mergeSuggestions', label: 'Suggestions de fusion' },
  { key: 'openCycles', label: 'Cycles en cours' },
]

export default function SmartFilters({ camions, filters, setFilters }) {
  function toggle(key) {
    setFilters(f => ({ ...f, [key]: !f[key] }))
  }

  return (
    <div className="card mb-6 space-y-3">
      <div className="flex flex-wrap items-end gap-4 justify-between">
        <div>
          <label className="label">Camion</label>
          <select className="input" style={{ width: '220px' }} value={filters.camionId}
            onChange={e => setFilters(f => ({ ...f, camionId: e.target.value }))}>
            <option value="">Tous les camions</option>
            {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}{c.chauffeur ? ` — ${c.chauffeur}` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Du</label>
          <input type="date" className="input" style={{ width: '150px' }} value={filters.from}
            onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        </div>
        <div>
          <label className="label">Au</label>
          <input type="date" className="input" style={{ width: '150px' }} value={filters.to}
            onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        </div>
        <div>
          <label className="label">Statut cycle</label>
          <select className="input" style={{ width: '170px' }} value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">Tous les statuts</option>
            {Object.entries(CYCLE_STATUS_META).map(([key, m]) => (
              <option key={key} value={key}>{m.emoji} {m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Seuil d'alerte (%)</label>
          <input type="number" className="input" style={{ width: '90px' }} value={filters.thresholdPct} min={1} max={100}
            onChange={e => setFilters(f => ({ ...f, thresholdPct: parseFloat(e.target.value) || 15 }))} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
        {TOGGLES.map(t => (
          <button
            key={t.key}
            onClick={() => toggle(t.key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              filters[t.key] ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
        {(filters.camionId || filters.status || filters.from || filters.to || TOGGLES.some(t => filters[t.key])) && (
          <button
            onClick={() => setFilters(f => ({ ...f, camionId: '', status: '', from: '', to: '', issues: false, missingKm: false, missingRefills: false, mergeSuggestions: false, openCycles: false }))}
            className="text-xs font-semibold px-3 py-1.5 rounded-full text-gray-400 hover:text-gray-600 underline"
          >
            Réinitialiser
          </button>
        )}
      </div>
    </div>
  )
}
