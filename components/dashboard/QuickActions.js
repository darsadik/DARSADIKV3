import Link from 'next/link'

// Section 8 — plain links into each existing page's own "add" UI. No new
// modals/routes, per "don't duplicate pages" — the destination page already
// owns its create flow.
const ACTIONS = [
  { href: '/voyages',  icon: '🚛', label: 'Créer un voyage' },
  { href: '/clients',  icon: '👤', label: 'Ajouter un client' },
  { href: '/gasoil',   icon: '⛽', label: 'Ajouter du carburant' },
  { href: '/paiements',icon: '💳', label: 'Enregistrer un paiement' },
]

export default function QuickActions() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {ACTIONS.map(a => (
        <Link key={a.href} href={a.href}
          className="flex items-center gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3.5 hover:border-blue-200 hover:shadow-md transition">
          <span className="text-xl">{a.icon}</span>
          <span className="text-sm font-semibold text-slate-700">{a.label}</span>
        </Link>
      ))}
    </div>
  )
}
