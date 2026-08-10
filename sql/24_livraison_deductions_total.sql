-- ═══════════════════════════════════════════════════════════════════════════
-- 24_LIVRAISON_DEDUCTIONS_TOTAL — isolate déductions from profitability
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- voyage_livraisons.frais_total is NET signed (Σ charges − Σ deductions,
-- sql/05_livraison_deductions.sql) and is correctly used everywhere the
-- client's billed amount is computed (accounting_total, ventes.total_vente,
-- clients.solde, client statement). But lib/services/profitability.js's
-- revenue formula also added frais_total straight into voyage/client
-- revenue — so a "Transport payé" déduction (the client already paid that
-- expense directly; not a company cost) silently reduced computed profit,
-- exactly as if it were a real loss. It must reduce what the client owes,
-- never the company's profitability.
--
-- deductions_total stores just the magnitude of Σ deduction-kind items for
-- this livraison (always >= 0). Profitability adds it back on top of
-- frais_total (charges_total = frais_total + deductions_total) to recover
-- charges-only revenue, without touching frais_total/accounting_total/
-- ventes/clients.solde/client statement at all.
ALTER TABLE voyage_livraisons ADD COLUMN IF NOT EXISTS deductions_total NUMERIC(12,2) DEFAULT 0;

-- Backfill existing rows from their voyage_livraison_frais children so
-- historical profitability numbers get corrected too (computeVoyageProfit
-- reads live from these columns on every render — nothing is cached).
UPDATE voyage_livraisons vl
SET deductions_total = COALESCE((
  SELECT SUM(f.montant) FROM voyage_livraison_frais f
  WHERE f.livraison_id = vl.id AND f.kind = 'deduction'
), 0)
WHERE EXISTS (
  SELECT 1 FROM voyage_livraison_frais f
  WHERE f.livraison_id = vl.id AND f.kind = 'deduction'
);

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT id, total_vente, frais_total, deductions_total FROM voyage_livraisons WHERE deductions_total > 0;


-- ═══════════════════════════════════════════════════════════════════════════
-- Fix save_livraison_brique: it drops `kind` entirely when inserting frais
-- items, so EVERY item created through it — including a "Transport payé"
-- déduction — silently lands in voyage_livraison_frais as kind='charge'
-- (the column default). updateLiv (lib/services/voyage/livraisons.js) never
-- calls this RPC and already preserves kind correctly; this RPC is only used
-- by saveLiv on brand-new brique livraison creation. This is the source of
-- "a déduction sometimes gets treated as a Frais": it happens specifically
-- when a déduction is added on a NEW delivery (not when editing an existing
-- one). No historical rows were found corrupted by this (verified live: every
-- existing 'Transport payé'/'Transport + Ouvriers' row already has
-- kind='deduction'), so this is a forward-looking fix, not a backfill.
--
-- Also adds p_deductions_total (default 0, backward compatible) so newly
-- created deliveries populate voyage_livraisons.deductions_total too, same
-- as updateLiv already does — otherwise their profit would stay wrong until
-- first edited.
--
-- Everything else below is byte-identical to the function's current live
-- definition (fetched via pg_get_functiondef) — only `kind` and
-- `p_deductions_total`/`deductions_total` were added.
--
-- IMPORTANT: CREATE OR REPLACE does NOT replace a function whose parameter
-- list differs (overload identity = name + parameter types) — it creates a
-- SECOND overload instead, leaving an ambiguous pair where a caller passing
-- only the original 18 params could match either one. Drop the old signature
-- first so exactly one save_livraison_brique exists afterward.
DROP FUNCTION IF EXISTS public.save_livraison_brique(
  bigint, date, bigint, text, bigint, text, text, bigint, text,
  numeric, numeric, numeric, numeric, numeric, numeric, text, text, jsonb
);

CREATE OR REPLACE FUNCTION public.save_livraison_brique(
  p_voyage_id bigint, p_date date, p_client_id bigint, p_client_nom text,
  p_camion_id bigint, p_camion_plaque text, p_chauffeur text,
  p_type_brique_id bigint, p_type_brique text,
  p_qte numeric, p_prix_vente numeric, p_prix_achat numeric, p_remise numeric,
  p_frais_total numeric, p_accounting_total numeric,
  p_frais_note text, p_note text, p_frais jsonb,
  p_deductions_total numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_vente_id BIGINT;
  v_liv_id   BIGINT;
BEGIN
  INSERT INTO ventes (
    date, date_fournisseur, client_id, client_nom,
    camion_id, camion_plaque, chauffeur,
    type_brique_id, type_brique, qte, prix_vente, prix_achat,
    total_vente, voyage_id, note, frais_note
  ) VALUES (
    p_date, p_date, p_client_id, p_client_nom,
    p_camion_id, p_camion_plaque, p_chauffeur,
    p_type_brique_id, p_type_brique, p_qte, p_prix_vente, p_prix_achat,
    p_accounting_total, p_voyage_id, p_note, p_frais_note
  ) RETURNING id INTO v_vente_id;

  INSERT INTO voyage_livraisons (
    voyage_id, date_livraison, type_produit,
    client_id, client_nom, type_brique,
    qte, prix_vente, prix_achat, remise,
    frais_total, deductions_total, note, vente_id
  ) VALUES (
    p_voyage_id, p_date, 'brique',
    p_client_id, p_client_nom, p_type_brique,
    p_qte, p_prix_vente, p_prix_achat, p_remise,
    p_frais_total, p_deductions_total, p_note, v_vente_id
  ) RETURNING id INTO v_liv_id;

  BEGIN
    UPDATE voyage_livraisons
    SET total_vente = (p_qte * p_prix_vente - p_remise),
        total_achat = (p_qte * p_prix_achat),
        marge       = (p_qte * p_prix_vente - p_remise) - (p_qte * p_prix_achat)
    WHERE id = v_liv_id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  IF p_frais IS NOT NULL AND jsonb_array_length(p_frais) > 0 THEN
    INSERT INTO voyage_livraison_frais (livraison_id, label, montant, note, kind)
    SELECT v_liv_id, f->>'label', (f->>'montant')::NUMERIC, NULLIF(f->>'note',''),
           COALESCE(NULLIF(f->>'kind',''), 'charge')
    FROM jsonb_array_elements(p_frais) f
    WHERE (f->>'montant')::NUMERIC > 0;
  END IF;

  UPDATE clients SET solde = solde + p_accounting_total WHERE id = p_client_id;

  RETURN jsonb_build_object('vente_id', v_vente_id, 'livraison_id', v_liv_id);
END;
$function$;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc
WHERE proname = 'save_livraison_brique' AND pronamespace = 'public'::regnamespace;
