import { useMemo } from 'react'
import { fmt, today } from '../../lib/utils'
import KpiCard from '../profitability/KpiCard'

const startOfWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().split('T')[0] }
const startOfMonthDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const startOfYear = () => `${new Date().getFullYear()}-01-01`

// Section 1 — fixed-period profit KPIs (never affected by the page's period
// filter) plus the two balance rollups. `results` are voyage rows already
// merged with computeVoyageProfit output (see pages/index.js) — profit here
// is never recomputed, only summed by date bucket.
export default function ExecutiveKpis({ results, clients, grignonClients, fournisseurs, grignonFournisseurs }) {
  const kpis = useMemo(() => {
    const t = today()
    const sumSince = from => results.filter(r => r.date_depart >= from && r.date_depart <= t).reduce((s, r) => s + r.profit, 0)
    return {
      day:   sumSince(t),
      week:  sumSince(startOfWeek()),
      month: sumSince(startOfMonthDate()),
      year:  sumSince(startOfYear()),
    }
  }, [results])

  const receivableBrique  = useMemo(() => (clients || []).reduce((s, c) => s + (c.solde || 0), 0), [clients])
  const receivableGrignon = useMemo(() => (grignonClients || []).reduce((s, c) => s + (c.solde || 0), 0), [grignonClients])
  const receivable = receivableBrique + receivableGrignon

  const payableBrique  = useMemo(() => (fournisseurs || []).reduce((s, f) => s + (f.solde || 0), 0), [fournisseurs])
  const payableGrignon = useMemo(() => (grignonFournisseurs || []).reduce((s, f) => s + (f.solde || 0), 0), [grignonFournisseurs])
  const payable = payableBrique + payableGrignon

  const profitCard = (label, value) => (
    <KpiCard label={label} color={value >= 0 ? 'green' : 'red'} large
      value={(value >= 0 ? '+' : '') + fmt(value) + ' DHS'} />
  )

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
      {profitCard('Profit · Jour', kpis.day)}
      {profitCard('Profit · Semaine', kpis.week)}
      {profitCard('Profit · Mois', kpis.month)}
      {profitCard('Profit · Année', kpis.year)}
      <KpiCard label="Clients à recevoir" color={receivable > 0 ? 'red' : 'green'} large value={fmt(receivable) + ' DHS'}
        sub={`Briques ${fmt(receivableBrique)} · Grignon ${fmt(receivableGrignon)}`} />
      <KpiCard label="Fournisseurs à payer" color={payable > 0 ? 'orange' : 'slate'} large value={fmt(payable) + ' DHS'}
        sub={`Briques ${fmt(payableBrique)} · Grignon ${fmt(payableGrignon)}`} />
      <KpiCard label="Trésorerie" color="slate" large value="—" sub="Bientôt disponible" />
    </div>
  )
}
