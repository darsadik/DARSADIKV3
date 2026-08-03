-- ═══════════════════════════════════════════════════════════════════════════
-- 20_GASOIL_FOURNISSEURS_PRESENTATION_ORDER — adds the Presentation Mode
-- custom-order column to gasoil_fournisseurs, mirroring clients.presentation_order
-- (Brick Client Statement, pages/clients/index.js). Purely a visual reordering
-- layer for pages/fournisseurs/gasoil.js — never read by any balance/debit/
-- credit calculation. Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE gasoil_fournisseurs ADD COLUMN IF NOT EXISTS presentation_order JSONB DEFAULT '{}'::jsonb;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT id, nom, presentation_order FROM gasoil_fournisseurs;
