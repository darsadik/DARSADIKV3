const SHOW_CHIPS = [
  { key: 'all', label: 'Tous' },
  { key: 'voyages', label: '🚚 Voyages' },
  { key: 'fuel', label: '⛽ Carburant' },
  { key: 'problems', label: '⚠ Problèmes' },
  { key: 'completed', label: '🟢 Complets' },
  { key: 'assigned', label: '🔗 Assigné' },
  { key: 'not_assigned', label: '⚪ Non assigné' },
  { key: 'estimated', label: '📍 Position estimée' },
]

// Spec §11 — professional filter bar: truck / date range as inputs, event
// kind + assignment state as a single-select chip row (mutually exclusive,
// same `show` value the dashboard cards drive). Controlled component only.
export default function TimelineFilterBar({ camions, filters, setFilters, onReset }) {
  return (
    <div className="card mb-4">
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div>
          <label className="label">Camion</label>
          <select className="input" value={filters.camionId} onChange={e => setFilters(f => ({ ...f, camionId: e.target.value }))} style={{ minWidth: '160px' }}>
            <option value="">Tous</option>
            {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Du</label>
          <input type="date" className="input" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
        </div>
        <div>
          <label className="label">Au</label>
          <input type="date" className="input" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="label">Rechercher</label>
          <input className="input w-full" placeholder="Voyage, camion, station..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
        </div>
        <button onClick={onReset} className="btn-secondary text-xs">↺ Réinitialiser</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {SHOW_CHIPS.map(c => (
          <button key={c.key}
            onClick={() => setFilters(f => ({ ...f, show: c.key, statusFilter: '' }))}
            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${
              filters.show === c.key && !filters.statusFilter
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}
