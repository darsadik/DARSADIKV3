-- =============================================================================
-- 01_fournisseurs_snapshot_and_reconcile.sql
-- Purpose : Recompute fournisseurs.solde from source tables (voyage_achats
--           minus outgoing payments). Run MANUALLY in the Supabase SQL Editor.
--           Never executed automatically by the application.
-- Safe    : Creates a snapshot first. UPDATE can be rolled back via the
--           snapshot table. The fournisseurs table itself is NOT dropped.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 0 — Verify this is the right environment before doing anything
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'fournisseurs' AS table_name, COUNT(*) AS row_count FROM fournisseurs
UNION ALL
SELECT 'voyage_achats',              COUNT(*) FROM voyage_achats
UNION ALL
SELECT 'paiements',                  COUNT(*) FROM paiements;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Snapshot current state (run this FIRST, before any UPDATE)
-- Replace 20260530 with today's actual date when you run this script.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fournisseurs_snapshot_20260530
    AS SELECT * FROM fournisseurs;

-- Confirm snapshot was created and row counts match
SELECT
    'Snapshot rows' AS label,
    COUNT(*)        AS count
FROM fournisseurs_snapshot_20260530
UNION ALL
SELECT 'Live rows', COUNT(*) FROM fournisseurs;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Preview the recomputed balances (SELECT only, no writes)
--   Read this carefully before running STEP 3.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    f.id,
    f.nom,
    snap.solde                                                      AS solde_avant,

    -- New formula: opening_balance + purchases - outgoing payments
    COALESCE(f.opening_balance, 0)
    + COALESCE(purchases.total_purchases, 0)
    - COALESCE(payments.total_paid,      0)                        AS solde_calcule,

    (
      COALESCE(f.opening_balance, 0)
      + COALESCE(purchases.total_purchases, 0)
      - COALESCE(payments.total_paid,      0)
    ) - snap.solde                                                 AS difference

FROM fournisseurs f
JOIN fournisseurs_snapshot_20260530 snap ON snap.id = f.id

LEFT JOIN (
    SELECT
        fournisseur_id,
        -- Use stored total_achat when available; fallback to qte * prix_achat
        SUM(COALESCE(NULLIF(total_achat, 0), qte * prix_achat)) AS total_purchases
    FROM voyage_achats
    WHERE type_produit = 'brique'
      AND fournisseur_id IS NOT NULL
    GROUP BY fournisseur_id
) purchases ON purchases.fournisseur_id = f.id

LEFT JOIN (
    SELECT
        fournisseur_id,
        SUM(montant) AS total_paid
    FROM paiements
    WHERE fournisseur_id IS NOT NULL
      AND (sens = 'sortant' OR type_compte IN ('fourn_brique', 'gasoil'))
    GROUP BY fournisseur_id
) payments ON payments.fournisseur_id = f.id

ORDER BY ABS(
    (COALESCE(f.opening_balance, 0)
     + COALESCE(purchases.total_purchases, 0)
     - COALESCE(payments.total_paid, 0))
    - snap.solde
) DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Apply the recomputed balances
--   Only run after reviewing the preview in STEP 2.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE fournisseurs f
SET solde =
    COALESCE(f.opening_balance, 0)
    + COALESCE((
        SELECT SUM(COALESCE(NULLIF(va.total_achat, 0), va.qte * va.prix_achat))
        FROM voyage_achats va
        WHERE va.fournisseur_id = f.id
          AND va.type_produit = 'brique'
    ), 0)
    - COALESCE((
        SELECT SUM(p.montant)
        FROM paiements p
        WHERE p.fournisseur_id = f.id
          AND (p.sens = 'sortant' OR p.type_compte IN ('fourn_brique', 'gasoil'))
    ), 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 — Verify the result
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    f.id,
    f.nom,
    snap.solde  AS solde_avant,
    f.solde     AS solde_apres,
    f.solde - snap.solde AS difference
FROM fournisseurs f
JOIN fournisseurs_snapshot_20260530 snap ON snap.id = f.id
ORDER BY ABS(f.solde - snap.solde) DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK — If something went wrong, restore from snapshot
-- Only run this if you need to undo STEP 3.
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE fournisseurs f
-- SET solde = snap.solde
-- FROM fournisseurs_snapshot_20260530 snap
-- WHERE snap.id = f.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- GRIGNON fournisseurs — same pattern, separate table
-- ─────────────────────────────────────────────────────────────────────────────

-- Snapshot
CREATE TABLE IF NOT EXISTS grignon_fournisseurs_snapshot_20260530
    AS SELECT * FROM grignon_fournisseurs;

-- Preview
SELECT
    f.id,
    f.nom,
    snap.solde AS solde_avant,

    -- Grignon purchases tracked in grignon_operations (includes both voyage-linked
    -- and direct entries from /grignon page). Do NOT add voyage_achats here —
    -- voyage grignon achats are mirrored into grignon_operations on save.
    COALESCE(purchases.total_purchases, 0)
    - COALESCE(payments_main.total_paid, 0)
    - COALESCE(payments_grignon.total_paid, 0) AS solde_calcule

FROM grignon_fournisseurs f
JOIN grignon_fournisseurs_snapshot_20260530 snap ON snap.id = f.id

LEFT JOIN (
    -- client_id IS NULL excludes delivery-mirror rows: a grignon delivery
    -- also carries a fournisseur_id (borrowed from the voyage's own
    -- purchase — see saveLiv in lib/services/voyage/livraisons.js) and a
    -- total_achat (cost basis of what was delivered). Without this filter,
    -- every delivery's cost was double-counted on top of the real achat row.
    SELECT
        fournisseur_id,
        SUM(COALESCE(total_achat, 0)) AS total_purchases
    FROM grignon_operations
    WHERE fournisseur_id IS NOT NULL
      AND client_id IS NULL
    GROUP BY fournisseur_id
) purchases ON purchases.fournisseur_id = f.id

LEFT JOIN (
    -- Payments recorded via /paiements page (outgoing, fourn_grignon)
    SELECT grignon_fourn_id AS fournisseur_id, SUM(montant) AS total_paid
    FROM paiements
    WHERE grignon_fourn_id IS NOT NULL
      AND type_compte = 'fourn_grignon'
    GROUP BY grignon_fourn_id
) payments_main ON payments_main.fournisseur_id = f.id

LEFT JOIN (
    -- Payments recorded via /grignon page (grignon_fournisseur_paiements)
    SELECT fournisseur_id, SUM(montant) AS total_paid
    FROM grignon_fournisseur_paiements
    WHERE fournisseur_id IS NOT NULL
    GROUP BY fournisseur_id
) payments_grignon ON payments_grignon.fournisseur_id = f.id

ORDER BY f.nom;

-- Apply grignon recompute (run only after reviewing the preview)
UPDATE grignon_fournisseurs f
SET solde =
    COALESCE((
        SELECT SUM(COALESCE(op.total_achat, 0))
        FROM grignon_operations op
        WHERE op.fournisseur_id = f.id
          AND op.client_id IS NULL
    ), 0)
    - COALESCE((
        SELECT SUM(p.montant)
        FROM paiements p
        WHERE p.grignon_fourn_id = f.id
          AND p.type_compte = 'fourn_grignon'
    ), 0)
    - COALESCE((
        SELECT SUM(gp.montant)
        FROM grignon_fournisseur_paiements gp
        WHERE gp.fournisseur_id = f.id
    ), 0);
