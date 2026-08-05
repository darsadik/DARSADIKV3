import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmtDate, today, startOfMonth, fmtMoney } from '../../lib/utils'
import { computeVoyageProfit, DEFAULT_REMISE_CARBURANT_RATE } from '../../lib/services/profitability'
import { fetchRemiseCarburantRate } from '../../lib/services/settings'
import { computeVoyageValidation, voyageValidationStatus } from '../../lib/services/voyage/validation'
import { detectAnomalies, voyageReviewStatus } from '../../lib/services/review/anomalies'
import { setReviewed as dbSetReviewed } from '../../lib/services/voyage/review'
import { ProfitCell } from '../../components/voyage/StatusBadges'
import VoyageDetailPanel from '../../components/voyage/VoyageDetailPanel'

const STATUS_DOT   = { complete: '🟢', needs_review: '🟡', has_errors: '🔴' }
const STATUS_LABEL = { complete: 'Complet', needs_review: 'À vérifier', has_errors: 'Erreurs' }
const VALIDATION_META = {
  ok:      { icon: '✅', label: 'Validé',  cls: 'bg-emerald-900/60 text-emerald-300' },
  warning: { icon: '⚠️', label: 'Écarts',  cls: 'bg-amber-900/60 text-amber-300' },
  error:   { icon: '❌', label: 'Erreurs', cls: 'bg-red-900/60 text-red-300' },
}

