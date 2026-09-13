// ── CAISSE — company cash-flow tracking ──────────────────────────────────────
// Additional cash-flow layer on top of existing accounting (clients,
// fournisseurs, grignon, voyages). Never replaces or duplicates them.
//
// Automatic movements (client cash payments, supplier cash payments, voyage
// charges) are computed LIVE from their existing source tables every time
// this is called — never copied into a stored Caisse row. This is what makes
// edits/deletes on the source (paiements, grignon_paiements, voyage_charges)
// reflect in Caisse immediately with zero sync code, and makes duplicate
// automatic movements structurally impossible (there is nothing to duplicate:
// the "movement" IS the source row, rendered).
//
// Only movements with no other source of truth — manual "Autre entrée" /
// "Autre dépense" — are stored, in `caisse_manual` (sql/25_caisse.sql).

export const CAISSE_SORTIE_CATEGORIES = [
  'Bureau', 'Réparation', 'Téléphone', 'Administration', 'Petit achat', 'Transport', 'Autre dépense',
]

// Free-text suggestions only (spec: "Source" is a plain text field on manual
// entrées, these examples are not an enum).
export const CAISSE_ENTREE_SUGGESTIONS = ['Avance', 'Remboursement', 'Autre']

const OUT_TYPE_LABELS = {
  fourn_brique: 'Paiement fournisseur (Brique)',
  fourn_grignon: 'Paiement fournisseur (Grignon)',
  gasoil: 'Paiement fournisseur (Carburant)',
}

export const CAISSE_MOVEMENT_TYPES = [
  'Paiement client', 'Paiement client Grignon', 'Charge Voyage',
  'Paiement fournisseur (Brique)', 'Paiement fournisseur (Grignon)', 'Paiement fournisseur (Carburant)',
  'Autre entrée', 'Autre dépense',
]

// Builds one normalized entry per real cash movement — one row per source
// transaction, never a copy stored anywhere. `paiements`/`voyageCharges`/
// `grignonPaiements` should be the FULL unfiltered tables (only mode/kind
// filtering happens here); filtering by date/direction/type is a separate,
// later step so the running balance below always accounts for every
// movement regardless of what the UI currently displays.
export function buildCaisseEntries({ paiements, voyageCharges, grignonPaiements, manualEntries }) {
  const entries = []

  ;(paiements || []).forEach(p => {
    if (p.mode !== 'Espèce') return // only physical cash affects Caisse (§15)
    const isOut = p.sens === 'sortant'
    entries.push({
      key: `paiement:${p.id}`,
      date: p.date,
      created_at: p.created_at || '',
      direction: isOut ? 'sortie' : 'entree',
      montant: p.montant || 0,
      type: isOut ? (OUT_TYPE_LABELS[p.type_compte] || 'Paiement fournisseur') : 'Paiement client',
      source: (isOut ? p.fournisseur_nom : p.client_nom) || '—',
      description: p.note || 'Paiement Espèce',
      auto: true, origin: 'paiement', originId: p.id,
    })
  })

  ;(grignonPaiements || []).forEach(p => {
    if (p.mode !== 'Espèce') return
    entries.push({
      key: `grignon_paiement:${p.id}`,
      date: p.date,
      created_at: p.created_at || '',
      direction: 'entree',
      montant: p.montant || 0,
      type: 'Paiement client Grignon',
      source: p.client_nom || '—',
      description: p.note || 'Paiement Espèce',
      auto: true, origin: 'grignon_paiement', originId: p.id,
    })
  })

  ;(voyageCharges || []).forEach(c => {
    entries.push({
      key: `voyage_charge:${c.id}`,
      date: c.date_charge,
      created_at: c.created_at || '',
      direction: 'sortie',
      montant: c.montant || 0,
      type: 'Charge Voyage',
      source: c.voyages?.reference || (c.voyage_id ? `Voyage #${c.voyage_id}` : '—'),
      description: c.description || c.categorie || '—',
      auto: true, origin: 'voyage_charge', originId: c.id, voyageId: c.voyage_id,
    })
  })

  ;(manualEntries || []).forEach(m => {
    entries.push({
      key: `manual:${m.id}`,
      date: m.date,
      created_at: m.created_at || '',
      direction: m.direction,
      montant: m.montant || 0,
      type: m.direction === 'entree' ? 'Autre entrée' : 'Autre dépense',
      source: m.categorie || '—',
      description: m.description || '—',
      auto: false, origin: 'manual', originId: m.id,
    })
  })

  entries.sort((a, b) =>
    (a.date || '').localeCompare(b.date || '') ||
    (a.created_at || '').localeCompare(b.created_at || '') ||
    (a.originId || 0) - (b.originId || 0)
  )
  return entries
}

