-- ═══════════════════════════════════════════════════════════════════════════
-- 11_REMISE_CARBURANT — Fuel supplier volume discount (gasoil only, never AdBlue)
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Generic key/value settings store — first setting is the configurable
-- discount rate (DH per litre of GASOIL). AdBlue never receives this
-- discount; see lib/services/profitability.js (kmFuelCost) and
-- pages/gasoil/index.js for where it's applied.
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_settings (key, value)
VALUES ('remise_carburant_rate', '0.10')
ON CONFLICT (key) DO NOTHING;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT * FROM app_settings WHERE key = 'remise_carburant_rate';
