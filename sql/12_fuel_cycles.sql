-- ═══════════════════════════════════════════════════════════════════════════
-- 12_FUEL_CYCLES — Additive columns for the "Cycles Carburant" module
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Fuel cycles themselves are NEVER persisted — they are computed on the fly
-- in lib/services/fuelCycles.js from the existing gasoil/voyages/camions
-- tables, exactly like the app's other fuel-cycle readers
-- (lib/services/profitability.js, lib/camionPerformance.js,
-- pages/gasoil/index.js). This column adds the one piece of input data
-- that was missing to build cycles correctly: an explicit user override
-- for merging refills.
--
-- NOTE: this file originally also added a `heure` (time-of-day) column.
-- That was a product decision to drop — trucks don't operate on an hourly
-- schedule, so same-day plein ordering falls back to created_at/id only.
-- `heure` was removed from every query/insert/update in the app; do NOT
-- re-add that column.

-- User override for cycle fusion with the immediately preceding plein of the
-- same truck (see lib/services/fuelCycles.js:groupPleinsIntoCycles).
--   NULL  (default, every existing row) — auto-detect: merge only if zero
--          voyages happened between the two pleins.
--   TRUE  — force-merge even if a voyage exists between them.
--   FALSE — force a new cycle even if auto-detection would have merged.
-- Never set by the existing insert/update code paths in pages/gasoil/index.js
-- unless the user explicitly picks a fusion choice, so every existing row
-- keeps today's automatic behavior.
ALTER TABLE gasoil ADD COLUMN IF NOT EXISTS merge_with_previous BOOLEAN DEFAULT NULL;