// Stamps each entry with the running balance, walking chronologically from
// `soldeInitial`. Must be called on the FULL entry list (not a filtered
// subset) so the "Solde" column stays historically correct no matter which
// date range / direction / type the UI is currently filtering by.
export function withRunningBalance(entries, soldeInitial) {
  let balance = soldeInitial || 0
  return entries.map(e => {
    balance += e.direction === 'entree' ? e.montant : -e.montant
    return { ...e, solde: balance }
  })
}

// ── CONSISTENCY AUDIT (§11) ──────────────────────────────────────────────────
// Read-only: reports findings, never repairs data. Most classic failure modes
// (duplicated automatic movement, orphaned reference, stale amount, wrong
// running balance) are structurally impossible here because automatic
// movements are never stored — there is no copy that could drift from the
// source or outlive it. What's left to actually check is real user-facing
// data quality: bad source rows, and accidental double-entry on the one
// hand-typed movement type (manual entries).
export function runCaisseAudit({ paiements, voyageCharges, grignonPaiements, manualEntries, soldeInitial }) {
  const findings = []

  const badMontant = (rows, label, dateField) => {
    ;(rows || []).forEach(r => {
      if (!(r.montant > 0)) {
        findings.push({
          severity: 'warn',
          message: `${label} #${r.id} du ${r[dateField] || '—'} a un montant invalide (${r.montant ?? '—'}) — exclu du calcul Caisse.`,
        })
      }
    })
  }
  badMontant((paiements || []).filter(p => p.mode === 'Espèce'), 'Paiement Espèce', 'date')
  badMontant(grignonPaiements, 'Paiement client Grignon', 'date')
  badMontant(voyageCharges, 'Charge Voyage', 'date_charge')

  // Legacy rows saved before `sens` existed default to "entrant" — surface
  // them so an operator can confirm that's correct rather than it being silent.
  const missingSens = (paiements || []).filter(p => p.mode === 'Espèce' && !p.sens)
  if (missingSens.length > 0) {
    findings.push({
      severity: 'info',
      message: `${missingSens.length} paiement(s) Espèce sans champ "sens" (ancien format) — traités comme Entrée client par défaut.`,
    })
  }

  // Accidental double-click / double-entry on manual rows: same date +
  // direction + montant + catégorie entered more than once.
  const groups = new Map()
  ;(manualEntries || []).forEach(m => {
    const k = `${m.date}|${m.direction}|${m.montant}|${(m.categorie || '').toLowerCase()}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(m)
  })
  for (const [, rows] of groups) {
    if (rows.length > 1) {
      findings.push({
        severity: 'warn',
        message: `${rows.length} entrées manuelles identiques le ${rows[0].date} (${rows[0].direction === 'entree' ? 'Entrée' : 'Sortie'}, ${rows[0].montant} DHS, "${rows[0].categorie || '—'}") — possible doublon de saisie. IDs: ${rows.map(r => r.id).join(', ')}.`,
      })
    }
  }

  // Independent recompute of the final balance, compared against the same
  // formula used for display — a guard against a future regression, not
  // against today's data (these two computations are definitionally equal
  // right now, since nothing else touches soldeInitial or the entry list).
  const entries = buildCaisseEntries({ paiements, voyageCharges, grignonPaiements, manualEntries })
  const totalEntrees = entries.filter(e => e.direction === 'entree').reduce((s, e) => s + e.montant, 0)
  const totalSorties = entries.filter(e => e.direction === 'sortie').reduce((s, e) => s + e.montant, 0)
  const recomputedBalance = (soldeInitial || 0) + totalEntrees - totalSorties
  const stamped = withRunningBalance(entries, soldeInitial)
  const walkedBalance = stamped.length > 0 ? stamped[stamped.length - 1].solde : (soldeInitial || 0)
  if (Math.abs(recomputedBalance - walkedBalance) > 0.01) {
    findings.push({
      severity: 'error',
      message: `Incohérence de calcul du solde: total agrégé ${recomputedBalance.toFixed(2)} DHS ≠ solde après parcours chronologique ${walkedBalance.toFixed(2)} DHS.`,
    })
  }

  return {
    findings,
    counts: {
      paiementsEspece: (paiements || []).filter(p => p.mode === 'Espèce').length,
      grignonPaiementsEspece: (grignonPaiements || []).filter(p => p.mode === 'Espèce').length,
      voyageCharges: (voyageCharges || []).length,
      manualEntries: (manualEntries || []).length,
      totalMovements: entries.length,
    },
    soldeActuel: walkedBalance,
  }
}
