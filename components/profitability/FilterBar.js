// ── Global filter bar — the ONE filter surface for the whole Profitability
// Center. Every section reads the same `filters` object; changing anything
// here re-scopes every KPI/table/chart at once (see pages/rentabilite/index.js).
// Local calendar date as YYYY-MM-DD — NOT d.toISOString(), which converts to
// UTC first and shifts the date by one day for any timezone ahead of UTC
// (e.g. Morocco, UTC+1), silently moving month-boundary voyages across
// months in every quick-select preset below.
const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
const startOfWeek = d => { const dow = d.getDay(); const diff = dow === 0 ? -6 : 1 - dow; return addDays(d, diff) }

const PRESETS = [
  { key: 'today',     label: "Aujourd'hui",     range: () => { const t = new Date(); return [isoDate(t), isoDate(t)] } },
  { key: 'yesterday', label: 'Hier',             range: () => { const y = addDays(new Date(), -1); return [isoDate(y), isoDate(y)] } },
  { key: 'week',      label: 'Cette semaine',    range: () => { const t = new Date(); return [isoDate(startOfWeek(t)), isoDate(t)] } },
  { key: 'lastWeek',  label: 'Semaine dernière', range: () => { const t = new Date(); const s = startOfWeek(t); return [isoDate(addDays(s, -7)), isoDate(addDays(s, -1))] } },
  { key: 'month',     label: 'Ce mois',          range: () => { const t = new Date(); return [isoDate(new Date(t.getFullYear(), t.getMonth(), 1)), isoDate(t)] } },
  { key: 'lastMonth', label: 'Mois dernier',     range: () => { const t = new Date(); return [isoDate(new Date(t.getFullYear(), t.getMonth() - 1, 1)), isoDate(new Date(t.getFullYear(), t.getMonth(), 0))] } },
  { key: 'last3m',    label: '3 derniers mois',  range: () => { const t = new Date(); return [isoDate(new Date(t.getFullYear(), t.getMonth() - 2, 1)), isoDate(t)] } },
  { key: 'last6m',    label: '6 derniers mois',  range: () => { const t = new Date(); return [isoDate(new Date(t.getFullYear(), t.getMonth() - 5, 1)), isoDate(t)] } },
  { key: 'year',      label: 'Cette année',      range: () => { const t = new Date(); return [`${t.getFullYear()}-01-01`, isoDate(t)] } },
]

const [defaultFrom, defaultTo] = PRESETS.find(p => p.key === 'month').range()
export const DEFAULT_FILTERS = {
  preset: 'month', from: defaultFrom, to: defaultTo,
  camionId: '', clientKey: '', supplierKey: '', typeProduit: '', typeBrique: '', chauffeur: '', typeCamion: '',
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="input text-xs px-2.5 py-1.5 rounded-lg">
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export default function FilterBar({ filters, onChange, options }) {
  function setPreset(key) {
    const p = PRESETS.find(x => x.key === key)
    const [from, to] = p.range()
    onChange({ ...filters, preset: key, from, to })
  }
  function setCustomDate(field, value) {
    onChange({ ...filters, preset: 'custom', [field]: value })
  }

  const clientOptions = [
    ...options.clients.map(c => ({ value: `brique:${c.id}`, label: c.nom })),
    ...options.grignonClients.map(c => ({ value: `grignon:${c.id}`, label: `${c.nom} (Grignon)` })),
  ]
  const supplierOptions = [
    ...options.fournisseurs.map(f => ({ value: `brique:${f.id}`, label: f.nom })),
    ...options.grignonFournisseurs.map(f => ({ value: `grignon:${f.id}`, label: `${f.nom} (Grignon)` })),
  ]

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
      {/* Date row */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(p => (
          <button key={p.key} onClick={() => setPreset(p.key)}
            className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition whitespace-nowrap ${
              filters.preset === p.key ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5 ml-1">
          <input type="date" value={filters.from} onChange={e => setCustomDate('from', e.target.value)} className="input text-xs px-2 py-1.5 rounded-lg" />
          <span className="text-slate-300">→</span>
          <input type="date" value={filters.to} onChange={e => setCustomDate('to', e.target.value)} className="input text-xs px-2 py-1.5 rounded-lg" />
        </div>
      </div>

      {/* Dimension row */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
        <Select placeholder="🚛 Tous les camions" value={filters.camionId}
          onChange={v => onChange({ ...filters, camionId: v })}
          options={options.camions.map(c => ({ value: String(c.id), label: c.plaque + (c.type_camion === 'loue' ? ' 🔑' : '') }))} />
        <Select placeholder="🚚 Propre / Loué" value={filters.typeCamion}
          onChange={v => onChange({ ...filters, typeCamion: v })}
          options={[{ value: 'propre', label: '🏢 Propre' }, { value: 'loue', label: '🔑 Loué' }]} />
        <Select placeholder="👤 Tous les clients" value={filters.clientKey}
          onChange={v => onChange({ ...filters, clientKey: v })}
          options={clientOptions} />
        <Select placeholder="🏭 Tous les fournisseurs" value={filters.supplierKey}
          onChange={v => onChange({ ...filters, supplierKey: v })}
          options={supplierOptions} />
        <Select placeholder="📦 Tous produits" value={filters.typeProduit}
          onChange={v => onChange({ ...filters, typeProduit: v })}
          options={[{ value: 'brique', label: '🧱 Briques' }, { value: 'grignon', label: '🫒 Grignon' }]} />
        <Select placeholder="🧱 Tous types brique" value={filters.typeBrique}
          onChange={v => onChange({ ...filters, typeBrique: v })}
          options={options.typeBriques.map(t => ({ value: t.nom, label: t.nom }))} />
        <Select placeholder="🧑‍✈️ Tous chauffeurs" value={filters.chauffeur}
          onChange={v => onChange({ ...filters, chauffeur: v })}
          options={options.drivers.map(d => ({ value: d, label: d }))} />
        {(filters.camionId || filters.typeCamion || filters.clientKey || filters.supplierKey || filters.typeProduit || filters.typeBrique || filters.chauffeur) && (
          <button
            onClick={() => onChange({ ...filters, camionId: '', typeCamion: '', clientKey: '', supplierKey: '', typeProduit: '', typeBrique: '', chauffeur: '' })}
            className="text-[11px] text-red-500 hover:text-red-700 font-semibold ml-1">
            ✕ Réinitialiser
          </button>
        )}
      </div>
    </div>
  )
}
