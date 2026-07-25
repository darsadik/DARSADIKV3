-- ═══════════════════════════════════════════════════════════════════════════
-- 08_TRANSACTION_MIRROR_LINKS — reverse-lookup columns for "edit from anywhere"
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Same nullable-link-column pattern already used for voyage_livraisons.vente_id,
-- voyage_retours.retour_id, voyage_gasoil.gasoil_id. These let a mirror row
-- (ventes / grignon_operations) be traced back to its true source row in
-- voyage_achats / voyage_charges, so a statement page can resolve the exact
-- voyage row to edit instead of guessing by date/amount.

ALTER TABLE voyage_achats  ADD COLUMN IF NOT EXISTS vente_id             BIGINT;
ALTER TABLE voyage_achats  ADD COLUMN IF NOT EXISTS grignon_operation_id BIGINT;
ALTER TABLE voyage_charges ADD COLUMN IF NOT EXISTS vente_id             BIGINT;

-- No backfill: existing rows simply won't be editable from statement pages
-- until re-saved from the voyage (matches how retour_id/gasoil_id were rolled out).

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT count(*) FILTER (WHERE vente_id IS NOT NULL)             AS achats_with_vente_link,
       count(*) FILTER (WHERE grignon_operation_id IS NOT NULL) AS achats_with_grignon_link
FROM voyage_achats;
SELECT count(*) FILTER (WHERE vente_id IS NOT NULL) AS charges_with_vente_link FROM voyage_charges;
