import { useState, useEffect, useMemo } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { computeVoyageProfit } from '../../lib/services/profitability'
import FilterBar, { DEFAULT_FILTERS } from '../../components/profitability/FilterBar'
import Overview from '../../components/profitability/Overview'
import ByVoyageSection from '../../components/profitability/ByVoyageSection'
import ByTruckSection from '../../components/profitability/ByTruckSection'
import ByClientSection from '../../components/profitability/ByClientSection'
import BySupplierSection from '../../components/profitability/BySupplierSection'
import Timeline from '../../components/profitability/Timeline'
import VoyageDrawer from '../../components/profitability/VoyageDrawer'

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
async function fetchByVoyageIds(table, select, ids) {
  if (!ids.length) return []
  const groups = chunk(ids, 200)
  const pages = await Promise.all(groups.map(g => supabase.from(table).select(select).in('voyage_id', g)))
  return pages.flatMap(p => p.data || [])
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
  const [voyageGasoil, setVoyageGasoil] = useState([])

  // Fuel-cycle refills: NEVER scope this by the selected date range — a
  // voyage's bracketing refill (before/after its km) can fall outside the
  // period, and kmFuelCost needs the full chain to resolve automatic mode.
  const [allGasoil, setAllGasoil] = useState([])

  // ── filter-dropdown option lists (fetched once, independent of filters) ──
  const [camions,             setCamions]             = useState([])
  const [clients,             setClients]             = useState([])
  const [grignonClients,      setGrignonClients]      = useState([])
  const [fournisseurs,        setFournisseurs]        = useState([])
  const [grignonFournisseurs, setGrignonFournisseurs] = useState([])
  const [typeBriques,         setTypeBriques]         = useState([])

  useEffect(() => { loadOptions() }, [])
  useEffect(() => { loadVoyageData() }, [filters.from, filters.to])

  async function loadOptions() {
    const [{ data: ca }, { data: cl }, { data: gc }, { data: fo }, { data: gf }, { data: tb }, { data: ag }] = await Promise.all([
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('clients').select('id,nom').order('nom'),
      supabase.from('grignon_clients').select('id,nom').order('nom'),
      supabase.from('fournisseurs').select('id,nom').order('nom'),
      supabase.from('grignon_fournisseurs').select('id,nom').order('nom'),
      supabase.from('type_briques').select('id,nom').order('nom'),
      supabase.from('gasoil').select('camion_id,km,total,date,adblue_total').not('km', 'is', null).order('km', { ascending: true }),
    ])
    setCamions(ca || []); setClients(cl || []); setGrignonClients(gc || [])
    setFournisseurs(fo || []); setGrignonFournisseurs(gf || []); setTypeBriques(tb || [])
    setAllGasoil(ag || [])
  }

  async function loadVoyageData() {
    setLoading(true)
    const { data: v } = await supabase.from('voyages').select('*')
      .gte('date_depart', filters.from).lte('date_depart', filters.to)
      .order('date_depart', { ascending: false })
    const vList = v || []
    const vIds = vList.map(x => x.id)
    const [ac, li, ch, re, loc, vg] = await Promise.all([
      fetchByVoyageIds('voyage_achats', 'id,voyage_id,type_produit,type_brique,fournisseur_id,fournisseur_nom,qte,prix_achat,total_achat', vIds),
      fetchByVoyageIds('voyage_livraisons', 'voyage_id,type_produit,type_brique,client_id,client_nom,qte,total_vente,frais_total', vIds),
      fetchByVoyageIds('voyage_charges', 'voyage_id,montant,facture_client,client_id,client_nom,categorie', vIds),
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
      camionRefills: gasoilByCamion[v.camion_id] || [],
      voyageGasoilRows: voyageGasoil.filter(g => g.voyage_id === v.id),
    }),
  })), [visibleVoyages, achats, livraisons, charges, retours, locations, gasoilByCamion, voyageGasoil])

  const resultById = useMemo(() => Object.fromEntries(results.map(r => [r.id, r])), [results])
  const drawerVoyage = drawerVoyageId ? resultById[drawerVoyageId] : null

  const options = { camions, clients, grignonClients, fournisseurs, grignonFournisseurs, typeBriques, drivers }

  return (
    <Layout title="Profitabilité" subtitle="Centre de rentabilité — une seule source de vérité">
      <div className="max-w-[1600px] mx-auto space-y-4">

        <FilterBar filters={filters} onChange={setFilters} options={options} />

        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition flex-shrink-0 ${
                tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t.label}
            </button>
          ))}
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

        {drawerVoyage && <VoyageDrawer voyage={drawerVoyage} onClose={() => setDrawerVoyageId(null)} />}
      </div>
    </Layout>
  )
}
