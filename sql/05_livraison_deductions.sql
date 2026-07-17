-- ═══════════════════════════════════════════════════════════════════════════
-- 05_LIVRAISON_DEDUCTIONS — Customer deductions on livraison frais
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Reuses the existing voyage_livraison_frais table for both:
--   kind='charge'    (existing "frais supplémentaires" — increases client balance)
--   kind='deduction' (new "déductions client" — decreases client balance)
-- montant is always stored as a positive magnitude; kind controls the sign
-- applied when summing into voyage_livraisons.frais_total / ventes.total_vente.
ALTER TABLE voyage_livraison_frais ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'charge';  -- 'charge' | 'deduction'

-- Backfill: any pre-existing frais rows are charges
UPDATE voyage_livraison_frais SET kind = 'charge' WHERE kind IS NULL;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT kind, count(*) FROM voyage_livraison_frais GROUP BY kind;
