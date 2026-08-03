-- ═══════════════════════════════════════════════════════════════════════════
-- 17_FUEL_OPENING_BALANCE — Global (not per-truck) starting balance for the
-- Fuel module, representing the fuel balance that existed before this ERP
-- was used. Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- Reuses the generic key/value settings store from sql/11_remise_carburant.sql.
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_settings (key, value)
VALUES ('fuel_opening_balance', '0')
ON CONFLICT (key) DO NOTHING;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT * FROM app_settings WHERE key = 'fuel_opening_balance';
