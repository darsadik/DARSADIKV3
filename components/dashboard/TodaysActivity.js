import { fmt, fmtMoney } from '../../lib/utils'
import Section from './Section'

// Section 7 — everything here is a same-day filter of already-loaded arrays
// (plus a small dedicated "today" fetch for paiements — see pages/index.js),
// never a new aggregation of its own.
function Row({ icon, label, amount, tone = 'slate' }) {
  const toneCls = tone === 'green' ? 'text-emerald-600' : tone === 'red' ? 'text-red-500' : 'text-slate-600'
  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-base flex-shrink-0">{icon}</span>
      <span className="flex-1 text-sm text-slate-700 truncate">{label}</span>
      {amount != null && <span className={`text-sm font-bold flex-shrink-0 ${toneCls}`}>{fmtMoney(amount)} DHS</span>}
    </div>
  )
}

export default function TodaysActivity({ voyagesToday, livraisonsToday, achatsToday, gasoilToday, retoursToday, paiementsToday }) {
  const items = [
    ...voyagesToday.map(v => ({ icon: '🚛', label: `Voyage ${v.reference || `#${v.id}`} — ${v.camion_plaque || ''}`, tone: 'slate' })),
    ...livraisonsToday.map(l => ({ icon: '📦', label: `Livraison — ${l.client_nom || 'client'}`, amount: (l.total_vente || 0) + (l.frais_total || 0), tone: 'green' })),
    ...achatsToday.map(a => ({ icon: '🧱', label: `Achat — ${a.type_brique || a.type_produit || ''}`, amount: a.total_achat, tone: 'red' })),
    ...gasoilToday.map(g => ({ icon: '⛽', label: `Carburant — ${g.camion_plaque || ''}`, amount: g.total, tone: 'red' })),
    ...retoursToday.map(r => ({ icon: '↩️', label: 'Retour transport', amount: r.montant, tone: 'slate' })),
    ...paiementsToday.map(p => ({ icon: '💳', label: `Paiement — ${p.client_nom || 'client'}`, amount: p.montant, tone: 'green' })),
  ]

  return (
    <Section title="Activité du jour" subtitle={`${items.length} mouvement${items.length !== 1 ? 's' : ''}`}>
      {items.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-sm">Aucune activité aujourd'hui</div>
      ) : items.map((it, i) => <Row key={i} {...it} />)}
    </Section>
  )
}
