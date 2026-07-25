-- ═══════════════════════════════════════════════════════════════════════════
-- 07_ADBLUE — AdBlue as part of the diesel Fuel Cycle
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- AdBlue is bought from the same station, on the same "plein" event, as
-- diesel — so it lives as extra columns on the existing `gasoil` row rather
-- than a new table. Defaults to 0, so every existing row (and every plein
-- that never enters AdBlue) behaves exactly as before.
ALTER TABLE gasoil ADD COLUMN IF NOT EXISTS adblue_qte           NUMERIC(12,2) DEFAULT 0;
ALTER TABLE gasoil ADD COLUMN IF NOT EXISTS adblue_prix_unitaire NUMERIC(12,2) DEFAULT 0;
ALTER TABLE gasoil ADD COLUMN IF NOT EXISTS adblue_total         NUMERIC(12,2) DEFAULT 0;

-- Backfill: pre-existing rows have no AdBlue.
UPDATE gasoil SET adblue_qte = 0, adblue_prix_unitaire = 0, adblue_total = 0 WHERE adblue_total IS NULL;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT count(*) FILTER (WHERE adblue_total > 0) AS pleins_with_adblue, count(*) AS total_pleins FROM gasoil;
