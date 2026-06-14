-- ═══════════════════════════════════════════════════════════════════════════
-- 04_CAMIONS LOUÉS — Affrètement (Truck Rental) Module
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PHASE 1: LOUEURS TABLE ─────────────────────────────────────────────────
-- Loueurs are truck owners who rent their trucks to DARSADIK.
-- Completely separate from fournisseurs.

CREATE TABLE IF NOT EXISTS loueurs (
  id         BIGSERIAL PRIMARY KEY,
  nom        TEXT NOT NULL,
  telephone  TEXT,
  cin        TEXT,
  rib        TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── PHASE 2: UPDATE CAMIONS TABLE ──────────────────────────────────────────
-- Classify each truck as owned (propre) or rented (loue).
-- Rented trucks link to a loueur and store their contact info.

ALTER TABLE camions ADD COLUMN IF NOT EXISTS type_camion          TEXT DEFAULT 'propre';   -- 'propre' | 'loue'
ALTER TABLE camions ADD COLUMN IF NOT EXISTS loueur_id            BIGINT REFERENCES loueurs(id) ON DELETE SET NULL;
ALTER TABLE camions ADD COLUMN IF NOT EXISTS nom_proprietaire     TEXT;
ALTER TABLE camions ADD COLUMN IF NOT EXISTS telephone_proprietaire TEXT;
ALTER TABLE camions ADD COLUMN IF NOT EXISTS cin                  TEXT;
ALTER TABLE camions ADD COLUMN IF NOT EXISTS camion_note          TEXT;

-- Backfill: mark all existing camions as propre
UPDATE camions SET type_camion = 'propre' WHERE type_camion IS NULL;

-- ── PHASE 3: VOYAGE LOCATIONS TABLE ────────────────────────────────────────
-- One location record per voyage, tracking the rental cost and payment status.

CREATE TABLE IF NOT EXISTS voyage_locations (
  id               BIGSERIAL PRIMARY KEY,
  voyage_id        BIGINT REFERENCES voyages(id) ON DELETE CASCADE,
  loueur_id        BIGINT REFERENCES loueurs(id) ON DELETE SET NULL,
  loueur_nom       TEXT,
  montant_location NUMERIC(12,2) DEFAULT 0,
  montant_paye     NUMERIC(12,2) DEFAULT 0,
  reste            NUMERIC(12,2) DEFAULT 0,
  note             TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast loueur-based queries (loueur accounting page)
CREATE INDEX IF NOT EXISTS idx_voyage_locations_loueur_id  ON voyage_locations(loueur_id);
CREATE INDEX IF NOT EXISTS idx_voyage_locations_voyage_id  ON voyage_locations(voyage_id);

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT 'loueurs'          AS tbl, count(*) FROM loueurs
UNION ALL
SELECT 'camions.type'     AS tbl, count(*) FROM camions WHERE type_camion IS NOT NULL
UNION ALL
SELECT 'voyage_locations' AS tbl, count(*) FROM voyage_locations;
