import { useMemo } from 'react'
import { useRouter } from 'next/router'
import { fmt, fmtMoney } from '../../lib/utils'
import { buildFuelCycles, enrichByCamion, buildFleetIntelligenceSummary } from '../../lib/services/fuelCycles'
import KpiCard from '../profitability/KpiCard'
import Section from './Section'

// Fleet-level decision widgets (spec §10) — built entirely from data the
// Dashboard already fetched for OperationalAlerts (allGasoil/voyages/camions),
// so this adds zero new Supabase queries. Longest cycle is always picked by
// distance, never by duration (§12).
export default function FleetFuelIntelligence({ allGasoil, voyages, camions }) {
  const router = useRouter()

  const intel = useMemo(() => {
    const byCamion = buildFuelCycles({ gasoil: allGasoil, voyages: voyages || [], camions })
    const enriched = enrichByCamion(byCamion, 15)
    return buildFleetIntelligenceSummary(enriched)
  }, [allGasoil, voyages, camions])

  const goCarburant = () => router.push('/carburant')

  return (
    <Section title="Intelligence Flotte — Carburant" subtitle="Vue décisionnelle basée sur les cycles de plein">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
        <KpiCard label="Conso. flotte" color="purple" onClick={goCarburant}
          value={intel.fleetAvgConso !== null ? `${intel.fleetAvgConso.toFixed(1)} L/100` : '—'} sub="Moyenne tous camions" />
        <KpiCard label="🏆 Meilleur camion" color="green" onClick={goCarburant}
          value={intel.bestTruck?.camionPlaque || '—'} sub={intel.bestTruck ? `${intel.bestTruck.health.avgConso.toFixed(1)} L/100` : 'Aucune donnée'} />
        <KpiCard label="⚠️ Camion à surveiller" color="red" onClick={goCarburant}
          value={intel.worstTruck?.camionPlaque || '—'} sub={intel.worstTruck ? `${intel.worstTruck.health.avgConso.toFixed(1)} L/100` : 'Aucune donnée'} />
        <KpiCard label="Cycles en cours" color="blue" onClick={goCarburant}
          value={intel.openCyclesCount} sub="Camions actifs" />
        <KpiCard label="Alertes critiques" color="red" onClick={goCarburant}
          value={intel.criticalAlertsCount} sub="Cycles 🔴" />
        <KpiCard label="🔧 À inspecter" color="orange" onClick={goCarburant}
          value={intel.trucksNeedingInspection.length} sub="Camions" />
        <KpiCard label="Cycle le plus long" color="slate" onClick={goCarburant}
          value={intel.longestCycle ? `${fmt(intel.longestCycle.distance)} km` : '—'} sub={intel.longestCycle?.camionPlaque || 'Par distance'} />
        <KpiCard label="💸 + coûteux ce mois" color="amber" onClick={goCarburant}
          value={intel.mostExpensiveTruckThisMonth?.camionPlaque || '—'} sub={intel.mostExpensiveTruckThisMonth ? `${fmtMoney(intel.mostExpensiveTruckThisMonth.cost)} DHS` : 'Aucune donnée'} />
      </div>
    </Section>
  )
}
