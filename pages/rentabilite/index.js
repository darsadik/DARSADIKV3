import { useState, useEffect, useMemo } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { computeVoyageProfit, buildFuelMapsByCamion, DEFAULT_REMISE_CARBURANT_RATE } from '../../lib/services/profitability'
import { buildVoyageFuelContributions } from '../../lib/services/voyage/fuelAllocationCenter'
import { fetchRemiseCarburantRate } from '../../lib/services/settings'
import FilterBar, { DEFAULT_FILTERS } from '../../components/profitability/FilterBar'
import Overview from '../../components/profitability/Overview'
import ByVoyageSection from '../../components/profitability/ByVoyageSection'
import ByTruckSection from '../../components/profitability/ByTruckSection'
import ByClientSection from '../../components/profitability/ByClientSection'
import BySupplierSection from '../../components/profitability/BySupplierSection'
import Timeline from '../../components/profitability/Timeline'
import VoyageDrawer from '../../components/profitability/VoyageDrawer'
import { printRentabiliteReport } from '../../lib/printRentabilite'

// ── Profitability Center ─────────────────────────────────────────────────────
// The ONE place profitability is analyzed. Every number displayed anywhere in
// this module comes from lib/services/profitability.js (computeVoyageProfit /
// aggregateVoyageProfits / aggregateClientProfits) — this file and every
// component under components/profitability/ only fetch rows, apply filters,
// and group/display the engine's own output. The single exception is the
// "Par Fournisseur" tab, which is a raw purchase-spend aggregation (suppliers
// don't have a profit in this business) — see BySupplierSection.js.

const TABS = [
  { key: 'overview',  label: '📊 Overview' },
  { key: 'voyages',   label: '🚛 Par Voyage' },
  { key: 'trucks',    label: '🚚 Par Camion' },
  { key: 'clients',   label: '👤 Par Client' },
  { key: 'suppliers', label: '🏭 Par Fournisseur' },
  { key: 'timeline',  label: '📈 Analyse' },
]

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// voyage_id-scoped tables can exceed a comfortable URL length once a filtered
// period spans hundreds of voyages — batch the .in() lookups defensively.
async function fetchByColumnIds(table, column, select, ids) {
  if (!ids.length) return []
  const groups = chunk(ids, 200)
  const pages = await Promise.all(groups.map(g => supabase.from(table).select(select).in(column, g)))
  return pages.flatMap(p => p.data || [])
}
async function fetchByVoyageIds(table, select, ids) {
  return fetchByColumnIds(table, 'voyage_id', select, ids)
}