export default function ReviewMode() {
  const { user } = useAuth()

  // ── raw data ──
  const [voyages,     setVoyages]     = useState([])
  const [achats,      setAchats]      = useState([])
  const [livraisons,  setLivraisons]  = useState([])
  const [retours,     setRetours]     = useState([])
  const [gasoilData,  setGasoilData]  = useState([])
  const [charges,     setCharges]     = useState([])
  const [locationsData, setLocationsData] = useState([])
  const [camions,     setCamions]     = useState([])
  const [clients,     setClients]     = useState([])
  const [allGasoil,   setAllGasoil]   = useState([])
  const [remiseRate,  setRemiseRate]  = useState(DEFAULT_REMISE_CARBURANT_RATE)
  const [loading,     setLoading]     = useState(true)

  // ── filters ──
  const [filterFrom,     setFilterFrom]     = useState(startOfMonth())
  const [filterTo,       setFilterTo]       = useState(today())
  const [filterCamion,   setFilterCamion]   = useState('')
  const [filterChauffeur,setFilterChauffeur]= useState('')
  const [filterClient,   setFilterClient]   = useState('')
  const [filterReviewed, setFilterReviewed] = useState('all') // 'all' | 'reviewed' | 'not_reviewed'
  const [errorsOnly,     setErrorsOnly]     = useState(false)

  const [selectedId, setSelectedId] = useState(null)
  const panelRef = useRef(null)

  useEffect(() => { loadAll(); fetchRemiseCarburantRate().then(setRemiseRate) }, [])

  async function loadAll() {
    setLoading(true)
    const [
      { data: v }, { data: ac }, { data: li }, { data: re }, { data: ga },
      { data: ch }, { data: ca }, { data: cl }, { data: loc }, { data: ag },
    ] = await Promise.all([
      supabase.from('voyages').select('*').is('deleted_at', null).order('date_depart', { ascending: false }),
      supabase.from('voyage_achats').select('voyage_id,type_produit,type_brique,total_achat,qte,prix_achat'),
      supabase.from('voyage_livraisons').select('voyage_id,type_produit,type_brique,client_id,client_nom,qte,total_vente,total_achat,frais_total'),
      supabase.from('voyage_retours').select('voyage_id,montant'),
      supabase.from('voyage_gasoil').select('voyage_id,gasoil_id'),
      supabase.from('voyage_charges').select('voyage_id,montant,facture_client,client_id,client_nom'),
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('clients').select('id,nom').order('nom'),
      supabase.from('voyage_locations').select('voyage_id,montant_location'),
      // No km filter: a no-km purchase can still be manually linked, and must
      // stay visible to lib/services/fuelAllocation.js.
      supabase.from('gasoil').select('camion_id,km,total,date,adblue_total,qte').order('km', { ascending: true }),
    ])
    setVoyages(v || [])
    setAchats(ac || [])
    setLivraisons(li || [])
    setRetours(re || [])
    setGasoilData(ga || [])
    setCharges(ch || [])
    setCamions(ca || [])
    setClients(cl || [])
    setLocationsData(loc || [])
    setAllGasoil(ag || [])
    setLoading(false)
  }

  const gasoilByCamion = useMemo(() => allGasoil.reduce((acc, g) => {
    if (!acc[g.camion_id]) acc[g.camion_id] = []
    acc[g.camion_id].push(g)
    return acc
  }, {}), [allGasoil])

  // ── one row per voyage: profit + anomalies + review status ──
  const rows = useMemo(() => voyages.map(v => {
    const myAchats     = achats.filter(a => a.voyage_id === v.id)
    const myLivraisons = livraisons.filter(l => l.voyage_id === v.id)
    const myGasoil      = gasoilData.filter(g => g.voyage_id === v.id)
    const result = computeVoyageProfit({
      voyage: v,
      achats: myAchats,
      livraisons: myLivraisons,
      charges: charges.filter(c => c.voyage_id === v.id),
      retours: retours.filter(r => r.voyage_id === v.id),
      locations: locationsData.filter(l => l.voyage_id === v.id),
      camionRefills: gasoilByCamion[v.camion_id] || [],
      camionVoyages: voyages.filter(vv => vv.camion_id === v.camion_id),
      voyageGasoilLinks: gasoilData,
      remiseRate,
    })
    const anomalies = detectAnomalies({ voyage: v, achats: myAchats, livraisons: myLivraisons, gasoil: myGasoil, result })
    const status = voyageReviewStatus({ reviewed_at: v.reviewed_at, anomalies })
    const validationStatus = voyageValidationStatus(computeVoyageValidation(myAchats, myLivraisons))
    const clientNoms = [...new Set(myLivraisons.map(l => l.client_nom).filter(Boolean))]
    return { voyage: v, result, anomalies, status, validationStatus, clientNoms }
  }), [voyages, achats, livraisons, charges, retours, locationsData, gasoilData, gasoilByCamion, remiseRate])

  // ── patch a single row after VoyageDetailPanel saves — no list refetch ──
  const patchRow = useCallback((voyage, result, sections = {}) => {
    const { achats: a = [], livraisons: l = [], gasoil: g = [], charges: c = [], retours: r = [], locations: loc = [] } = sections
    const rescope = arr => arr.map(x => ({ ...x, voyage_id: voyage.id }))
    setVoyages(prev => prev.map(v => v.id === voyage.id ? voyage : v))
    setAchats(prev => [...prev.filter(x => x.voyage_id !== voyage.id), ...rescope(a)])
    setLivraisons(prev => [...prev.filter(x => x.voyage_id !== voyage.id), ...rescope(l)])
    setGasoilData(prev => [...prev.filter(x => x.voyage_id !== voyage.id), ...rescope(g)])
    setCharges(prev => [...prev.filter(x => x.voyage_id !== voyage.id), ...rescope(c)])
    setRetours(prev => [...prev.filter(x => x.voyage_id !== voyage.id), ...rescope(r)])
    setLocationsData(prev => [...prev.filter(x => x.voyage_id !== voyage.id), ...rescope(loc)])
  }, [])

  const filteredRows = useMemo(() => rows.filter(({ voyage: v, status }) => {
    if (filterFrom && v.date_depart < filterFrom) return false
    if (filterTo   && v.date_depart > filterTo)   return false
    if (filterCamion && v.camion_id !== parseInt(filterCamion)) return false
    if (filterChauffeur && !(v.chauffeur || '').toLowerCase().includes(filterChauffeur.toLowerCase())) return false
    if (filterClient) {
      const has = livraisons.some(l => l.voyage_id === v.id && l.client_id === parseInt(filterClient))
      if (!has) return false
    }
    if (filterReviewed === 'reviewed'     && !v.reviewed_at) return false
    if (filterReviewed === 'not_reviewed' && v.reviewed_at)  return false
    if (errorsOnly && status !== 'has_errors') return false
    return true
  }), [rows, filterFrom, filterTo, filterCamion, filterChauffeur, filterClient, filterReviewed, errorsOnly, livraisons])

  // ── keep selection valid as filters change ──
  useEffect(() => {
    if (filteredRows.length === 0) { setSelectedId(null); return }
    if (!filteredRows.some(r => r.voyage.id === selectedId)) setSelectedId(filteredRows[0].voyage.id)
  }, [filteredRows])

  const selIdx    = filteredRows.findIndex(r => r.voyage.id === selectedId)
  const selectedRow= selIdx >= 0 ? filteredRows[selIdx] : null
  const prevRow    = selIdx > 0 ? filteredRows[selIdx - 1] : null
  const nextRow    = selIdx >= 0 && selIdx < filteredRows.length - 1 ? filteredRows[selIdx + 1] : null

  // ── keyboard navigation ──────────────────────────────────────────────────
  // ← / → move through the filtered queue, Space toggles Reviewed, Ctrl+S
  // saves whichever add-form is currently open inside VoyageDetailPanel (via
  // its saveActive() — the exact same handler its own "Enregistrer" button
  // calls, so there is still only one save path).
  useEffect(() => {
    function onKeyDown(e) {
      if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        panelRef.current?.saveActive()
        return
      }
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return
      if (e.key === 'ArrowLeft'  && prevRow) setSelectedId(prevRow.voyage.id)
      if (e.key === 'ArrowRight' && nextRow) setSelectedId(nextRow.voyage.id)
      if (e.key === ' ' && selectedRow) { e.preventDefault(); toggleReviewed(selectedRow.voyage) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [prevRow, nextRow, selectedRow])

  async function toggleReviewed(v) {
    const next = !v.reviewed_at
    setVoyages(prev => prev.map(x => x.id === v.id ? { ...x, reviewed_at: next ? new Date().toISOString() : null, reviewed_by: next ? (user?.email || null) : null } : x))
    await dbSetReviewed(v.id, next, user?.email)
  }

  // ── dashboard stats ──
  const stats = useMemo(() => ({
    total:     filteredRows.length,
    reviewed:  filteredRows.filter(r => r.voyage.reviewed_at).length,
    errors:    filteredRows.filter(r => r.status === 'has_errors').length,
  }), [filteredRows])

  return (
    <Layout title="Mode Révision" subtitle="Audit mensuel des voyages">
      <div className="flex gap-4 items-stretch" style={{ height: 'calc(100vh - 7.5rem)' }}>

        {/* ── LEFT: filters + queue ── */}
        <div className="hidden md:flex flex-col w-80 flex-shrink-0 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-100 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50" />
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50" />
            </div>
            <select value={filterCamion} onChange={e => setFilterCamion(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50">
              <option value="">Tous les camions</option>
              {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}{c.chauffeur ? ` — ${c.chauffeur}` : ''}</option>)}
            </select>
            <input type="text" value={filterChauffeur} onChange={e => setFilterChauffeur(e.target.value)}
              placeholder="Chauffeur…"
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50" />
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50">
              <option value="">Tous les clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <select value={filterReviewed} onChange={e => setFilterReviewed(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50">
              <option value="all">Tous</option>
              <option value="reviewed">Revus</option>
              <option value="not_reviewed">Non revus</option>
            </select>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 px-0.5">
              <input type="checkbox" checked={errorsOnly} onChange={e => setErrorsOnly(e.target.checked)} />
              🔴 Erreurs uniquement
            </label>
          </div>

          <div className="grid grid-cols-3 gap-1 px-3 py-2 border-b border-slate-100 bg-slate-50 text-center">
            <div><div className="text-sm font-black text-slate-800">{stats.total}</div><div className="text-[9px] text-slate-400 uppercase">Total</div></div>
            <div><div className="text-sm font-black text-emerald-600">{stats.reviewed}</div><div className="text-[9px] text-slate-400 uppercase">Revus</div></div>
            <div><div className="text-sm font-black text-red-500">{stats.errors}</div><div className="text-[9px] text-slate-400 uppercase">Erreurs</div></div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {loading && <div className="text-center text-xs text-slate-400 py-8">Chargement...</div>}
            {!loading && filteredRows.length === 0 && <div className="text-center text-xs text-slate-400 py-8">Aucun voyage</div>}
            {filteredRows.map(({ voyage: v, result, status, clientNoms }) => {
              const isActive = v.id === selectedId
              return (
                <button key={v.id} onClick={() => setSelectedId(v.id)}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${isActive ? 'bg-blue-600' : 'hover:bg-blue-50/60'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className={`font-bold text-xs leading-tight ${isActive ? 'text-white' : 'text-slate-800'}`}>
                      {v.reference || `#${v.id}`} · {fmtDate(v.date_depart)}
                    </div>
                    <span title={STATUS_LABEL[status]}>{STATUS_DOT[status]}</span>
                  </div>
                  <div className={`text-[10px] mt-0.5 ${isActive ? 'text-blue-200' : 'text-slate-400'}`}>
                    {v.camion_plaque}{v.chauffeur ? ` · ${v.chauffeur}` : ''}
                  </div>
                  {clientNoms.length > 0 && (
                    <div className={`text-[10px] mt-0.5 truncate ${isActive ? 'text-blue-200' : 'text-slate-400'}`}>
                      {clientNoms.join(', ')}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-1">
                    <div className={isActive ? 'text-white' : ''}>
                      {isActive
                        ? <span className={`font-black text-sm ${result.profit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{result.profit >= 0 ? '+' : ''}{fmtMoney(result.profit)}</span>
                        : <ProfitCell v={result.profit} />}
                    </div>
                    <label className="flex items-center gap-1 text-[10px]" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={!!v.reviewed_at} onChange={() => toggleReviewed(v)} />
                      <span className={isActive ? 'text-blue-200' : 'text-slate-400'}>Revu</span>
                    </label>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── RIGHT: existing Voyage Detail component — this IS /voyages/[id] ── */}
        <div className="flex-1 min-w-0 overflow-y-auto space-y-3">
          {selectedRow && (
            <div className="bg-slate-800 text-white rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 sticky top-0 z-30 shadow-lg">
              <button onClick={() => prevRow && setSelectedId(prevRow.voyage.id)} disabled={!prevRow}
                className="text-xs font-bold text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg hover:bg-white/10 transition">
                ← Précédent
              </button>

              <div className="flex items-center gap-2 flex-wrap justify-center text-xs">
                <span className="font-bold text-slate-300">{selIdx + 1} / {filteredRows.length}</span>

                <span title={STATUS_LABEL[selectedRow.status]}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full font-bold bg-white/10">
                  {STATUS_DOT[selectedRow.status]} {STATUS_LABEL[selectedRow.status]}
                </span>

                <span title={selectedRow.anomalies.length ? selectedRow.anomalies.map(a => a.label).join('\n') : 'Aucune donnée manquante'}
                  className={`px-2 py-0.5 rounded-full font-bold ${selectedRow.anomalies.length ? 'bg-red-900/60 text-red-300' : 'bg-emerald-900/60 text-emerald-300'}`}>
                  {selectedRow.anomalies.length ? `⚠ ${selectedRow.anomalies.length} manquant(s)` : '✓ Complet'}
                </span>

                <span title="Validation achats/livraisons" className={`px-2 py-0.5 rounded-full font-bold ${VALIDATION_META[selectedRow.validationStatus].cls}`}>
                  {VALIDATION_META[selectedRow.validationStatus].icon} {VALIDATION_META[selectedRow.validationStatus].label}
                </span>

                <label className="flex items-center gap-1.5 font-semibold px-2 py-0.5 rounded-full bg-white/10 cursor-pointer">
                  <input type="checkbox" checked={!!selectedRow.voyage.reviewed_at} onChange={() => toggleReviewed(selectedRow.voyage)} />
                  ☑ Revu
                </label>
              </div>

              <button onClick={() => nextRow && setSelectedId(nextRow.voyage.id)} disabled={!nextRow}
                className="text-xs font-bold text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg hover:bg-white/10 transition">
                Suivant →
              </button>
            </div>
          )}

          {selectedId
            ? <VoyageDetailPanel ref={panelRef} voyageId={selectedId} embedded onSaved={patchRow} />
            : <div className="text-center py-20 text-slate-400">Sélectionnez un voyage à gauche</div>}
        </div>
      </div>
    </Layout>
  )
}
