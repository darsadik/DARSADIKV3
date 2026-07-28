-- ═══════════════════════════════════════════════════════════════════════════
-- 12_FUEL_CYCLES — Additive columns for the "Cycles Carburant" module
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Fuel cycles themselves are NEVER persisted — they are computed on the fly
-- in lib/services/fuelCycles.js from the existing gasoil/voyages/camions
-- tables, exactly like the app's other fuel-cycle readers
-- (lib/services/profitability.js, lib/camionPerformance.js,
-- pages/gasoil/index.js). These two columns only add the two pieces of
-- input data that were missing to build cycles correctly: a same-day
-- ordering hint, and an explicit user override for merging refills.

-- Optional time-of-day for a plein, to disambiguate same-day chronological
-- order (e.g. 08h00 vs 15h00 same-day refills of the same truck). NULL
-- (every pre-existing row) falls back to created_at as the tiebreaker.
ALTER TABLE gasoil ADD COLUMN IF NOT EXISTS heure TIME;

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
