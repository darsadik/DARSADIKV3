-- ═══════════════════════════════════════════════════════════════════════════
-- 21_SUPPLIER_OPENING_BALANCE — per-supplier Opening Balance for Fuel and
-- Grignon suppliers, mirroring clients.opening_balance (pages/clients/index.js)
-- and fournisseurs.opening_balance (sql/02_fournisseurs_opening_balance.sql).
--
-- This is the SINGLE SOURCE OF TRUTH for a supplier's starting balance:
--   - Edited via the "🏦 Solde initial" button on /fournisseurs/gasoil and
--     /fournisseurs/grignon (admin only).
--   - Read live by each statement's own opening-balance / carry-forward
--     calculation — never duplicated or hardcoded elsewhere.
--   - gasoil_fournisseurs.solde / grignon_fournisseurs.solde are recomputed
--     on every save as opening_balance + purchases − payments (same formula
--     already used for the brique `fournisseurs` table, sql/01), so every
--     other screen that already reads .solde picks up the change automatically.
--
-- Distinct from app_settings.fuel_opening_balance (sql/17), which is a single
-- GLOBAL figure for the whole Fuel module's balance sheet (/gasoil KPI) and
-- is not attributable to any one supplier — the two are intentionally
-- separate numbers. Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE gasoil_fournisseurs  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE grignon_fournisseurs ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12,2) DEFAULT 0;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT id, nom, opening_balance, solde FROM gasoil_fournisseurs;
SELECT id, nom, opening_balance, solde FROM grignon_fournisseurs;
