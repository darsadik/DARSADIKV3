-- ═══════════════════════════════════════════════════════════════════════════
-- 18_GASOIL_FOURNISSEURS — Fuel Supplier accounts (Petrom, Afriquia, Winxo,
-- Shell, ...), with a full chronological statement exactly like `fournisseurs`
-- (briques) and `grignon_fournisseurs`. Run in Supabase SQL Editor.
--
-- Debit  (Fuel Purchase / Plein)   → gasoil.fournisseur_id            (pages/gasoil/index.js)
-- Credit (Payment)                 → paiements.gasoil_fourn_id        (pages/paiements/index.js, type_compte='gasoil')
-- Statement page                   → pages/fournisseurs/gasoil.js
--
-- This does NOT touch Fuel Cost calculation, Cost/KM, Fuel Cycles,
-- Profitability, or Voyage logic — purely additive supplier accounting.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gasoil_fournisseurs (
  id         BIGSERIAL PRIMARY KEY,
  nom        TEXT NOT NULL,
  tel        TEXT,
  note       TEXT,
  solde      NUMERIC(12,2) DEFAULT 0,
  actif      BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Links each Plein (fuel purchase) to the supplier it was bought from —
-- nullable so historical pleins entered before this migration stay valid.
ALTER TABLE gasoil ADD COLUMN IF NOT EXISTS fournisseur_id BIGINT REFERENCES gasoil_fournisseurs(id);

-- Links a `paiements` row (type_compte='gasoil') to the supplier being paid,
-- same pattern as fournisseur_id (fourn_brique) / grignon_fourn_id (fourn_grignon).
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS gasoil_fourn_id BIGINT REFERENCES gasoil_fournisseurs(id);

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT * FROM gasoil_fournisseurs;
