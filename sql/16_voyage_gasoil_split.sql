-- ═══════════════════════════════════════════════════════════════════════════
-- 16_VOYAGE_GASOIL_SPLIT — allow one plein to be split across several voyages
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- voyage_gasoil already links a plein (gasoil.id) to a voyage with its own
-- copy of qte_litres/total (sql/08_transaction_mirror_links.sql). Until now
-- the app always copied the WHOLE plein when linking, so in practice one
-- plein → at most one voyage. This column is purely a display/audit flag:
-- is_split = true means the linked qte_litres/total are a manually-typed
-- PORTION of the source plein (gasoil.qte / gasoil.total), not the whole
-- fill — so several voyage_gasoil rows can legitimately share the same
-- gasoil_id, one per voyage that got a slice of it. Nothing downstream
-- (computeFuelCost/kmFuelCost) changes: voyage_gasoil.total is summed for
-- the 'manuel' fallback / manual_amount override exactly as before, whether
-- or not it happens to be a partial amount.
ALTER TABLE voyage_gasoil ADD COLUMN IF NOT EXISTS is_split BOOLEAN DEFAULT false;

-- Backfill: every pre-existing row was a whole-plein link.
UPDATE voyage_gasoil SET is_split = false WHERE is_split IS NULL;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT is_split, count(*) FROM voyage_gasoil GROUP BY is_split;
