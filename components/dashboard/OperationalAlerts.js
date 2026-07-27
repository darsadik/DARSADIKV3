import { useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { fmt, fmtDate } from '../../lib/utils'
import { detectAnomalies } from '../../lib/services/review/anomalies'
import { computeVoyageValidation, voyageValidationStatus } from '../../lib/services/voyage/validation'
import { buildFuelCycles, historicalAverages, statusForCycle } from '../../lib/camionPerformance'
import Section from './Section'

// Presentation-only thresholds — not accounting rules. Mirrors the 100 000 DHS
// heuristic the previous dashboard already used for its urgent-client banner
// (there is no credit_limit column in the schema) and the 15% deviation
// default already used on /camions for fuel-cycle anomaly detection.
const CLIENT_CREDIT_THRESHOLD = 100000
const SUPPLIER_UNPAID_THRESHOLD = 50000
const FUEL_ANOMALY_THRESHOLD_PCT = 15

const TONE = {
  red:    { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', dot: 'bg-red-500' },
  amber:  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600', dot: 'bg-amber-500' },
}

function AlertCard({ icon, label, count, tone, sub, onClick }) {
  if (!count) return null
  const t = TONE[tone]
  return (
    <button onClick={onClick} className={`text-left rounded-xl border ${t.border} ${t.bg} px-4 py-3 hover:shadow-sm transition`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-lg">{icon}</span>
        <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
      </div>
      <div className={`text-xl font-black ${t.text}`}>{count}</div>
      <div className="text-[11px] font-semibold text-slate-600 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </button>
  )
}

// Section 5 — every signal here is a read of an existing pure detector
// (detectAnomalies / computeVoyageValidation / statusForCycle) or a simple
// balance threshold, never a new business rule. `results` are voyage rows
// already merged with computeVoyageProfit output (see pages/index.js), so
// `result: v` below reuses that computation instead of redoing it.
export default function OperationalAlerts({
  results, achats, livraisons, voyageGasoil, allGasoil, camions,
  clients, grignonClients, fournisseurs, grignonFournisseurs,
  rangeFrom, rangeTo,
}) {
  const router = useRouter()
  const [drill, setDrill] = useState(null) // { title, items: [{label, sub}] }

  const perVoyage = useMemo(() => results.map(v => {
    const myAchats = achats.filter(a => a.voyage_id === v.id)
    const myLivraisons = livraisons.filter(l => l.voyage_id === v.id)
    const myGasoil = voyageGasoil.filter(g => g.voyage_id === v.id)
    const anomalies = detectAnomalies({ voyage: v, achats: myAchats, livraisons: myLivraisons, gasoil: myGasoil, result: v })
    const validationStatus = voyageValidationStatus(computeVoyageValidation(myAchats, myLivraisons))
    return { voyage: v, anomalies, validationStatus }
  }), [results, achats, livraisons, voyageGasoil])

  function byType(type) {
    return perVoyage.filter(r => r.anomalies.some(a => a.type === type))
  }

  const missingFuel   = byType('missing_fuel')
  const noAchats      = byType('no_achats')
  const noLivraisons  = byType('no_livraisons')
  const negativeProfit= byType('negative_profit')
  const missingOdometer = byType('missing_odometer')
  const exceedsPurchase = perVoyage.filter(r => r.validationStatus === 'error')

  const fuelIssues = useMemo(() => {
    const cycles = buildFuelCycles(allGasoil)
    const hist = historicalAverages(cycles)
    const inRange = cycles.filter(c => c.dateFin >= rangeFrom && c.dateFin <= rangeTo)
    return inRange
      .map(c => ({ cycle: c, status: statusForCycle(c, hist, FUEL_ANOMALY_THRESHOLD_PCT) }))
      .filter(c => c.status === 'anormale')
  }, [allGasoil, rangeFrom, rangeTo])

  const unpaidSuppliers = useMemo(() => (
    [...(fournisseurs || []), ...(grignonFournisseurs || [])].filter(f => (f.solde || 0) >= SUPPLIER_UNPAID_THRESHOLD)
  ), [fournisseurs, grignonFournisseurs])

  const overLimitClients = useMemo(() => (
    [...(clients || []), ...(grignonClients || [])].filter(c => (c.solde || 0) >= CLIENT_CREDIT_THRESHOLD)
  ), [clients, grignonClients])

  const voyageLabel = v => `${v.reference || `#${v.id}`} — ${fmtDate(v.date_depart)} · ${v.camion_plaque || ''}`

  function openVoyageDrill(title, rows) {
    setDrill({
      title,
      items: rows.map(r => ({ label: voyageLabel(r.voyage), onClick: () => router.push(`/review`) })),
    })
  }

  const totalAlerts = missingFuel.length + noAchats.length + noLivraisons.length + negativeProfit.length
    + missingOdometer.length + exceedsPurchase.length + fuelIssues.length + unpaidSuppliers.length + overLimitClients.length

  return (
    <Section
      title="Alertes opérationnelles"
      subtitle={totalAlerts === 0 ? 'Aucune anomalie détectée' : `${totalAlerts} point(s) à vérifier`}
    >
      {totalAlerts === 0 ? (
        <div className="py-10 text-center text-slate-400 text-sm flex flex-col items-center gap-1.5">
          <span className="text-2xl">✅</span>Tout est en ordre
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 p-4">
          <AlertCard icon="⛽" label="Carburant manquant" count={missingFuel.length} tone="red"
            onClick={() => openVoyageDrill('⛽ Carburant manquant', missingFuel)} />
          <AlertCard icon="📦" label="Achat manquant" count={noAchats.length} tone="red"
            onClick={() => openVoyageDrill('📦 Achat manquant', noAchats)} />
          <AlertCard icon="⚖️" label="Achat > Livraison" count={exceedsPurchase.length} tone="amber"
            onClick={() => openVoyageDrill('⚖️ Achat > Livraison', exceedsPurchase)} />
          <AlertCard icon="📉" label="Profit négatif" count={negativeProfit.length} tone="red"
            onClick={() => openVoyageDrill('📉 Profit négatif', negativeProfit)} />
          <AlertCard icon="🚚" label="Livraison manquante" count={noLivraisons.length} tone="amber"
            onClick={() => openVoyageDrill('🚚 Livraison manquante', noLivraisons)} />
          <AlertCard icon="🔢" label="Odomètre manquant" count={missingOdometer.length} tone="amber"
            onClick={() => openVoyageDrill('🔢 Odomètre manquant', missingOdometer)} />
          <AlertCard icon="📈" label="Cycle carburant anormal" count={fuelIssues.length} tone="amber"
            sub={`Seuil ${FUEL_ANOMALY_THRESHOLD_PCT}%`}
            onClick={() => setDrill({
              title: '📈 Cycle carburant anormal',
              items: fuelIssues.map(({ cycle }) => ({
                label: `${camions.find(c => c.id === cycle.camionId)?.plaque || cycle.camionPlaque || '—'} — ${fmtDate(cycle.dateDebut)} → ${fmtDate(cycle.dateFin)}`,
                onClick: () => router.push('/camions'),
              })),
            })} />
          <AlertCard icon="🏭" label="Fournisseur impayé" count={unpaidSuppliers.length} tone="amber"
            sub={`≥ ${fmt(SUPPLIER_UNPAID_THRESHOLD)} DHS`}
            onClick={() => setDrill({
              title: '🏭 Fournisseur impayé',
              items: unpaidSuppliers.map(f => ({ label: `${f.nom} — ${fmt(f.solde)} DHS`, onClick: () => router.push('/fournisseurs') })),
            })} />
          <AlertCard icon="🚨" label="Client dépasse le crédit" count={overLimitClients.length} tone="red"
            sub={`≥ ${fmt(CLIENT_CREDIT_THRESHOLD)} DHS`}
            onClick={() => setDrill({
              title: '🚨 Client dépasse le crédit',
              items: overLimitClients.map(c => ({ label: `${c.nom} — ${fmt(c.solde)} DHS`, onClick: () => router.push('/clients') })),
            })} />
        </div>
      )}

      {drill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setDrill(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h3 className="font-black text-slate-800 text-sm">{drill.title}</h3>
              <button onClick={() => setDrill(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1">×</button>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-50">
              {drill.items.map((it, i) => (
                <button key={i} onClick={it.onClick} className="w-full text-left px-5 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  {it.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Section>
  )
}
