const SHOW_MODES = [
  { key: 'all', label: 'Tous les événements' },
  { key: 'voyages', label: 'Voyages uniquement' },
  { key: 'fuel', label: 'Carburant uniquement' },
  { key: 'problems', label: 'Problèmes uniquement' },
]

// Spec §7. Controlled component — the page owns all filter state, this is
// pure presentation + onChange plumbing.
export default function TimelineFilterBar({ camions, filters, setFilters, onReset }) {
  return (
    <div className="card mb-4">
      <div className="flex flex-wrap items-end gap-3">
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
        <div>
          <label className="label">Afficher</label>
          <select className="input" value={filters.show} onChange={e => setFilters(f => ({ ...f, show: e.target.value }))} style={{ minWidth: '190px' }}>
            {SHOW_MODES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Rechercher</label>
          <input className="input" placeholder="Voyage, camion, station..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} style={{ width: '180px' }} />
        </div>
        <button onClick={onReset} className="btn-secondary text-xs">↺ Réinitialiser</button>
      </div>
    </div>
  )
}
