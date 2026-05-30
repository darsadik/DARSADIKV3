-- ============================================================
-- GRIGNON (FITOUR) MODULE — Supabase SQL Migration
-- Fully isolated from main project (brique / ajour)
-- DO NOT mix with: clients, fournisseurs, camions, ventes
-- ============================================================

-- 1. GRIGNON CLIENTS
-- Separate from main "clients" table — no shared data
CREATE TABLE IF NOT EXISTS grignon_clients (
  id         BIGSERIAL PRIMARY KEY,
  nom        TEXT NOT NULL,
  telephone  TEXT,
  adresse    TEXT,
  solde      NUMERIC(12,2) DEFAULT 0,   -- running balance from grignon sales
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. GRIGNON FOURNISSEURS
-- Separate from main "fournisseurs" table — no shared data
CREATE TABLE IF NOT EXISTS grignon_fournisseurs (
  id         BIGSERIAL PRIMARY KEY,
  nom        TEXT NOT NULL,
  telephone  TEXT,
  adresse    TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. GRIGNON CAMIONS
-- Separate from main "camions" table — no shared data
CREATE TABLE IF NOT EXISTS grignon_camions (
  id         BIGSERIAL PRIMARY KEY,
  plaque     TEXT NOT NULL UNIQUE,
  chauffeur  TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. GRIGNON OPERATIONS
-- Core transaction table for grignon (fitour) module
-- Covers both achats (from fournisseurs) and ventes (to clients)
CREATE TABLE IF NOT EXISTS grignon_operations (
  id               BIGSERIAL PRIMARY KEY,

  -- Date
  date             DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Client relation (grignon only)
  client_id        BIGINT REFERENCES grignon_clients(id) ON DELETE SET NULL,
  client_nom       TEXT DEFAULT '',           -- denormalized for reporting

  -- Fournisseur relation (grignon only)
  fournisseur_id   BIGINT REFERENCES grignon_fournisseurs(id) ON DELETE SET NULL,
  fournisseur_nom  TEXT DEFAULT '',           -- denormalized for reporting

  -- Camion relation (grignon only)
  camion_id        BIGINT REFERENCES grignon_camions(id) ON DELETE SET NULL,
  camion_plaque    TEXT DEFAULT '',           -- denormalized for reporting
  chauffeur        TEXT DEFAULT '',

  -- Quantities & Prices
  qte              NUMERIC(12,2) NOT NULL DEFAULT 0,   -- kg
  prix_achat       NUMERIC(10,2) DEFAULT 0,            -- price per kg (purchase)
  prix_vente       NUMERIC(10,2) DEFAULT 0,            -- price per kg (sale)
  total_achat      NUMERIC(12,2) DEFAULT 0,            -- qte × prix_achat
  total_vente      NUMERIC(12,2) DEFAULT 0,            -- qte × prix_vente
  marge            NUMERIC(12,2) DEFAULT 0,            -- total_vente − total_achat

  -- Notes
  note             TEXT,

  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_grignon_operations_date        ON grignon_operations(date);
CREATE INDEX IF NOT EXISTS idx_grignon_operations_client_id   ON grignon_operations(client_id);
CREATE INDEX IF NOT EXISTS idx_grignon_operations_fourn_id    ON grignon_operations(fournisseur_id);
CREATE INDEX IF NOT EXISTS idx_grignon_operations_camion_id   ON grignon_operations(camion_id);

-- ============================================================
-- ROW LEVEL SECURITY (optional — enable if needed)
-- ============================================================
-- ALTER TABLE grignon_clients       ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE grignon_fournisseurs  ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE grignon_camions       ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE grignon_operations    ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- VERIFICATION — run after migration to confirm tables exist
-- ============================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name LIKE 'grignon%'
-- ORDER BY table_name;

-- ============================================================
-- NOTES
-- ============================================================
-- • These tables are COMPLETELY separate from:
--     clients, fournisseurs, camions, ventes, paiements, gasoil
-- • The grignon module has its own client balances (grignon_clients.solde)
--   which are never updated by main project operations
-- • huile_operations table is NOT dropped — kept for historical data
--   but is no longer used by the app (now uses grignon_operations)
-- ============================================================
