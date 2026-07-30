-- ═══════════════════════════════════════════════════════════════════════════
-- 13_GRIGNON_MASTER_DATA — activate/deactivate for grignon clients & suppliers
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- The /grignon page is now master-data-only (create/edit/activate/search for
-- grignon_clients and grignon_fournisseurs). All operational entries
-- (achats, livraisons, charges, retours) come exclusively from the Voyage
-- module and are mirrored into grignon_operations as before — this migration
-- does not touch that flow or any accounting figures.

ALTER TABLE grignon_clients      ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE grignon_fournisseurs ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT true;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT count(*) FILTER (WHERE actif) AS clients_actifs, count(*) FILTER (WHERE NOT actif) AS clients_inactifs FROM grignon_clients;
SELECT count(*) FILTER (WHERE actif) AS fourn_actifs,   count(*) FILTER (WHERE NOT actif) AS fourn_inactifs   FROM grignon_fournisseurs;
