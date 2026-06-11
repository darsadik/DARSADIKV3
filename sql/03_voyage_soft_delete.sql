-- Voyage soft-delete columns
-- Run once in Supabase SQL editor
-- After this migration, archived voyages are hidden from normal lists
-- and accessible via /voyages/archives (admin only)

ALTER TABLE voyages ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;
ALTER TABLE voyages ADD COLUMN IF NOT EXISTS deleted_by  TEXT;

-- Index for fast filtering of non-deleted voyages
CREATE INDEX IF NOT EXISTS idx_voyages_deleted_at ON voyages (deleted_at) WHERE deleted_at IS NULL;
