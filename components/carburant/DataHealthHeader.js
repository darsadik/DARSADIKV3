// ── Fuel & KM Quality header (spec §8) — single fleet-wide quality
// percentage with a clickable breakdown. Each chip sets a quick filter on
// the page (onFilter receives the same key SmartFilters/the page use), so
// clicking "2 voyages sans KM" jumps straight to the Missing Data list
// filtered to that category — no separate query, everything here is already
// computed by buildDataHealthScore.

function Chip({ label, value, tone, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`flex flex-col items-start px-3 py-2 rounded-xl text-left transition-colors ${tone} ${onClick ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'}`}
    >
      <span className="text-lg font-black leading-none">{value}</span>
      <span className="text-[10px] font-semibold opacity-80 mt-1">{label}</span>
    </button>
  )
}

export default function DataHealthHeader({ health, onFilter }) {
  const pctTone = health.pct >= 95 ? 'text-emerald-700' : health.pct >= 85 ? 'text-amber-600' : 'text-red-600'
  const ringTone = health.pct >= 95 ? 'ring-emerald-100 bg-emerald-50' : health.pct >= 85 ? 'ring-amber-100 bg-amber-50' : 'ring-red-100 bg-red-50'

  return (
    <div className={`card mb-6 ring-1 ring-inset ${ringTone}`}>
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex flex-col items-center px-2">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Qualité KM &amp; Carburant</div>
          <div className={`text-4xl font-black ${pctTone}`}>{health.pct}%</div>
        </div>
        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <Chip label="Voyages OK" value={`${health.voyagesOk}/${health.voyagesTotal}`} tone="bg-blue-50 text-blue-700" />
          <Chip label="Pleins OK" value={`${health.pleinsOk}/${health.pleinsTotal}`} tone="bg-cyan-50 text-cyan-700" />
          <Chip label="Voyages sans KM" value={health.missingKmVoyages} tone="bg-amber-50 text-amber-700"
            onClick={health.missingKmVoyages > 0 ? () => onFilter?.('missingKm') : undefined} />
          <Chip label="Pleins sans KM" value={health.missingKmPleins} tone="bg-amber-50 text-amber-700"
            onClick={health.missingKmPleins > 0 ? () => onFilter?.('missingKm') : undefined} />
          <Chip label="Suggestions fusion" value={health.mergeSuggestionsCount} tone="bg-purple-50 text-purple-700"
            onClick={health.mergeSuggestionsCount > 0 ? () => onFilter?.('mergeSuggestions') : undefined} />
          <Chip label="Distance négative" value={health.negativeDistanceCount} tone="bg-red-50 text-red-700"
            onClick={health.negativeDistanceCount > 0 ? () => onFilter?.('issues') : undefined} />
        </div>
      </div>
    </div>
  )
}
