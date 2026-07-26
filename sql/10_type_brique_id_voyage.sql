-- ═══════════════════════════════════════════════════════════════════════════
-- 10_TYPE_BRIQUE_ID_VOYAGE — stable ID matching for Achats/Livraisons
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Purchases and deliveries currently match by the free-text `type_brique`
-- name. If a type_brique is ever renamed, that text match silently breaks.
-- This adds a stable FK so matching (and the WAC engine) can key off the ID
-- instead, while keeping `type_brique` as the display label.
--
-- voyage_livraisons may already have this column in some environments (the
-- save_livraison_brique RPC already accepts p_type_brique_id) — IF NOT EXISTS
-- makes this safe to run either way.
ALTER TABLE voyage_achats     ADD COLUMN IF NOT EXISTS type_brique_id BIGINT REFERENCES type_briques(id);
ALTER TABLE voyage_livraisons ADD COLUMN IF NOT EXISTS type_brique_id BIGINT REFERENCES type_briques(id);

-- Backfill historical rows by matching the stored text to the CURRENT
-- type_briques.nom. Rows whose text no longer matches any current name (the
-- type was renamed after that row was saved) are left NULL on purpose — the
-- app's WAC engine falls back to name-based matching for those rows, so no
-- historical profit/WAC number changes as a result of this migration.
UPDATE voyage_achats a
SET type_brique_id = tb.id
FROM type_briques tb
WHERE a.type_brique_id IS NULL AND a.type_brique = tb.nom;

UPDATE voyage_livraisons l
SET type_brique_id = tb.id
FROM type_briques tb
WHERE l.type_brique_id IS NULL AND l.type_brique = tb.nom;

CREATE INDEX IF NOT EXISTS idx_voyage_achats_type_brique_id     ON voyage_achats (type_brique_id);
CREATE INDEX IF NOT EXISTS idx_voyage_livraisons_type_brique_id ON voyage_livraisons (type_brique_id);

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM voyage_achats     WHERE type_produit = 'brique' AND type_brique_id IS NULL) AS achats_unmatched,
  (SELECT count(*) FROM voyage_livraisons WHERE type_produit = 'brique' AND type_brique_id IS NULL) AS livraisons_unmatched;
