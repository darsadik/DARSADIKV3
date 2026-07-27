import Link from 'next/link'
import { fmt, fmtDate } from '../../lib/utils'
import DataTable from '../profitability/DataTable'
import MarginBadge, { marginRowClass } from '../profitability/MarginBadge'
import { StatusBadge } from '../voyage/StatusBadges'
import Section from './Section'

function clientLabel(v) {
  const names = [...new Set((v.clients || []).map(c => c.client_nom).filter(Boolean))]
  if (names.length === 0) return '—'
  if (names.length === 1) return names[0]
  return `${names[0]} +${names.length - 1}`
}

// Section 4 — compact "latest voyages" table, always the most recent N
// regardless of the page's period filter (that's what "latest" means).
// Reuses the exact same DataTable/MarginBadge/StatusBadge components the
// Profitability Center and Voyages list already use, for one visual system.
export default function LatestVoyages({ results, onOpenVoyage }) {
  const rows = [...results].sort((a, b) => (b.date_depart || '').localeCompare(a.date_depart || '')).slice(0, 8)

  const columns = [
    { key: 'ref', label: 'Voyage', sortValue: r => r.date_depart || '', render: r => (
      <div>
        <div className="font-bold text-slate-800">{r.reference || `#${r.id}`}</div>
        <div className="text-[10px] text-slate-400">{fmtDate(r.date_depart)}</div>
      </div>
    ) },
    { key: 'camion', label: 'Camion', sortValue: r => r.camion_plaque || '', render: r => r.camion_plaque || '—' },
    { key: 'client', label: 'Client', sortValue: r => clientLabel(r), render: r => clientLabel(r) },
    { key: 'revenue', label: 'Revenu', right: true, sortValue: r => r.revenue.total, exportValue: r => Math.round(r.revenue.total), render: r => r.revenue.total > 0 ? <span className="font-semibold text-slate-700">{fmt(r.revenue.total)}</span> : <span className="text-slate-300">—</span> },
    { key: 'cost', label: 'Coût', right: true, sortValue: r => r.cost.total, exportValue: r => Math.round(r.cost.total), render: r => r.cost.total > 0 ? <span className="text-slate-500">{fmt(r.cost.total)}</span> : <span className="text-slate-300">—</span> },
    { key: 'profit', label: 'Profit', right: true, sortValue: r => r.profit, exportValue: r => Math.round(r.profit), render: r => (
      <span className={`font-black ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{r.profit >= 0 ? '+' : ''}{fmt(r.profit)}</span>
    ) },
    { key: 'marge', label: 'Marge', right: true, sortValue: r => r.marge, exportValue: r => r.marge, render: r => <MarginBadge marge={r.marge} /> },
    { key: 'statut', label: 'Statut', center: true, sortValue: r => r.statut || '', render: r => <StatusBadge statut={r.statut} /> },
  ]

  return (
    <Section
      title="Derniers voyages"
      action={<Link href="/voyages" className="text-xs font-bold text-blue-600 hover:text-blue-700">Tous les voyages →</Link>}
    >
      <DataTable
        columns={columns} rows={rows} rowKey={r => r.id}
        onRowClick={r => onOpenVoyage(r.id)}
        rowClassName={r => marginRowClass(r.marge)}
        defaultSortKey="ref" emptyText="Aucun voyage récent"
        exportFilename={null}
      />
    </Section>
  )
}
