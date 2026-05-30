-- =============================================================================
-- 02_fournisseurs_opening_balance.sql
-- Purpose : Add the opening_balance column to fournisseurs and backfill it
--           from legacy data (standalone achats table + pre-voyage ventes rows)
--           that predate the voyage_achats workflow.
-- Safe    : Column is nullable with DEFAULT 0. Backfill is a preview-first
--           pattern. No tables are dropped or archived.
-- Run     : MANUALLY in the Supabase SQL Editor. Never auto-executed.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Add the column (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE fournisseurs
    ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12,2) DEFAULT 0;

-- Confirm
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'fournisseurs'
  AND column_name = 'opening_balance';

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Preview the backfill amounts (SELECT only)
--   These are the historical purchases that existed BEFORE voyage_achats became
--   the primary write path. They will become the fournisseur's opening_balance.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    f.id,
    f.nom,
    f.opening_balance                           AS opening_balance_current,

    -- From the legacy standalone achats table (pre-voyage purchases)
    COALESCE(legacy_achats.total, 0)            AS legacy_achats_total,

    -- From ventes rows with voyage_id IS NULL (old fournisseur entries without voyage)
    COALESCE(legacy_ventes.total, 0)            AS legacy_ventes_total,

    -- Proposed new opening_balance
    COALESCE(legacy_achats.total, 0)
    + COALESCE(legacy_ventes.total, 0)          AS proposed_opening_balance

FROM fournisseurs f

LEFT JOIN (
    SELECT fournisseur_id, SUM(COALESCE(total_achat, qte * prix_achat)) AS total
    FROM achats
    WHERE fournisseur_id IS NOT NULL
    GROUP BY fournisseur_id
) legacy_achats ON legacy_achats.fournisseur_id = f.id

LEFT JOIN (
    SELECT
        fournisseur_id,
        SUM(COALESCE(total_achat, 0)) AS total
    FROM ventes
    WHERE fournisseur_id IS NOT NULL
      AND voyage_id IS NULL        -- pre-voyage entries only
      AND total_achat > 0
      AND (type_entree IS NULL OR type_entree = 'achat')
    GROUP BY fournisseur_id
) legacy_ventes ON legacy_ventes.fournisseur_id = f.id

ORDER BY (COALESCE(legacy_achats.total, 0) + COALESCE(legacy_ventes.total, 0)) DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Apply the backfill
--   IMPORTANT: Only run after verifying the preview in STEP 2.
--   Only update rows where opening_balance is still 0 (not yet set manually).
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE fournisseurs f
SET opening_balance =
    COALESCE((
        SELECT SUM(COALESCE(a.total_achat, a.qte * a.prix_achat))
        FROM achats a
        WHERE a.fournisseur_id = f.id
    ), 0)
    + COALESCE((
        SELECT SUM(COALESCE(v.total_achat, 0))
        FROM ventes v
        WHERE v.fournisseur_id = f.id
          AND v.voyage_id IS NULL
          AND v.total_achat > 0
          AND (v.type_entree IS NULL OR v.type_entree = 'achat')
    ), 0)
WHERE f.opening_balance = 0   -- skip any row already manually adjusted
  AND (
    EXISTS (SELECT 1 FROM achats a WHERE a.fournisseur_id = f.id)
    OR
    EXISTS (
        SELECT 1 FROM ventes v
        WHERE v.fournisseur_id = f.id
          AND v.voyage_id IS NULL
          AND v.total_achat > 0
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 — Verify
-- ─────────────────────────────────────────────────────────────────────────────
SELECT id, nom, opening_balance, solde
FROM fournisseurs
ORDER BY opening_balance DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE: After running this script, re-run 01_fournisseurs_snapshot_and_reconcile
-- so that the reconciled solde correctly includes the new opening_balance.
-- The reconcile formula is:
--   solde = opening_balance + Σ(voyage_achats.total_achat) - Σ(outgoing payments)
-- ─────────────────────────────────────────────────────────────────────────────