export default function ProfitabiliteCenter() {
  useAuth()
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [drawerVoyageId, setDrawerVoyageId] = useState(null)

  // ── date-scoped voyage data (re-fetched when the date range changes) ──
  const [voyages,    setVoyages]    = useState([])
  const [achats,     setAchats]     = useState([])
  const [livraisons, setLivraisons] = useState([])
  const [charges,    setCharges]    = useState([])
  const [retours,    setRetours]    = useState([])
  const [locations,  setLocations]  = useState([])
  // Charges/déductions attached to individual livraisons (voyage_livraison_frais)
  // — fetched only for the print report's itemized operation ledger (see
  // lib/printRentabilite.js). Never read by computeVoyageProfit: livraisons
  // already carry their own frais_total, so this only unbundles that same
  // number into its component lines for display, never recomputes it.
  const [livraisonFrais, setLivraisonFrais] = useState([])

  // Fuel allocation inputs: NEVER scope these by the selected date range — a
  // voyage's bracketing purchase (before/after its km), or a manual link to a
  // voyage outside the period, can fall outside the window, and the
  // allocation engine (lib/services/fuelAllocation.js) needs the full picture
  // to resolve automatic brackets / exclude manually-linked voyages correctly.
  const [allGasoil, setAllGasoil] = useState([])
  const [allVoyages, setAllVoyages] = useState([])
  const [allVoyageGasoilLinks, setAllVoyageGasoilLinks] = useState([])

  // ── filter-dropdown option lists (fetched once, independent of filters) ──
  const [camions,             setCamions]             = useState([])
  const [clients,             setClients]             = useState([])
  const [grignonClients,      setGrignonClients]      = useState([])
  const [fournisseurs,        setFournisseurs]        = useState([])
  const [grignonFournisseurs, setGrignonFournisseurs] = useState([])
  const [typeBriques,         setTypeBriques]         = useState([])
  const [remiseRate,          setRemiseRate]          = useState(DEFAULT_REMISE_CARBURANT_RATE)

  useEffect(() => { loadOptions(); fetchRemiseCarburantRate().then(setRemiseRate) }, [])
  useEffect(() => { loadVoyageData() }, [filters.from, filters.to])

  async function loadOptions() {
    const [{ data: ca }, { data: cl }, { data: gc }, { data: fo }, { data: gf }, { data: tb }, { data: ag }, { data: av }, { data: vgl }] = await Promise.all([
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('clients').select('id,nom').order('nom'),
      supabase.from('grignon_clients').select('id,nom').order('nom'),
      supabase.from('fournisseurs').select('id,nom').order('nom'),
      supabase.from('grignon_fournisseurs').select('id,nom').order('nom'),
      supabase.from('type_briques').select('id,nom').order('nom'),
      // No `.not('km', 'is', null)` filter: a purchase with no odometer can
      // still be manually linked to a voyage, so it must stay in the pool the
      // allocation engine sees (see lib/services/fuelAllocation.js).
      // id/camion_plaque/station/prix_unitaire added (display-only) for the
      // VoyageDrawer's fuel-cost breakdown (buildVoyageFuelContributions).
      supabase.from('gasoil').select('id,camion_id,camion_plaque,station,prix_unitaire,km,total,date,adblue_total,qte').order('km', { ascending: true }),
      supabase.from('voyages').select('id,camion_id,km_depart,km_arrivee,fuel_mode,deleted_at'),
      supabase.from('voyage_gasoil').select('voyage_id,gasoil_id'),
    ])
    setCamions(ca || []); setClients(cl || []); setGrignonClients(gc || [])
    setFournisseurs(fo || []); setGrignonFournisseurs(gf || []); setTypeBriques(tb || [])
    setAllGasoil(ag || [])
    setAllVoyages(av || [])
    setAllVoyageGasoilLinks(vgl || [])
  }

  async function loadVoyageData() {
    setLoading(true)
    const { data: v } = await supabase.from('voyages').select('*')
      .gte('date_depart', filters.from).lte('date_depart', filters.to)
      .order('date_depart', { ascending: false })
    const vList = v || []
    const vIds = vList.map(x => x.id)
    // Extra columns below (id, created_at, date_*, and a few descriptive
    // fields) are additive — every column computeVoyageProfit already reads
    // (qte, total_achat, total_vente, frais_total, montant, facture_client,
    // montant_location...) is untouched, so the engine's own math is
    // unaffected. They only feed the print report's itemized ledger
    // (lib/printRentabilite.js), which never recomputes a total — it just
    // displays these exact rows and lets them sum to the engine's totals.
    const [ac, li, ch, re, loc] = await Promise.all([
      fetchByVoyageIds('voyage_achats', 'id,voyage_id,type_produit,type_brique,fournisseur_id,fournisseur_nom,qte,prix_achat,total_achat,date_achat,created_at', vIds),
      fetchByVoyageIds('voyage_livraisons', 'id,voyage_id,type_produit,type_brique,client_id,client_nom,qte,prix_vente,total_vente,frais_total,date_livraison,created_at', vIds),
      fetchByVoyageIds('voyage_charges', 'id,voyage_id,montant,facture_client,client_id,client_nom,categorie,description,date_charge,created_at', vIds),
      fetchByVoyageIds('voyage_retours', 'id,voyage_id,montant,destination,client_nom,note,date_retour,created_at', vIds),
      fetchByVoyageIds('voyage_locations', 'id,voyage_id,montant_location,loueur_nom,note,created_at', vIds),
    ])
    const liIds = li.map(l => l.id).filter(Boolean)
    const lf = await fetchByColumnIds('voyage_livraison_frais', 'livraison_id', 'id,livraison_id,label,montant,kind,note,created_at', liIds)
    setVoyages(vList); setAchats(ac); setLivraisons(li); setCharges(ch)
    setRetours(re); setLocations(loc); setLivraisonFrais(lf)
    setLoading(false)
  }

  // Built ONCE per truck (not once per voyage) — see lib/services/profitability.js.
  // Every voyage below does a cheap Map lookup instead of rebuilding its
  // truck's whole purchase/voyage history from scratch.
  const fuelMapsByCamion = useMemo(() => buildFuelMapsByCamion({
    gasoil: allGasoil, voyages: allVoyages, voyageGasoilLinks: allVoyageGasoilLinks, remiseRate,
  }), [allGasoil, allVoyages, allVoyageGasoilLinks, remiseRate])

  // Per-purchase breakdown for the VoyageDrawer's fuel-cost transparency
  // panel (spec item 9) — same inputs as fuelMapsByCamion above, reading the
  // engine's own voyageContributions instead of discarding them.
  const fuelContributionsByVoyage = useMemo(() => buildVoyageFuelContributions({
    gasoil: allGasoil, voyages: allVoyages, voyageGasoilLinks: allVoyageGasoilLinks, remiseRate,
  }), [allGasoil, allVoyages, allVoyageGasoilLinks, remiseRate])

  const drivers = useMemo(() => [...new Set(voyages.map(v => v.chauffeur).filter(Boolean))].sort(), [voyages])

  // ── one filtering pass: every global filter is an "existence" filter that
  // decides whether a voyage is in scope at all — never strips line items out
  // of an in-scope voyage's own calculation (see plan: filtering by Client X
  // shows every voyage Client X appears on, with that voyage's FULL total —
  // isolating just X's share is what the "Par Client" tab's aggregation is for).
  const visibleVoyages = useMemo(() => {
    return voyages.filter(v => {
      if (filters.camionId && v.camion_id !== parseInt(filters.camionId)) return false
      if (filters.chauffeur && v.chauffeur !== filters.chauffeur) return false
      const myLivs = livraisons.filter(l => l.voyage_id === v.id)
      const myAch  = achats.filter(a => a.voyage_id === v.id)
      if (filters.typeProduit) {
        const has = myLivs.some(l => l.type_produit === filters.typeProduit) || myAch.some(a => a.type_produit === filters.typeProduit)
        if (!has) return false
      }
      if (filters.typeBrique) {
        const has = myLivs.some(l => l.type_brique === filters.typeBrique) || myAch.some(a => a.type_brique === filters.typeBrique)
        if (!has) return false
      }
      if (filters.clientKey) {
        const [tp, cid] = filters.clientKey.split(':')
        const has = myLivs.some(l => l.type_produit === tp && String(l.client_id) === cid)
                 || (tp === 'brique' && charges.some(c => c.voyage_id === v.id && c.facture_client && String(c.client_id) === cid))
        if (!has) return false
      }
      if (filters.supplierKey) {
        const [tp, sid] = filters.supplierKey.split(':')
        const has = myAch.some(a => a.type_produit === tp && String(a.fournisseur_id) === sid)
        if (!has) return false
      }
      return true
    })
  }, [voyages, livraisons, achats, charges, filters.camionId, filters.chauffeur, filters.typeProduit, filters.typeBrique, filters.clientKey, filters.supplierKey])

  // ── the ONE place computeVoyageProfit is called — every section below
  // reads this same memoized array, never recomputing per-voyage math. ──
  const results = useMemo(() => visibleVoyages.map(v => ({
    ...v,
    ...computeVoyageProfit({
      voyage: v,
      achats: achats.filter(a => a.voyage_id === v.id),
      livraisons: livraisons.filter(l => l.voyage_id === v.id),
      charges: charges.filter(c => c.voyage_id === v.id),
      retours: retours.filter(r => r.voyage_id === v.id),
      locations: locations.filter(l => l.voyage_id === v.id),
      voyageFuelMap: fuelMapsByCamion.get(v.camion_id) || new Map(),
      voyageGasoilLinks: allVoyageGasoilLinks,
    }),
  })), [visibleVoyages, achats, livraisons, charges, retours, locations, fuelMapsByCamion, allVoyageGasoilLinks])

  const resultById = useMemo(() => Object.fromEntries(results.map(r => [r.id, r])), [results])
  const drawerVoyage = drawerVoyageId ? resultById[drawerVoyageId] : null

  const options = { camions, clients, grignonClients, fournisseurs, grignonFournisseurs, typeBriques, drivers }

  return (
    <Layout title="Profitabilité" subtitle="Centre de rentabilité — une seule source de vérité">
      <div className="max-w-[1600px] mx-auto space-y-4">

        <FilterBar filters={filters} onChange={setFilters} options={options} />

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto flex-1">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition flex-shrink-0 ${
                  tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => printRentabiliteReport({ results, achats, livraisons, livraisonFrais, charges, retours, locations, filters, options })}
            disabled={loading}
            className="text-xs font-semibold px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition whitespace-nowrap disabled:opacity-50">
            🖨️ Imprimer / PDF
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-400 animate-pulse">Chargement...</div>
        ) : (
          <>
            {tab === 'overview'  && <Overview results={results} camions={camions} />}
            {tab === 'voyages'   && <ByVoyageSection results={results} onOpenVoyage={setDrawerVoyageId} />}
            {tab === 'trucks'    && <ByTruckSection results={results} camions={camions} onOpenVoyage={setDrawerVoyageId} />}
            {tab === 'clients'   && <ByClientSection results={results} onOpenVoyage={setDrawerVoyageId} />}
            {tab === 'suppliers' && <BySupplierSection achats={achats} results={results} onOpenVoyage={setDrawerVoyageId} />}
            {tab === 'timeline'  && <Timeline results={results} from={filters.from} to={filters.to} />}
          </>
        )}

        {drawerVoyage && (
          <VoyageDrawer voyage={drawerVoyage} onClose={() => setDrawerVoyageId(null)}
            contributions={fuelContributionsByVoyage.get(drawerVoyage.id)} />
        )}
      </div>
    </Layout>
  )
}
