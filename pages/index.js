import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from './_app'
import { computeVoyageProfit, DEFAULT_REMISE_CARBURANT_RATE } from '../lib/services/profitability'
import { fetchRemiseCarburantRate } from '../lib/services/settings'
import { fmtDate, today, startOfMonth } from '../lib/utils'
import ExecutiveKpis from '../components/dashboard/ExecutiveKpis'
import FleetPerformance from '../components/dashboard/FleetPerformance'
import TopClients from '../components/dashboard/TopClients'
import LatestVoyages from '../components/dashboard/LatestVoyages'
import OperationalAlerts from '../components/dashboard/OperationalAlerts'
import FleetFuelIntelligence from '../components/dashboard/FleetFuelIntelligence'
import DashboardCharts from '../components/dashboard/DashboardCharts'
import TodaysActivity from '../components/dashboard/TodaysActivity'
import QuickActions from '../components/dashboard/QuickActions'

// ── Executive ERP Cockpit ────────────────────────────────────────────────────
// This page only fetches rows and hands them to components/dashboard/* — every
// number displayed anywhere below comes from lib/services/profitability.js
// (computeVoyageProfit / aggregateVoyageProfits / aggregateClientProfits),
// lib/services/review/anomalies.js, lib/services/voyage/validation.js, or
// lib/camionPerformance.js. Nothing here recomputes profit/anomaly/validation
// logic — same "one engine, many views" rule as pages/rentabilite/index.js.

const startOfWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().split('T')[0] }
const startOfYear = () => `${new Date().getFullYear()}-01-01`
const minDate = (a, b) => (a < b ? a : b)
const maxDate = (a, b) => (a > b ? a : b)

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function fetchByVoyageIds(table, select, ids) {
  if (!ids.length) return []
  const groups = chunk(ids, 200)
  const pages = await Promise.all(groups.map(g => supabase.from(table).select(select).in('voyage_id', g)))
  return pages.flatMap(p => p.data || [])
}

