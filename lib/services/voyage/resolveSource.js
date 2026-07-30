import { supabase } from '../../supabase'

// Given a row from a *mirror* table (ventes, grignon_operations,
// retours_transport…) shown on a non-voyage page, resolve the true voyage_*
// row that owns it, so it can be handed to EditTransactionModal /
// useVoyageTransactionEdit — the same editor and the same
// lib/services/voyage/* update functions used inside the voyage page itself.
// Every resolver returns `null` when the row can't be traced back (e.g. data
// created before the link column existed) — callers should simply hide the
// Edit affordance in that case, never guess.

async function attachFrais(livraison) {
  if (!livraison) return null
  const { data: frais } = await supabase
    .from('voyage_livraison_frais').select('*').eq('livraison_id', livraison.id)
  return { ...livraison, frais: frais || [] }
}

export async function resolveLivraisonByVenteId(venteId) {
  if (!venteId) return null
  const { data } = await supabase.from('voyage_livraisons').select('*').eq('vente_id', venteId).maybeSingle()
  return attachFrais(data)
}

export async function resolveLivraisonById(livraisonId) {
  if (!livraisonId) return null
  const { data } = await supabase.from('voyage_livraisons').select('*').eq('id', livraisonId).maybeSingle()
  return attachFrais(data)
}

// A voyage_livraison_frais row already carries livraison_id directly.
export async function resolveLivraisonByFraisRow(fraisRow) {
  return resolveLivraisonById(fraisRow?.livraison_id)
}

// Exact reverse link (sql/14_grignon_livraison_link.sql): given a
// grignon_operations row, find the voyage_livraisons row that produced it.
// Mirrors resolveAchatByGrignonOpId below, which already works this way for
// achats. Returns null for rows saved before the link column existed —
// callers should fall back to resolveLivraisonGrignonHeuristic in that case.
export async function resolveLivraisonByGrignonOpId(grignonOperationId) {
  if (!grignonOperationId) return null
  const { data } = await supabase.from('voyage_livraisons').select('*').eq('grignon_operation_id', grignonOperationId).maybeSingle()
  return attachFrais(data)
}

// Legacy fallback for grignon livraisons saved before the exact link existed
// — same best-effort client_id+date+voyage_id match already relied on by
// updateLiv's own grignon sync in lib/services/voyage/livraisons.js.
// Ambiguous only if two identical grignon deliveries exist for the same
// client on the same day of the same voyage; falls back to "no Edit icon".
export async function resolveLivraisonGrignonHeuristic({ voyage_id, client_id, date }) {
  if (!voyage_id || !client_id || !date) return null
  const { data } = await supabase.from('voyage_livraisons').select('*')
    .eq('voyage_id', voyage_id).eq('client_id', client_id).eq('date_livraison', date).eq('type_produit', 'grignon')
    .limit(2)
  if (!data || data.length !== 1) return null // 0 or ambiguous (>1) — don't guess
  return attachFrais(data[0])
}

export async function resolveAchatByVenteId(venteId) {
  if (!venteId) return null
  const { data } = await supabase.from('voyage_achats').select('*').eq('vente_id', venteId).maybeSingle()
  return data || null
}

export async function resolveAchatByGrignonOpId(grignonOperationId) {
  if (!grignonOperationId) return null
  const { data } = await supabase.from('voyage_achats').select('*').eq('grignon_operation_id', grignonOperationId).maybeSingle()
  return data || null
}

export async function resolveChargeByVenteId(venteId) {
  if (!venteId) return null
  const { data } = await supabase.from('voyage_charges').select('*, voyages(camion_id)').eq('vente_id', venteId).maybeSingle()
  return data || null
}

// voyage_retours.retour_id points forward at retours_transport.id — query in reverse.
export async function resolveRetourByMirrorId(retoursTransportId) {
  if (!retoursTransportId) return null
  const { data } = await supabase.from('voyage_retours').select('*').eq('retour_id', retoursTransportId).maybeSingle()
  return data || null
}
