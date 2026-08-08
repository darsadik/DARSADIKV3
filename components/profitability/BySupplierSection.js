import { useState, useMemo } from 'react'
import { fmt, fmtDate, fmtMoney } from '../../lib/utils'
import DataTable from './DataTable'

// NOT built from the profitability engine — suppliers don't have a "profit"
// in this business, only spend. This is a plain aggregation of raw
// voyage_achats rows, scoped to the currently visible voyages (`results`).
// Documented exception to the Golden Rule discussion in
// pages/rentabilite/index.js.
export default function BySupplierSection({ achats, results, onOpenVoyage }) {
  const [selected, setSelected] = useState(null) // `${type_produit}:${fournisseur_id}`

  const voyageIds = useMemo(() => new Set(results.map(r => r.id)), [results])
  const voyageById = useMemo(() => Object.fromEntries(results.map(r => [r.id, r])), [results])
  const myAchats = useMemo(() => achats.filter(a => voyageIds.has(a.voyage_id)), [achats, voyageIds])

  const rows = useMemo(() => {
    const map = new Map()
    myAchats.forEach(a => {
      if (!a.fournisseur_id) return
      const key = `${a.type_produit}:${a.fournisseur_id}`
      if (!map.has(key)) {
        map.set(key, { key, type_produit: a.type_produit, fournisseur_id: a.fournisseur_id, fournisseur_nom: a.fournisseur_nom, totalAchat: 0, nbAchats: 0, voyageIds: new Set() })
      }
      const s = map.get(key)
      s.totalAchat += a.total_achat || (a.qte || 0) * (a.prix_achat || 0)
      s.nbAchats += 1
      s.voyageIds.add(a.voyage_id)
    })
    return Array.from(map.values()).map(s => ({ ...s, nbVoyages: s.voyageIds.size })).sort((a, b) => b.totalAchat - a.totalAchat)
  }, [myAchats])

  // PDF TOTAL row: plain reduce over the already-aggregated per-supplier
  // `rows` — raw purchase spend, same values already shown on screen.
  function totals(rows) {
    return {
      nbAchats: rows.reduce((s, r) => s + r.nbAchats, 0),
      nbVoyages: rows.reduce((s, r) => s + r.nbVoyages, 0),
      totalAchat: rows.reduce((s, r) => s + r.totalAchat, 0),
    }
  }

  const columns = [
    { key: 'nom', label: 'Fournisseur', sortValue: r => r.fournisseur_nom || '', render: r => (
      <div>
        <span className="font-bold text-slate-800">{r.fournisseur_nom}</span>
        {r.type_produit === 'grignon' && <span className="ml-1.5 text-[9px] bg-lime-100 text-lime-700 px-1.5 py-0.5 rounded font-semibold">GRIGNON</span>}
      </div>
    ) },
    { key: 'nbAchats', label: 'Achats', center: true, sortValue: r => r.nbAchats, render: r => (
      <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{r.nbAchats}</span>
    ), total: rows => String(totals(rows).nbAchats) },
    { key: 'nbVoyages', label: 'Voyages', center: true, sortValue: r => r.nbVoyages, render: r => (
      <span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{r.nbVoyages}</span>
    ), total: rows => String(totals(rows).nbVoyages) },
    { key: 'total', label: 'Total dépensé', right: true, sortValue: r => r.totalAchat, exportValue: r => Math.round(r.totalAchat), printValue: r => fmtMoney(r.totalAchat) + ' DHS', render: r => <span className="font-black text-red-500">{fmtMoney(r.totalAchat)} DHS</span>,
      total: rows => fmtMoney(totals(rows).totalAchat) + ' DHS' },
  ]

  const selectedSupplier = rows.find(r => r.key === selected)
  const selectedAchats = selectedSupplier
    ? myAchats.filter(a => `${a.type_produit}:${a.fournisseur_id}` === selected)
    : []

  // Chronological (oldest → newest) by the achat's own voyage date, tie-broken
  // by achat id — same convention as every other voyage-dated list in this
  // module (see ByVoyageSection.js's chronoSort / lib/printRentabilite.js).
  function drillChronoSort(a, b) {
    const da = voyageById[a.voyage_id]?.date_depart || '', db = voyageById[b.voyage_id]?.date_depart || ''
    if (da !== db) return da < db ? -1 : 1
    return (a.id || 0) - (b.id || 0)
  }

  const drillColumns = [
    { key: 'date', label: 'Date', sortValue: a => voyageById[a.voyage_id]?.date_depart || '', render: a => fmtDate(voyageById[a.voyage_id]?.date_depart) },
    { key: 'voyage', label: 'Voyage', sortValue: a => voyageById[a.voyage_id]?.reference || String(a.voyage_id), render: a => voyageById[a.voyage_id]?.reference || `#${a.voyage_id}` },
    { key: 'camion', label: 'Camion', sortValue: a => voyageById[a.voyage_id]?.camion_plaque || '', render: a => voyageById[a.voyage_id]?.camion_plaque || '—' },
    { key: 'type', label: 'Type', sortValue: a => a.type_brique || '', render: a => a.type_brique || '—' },
    { key: 'qte', label: 'Qté', right: true, sortValue: a => a.qte, exportValue: a => a.qte, printValue: a => fmt(a.qte), render: a => fmt(a.qte),
      total: rows => fmt(rows.reduce((s, a) => s + (a.qte || 0), 0)) },
    { key: 'prix', label: 'Prix/u', right: true, sortValue: a => a.prix_achat, exportValue: a => a.prix_achat, printValue: a => fmtMoney(a.prix_achat) + ' DHS', render: a => fmtMoney(a.prix_achat) },
    { key: 'total', label: 'Total', right: true, sortValue: a => a.total_achat, exportValue: a => Math.round(a.total_achat), printValue: a => fmtMoney(a.total_achat) + ' DHS', render: a => <span className="font-bold text-red-500">{fmtMoney(a.total_achat)}</span>,
      total: rows => fmtMoney(rows.reduce((s, a) => s + (a.total_achat || 0), 0)) + ' DHS' },
  ]

  return (
    <>
      <DataTable
        title="Achats par fournisseur" subtitle="Dépense d'achat — hors moteur de rentabilité (les fournisseurs n'ont pas de « profit »)"
        columns={columns} rows={rows} rowKey={r => r.key}
        onRowClick={r => setSelected(r.key)}
        searchable searchFn={(r, q) => (r.fournisseur_nom || '').toLowerCase().includes(q)}
        placeholder="Rechercher un fournisseur..."
        defaultSortKey="total" exportFilename="Fournisseurs"
        printIcon="🏭"
        printSummary={rows => {
          const t = totals(rows)
          return [
            { label: 'Total Dépensé', value: `${fmtMoney(t.totalAchat)} DHS`, color: '#dc2626' },
            { label: 'Nb. Achats', value: `${t.nbAchats}`, color: '#64748b' },
            { label: 'Nb. Voyages', value: `${t.nbVoyages}`, color: '#64748b' },
          ]
        }}
      />
      {selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-black text-slate-800 text-sm">🏭 {selectedSupplier.fournisseur_nom}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedSupplier.nbAchats} achat(s) sur {selectedSupplier.nbVoyages} voyage(s) — {fmtMoney(selectedSupplier.totalAchat)} DHS au total</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1">×</button>
            </div>
            <div className="overflow-y-auto p-4">
              <DataTable
                columns={drillColumns} rows={selectedAchats} rowKey={a => a.id}
                onRowClick={a => onOpenVoyage(a.voyage_id)}
                defaultSortKey="date" printSort={drillChronoSort} exportFilename={selectedSupplier.fournisseur_nom}
                printIcon="🏭"
                printSummary={rows => [
                  { label: 'Total Achats', value: `${fmtMoney(rows.reduce((s, a) => s + (a.total_achat || 0), 0))} DHS`, color: '#dc2626' },
                  { label: 'Quantité Totale', value: fmt(rows.reduce((s, a) => s + (a.qte || 0), 0)), color: '#64748b' },
                  { label: 'Nb. Achats', value: `${rows.length}`, color: '#64748b' },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
