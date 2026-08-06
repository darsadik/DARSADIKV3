const STATUS_CHIPS = [
  { key: '', label: 'Tous' },
  { key: 'remaining', label: '🟠 Reste à allouer' },
  { key: 'waiting', label: '🔴 En attente' },
  { key: 'manual', label: '🟣 Override manuel' },
  { key: 'automatic', label: '🔵 Automatique seul' },
  { key: 'full', label: '✓ Entièrement alloué' },
]

// Truck + date range markup identical to TimelineFilterBar.js (same app,
// same conventions) plus one single-select chip row for the 5 allocation
// filters — same toggle pattern as TimelineFilterBar's SHOW_CHIPS.
export default function AllocationFilterBar({ camions, filters, setFilters, onReset }) {
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
        <div className="flex-1 min-w-[180px]">
          <label className="label">Rechercher</label>
          <input className="input w-full" placeholder="Voyage, client, camion, KM, montant restant..."
            value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
        </div>
        <button onClick={onReset} className="btn-secondary text-xs">↺ Réinitialiser</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map(c => (
          <button key={c.key || 'all'}
            onClick={() => setFilters(f => ({ ...f, statusFilter: c.key }))}
            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${
              filters.statusFilter === c.key
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
