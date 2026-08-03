-- =============================================================================
-- 19_gasoil_fournisseurs_backfill.sql
-- Purpose : Regression fix — 18_gasoil_fournisseurs.sql introduced
--           gasoil_fournisseurs as an EMPTY table, but the /paiements →
--           "Fournisseur Carburant" dropdown and /gasoil form now both
--           REQUIRE a gasoil_fournisseurs row to save anything. All historical
--           fuel purchases already carry a supplier implicitly as free text
--           in gasoil.station (e.g. "Station Hmida", "Petrom", "Zaio Station").
--           This script derives ONE gasoil_fournisseurs row per distinct
--           historical station, relinks every historical gasoil row to it via
--           gasoil.fournisseur_id, and recomputes solde from history —
--           exactly like fournisseurs (briques), see 01_fournisseurs_snapshot_
--           and_reconcile.sql.
-- Safe    : Snapshots gasoil_fournisseurs first. Only INSERTs suppliers that
--           don't already exist (case/whitespace-insensitive match on nom) —
--           never duplicates. Only touches gasoil rows where fournisseur_id
--           IS NULL — never overwrites a supplier already chosen through the
--           new dropdown. Does NOT touch profitability, voyage calculations,
--           km/fuel algorithm, fuel cycles, or the truck control center —
--           purely additive supplier accounting, same scope as
--           18_gasoil_fournisseurs.sql.
-- Run     : MANUALLY in the Supabase SQL Editor, top to bottom. Never
--           auto-executed by the application.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 0 — Sanity check before doing anything
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'gasoil'              AS table_name, COUNT(*) AS row_count FROM gasoil
UNION ALL
SELECT 'gasoil_fournisseurs',                COUNT(*) FROM gasoil_fournisseurs
UNION ALL
SELECT 'gasoil rows with station set',        COUNT(*) FROM gasoil WHERE station IS NOT NULL AND TRIM(station) <> ''
UNION ALL
SELECT 'gasoil rows already linked',          COUNT(*) FROM gasoil WHERE fournisseur_id IS NOT NULL
UNION ALL
SELECT 'distinct stations (case-insensitive)', COUNT(DISTINCT LOWER(TRIM(station))) FROM gasoil WHERE station IS NOT NULL AND TRIM(station) <> '';

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Snapshot current state (run this FIRST, before any write)
-- Replace 20260803 with today's actual date when you run this script.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gasoil_fournisseurs_snapshot_20260803
    AS SELECT * FROM gasoil_fournisseurs;

CREATE TABLE IF NOT EXISTS gasoil_link_snapshot_20260803
    AS SELECT id, fournisseur_id, station FROM gasoil;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Preview the suppliers that will be created (SELECT only)
--   One row per distinct station, case/whitespace-insensitive, that has no
--   matching gasoil_fournisseurs.nom yet. Read this before STEP 3.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    s.station_name           AS nom_a_creer,
    COUNT(g.id)               AS nb_pleins,
    SUM(COALESCE(g.total,0) + COALESCE(g.adblue_total,0)) AS total_historique
