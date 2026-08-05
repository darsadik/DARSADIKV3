-- ═══════════════════════════════════════════════════════════════════════════
-- 22_VOYAGE_GASOIL_PURE_MAPPING — fuel allocation redesign
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- voyage_gasoil used to store an independently-typed amount per link
-- (qte_litres/prix_unitaire/total/is_split) — this is exactly what let the
-- same plein be claimed in full by two different voyages simultaneously
-- (confirmed live: gasoil_id=105 was linked in full to both voyage #167 and
-- voyage #175, summing to 200% of that purchase). The app no longer writes
-- or reads those columns: lib/services/voyage/gasoilLink.js now inserts only
-- (gasoil_id, voyage_id), and every voyage's DHS share is computed
-- dynamically and distance-proportionally by lib/services/fuelAllocation.js
-- every time it's needed — never stored.
--
-- qte_litres/prix_unitaire/total/is_split/date_gasoil/station are left in
-- place (not dropped) so existing rows stay readable during the transition;
-- they can be dropped in a later cleanup once the new engine has run in
-- production for a while.

-- Run this check FIRST — if it returns any rows, resolve them manually
-- before applying the constraint below (the ALTER TABLE will fail otherwise).
-- This is a different, rarer shape than the confirmed gasoil_id=105 case
-- (which had two DIFFERENT voyage_ids and is unaffected by this constraint):
-- this instead finds the exact same (gasoil_id, voyage_id) pair duplicated.
SELECT gasoil_id, voyage_id, count(*)
FROM voyage_gasoil
GROUP BY gasoil_id, voyage_id
HAVING count(*) > 1;

-- Prevents the exact same (purchase, voyage) pair from being inserted twice
-- (a literal duplicate-row data bug). Deliberately NOT a UNIQUE constraint on
-- voyage_id alone — a voyage can legitimately draw from more than one
-- purchase (e.g. it refueled mid-trip), and the allocation engine itself,
-- not a schema lock, is what guarantees no single purchase is ever
-- over-allocated (see lib/services/fuelAllocation.js: distributeFuelPurchase).
ALTER TABLE voyage_gasoil ADD CONSTRAINT voyage_gasoil_gasoil_voyage_unique UNIQUE (gasoil_id, voyage_id);

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT count(*) AS total_links, count(DISTINCT gasoil_id) AS distinct_purchases, count(DISTINCT voyage_id) AS distinct_voyages
FROM voyage_gasoil;
