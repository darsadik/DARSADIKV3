-- ═══════════════════════════════════════════════════════════════════════════
-- 14_GRIGNON_LIVRAISON_LINK — root-cause fix for grignon records going missing
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ROOT CAUSE: sql/08_transaction_mirror_links.sql gave voyage_achats a proper
-- link column (grignon_operation_id) back to its grignon_operations mirror
-- row, so achats can always be updated/deleted by exact id. voyage_livraisons
-- never got the equivalent column, and grignon_operations never got a
-- voyage_id column either — yet the app (lib/services/voyage/livraisons.js,
-- and the delete_voyage_livraison / delete_voyage RPC functions below) has
-- always assumed both exist and tried to scope updates/deletes with them.
--
-- Because grignon_operations.voyage_id doesn't exist, every one of those
-- scoped queries fails and falls back to matching by client_id + date alone
-- — which is not unique. Editing or deleting ONE grignon livraison on a
-- voyage can silently update or delete ANY OTHER grignon_operations row for
-- that same client on that same calendar date: a different voyage's entry,
-- or a historical pre-Voyage direct entry. That is the actual mechanism
-- behind "Voyage records missing / balances inconsistent" in Fournisseur
-- Grignon and Client Grignon — not a query/JOIN bug in those two pages
-- (they already read grignon_operations correctly by client_id/fournisseur_id).
--
-- It also explains a directly-visible symptom: because grignon_operations
-- .voyage_id was never populated, no grignon livraison has ever shown the
-- "↗ Ouvrir le voyage" / "✎ Modifier (voyage)" affordance on the Client
-- Grignon page, even for brand-new Voyage-sourced rows.

ALTER TABLE voyage_livraisons  ADD COLUMN IF NOT EXISTS grignon_operation_id BIGINT;
ALTER TABLE grignon_operations ADD COLUMN IF NOT EXISTS voyage_id            BIGINT;

-- No backfill: existing rows keep matching by the old (fallback) heuristic
-- until they're next re-saved from the voyage — same precedent as sql/08.
-- From this migration onward, every NEW grignon livraison save/update/delete
-- uses the exact id link instead of the client+date match.

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT count(*) FILTER (WHERE grignon_operation_id IS NOT NULL) AS livraisons_with_grignon_link,
       count(*) FILTER (WHERE type_produit = 'grignon')          AS livraisons_grignon_total
FROM voyage_livraisons;
SELECT count(*) FILTER (WHERE voyage_id IS NOT NULL) AS ops_with_voyage_link,
       count(*)                                       AS ops_total
FROM grignon_operations;
