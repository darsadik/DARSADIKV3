-- ═══════════════════════════════════════════════════════════════════════════
-- 06_FUEL_ODOMETER_SYSTEM — Sequential truck odometer + manual fuel fallbacks
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Each voyage now only records ONE odometer reading: km_depart, the truck's
-- odometer when it arrives to load. km_arrivee is no longer typed by hand —
-- it is auto-derived as the km_depart of that same truck's next chronological
-- voyage (see recalc_camion_odometer_chain below). This keeps
-- lib/services/profitability.js's kmFuelCost() (distance = km_arrivee -
-- km_depart) completely unchanged; only how km_arrivee gets populated changes.

-- fuel_mode selects which single source the profitability engine reads for
-- this voyage's fuel cost. Never combined — see computeFuelCost().
--   'automatic'     (default) — kmFuelCost() using the odometer chain, or the
--                    legacy fallback (sum of linked voyage_gasoil rows) if
--                    the chain/history is insufficient.
--   'manual_rate'   — manual_distance_km × manual_cost_per_km
--   'manual_amount' — manual_fuel_cost used verbatim
-- The manual_* columns are never cleared on a mode switch — they stay as an
-- audit trail even after a voyage later moves back to 'automatic'.
ALTER TABLE voyages ADD COLUMN IF NOT EXISTS fuel_mode           TEXT DEFAULT 'automatic'; -- 'automatic' | 'manual_rate' | 'manual_amount'
ALTER TABLE voyages ADD COLUMN IF NOT EXISTS manual_distance_km  NUMERIC(12,2);
ALTER TABLE voyages ADD COLUMN IF NOT EXISTS manual_cost_per_km  NUMERIC(12,2);
ALTER TABLE voyages ADD COLUMN IF NOT EXISTS manual_fuel_cost    NUMERIC(12,2);

-- Backfill: every pre-existing voyage keeps today's behavior (automatic).
UPDATE voyages SET fuel_mode = 'automatic' WHERE fuel_mode IS NULL;

-- Rebuilds one truck's entire odometer chain from scratch: walks its voyages
-- chronologically and sets each voyage's km_arrivee to the km_depart of the
-- next one. The last voyage in the chain has no next voyage yet, so its
-- km_arrivee is cleared (distance unknown until that next voyage is saved).
-- Full rebuild (rather than patching only the adjacent voyage) keeps this
-- correct for every case uniformly: normal append, backdated/out-of-order
-- inserts, edits that move a voyage's date/truck, and deletes.
CREATE OR REPLACE FUNCTION recalc_camion_odometer_chain(p_camion_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec RECORD;
  prev_id BIGINT := NULL;
BEGIN
  FOR rec IN
    SELECT id, km_depart FROM voyages
    WHERE camion_id = p_camion_id AND deleted_at IS NULL
    ORDER BY date_depart ASC, id ASC
  LOOP
    IF prev_id IS NOT NULL THEN
      UPDATE voyages SET km_arrivee = rec.km_depart WHERE id = prev_id;
    END IF;
    prev_id := rec.id;
  END LOOP;
  IF prev_id IS NOT NULL THEN
    UPDATE voyages SET km_arrivee = NULL WHERE id = prev_id;
  END IF;
END;
$$;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT fuel_mode, count(*) FROM voyages GROUP BY fuel_mode;
