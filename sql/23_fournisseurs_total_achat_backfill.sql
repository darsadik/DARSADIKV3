-- ═══════════════════════════════════════════════════════════════════════════
-- 23_FOURNISSEURS_TOTAL_ACHAT_BACKFILL
-- Purpose : backfill total_achat sur ventes (mirror achats fournisseur) —
--           jamais écrit avant ce patch (lib/services/voyage/achats.js).
--           N'affecte AUCUN solde (fournisseurs.solde est déjà correct, calculé
--           depuis une variable JS locale à la saisie, jamais depuis cette colonne).
--           voyage_achats.total_achat est volontairement EXCLU de ce script :
--           colonne GENERATED ALWAYS AS (qte * prix_achat) STORED côté Postgres
--           (vérifié en direct sur la base) — elle se recalcule seule à chaque
--           écriture et ne peut pas recevoir de valeur explicite (UPDATE dessus
--           lève une erreur). Rien à corriger côté voyage_achats.
--           Run MANUALLY in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 0 — Vérifier l'environnement
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'ventes (type_entree=achat)' AS table_name, COUNT(*) AS row_count
FROM ventes WHERE type_entree = 'achat';

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Snapshot (avant toute écriture)
-- Remplacer 20260808 par la date du jour si vous relancez ce script plus tard.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ventes_total_achat_snapshot_20260808 AS
    SELECT id, total_achat FROM ventes WHERE type_entree = 'achat';

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Prévisualisation (SELECT uniquement, aucune écriture)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT id, qte, prix_achat, total_achat AS total_achat_avant,
       ROUND(qte*prix_achat*100)/100    AS total_achat_calcule
FROM ventes
WHERE type_entree = 'achat' AND COALESCE(total_achat,0) = 0
ORDER BY date DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Appliquer le backfill (après relecture de STEP 2)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE ventes
SET total_achat = ROUND(qte*prix_achat*100)/100
WHERE type_entree = 'achat' AND COALESCE(total_achat,0) = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 — Vérifier
-- ─────────────────────────────────────────────────────────────────────────────
SELECT COUNT(*) FILTER (WHERE total_achat = 0 OR total_achat IS NULL) AS ventes_encore_a_zero
FROM ventes WHERE type_entree = 'achat';

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK — en cas de besoin
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE ventes v SET total_achat = s.total_achat
-- FROM ventes_total_achat_snapshot_20260808 s WHERE s.id = v.id;
