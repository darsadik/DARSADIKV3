// ── Review Mode anomaly detection ────────────────────────────────────────────
// Pure, read-only consumer of lib/services/profitability.js's computeVoyageProfit
// output — never imports or recomputes anything from the profit engine itself.
// Used only by the Review Mode audit workspace (pages/review).

const LABELS = {
  achat_without_delivery:     a => `Achat sans livraison — ${a.type_brique} (${a.qte})`,
  delivery_cost_undetermined: a => `Coût d'achat indéterminé (WAC) — ${a.type_brique} · ${a.client_nom || 'client'}`,
  no_achats:                  () => 'Aucun achat enregistré',
  no_livraisons:              () => 'Aucune livraison enregistrée',
  missing_client:             () => 'Livraison sans client',
  negative_profit:            () => 'Profit négatif',
  missing_odometer:           () => 'Odomètre au départ manquant',
  missing_fuel:                () => 'Carburant non déterminé',
}

// { voyage, achats, livraisons, gasoil, result } → [{ type, label }]
// `result` is the already-computed computeVoyageProfit(...) output for this voyage.
export function detectAnomalies({ voyage, achats = [], livraisons = [], gasoil = [], result }) {
  const anomalies = []

  ;(result?.warnings || []).forEach(w => {
    const build = LABELS[w.type]
    if (build) anomalies.push({ type: w.type, label: build(w) })
  })

  if (achats.length === 0)     anomalies.push({ type: 'no_achats',     label: LABELS.no_achats() })
  if (livraisons.length === 0) anomalies.push({ type: 'no_livraisons', label: LABELS.no_livraisons() })
  if (livraisons.some(l => !l.client_id)) anomalies.push({ type: 'missing_client', label: LABELS.missing_client() })
  if (result && result.profit < 0) anomalies.push({ type: 'negative_profit', label: LABELS.negative_profit() })
  if (!voyage?.km_depart) anomalies.push({ type: 'missing_odometer', label: LABELS.missing_odometer() })
  if (result?.cost?.fuelSource === 'none') anomalies.push({ type: 'missing_fuel', label: LABELS.missing_fuel() })

  return anomalies
}

// 'complete' (🟢) | 'needs_review' (🟡) | 'has_errors' (🔴)
export function voyageReviewStatus({ reviewed_at, anomalies }) {
  if ((anomalies || []).length > 0) return 'has_errors'
  return reviewed_at ? 'complete' : 'needs_review'
}
