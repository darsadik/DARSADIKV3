import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmtMoney, fmtDate, today, startOfMonth, useIsMobile, openPrintWindow } from '../../lib/utils'
import { printBaseCss, printHeader, printGeneratedDate, totalsRow, soldeFinal, printFooter } from '../../lib/printLayout'
import { fetchCaisseSoldeInitial, saveCaisseSoldeInitial } from '../../lib/services/settings'
import {
  buildCaisseEntries, withRunningBalance, runCaisseAudit,
  CAISSE_SORTIE_CATEGORIES, CAISSE_ENTREE_SUGGESTIONS, CAISSE_MOVEMENT_TYPES,
} from '../../lib/services/caisse'

const emptyManualForm = () => ({ date: today(), montant: '', categorie: '', description: '' })

export default function Caisse() {
  const { user } = useAuth()
  const router = useRouter()
  const isMobile = useIsMobile()

  // ── DATA ──
  const [paiements, setPaiements] = useState([])
  const [voyageCharges, setVoyageCharges] = useState([])
  const [grignonPaiements, setGrignonPaiements] = useState([])
  const [manualEntries, setManualEntries] = useState([])
  const [soldeInitial, setSoldeInitial] = useState(0)
  const [loading, setLoading] = useState(true)

  // ── FILTERS ──
  const [filterFrom, setFilterFrom] = useState(startOfMonth())
  const [filterTo, setFilterTo] = useState(today())
  const [filterDirection, setFilterDirection] = useState('all') // 'all' | 'entree' | 'sortie'
  const [filterType, setFilterType] = useState('')

  // ── MANUAL ENTRY FORM ──
  const [manualDirection, setManualDirection] = useState(null) // 'entree' | 'sortie' | null (closed)
  const [manualForm, setManualForm] = useState(emptyManualForm())
  const [editingManualId, setEditingManualId] = useState(null)
  const [savingManual, setSavingManual] = useState(false)

  // ── SOLDE INITIAL EDIT ──
  const [editingSolde, setEditingSolde] = useState(false)
  const [soldeInput, setSoldeInput] = useState('0')

  // ── AUDIT ──
  const [showAudit, setShowAudit] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: pa }, { data: vc }, { data: gp }, { data: me }, ini] = await Promise.all([
      supabase.from('paiements').select('*').eq('mode', 'Espèce').order('date', { ascending: true }),
      supabase.from('voyage_charges').select('*, voyages(id, reference, date_depart, camion_plaque)').order('date_charge', { ascending: true }),
      supabase.from('grignon_paiements').select('*').eq('mode', 'Espèce').order('date', { ascending: true }),
      supabase.from('caisse_manual').select('*').order('date', { ascending: true }),
      fetchCaisseSoldeInitial(),
    ])
    setPaiements(pa || [])
    setVoyageCharges(vc || [])
    setGrignonPaiements(gp || [])
    setManualEntries(me || [])
    setSoldeInitial(ini)
    setSoldeInput(String(ini))
    setLoading(false)
  }

  // ── LEDGER (full history — Solde column always correct regardless of filters) ──
  const allEntries = useMemo(() => withRunningBalance(
    buildCaisseEntries({ paiements, voyageCharges, grignonPaiements, manualEntries }),
    soldeInitial
  ), [paiements, voyageCharges, grignonPaiements, manualEntries, soldeInitial])

  const soldeActuel = allEntries.length > 0 ? allEntries[allEntries.length - 1].solde : soldeInitial

  const filteredEntries = useMemo(() => allEntries.filter(e => {
    if (filterFrom && e.date < filterFrom) return false
    if (filterTo && e.date > filterTo) return false
    if (filterDirection !== 'all' && e.direction !== filterDirection) return false
    if (filterType && e.type !== filterType) return false
    return true
  }), [allEntries, filterFrom, filterTo, filterDirection, filterType])

  const totalEntreesPeriode = filteredEntries.filter(e => e.direction === 'entree').reduce((s, e) => s + e.montant, 0)
  const totalSortiesPeriode = filteredEntries.filter(e => e.direction === 'sortie').reduce((s, e) => s + e.montant, 0)

  // Balance carried into the filtered period — the last movement strictly
  // before filterFrom, or the global solde initial if none.
  const soldeDepartPeriode = useMemo(() => {
    if (!filterFrom) return soldeInitial
    const before = allEntries.filter(e => e.date < filterFrom)
    return before.length > 0 ? before[before.length - 1].solde : soldeInitial
  }, [allEntries, filterFrom, soldeInitial])

  const soldeFinPeriode = filteredEntries.length > 0 ? filteredEntries[filteredEntries.length - 1].solde : soldeDepartPeriode

  // ── SOLDE INITIAL ──
  async function saveSolde() {
    const v = parseFloat(soldeInput) || 0
    await saveCaisseSoldeInitial(v)
    setSoldeInitial(v)
    setEditingSolde(false)
  }

  // ── MANUAL ENTRY CRUD ──
  function openManualForm(direction) {
    setManualDirection(direction)
    setManualForm(emptyManualForm())
    setEditingManualId(null)
  }
  function closeManualForm() {
    setManualDirection(null)
    setManualForm(emptyManualForm())
    setEditingManualId(null)
  }
  function editManual(e) {
    setManualDirection(e.direction)
    setManualForm({ date: e.date, montant: String(e.montant), categorie: e.source === '—' ? '' : e.source, description: e.description === '—' ? '' : e.description })
    setEditingManualId(e.originId)
  }

  async function saveManual(ev) {
    ev.preventDefault()
    const montant = parseFloat(manualForm.montant) || 0
    if (!montant || !manualForm.date) return
    setSavingManual(true)
    try {
      const payload = {
        date: manualForm.date,
        direction: manualDirection,
        montant,
        categorie: manualForm.categorie || null,
        description: manualForm.description || null,
        updated_at: new Date().toISOString(),
      }
      if (editingManualId) {
        const { error } = await supabase.from('caisse_manual').update(payload).eq('id', editingManualId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('caisse_manual').insert(payload)
        if (error) throw error
      }
      closeManualForm()
      loadAll()
    } catch (err) {
      alert('Erreur enregistrement mouvement: ' + err.message)
    } finally {
      setSavingManual(false)
    }
  }

  async function deleteManual(id) {
    if (!confirm('Supprimer ce mouvement ?')) return
    await supabase.from('caisse_manual').delete().eq('id', id)
    loadAll()
  }

  function goToOrigin(e) {
    if (e.origin === 'voyage_charge' && e.voyageId) router.push(`/voyages/${e.voyageId}`)
    else router.push('/paiements')
  }

  // ── AUDIT ──
  const audit = useMemo(() => runCaisseAudit({
    paiements, voyageCharges, grignonPaiements, manualEntries, soldeInitial,
  }), [paiements, voyageCharges, grignonPaiements, manualEntries, soldeInitial])

  // ── PRINT ──
  function printCaisse() {
    const printDate = printGeneratedDate()
    const accent = '#1e3a5f'
    const periode = `${fmtDate(filterFrom)} → ${fmtDate(filterTo)}`
    const activeFilters = [
      filterDirection !== 'all' ? (filterDirection === 'entree' ? 'Entrées uniquement' : 'Sorties uniquement') : null,
      filterType || null,
    ].filter(Boolean).join(' · ')

    const rows = filteredEntries.map(e => `<tr>
      <td class="m" style="white-space:nowrap">${fmtDate(e.date)}</td>
      <td class="m">${e.type}${!e.auto ? ' <span style="color:#94a3b8">(Manuel)</span>' : ''}</td>
      <td>${e.source}</td>
      <td class="m">${e.description}</td>
      <td class="r" style="color:#16a34a;font-weight:800">${e.direction === 'entree' ? fmtMoney(e.montant) : '—'}</td>
      <td class="r" style="color:#dc2626;font-weight:800">${e.direction === 'sortie' ? fmtMoney(e.montant) : '—'}</td>
      <td class="r" style="font-weight:800">${fmtMoney(e.solde)}</td>
    </tr>`).join('')

    openPrintWindow(`<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Caisse — DAR SADIK</title>
<style>
${printBaseCss(accent)}
  .periode-bar{padding:13px 24px;border-bottom:2px solid #e2e8f0;font-size:13px;color:#1e293b;font-weight:600}
  .periode-bar strong{color:${accent};font-weight:800}
  .periode-bar .filt{color:#64748b;font-weight:600;font-size:11.5px;margin-left:10px}
</style></head><body>
${printHeader({ date: printDate })}
<div class="periode-bar">CAISSE — SUIVI DES MOUVEMENTS &nbsp;·&nbsp; Période : <strong>${periode}</strong>${activeFilters ? `<span class="filt">Filtres : ${activeFilters}</span>` : ''}</div>
<div class="bdy">
<table>
  <thead><tr>
    <th>Date</th><th>Type</th><th>Source</th><th>Description</th><th class="r">Entrée</th><th class="r">Sortie</th><th class="r">Solde</th>
  </tr></thead>
  <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#94a3b8">Aucun mouvement</td></tr>'}</tbody>
</table>
${totalsRow('Solde de départ (période)', `${fmtMoney(soldeDepartPeriode)} DHS`)}
${totalsRow('Total entrées (période)', `${fmtMoney(totalEntreesPeriode)} DHS`)}
${totalsRow('Total sorties (période)', `${fmtMoney(totalSortiesPeriode)} DHS`)}
${soldeFinal({ label: 'Solde final (fin de période)', amountFormatted: fmtMoney(soldeFinPeriode), amount: soldeFinPeriode })}
${printFooter(printDate)}
</div></body></html>`)
  }

  const ManualForm = (
    <form onSubmit={saveManual} className="card mb-4 space-y-3" style={{ borderLeft: `4px solid ${manualDirection === 'entree' ? '#16a34a' : '#dc2626'}` }}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          {editingManualId ? 'Modifier' : 'Nouveau'} — {manualDirection === 'entree' ? '💰 Autre entrée' : '💸 Autre dépense'}
        </h3>
        <button type="button" onClick={closeManualForm} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Date</label>
          <input className="input" type="date" value={manualForm.date} onChange={e => setManualForm({ ...manualForm, date: e.target.value })} required /></div>
        <div><label className="label">Montant (DHS)</label>
          <input className="input" type="number" step="0.01" value={manualForm.montant} onChange={e => setManualForm({ ...manualForm, montant: e.target.value })} required /></div>
      </div>
      {manualDirection === 'entree' ? (
        <div><label className="label">Source</label>
          <input className="input" list="caisse-entree-sources" placeholder="Ex: Avance, Remboursement..."
            value={manualForm.categorie} onChange={e => setManualForm({ ...manualForm, categorie: e.target.value })} />
          <datalist id="caisse-entree-sources">
            {CAISSE_ENTREE_SUGGESTIONS.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>
      ) : (
        <div><label className="label">Type / Catégorie</label>
          <select className="input" value={manualForm.categorie} onChange={e => setManualForm({ ...manualForm, categorie: e.target.value })}>
            <option value="">Sélectionner...</option>
            {CAISSE_SORTIE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}
      <div><label className="label">Description / Note</label>
        <input className="input" value={manualForm.description} onChange={e => setManualForm({ ...manualForm, description: e.target.value })} /></div>
      <button type="submit" disabled={savingManual} className={manualDirection === 'entree' ? 'btn-success w-full justify-center' : 'btn-danger w-full justify-center'}>
        {savingManual ? 'Enregistrement...' : editingManualId ? '✓ Modifier' : '✓ Enregistrer'}
      </button>
    </form>
  )

  return (
    <Layout title="Caisse" subtitle="Suivi de la trésorerie physique de l'entreprise">
      {/* SOLDE ACTUEL — always visible, always the true unfiltered current balance */}
      <div className="card mb-6" style={{ background: '#0f172a', color: '#fff' }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#94a3b8' }}>Solde Caisse actuel</div>
            <div className="text-4xl font-black mt-1" style={{ color: soldeActuel >= 0 ? '#4ade80' : '#f87171' }}>
              {fmtMoney(soldeActuel)} <span className="text-lg font-semibold">DHS</span>
            </div>
          </div>
          <div className="text-right text-xs" style={{ color: '#94a3b8' }}>
            {editingSolde ? (
              <div className="flex items-center gap-2">
                <input className="input" style={{ width: 140, color: '#0f172a' }} type="number" step="0.01" value={soldeInput} onChange={e => setSoldeInput(e.target.value)} />
                <button onClick={saveSolde} className="btn-success text-xs px-3 py-1.5">✓</button>
                <button onClick={() => { setEditingSolde(false); setSoldeInput(String(soldeInitial)) }} className="btn-secondary text-xs px-3 py-1.5">✕</button>
              </div>
            ) : (
              <div>
                Solde initial : <b style={{ color: '#e2e8f0' }}>{fmtMoney(soldeInitial)} DHS</b>
                <button onClick={() => setEditingSolde(true)} className="ml-2 underline">✎ Modifier</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="stat-card border border-green-100 bg-green-50">
          <div className="stat-label text-green-600">Total entrées</div>
          <div className="stat-value text-green-700">{fmtMoney(totalEntreesPeriode)} DHS</div>
          <div className="stat-sub">Période sélectionnée</div>
        </div>
        <div className="stat-card border border-red-100 bg-red-50">
          <div className="stat-label text-red-600">Total sorties</div>
          <div className="stat-value text-red-700">{fmtMoney(totalSortiesPeriode)} DHS</div>
          <div className="stat-sub">Période sélectionnée</div>
        </div>
        <div className="stat-card border border-gray-200 bg-gray-50">
          <div className="stat-label text-gray-600">Mouvements</div>
          <div className="stat-value text-gray-700">{filteredEntries.length}</div>
          <div className="stat-sub">Période sélectionnée</div>
        </div>
      </div>

      {/* ACTIONS */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => openManualForm('entree')} className="btn-success text-sm px-4 py-2">+ Ajouter une entrée</button>
        <button onClick={() => openManualForm('sortie')} className="btn-danger text-sm px-4 py-2">+ Ajouter une sortie</button>
        <button onClick={printCaisse} className="btn-primary text-sm px-4 py-2" style={{ background: '#4f46e5' }}>🖨️ Imprimer / PDF</button>
        <button onClick={() => setShowAudit(!showAudit)} className="btn-secondary text-sm px-4 py-2">
          {showAudit ? '▲ Fermer audit' : '🔍 Vérifier la cohérence'}
        </button>
      </div>

      {manualDirection && ManualForm}

      {showAudit && (
        <div className="card mb-4">
          <h3 className="font-semibold text-gray-900 mb-2">Audit de cohérence Caisse</h3>
          <p className="text-xs text-gray-500 mb-3">
            Les mouvements automatiques (Paiement client, Paiement client Grignon, Paiement fournisseur, Charge Voyage) sont recalculés à chaque chargement directement depuis leurs tables sources — aucune copie n'est stockée, donc ni doublon ni désynchronisation possible sur ces mouvements. Cet audit vérifie la qualité des données sources et les saisies manuelles.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4 text-xs">
            <div className="bg-gray-50 rounded-lg p-2 text-center"><div className="font-bold text-gray-800">{audit.counts.paiementsEspece}</div><div className="text-gray-400">Paiements Espèce</div></div>
            <div className="bg-gray-50 rounded-lg p-2 text-center"><div className="font-bold text-gray-800">{audit.counts.grignonPaiementsEspece}</div><div className="text-gray-400">Paiements Grignon</div></div>
            <div className="bg-gray-50 rounded-lg p-2 text-center"><div className="font-bold text-gray-800">{audit.counts.voyageCharges}</div><div className="text-gray-400">Charges Voyage</div></div>
            <div className="bg-gray-50 rounded-lg p-2 text-center"><div className="font-bold text-gray-800">{audit.counts.manualEntries}</div><div className="text-gray-400">Manuels</div></div>
            <div className="bg-gray-50 rounded-lg p-2 text-center"><div className="font-bold text-gray-800">{audit.counts.totalMovements}</div><div className="text-gray-400">Total mouvements</div></div>
          </div>
          {audit.findings.length === 0 ? (
            <div className="text-sm text-green-700 bg-green-50 rounded-lg p-3">✅ Aucune anomalie détectée.</div>
          ) : (
            <div className="space-y-2">
              {audit.findings.map((f, i) => (
                <div key={i} className={`text-xs rounded-lg p-2.5 ${f.severity === 'error' ? 'bg-red-50 text-red-700' : f.severity === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                  {f.severity === 'error' ? '🛑' : f.severity === 'warn' ? '⚠️' : 'ℹ️'} {f.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FILTERS */}
      <div className="card mb-4">
        <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-5'} gap-3 items-end`}>
          <div><label className="label">Date début</label>
            <input type="date" className="input" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} /></div>
          <div><label className="label">Date fin</label>
            <input type="date" className="input" value={filterTo} onChange={e => setFilterTo(e.target.value)} /></div>
          <div><label className="label">Mouvement</label>
            <select className="input" value={filterDirection} onChange={e => setFilterDirection(e.target.value)}>
              <option value="all">Toutes</option>
              <option value="entree">Entrées</option>
              <option value="sortie">Sorties</option>
            </select></div>
          <div><label className="label">Type / Source</label>
            <select className="input" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">Tous</option>
              {CAISSE_MOVEMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select></div>
          <button onClick={() => { setFilterFrom(startOfMonth()); setFilterTo(today()); setFilterDirection('all'); setFilterType('') }}
            className="btn-secondary text-xs justify-center">↺ Réinitialiser</button>
        </div>
      </div>

      {/* CHRONOLOGICAL TABLE */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              <th className="th">Date</th>
              <th className="th">Type</th>
              <th className="th">Source</th>
              <th className="th">Description</th>
              <th className="th text-right">Entrée</th>
              <th className="th text-right">Sortie</th>
              <th className="th text-right">Solde</th>
              <th className="th"></th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="td text-center text-gray-400 py-10">Chargement...</td></tr>
              ) : filteredEntries.length === 0 ? (
                <tr><td colSpan={8} className="td text-center text-gray-400 py-10">Aucun mouvement pour cette période</td></tr>
              ) : filteredEntries.map(e => (
                <tr key={e.key} className="hover:bg-gray-50">
                  <td className="td text-gray-500 whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="td">
                    <span className="text-xs font-semibold">{e.type}</span>
                    {!e.auto && <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Manuel</span>}
                  </td>
                  <td className="td text-sm">{e.source}</td>
                  <td className="td text-gray-500 text-xs">{e.description}</td>
                  <td className="td text-right font-bold text-green-600">{e.direction === 'entree' ? `+${fmtMoney(e.montant)}` : '—'}</td>
                  <td className="td text-right font-bold text-red-600">{e.direction === 'sortie' ? `−${fmtMoney(e.montant)}` : '—'}</td>
                  <td className="td text-right font-bold">{fmtMoney(e.solde)}</td>
                  <td className="td whitespace-nowrap">
                    {e.auto ? (
                      <button onClick={() => goToOrigin(e)} className="text-xs text-blue-500 hover:underline">→ Voir</button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => editManual(e)} className="text-xs text-blue-500 hover:underline">✎</button>
                        <button onClick={() => deleteManual(e.originId)} className="text-xs text-red-500 hover:underline">✕</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {filteredEntries.length > 0 && (
              <tfoot><tr>
                <td className="tfoot-td" colSpan={4}>TOTAL ({filteredEntries.length})</td>
                <td className="tfoot-td text-right text-green-600">{fmtMoney(totalEntreesPeriode)} DHS</td>
                <td className="tfoot-td text-right text-red-600">{fmtMoney(totalSortiesPeriode)} DHS</td>
                <td className="tfoot-td text-right">{fmtMoney(soldeFinPeriode)} DHS</td>
                <td className="tfoot-td"></td>
              </tr></tfoot>
            )}
          </table>
        </div>
      </div>
    </Layout>
  )
}
