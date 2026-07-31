-- ═══════════════════════════════════════════════════════════════════════════
-- 15_CHARGES_MIRROR_LINK — same class of fix as sql/08 and sql/14, applied to
-- the voyage_charges -> charges (global table) mirror
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════
--
-- lib/services/voyage/charges.js's updateCharge/delCharge locate the global
-- `charges` mirror row by `date + camion_id` alone (`.limit(1).maybeSingle()`,
-- taking whichever row comes back first). If the same truck has two voyages
-- on the same calendar day, editing/deleting a charge on ONE voyage can
-- silently update or delete the OTHER voyage's charges row. Same root cause
-- as the grignon mirror bug (sql/14): no exact id link, so a non-unique
-- match stood in for one.

ALTER TABLE voyage_charges ADD COLUMN IF NOT EXISTS charge_id BIGINT;

-- No backfill: existing rows keep matching by date+camion_id (unchanged
-- fallback) until next re-saved from the voyage.

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT count(*) FILTER (WHERE charge_id IS NOT NULL) AS charges_with_link,
       count(*)                                       AS voyage_charges_total
FROM voyage_charges;
