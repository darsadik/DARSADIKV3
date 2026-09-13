-- ═══════════════════════════════════════════════════════════════════════════
-- 25_CAISSE — company cash-flow tracking layer.
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Caisse is an ADDITIONAL cash-flow view on top of existing accounting; it
-- does not replace or duplicate any existing table.
--
-- Automatic movements (client cash payments, supplier cash payments, voyage
-- charges) are NEVER copied into a Caisse table — they are computed live, on
-- every read, directly from `paiements` / `grignon_paiements` / `voyage_charges`
-- (see lib/services/caisse.js). This means:
--   - an edit to the source row is reflected immediately, with no sync code
--   - a delete of the source row (including via the delete_voyage RPC, which
--     removes voyage_charges rows with raw SQL, bypassing the JS layer
--     entirely) removes it from Caisse immediately, with no cascade needed
--   - duplication is structurally impossible: there is no copy to duplicate
--
-- The ONLY new table needed is for movements that have no other source of
-- truth: manual "Autre entrée" / "Autre dépense" entries.
--
-- "Solde initial" is stored as a key in the existing `app_settings` table
-- (same pattern as fuel_opening_balance, see lib/services/settings.js) —
-- no schema change needed for it.

CREATE TABLE IF NOT EXISTS caisse_manual (
  id          BIGSERIAL PRIMARY KEY,
  date        DATE NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('entree','sortie')),
  montant     NUMERIC(12,2) NOT NULL CHECK (montant > 0),
  categorie   TEXT,     -- "Source" (entrée) or "Type/Catégorie" (sortie) free label
  description TEXT,     -- Description / Note
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caisse_manual_date ON caisse_manual(date);

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT count(*) AS caisse_manual_rows FROM caisse_manual;