FROM (
    SELECT DISTINCT ON (LOWER(TRIM(station))) TRIM(station) AS station_name, LOWER(TRIM(station)) AS station_key
    FROM gasoil
    WHERE station IS NOT NULL AND TRIM(station) <> ''
    ORDER BY LOWER(TRIM(station)), date ASC, id ASC
) s
JOIN gasoil g ON LOWER(TRIM(g.station)) = s.station_key
WHERE NOT EXISTS (
    SELECT 1 FROM gasoil_fournisseurs gf WHERE LOWER(TRIM(gf.nom)) = s.station_key
)
GROUP BY s.station_name
ORDER BY total_historique DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Create the missing suppliers
--   Reuses any existing gasoil_fournisseurs row (case/whitespace-insensitive
--   match) instead of duplicating — "Petrom" stays "Petrom" if it already
--   exists. Only inserts stations with no match at all.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO gasoil_fournisseurs (nom, solde, actif)
SELECT s.station_name, 0, true
FROM (
    SELECT DISTINCT ON (LOWER(TRIM(station))) TRIM(station) AS station_name, LOWER(TRIM(station)) AS station_key
    FROM gasoil
    WHERE station IS NOT NULL AND TRIM(station) <> ''
    ORDER BY LOWER(TRIM(station)), date ASC, id ASC
) s
WHERE NOT EXISTS (
    SELECT 1 FROM gasoil_fournisseurs gf WHERE LOWER(TRIM(gf.nom)) = s.station_key
);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 — Relink historical gasoil rows to the (now-existing) supplier
--   Only rows where fournisseur_id IS NULL — a row already linked via the new
--   /gasoil dropdown is left untouched, matching gasoil_fournisseurs.nom
--   case/whitespace-insensitively against the station free text.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE gasoil g
SET fournisseur_id = gf.id
FROM gasoil_fournisseurs gf
WHERE g.fournisseur_id IS NULL
  AND g.station IS NOT NULL AND TRIM(g.station) <> ''
  AND LOWER(TRIM(gf.nom)) = LOWER(TRIM(g.station));

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5 — Recompute every supplier's solde from history
--   Balance = Σ(gasoil.total + gasoil.adblue_total) − Σ(paiements.montant
--   WHERE type_compte='gasoil'), same formula as fournisseurs (briques),
--   see 01_fournisseurs_snapshot_and_reconcile.sql. gasoil_paiements (the
--   older, non-supplier-specific global payment log used by /gasoil's
--   "Solde restant" KPI) is intentionally NOT included here — the fournisseur-
--   level ledger only reads paiements.gasoil_fourn_id, exactly like
--   pages/fournisseurs/gasoil.js does on screen.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE gasoil_fournisseurs gf
SET solde =
    COALESCE((
        SELECT SUM(COALESCE(g.total,0) + COALESCE(g.adblue_total,0))
        FROM gasoil g
        WHERE g.fournisseur_id = gf.id
    ), 0)
    - COALESCE((
        SELECT SUM(p.montant)
        FROM paiements p
        WHERE p.gasoil_fourn_id = gf.id
          AND p.type_compte = 'gasoil'
    ), 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6 — VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────

-- 6a. Suppliers created by this backfill, with their recomputed balance
SELECT gf.id, gf.nom, gf.solde, gf.actif
FROM gasoil_fournisseurs gf
WHERE NOT EXISTS (SELECT 1 FROM gasoil_fournisseurs_snapshot_20260803 s WHERE s.id = gf.id)
ORDER BY gf.solde DESC;

-- 6b. Any historical row with a station name that STILL has no fournisseur_id
--     (should be empty — investigate any row returned here)
SELECT id, date, station, camion_plaque, total
FROM gasoil
WHERE fournisseur_id IS NULL
  AND station IS NOT NULL AND TRIM(station) <> ''
ORDER BY date;

-- 6c. Duplicate-name check (should be empty — case/whitespace-insensitive)
SELECT LOWER(TRIM(nom)) AS nom_key, COUNT(*) AS nb, ARRAY_AGG(id) AS ids, ARRAY_AGG(nom) AS noms
FROM gasoil_fournisseurs
GROUP BY LOWER(TRIM(nom))
HAVING COUNT(*) > 1;

-- 6d. Full reconciliation — purchases vs. payments vs. stored solde per supplier
SELECT
    gf.id,
    gf.nom,
    gf.actif,
    COALESCE(purchases.total_purchases, 0) AS total_achats,
    COALESCE(payments.total_paid, 0)       AS total_paye,
    COALESCE(purchases.total_purchases, 0) - COALESCE(payments.total_paid, 0) AS solde_calcule,
    gf.solde                               AS solde_stocke,
    (COALESCE(purchases.total_purchases, 0) - COALESCE(payments.total_paid, 0)) - gf.solde AS difference
FROM gasoil_fournisseurs gf
LEFT JOIN (
    SELECT fournisseur_id, SUM(COALESCE(total,0) + COALESCE(adblue_total,0)) AS total_purchases
    FROM gasoil
    WHERE fournisseur_id IS NOT NULL
    GROUP BY fournisseur_id
) purchases ON purchases.fournisseur_id = gf.id
LEFT JOIN (
    SELECT gasoil_fourn_id, SUM(montant) AS total_paid
    FROM paiements
    WHERE gasoil_fourn_id IS NOT NULL AND type_compte = 'gasoil'
    GROUP BY gasoil_fourn_id
) payments ON payments.gasoil_fourn_id = gf.id
ORDER BY ABS((COALESCE(purchases.total_purchases, 0) - COALESCE(payments.total_paid, 0)) - gf.solde) DESC;

-- 6e. Overall counts summary
SELECT 'suppliers total'            AS label, COUNT(*) AS value FROM gasoil_fournisseurs
UNION ALL
SELECT 'suppliers active (dropdown)', COUNT(*) FROM gasoil_fournisseurs WHERE actif = true
UNION ALL
SELECT 'gasoil rows still unlinked with a station', COUNT(*) FROM gasoil WHERE fournisseur_id IS NULL AND station IS NOT NULL AND TRIM(station) <> ''
UNION ALL
SELECT 'gasoil rows unlinked, blank station (untouched by design)', COUNT(*) FROM gasoil WHERE fournisseur_id IS NULL AND (station IS NULL OR TRIM(station) = '');

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK — if something went wrong, restore from snapshot
-- Only run this if you need to undo STEP 3 / 4 / 5.
-- ─────────────────────────────────────────────────────────────────────────────
-- DELETE FROM gasoil_fournisseurs gf
-- WHERE NOT EXISTS (SELECT 1 FROM gasoil_fournisseurs_snapshot_20260803 s WHERE s.id = gf.id);
--
-- UPDATE gasoil_fournisseurs gf
-- SET solde = s.solde
-- FROM gasoil_fournisseurs_snapshot_20260803 s
-- WHERE s.id = gf.id;
--
-- UPDATE gasoil g
-- SET fournisseur_id = s.fournisseur_id
-- FROM gasoil_link_snapshot_20260803 s
-- WHERE s.id = g.id;