export default function Dashboard() {
  useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  // ── date-window-scoped voyage data ──
  const [voyages,      setVoyages]      = useState([])
  const [achats,       setAchats]       = useState([])
  const [livraisons,   setLivraisons]   = useState([])
  const [charges,      setCharges]      = useState([])
  const [retours,      setRetours]      = useState([])
  const [locations,    setLocations]    = useState([])
  const [voyageGasoil, setVoyageGasoil] = useState([])

  // ── unscoped (fetched once) ──
  const [allGasoil,           setAllGasoil]           = useState([])
  const [camions,              setCamions]             = useState([])
  const [clients,              setClients]             = useState([])
  const [grignonClients,       setGrignonClients]      = useState([])
  const [fournisseurs,         setFournisseurs]        = useState([])
  const [grignonFournisseurs,  setGrignonFournisseurs] = useState([])
  const [remiseRate,           setRemiseRate]          = useState(DEFAULT_REMISE_CARBURANT_RATE)

  // ── today-only (Section 7) ──
  const [paiementsToday, setPaiementsToday] = useState([])

  // ── period filter — scopes Fleet/Clients/Alerts/Charts (Sections 2,3,5,6) ──
  const [filterType, setFilterType] = useState('month') // 'month' | 'week' | 'custom'
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo,   setFilterTo]   = useState(today())

  const rangeFrom = filterType === 'month' ? startOfMonth() : filterType === 'week' ? startOfWeek() : filterFrom
  const rangeTo   = filterType === 'custom' ? filterTo : today()

  // Fetch window always covers year-to-date (Section 1's "Profit Année" needs
  // it) unioned with whatever the period filter currently selects.
  const windowFrom = minDate(startOfYear(), rangeFrom)
  const windowTo   = maxDate(today(), rangeTo)

  useEffect(() => { loadOptions(); fetchRemiseCarburantRate().then(setRemiseRate) }, [])
  useEffect(() => { loadVoyageData() }, [windowFrom, windowTo])

  async function loadOptions() {
    const [{ data: ca }, { data: cl }, { data: gc }, { data: fo }, { data: gf }, { data: ag }, { data: pt }, { data: gpt }] = await Promise.all([
      supabase.from('camions').select('id,plaque,type_camion,chauffeur').order('plaque'),
      supabase.from('clients').select('id,nom,solde'),
      supabase.from('grignon_clients').select('id,nom,solde'),
      supabase.from('fournisseurs').select('id,nom,solde'),
      supabase.from('grignon_fournisseurs').select('id,nom,solde'),
      supabase.from('gasoil').select('id,camion_id,camion_plaque,km,date,heure,adblue_total,adblue_qte,qte,total,merge_with_previous').not('km', 'is', null).order('km', { ascending: true }),
      supabase.from('paiements').select('id,date,client_nom,montant').eq('date', today()),
      supabase.from('grignon_paiements').select('id,date,client_nom,montant').eq('date', today()),
    ])
    setCamions(ca || []); setClients(cl || []); setGrignonClients(gc || [])
    setFournisseurs(fo || []); setGrignonFournisseurs(gf || [])
    setAllGasoil(ag || [])
    setPaiementsToday([...(pt || []), ...(gpt || [])])
  }

  async function loadVoyageData() {
    setLoading(true)
    const { data: v } = await supabase.from('voyages').select('*')
      .gte('date_depart', windowFrom).lte('date_depart', windowTo)
      .order('date_depart', { ascending: false })
    const vList = v || []
    const vIds = vList.map(x => x.id)
    const [ac, li, ch, re, loc, vg] = await Promise.all([
      fetchByVoyageIds('voyage_achats', 'voyage_id,type_produit,type_brique,qte,prix_achat,total_achat', vIds),
      fetchByVoyageIds('voyage_livraisons', 'id,voyage_id,date_livraison,type_produit,type_brique,client_id,client_nom,qte,total_vente,frais_total', vIds),
      fetchByVoyageIds('voyage_charges', 'voyage_id,montant,facture_client,client_id,client_nom', vIds),
      fetchByVoyageIds('voyage_retours', 'voyage_id,montant', vIds),
      fetchByVoyageIds('voyage_locations', 'voyage_id,montant_location', vIds),
      fetchByVoyageIds('voyage_gasoil', 'voyage_id,total', vIds),
    ])
    setVoyages(vList); setAchats(ac); setLivraisons(li); setCharges(ch)
    setRetours(re); setLocations(loc); setVoyageGasoil(vg)
    setLoading(false)
  }

  const gasoilByCamion = useMemo(() => {
    const acc = {}
    allGasoil.forEach(g => { if (!acc[g.camion_id]) acc[g.camion_id] = []; acc[g.camion_id].push(g) })
    return acc
  }, [allGasoil])

  // ── the ONE place computeVoyageProfit is called — every section reads this
  // same memoized array, never recomputing profit itself. ──
  const results = useMemo(() => voyages.map(v => ({
    ...v,
    ...computeVoyageProfit({
      voyage: v,
      achats: achats.filter(a => a.voyage_id === v.id),
      livraisons: livraisons.filter(l => l.voyage_id === v.id),
      charges: charges.filter(c => c.voyage_id === v.id),
      retours: retours.filter(r => r.voyage_id === v.id),
      locations: locations.filter(l => l.voyage_id === v.id),
      camionRefills: gasoilByCamion[v.camion_id] || [],
      voyageGasoilRows: voyageGasoil.filter(g => g.voyage_id === v.id),
      remiseRate,
    }),
  })), [voyages, achats, livraisons, charges, retours, locations, gasoilByCamion, voyageGasoil, remiseRate])

  const periodResults = useMemo(
    () => results.filter(r => r.date_depart >= rangeFrom && r.date_depart <= rangeTo),
    [results, rangeFrom, rangeTo]
  )

  const periodLabel = filterType === 'month'
    ? new Date().toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' })
    : filterType === 'week'
    ? 'cette semaine'
    : `${fmtDate(rangeFrom)} – ${fmtDate(rangeTo)}`

  const openVoyage = id => router.push(`/voyages/${id}`)

  // ── Section 7 inputs — same-day filter of already-loaded arrays ──
  const t = today()
  const voyagesToday   = voyages.filter(v => v.date_depart === t)
  const voyageIdsToday = new Set(voyagesToday.map(v => v.id))
  const livraisonsToday = livraisons.filter(l => l.date_livraison === t)
  const achatsToday     = achats.filter(a => voyageIdsToday.has(a.voyage_id))
  const retoursToday    = retours.filter(r => voyageIdsToday.has(r.voyage_id))
  const gasoilToday     = allGasoil.filter(g => g.date === t)

  return (
    <Layout title="Dashboard" subtitle="Cockpit exécutif">
      <div className="max-w-[1500px] mx-auto space-y-4">

        {/* ── SECTION 1 — Executive KPIs (fixed periods) ── */}
        <ExecutiveKpis
          results={results}
          clients={clients} grignonClients={grignonClients}
          fournisseurs={fournisseurs} grignonFournisseurs={grignonFournisseurs}
        />

        {/* ── PERIOD FILTER — scopes Sections 2, 3, 5, 6 ── */}
        <div className="bg-white border border-slate-100 rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-3 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex-shrink-0">Période</span>
          <div className="flex rounded-lg overflow-hidden border border-slate-200 flex-shrink-0">
            {[{ key: 'month', label: 'Ce mois' }, { key: 'week', label: 'Cette semaine' }, { key: 'custom', label: 'Personnalisé' }].map(opt => (
              <button key={opt.key} onClick={() => setFilterType(opt.key)}
                className={`px-3 py-1.5 text-xs font-bold transition ${filterType === opt.key ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                {opt.label}
              </button>
            ))}
          </div>
          {filterType === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50" />
              <span className="text-slate-400 text-xs">→</span>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50" />
            </div>
          )}
          <span className="text-xs text-slate-500 font-medium">{periodLabel}</span>
          <span className="ml-auto text-xs text-slate-400">{periodResults.length} voyage{periodResults.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-40 bg-slate-100 rounded-2xl" />
            <div className="h-64 bg-slate-100 rounded-2xl" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-56 bg-slate-100 rounded-2xl" />
              <div className="h-56 bg-slate-100 rounded-2xl" />
            </div>
          </div>
        ) : (
          <>
            {/* ── SECTION 2 — Fleet Performance ── */}
            <FleetPerformance results={periodResults} camions={camions} periodLabel={periodLabel} onOpenVoyage={openVoyage} />

            {/* ── SECTION 2.5 — Fleet Fuel Intelligence ── */}
            <FleetFuelIntelligence allGasoil={allGasoil} voyages={voyages} camions={camions} />

            {/* ── SECTION 3 — Top / Worst Clients ── */}
            <TopClients results={periodResults} periodLabel={periodLabel} />

            {/* ── SECTION 4 — Latest Voyages ── */}
            <LatestVoyages results={results} onOpenVoyage={openVoyage} />

            {/* ── SECTION 5 — Operational Alerts ── */}
            <OperationalAlerts
              results={periodResults} achats={achats} livraisons={livraisons} voyageGasoil={voyageGasoil}
              allGasoil={allGasoil} camions={camions} voyages={voyages}
              clients={clients} grignonClients={grignonClients}
              fournisseurs={fournisseurs} grignonFournisseurs={grignonFournisseurs}
              rangeFrom={rangeFrom} rangeTo={rangeTo}
            />

            {/* ── SECTION 6 — Charts ── */}
            <DashboardCharts results={periodResults} camions={camions} />

            {/* ── SECTION 7 — Today's Activity ── */}
            <TodaysActivity
              voyagesToday={voyagesToday} livraisonsToday={livraisonsToday}
              achatsToday={achatsToday} gasoilToday={gasoilToday}
              retoursToday={retoursToday} paiementsToday={paiementsToday}
            />

            {/* ── SECTION 8 — Quick Actions ── */}
            <QuickActions />
          </>
        )}
      </div>
    </Layout>
  )
}
