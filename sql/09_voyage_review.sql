-- ═══════════════════════════════════════════════════════════════════════════
-- 09_VOYAGE_REVIEW — reviewed state for the Review Mode audit workspace
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Same nullable-timestamp/actor pattern already used for soft-delete
-- (voyages.deleted_at / deleted_by, see 03_voyage_soft_delete.sql).
-- reviewed_at IS NULL means "not reviewed"; setting it (and reviewed_by)
-- marks the voyage checked off during a monthly audit pass.

ALTER TABLE voyages ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE voyages ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

-- Index for fast filtering of not-yet-reviewed voyages
CREATE INDEX IF NOT EXISTS idx_voyages_reviewed_at ON voyages (reviewed_at) WHERE reviewed_at IS NULL;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT count(*) FILTER (WHERE reviewed_at IS NOT NULL) AS reviewed_count,
       count(*) FILTER (WHERE reviewed_at IS NULL)     AS not_reviewed_count
FROM voyages
WHERE deleted_at IS NULL;
