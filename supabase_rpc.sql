-- ============================================================
-- SUPABASE RPC FUNCTIONS — run once in Supabase SQL editor
-- These replace multi-step JS deletes with atomic DB transactions
-- so a partial failure never corrupts client balances or camion stats
-- ============================================================

-- 1. Delete a voyage livraison atomically:
--    removes voyage_livraisons row + linked ventes (brique) or grignon_operations (grignon)
--    + reverses client (or grignon_client) solde adjustment
CREATE OR REPLACE FUNCTION delete_voyage_livraison(p_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v voyage_livraisons%ROWTYPE;
BEGIN
  SELECT * INTO v FROM voyage_livraisons WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v.type_produit = 'grignon' THEN
    -- Remove mirrored grignon_operations row by its exact link
    -- (voyage_livraisons.grignon_operation_id, sql/14_grignon_livraison_link.sql).
    -- The client_id+date match is not unique — it was hitting unrelated rows
    -- (other voyages, or historical data) for the same client on the same day.
    IF v.grignon_operation_id IS NOT NULL THEN
      DELETE FROM grignon_operations WHERE id = v.grignon_operation_id;
    ELSE
      -- voyage_id-scoped: client_id+date+qte alone is not unique across
      -- voyages (two voyages delivering the same qty to the same client on
      -- the same date would otherwise both match and both get deleted).
      DELETE FROM grignon_operations
      WHERE client_id   = v.client_id
        AND date        = v.date_livraison
        AND qte         = v.qte
        AND voyage_id   = v.voyage_id;
    END IF;

    UPDATE grignon_clients
    SET solde = solde - COALESCE(v.total_vente, 0)
    WHERE id = v.client_id;
  ELSE
    -- Remove mirrored global vente row.
    -- For old rows where vente_id was never saved, fall back to matching by context.
    IF v.vente_id IS NOT NULL THEN
      DELETE FROM ventes WHERE id = v.vente_id;
    ELSE
      DELETE FROM ventes
      WHERE voyage_id   = v.voyage_id
        AND client_id   = v.client_id
        AND date        = v.date_livraison
        AND total_vente = v.total_vente
        AND (type_entree IS NULL OR type_entree NOT IN ('mdo','gasoil','autre','remise'));
    END IF;

    UPDATE clients
    SET solde = solde - COALESCE(v.total_vente, 0)
    WHERE id = v.client_id;
  END IF;

  DELETE FROM voyage_livraisons WHERE id = p_id;
END;
$$;


-- 1b. Save a brique voyage livraison atomically (the primary path saveLiv's
--     brique branch calls first, in lib/services/voyage/livraisons.js):
--     inserts ventes + voyage_livraisons + frais rows, adjusts client solde.
--     NOTE: this function existed live in Supabase but was never captured in
--     this file. Documenting it here now, WITH a fix — the deployed version
--     wrapped its voyage_livraisons total_achat/marge UPDATE in
--     BEGIN ... EXCEPTION WHEN OTHERS THEN NULL; END, because that UPDATE
--     also tried to set total_vente directly, which is a Postgres
--     GENERATED ALWAYS AS (qte * prix_vente) STORED column — an illegal
--     write that made the whole UPDATE statement fail every single time,
--     silently swallowed by the exception handler. Net effect: total_achat
--     and marge were NEVER actually persisted for any brique livraison
--     saved through this function (measured live: 583 of 596 existing rows
--     have total_achat=0/marge=0). Removing total_vente from the SET list
--     lets the UPDATE succeed normally, so the exception wrapper is removed
--     too — a genuine failure here should now surface, not vanish.
CREATE OR REPLACE FUNCTION save_livraison_brique(
  p_voyage_id BIGINT, p_date DATE, p_client_id BIGINT, p_client_nom TEXT,
  p_camion_id BIGINT, p_camion_plaque TEXT, p_chauffeur TEXT,
  p_type_brique_id BIGINT, p_type_brique TEXT,
  p_qte NUMERIC, p_prix_vente NUMERIC, p_prix_achat NUMERIC, p_remise NUMERIC,
  p_frais_total NUMERIC, p_accounting_total NUMERIC,
  p_frais_note TEXT, p_note TEXT, p_frais JSONB,
  p_deductions_total NUMERIC DEFAULT 0
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  -- total_vente omitted — GENERATED column, recomputes itself from qte/prix_vente above.
  UPDATE voyage_livraisons
  SET total_achat = (p_qte * p_prix_achat),
      marge       = (p_qte * p_prix_vente - p_remise) - (p_qte * p_prix_achat)
  WHERE id = v_liv_id;

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
$$;


-- 2. Update a voyage livraison atomically:
--    updates voyage_livraisons + linked ventes row
--    Solde is intentionally NOT touched here (see fix note below) — the
--    caller (updateLiv in lib/services/voyage/livraisons.js) is the single
--    place that adjusts clients/grignon_clients.solde, unconditionally,
--    using a diff that correctly includes frais/déductions.
--
-- FIX (2026-09): this function used to also apply diff := (p_qte*p_prix_vente
-- - p_remise) - COALESCE(v.total_vente,0) to clients/grignon_clients.solde.
-- updateLiv's JS ALSO unconditionally applied its own (more complete, frais-
-- inclusive) diff to the same solde column right after calling this RPC —
-- with no guard on whether the RPC had already done it. Every successful
-- call therefore double-counted the solde adjustment on every livraison edit
-- that changed the billed amount (both grignon_clients.solde AND
-- clients.solde, since this RPC and updateLiv are shared by both business
-- lines). Removing the solde update here — and updating total_achat/marge on
-- voyage_livraisons directly instead of only inside the vente_id-guarded
-- block, which is grignon's ONLY place they were previously set at all —
-- makes updateLiv's own diff application the sole source of truth.
CREATE OR REPLACE FUNCTION update_voyage_livraison(
  p_id          BIGINT,
  p_date        DATE,
  p_qte         NUMERIC,
  p_prix_vente  NUMERIC,
  p_prix_achat  NUMERIC,
  p_remise      NUMERIC,
  p_total_vente NUMERIC,
  p_total_achat NUMERIC,
  p_marge       NUMERIC,
  p_note        TEXT DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v   voyage_livraisons%ROWTYPE;
BEGIN
  SELECT * INTO v FROM voyage_livraisons WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- total_vente is NOT set here — GENERATED ALWAYS AS (qte * prix_vente)
  -- STORED column; it recomputes itself from qte/prix_vente above.
  UPDATE voyage_livraisons SET
    date_livraison = p_date,
    qte            = p_qte,
    prix_vente     = p_prix_vente,
    prix_achat     = p_prix_achat,
    remise         = p_remise,
    note           = p_note,
    total_achat    = p_total_achat,
    marge          = p_marge
  WHERE id = p_id;

  IF v.vente_id IS NOT NULL THEN
    UPDATE ventes SET
      qte         = p_qte,
      prix_vente  = p_prix_vente,
      prix_achat  = p_prix_achat,
      total_vente = p_total_vente,
      total_achat = p_total_achat,
      marge       = p_marge
    WHERE id = v.vente_id;
  END IF;
END;
$$;


-- 3. Delete a voyage gasoil entry atomically:
--    removes voyage_gasoil + linked global gasoil row
--    + reverses camion stats (gasoil_dhs, litres, pleins)
CREATE OR REPLACE FUNCTION delete_voyage_gasoil(p_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  vg voyage_gasoil%ROWTYPE;
BEGIN
  SELECT * INTO vg FROM voyage_gasoil WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Split assignments (sql/16_voyage_gasoil_split.sql) only own a PORTION of
  -- the source plein — the plein itself and the camion's running totals were
  -- already accounted for once, at the original /gasoil insert, independent
  -- of how many voyages it ends up split across. Unlinking a split
  -- assignment must only ever remove this one voyage_gasoil row — never the
  -- shared gasoil source row (other voyages may still reference it) or
  -- camion stats (would double-decrement them).
  IF COALESCE(vg.is_split, false) THEN
    DELETE FROM voyage_gasoil WHERE id = p_id;
    RETURN;
  END IF;

  IF vg.gasoil_id IS NOT NULL THEN
    DELETE FROM gasoil WHERE id = vg.gasoil_id;
  END IF;

  -- Reverse camion stats via voyage→camion join
  UPDATE camions c
  SET
    gasoil_dhs = GREATEST(c.gasoil_dhs - COALESCE(vg.total, 0), 0),
    pleins      = GREATEST(c.pleins - 1, 0),
    litres      = GREATEST(c.litres  - COALESCE(vg.qte_litres, 0), 0)
  FROM voyages v
  WHERE v.id = vg.voyage_id AND c.id = v.camion_id;

  DELETE FROM voyage_gasoil WHERE id = p_id;
END;
$$;


-- 4. Delete a voyage retour atomically:
--    removes voyage_retours + linked retours_transport row
CREATE OR REPLACE FUNCTION delete_voyage_retour(p_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  vr voyage_retours%ROWTYPE;
BEGIN
  SELECT * INTO vr FROM voyage_retours WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF vr.retour_id IS NOT NULL THEN
    DELETE FROM retours_transport WHERE id = vr.retour_id;
  END IF;

  DELETE FROM voyage_retours WHERE id = p_id;
END;
$$;


-- 5. Record a client payment atomically:
--    inserts into paiements + decrements client.solde
CREATE OR REPLACE FUNCTION record_paiement(
  p_date          DATE,
  p_client_id     BIGINT,
  p_client_nom    TEXT,
  p_mode          TEXT,
  p_montant       NUMERIC,
  p_note          TEXT DEFAULT NULL,
  p_camion_id     BIGINT DEFAULT NULL,
  p_camion_plaque TEXT DEFAULT NULL,
  p_cheque_number TEXT DEFAULT NULL,
  p_cheque_bank   TEXT DEFAULT NULL,
  p_cheque_status TEXT DEFAULT NULL,
  p_fournisseur_id  BIGINT DEFAULT NULL,
  p_fournisseur_nom TEXT DEFAULT NULL
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_id BIGINT;
BEGIN
  INSERT INTO paiements (
    date, client_id, client_nom, mode, montant, note,
    camion_id, camion_plaque,
    cheque_number, cheque_bank, cheque_status,
    fournisseur_id, fournisseur_nom
  ) VALUES (
    p_date, p_client_id, p_client_nom, p_mode, p_montant, p_note,
    p_camion_id, p_camion_plaque,
    p_cheque_number, p_cheque_bank, p_cheque_status,
    p_fournisseur_id, p_fournisseur_nom
  ) RETURNING id INTO new_id;

  UPDATE clients SET solde = solde - p_montant WHERE id = p_client_id;

  RETURN new_id;
END;
$$;


-- 6. Delete a paiement atomically:
--    removes paiement row + reverses client.solde
CREATE OR REPLACE FUNCTION delete_paiement(p_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p paiements%ROWTYPE;
BEGIN
  SELECT * INTO p FROM paiements WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM paiements WHERE id = p_id;
  UPDATE clients SET solde = solde + COALESCE(p.montant, 0) WHERE id = p.client_id;
END;
$$;


-- 7. Recompute and fix a client's solde from source of truth:
--    solde = opening_balance + Σ ventes.total_vente - Σ paiements.montant
CREATE OR REPLACE FUNCTION reconcile_client_solde(p_client_id BIGINT)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  opening  NUMERIC;
  tot_v    NUMERIC;
  tot_p    NUMERIC;
  new_solde NUMERIC;
BEGIN
  SELECT COALESCE(opening_balance, 0) INTO opening FROM clients WHERE id = p_client_id;
  SELECT COALESCE(SUM(total_vente), 0) INTO tot_v  FROM ventes    WHERE client_id = p_client_id;
  SELECT COALESCE(SUM(montant), 0)     INTO tot_p  FROM paiements  WHERE client_id = p_client_id;

  new_solde := opening + tot_v - tot_p;

  UPDATE clients SET solde = new_solde WHERE id = p_client_id;
  RETURN new_solde;
END;
$$;


-- 8. Delete an entire voyage atomically:
--    For each livraison  → deletes ventes (brique) or grignon_operations (grignon) + reverses client solde
--    For each gasoil     → deletes linked gasoil row + reverses camion stats
--    For each retour     → deletes linked retours_transport row
--    For each charge     → if facture_client, deletes linked vente + reverses client solde
--    Then deletes all voyage_* sub-tables and the voyage itself
CREATE OR REPLACE FUNCTION delete_voyage(p_voyage_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  liv voyage_livraisons%ROWTYPE;
  vg  voyage_gasoil%ROWTYPE;
  vr  voyage_retours%ROWTYPE;
  vc  voyage_charges%ROWTYPE;
BEGIN
  -- Livraisons: reverse client balances + delete mirrored rows
  FOR liv IN SELECT * FROM voyage_livraisons WHERE voyage_id = p_voyage_id LOOP
    IF liv.type_produit = 'grignon' THEN
      -- Exact link first (sql/14_grignon_livraison_link.sql) — client_id+date
      -- alone is not unique and can delete another voyage's/historical row.
      IF liv.grignon_operation_id IS NOT NULL THEN
        DELETE FROM grignon_operations WHERE id = liv.grignon_operation_id;
      ELSE
        -- voyage_id-scoped — same reasoning as delete_voyage_livraison above.
        DELETE FROM grignon_operations
          WHERE client_id = liv.client_id AND date = liv.date_livraison AND qte = liv.qte AND voyage_id = liv.voyage_id;
      END IF;
      UPDATE grignon_clients SET solde = solde - COALESCE(liv.total_vente, 0) WHERE id = liv.client_id;
    ELSE
      IF liv.vente_id IS NOT NULL THEN
        DELETE FROM ventes WHERE id = liv.vente_id;
      ELSE
        DELETE FROM ventes
          WHERE voyage_id   = liv.voyage_id
            AND client_id   = liv.client_id
            AND date        = liv.date_livraison
            AND total_vente = liv.total_vente
            AND (type_entree IS NULL OR type_entree NOT IN ('mdo','gasoil','autre','remise'));
      END IF;
      UPDATE clients SET solde = solde - COALESCE(liv.total_vente, 0) WHERE id = liv.client_id;
    END IF;
  END LOOP;

  -- Gasoil: delete linked global row + reverse camion stats
  FOR vg IN SELECT * FROM voyage_gasoil WHERE voyage_id = p_voyage_id LOOP
    IF vg.gasoil_id IS NOT NULL THEN
      DELETE FROM gasoil WHERE id = vg.gasoil_id;
    END IF;
    UPDATE camions c SET
      gasoil_dhs = GREATEST(c.gasoil_dhs - COALESCE(vg.total, 0), 0),
      pleins      = GREATEST(c.pleins - 1, 0),
      litres      = GREATEST(c.litres  - COALESCE(vg.qte_litres, 0), 0)
    FROM voyages v WHERE v.id = vg.voyage_id AND c.id = v.camion_id;
  END LOOP;

  -- Retours: delete linked retours_transport rows
  FOR vr IN SELECT * FROM voyage_retours WHERE voyage_id = p_voyage_id LOOP
    IF vr.retour_id IS NOT NULL THEN
      DELETE FROM retours_transport WHERE id = vr.retour_id;
    END IF;
  END LOOP;

  -- Charges billed to client: delete linked vente + reverse client solde
  FOR vc IN SELECT * FROM voyage_charges WHERE voyage_id = p_voyage_id AND facture_client = true LOOP
    IF vc.client_id IS NOT NULL THEN
      DELETE FROM ventes
        WHERE voyage_id       = vc.voyage_id
          AND client_id       = vc.client_id
          AND type_entree     = 'mdo'
          AND montant_mdo     = vc.montant
          AND description_mdo = vc.description;
      UPDATE clients SET solde = solde - COALESCE(vc.montant, 0) WHERE id = vc.client_id;
    END IF;
  END LOOP;

  -- Achats: reverse fournisseur solde before deleting
  UPDATE fournisseurs f SET
    solde = GREATEST(f.solde - COALESCE(a.total_achat, a.qte * a.prix_achat, 0), 0)
  FROM voyage_achats a
  WHERE a.voyage_id = p_voyage_id
    AND a.type_produit <> 'grignon'
    AND a.fournisseur_id = f.id;

  UPDATE grignon_fournisseurs gf SET
    solde = GREATEST(gf.solde - COALESCE(a.total_achat, a.qte * a.prix_achat, 0), 0)
  FROM voyage_achats a
  WHERE a.voyage_id = p_voyage_id
    AND a.type_produit = 'grignon'
    AND a.fournisseur_id = gf.id;

  -- Delete all voyage sub-tables then the voyage itself
  DELETE FROM voyage_livraisons WHERE voyage_id = p_voyage_id;
  DELETE FROM voyage_gasoil     WHERE voyage_id = p_voyage_id;
  DELETE FROM voyage_retours    WHERE voyage_id = p_voyage_id;
  DELETE FROM voyage_charges    WHERE voyage_id = p_voyage_id;
  DELETE FROM voyage_achats     WHERE voyage_id = p_voyage_id;
  DELETE FROM voyages           WHERE id        = p_voyage_id;
END;
$$;


-- 9. Archive (soft-delete) a voyage atomically:
--    Sets deleted_at/deleted_by AND reverses fournisseur/grignon_fournisseur
--    solde for this voyage's achats — same reversal formula as delete_voyage's
--    achat step above, so an archived voyage's purchases stop counting in
--    Fournisseurs Briques/Grignon (solde + traceability) immediately, exactly
--    like a permanent delete does, but reversibly via restore_voyage below.
--    voyage_achats rows themselves are left untouched (archiving is not
--    destructive) — pages must additionally filter them out by joining the
--    parent voyage's deleted_at, same as /voyages and /review already do.
--    No-op if the voyage is already archived (guards against double-reversal
--    if called twice, e.g. a retried request).
CREATE OR REPLACE FUNCTION archive_voyage(p_voyage_id BIGINT, p_deleted_by TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v voyages%ROWTYPE;
BEGIN
  SELECT * INTO v FROM voyages WHERE id = p_voyage_id;
  IF NOT FOUND OR v.deleted_at IS NOT NULL THEN RETURN; END IF;

  UPDATE fournisseurs f SET
    solde = GREATEST(f.solde - COALESCE(a.total_achat, a.qte * a.prix_achat, 0), 0)
  FROM voyage_achats a
  WHERE a.voyage_id = p_voyage_id
    AND a.type_produit <> 'grignon'
    AND a.fournisseur_id = f.id;

  UPDATE grignon_fournisseurs gf SET
    solde = GREATEST(gf.solde - COALESCE(a.total_achat, a.qte * a.prix_achat, 0), 0)
  FROM voyage_achats a
  WHERE a.voyage_id = p_voyage_id
    AND a.type_produit = 'grignon'
    AND a.fournisseur_id = gf.id;

  UPDATE voyages SET deleted_at = NOW(), deleted_by = p_deleted_by WHERE id = p_voyage_id;
END;
$$;


-- 10. Restore an archived voyage atomically:
--     Clears deleted_at/deleted_by AND re-adds the fournisseur/grignon_fournisseur
--     solde this voyage's achats represent — exact inverse of archive_voyage.
--     No-op if the voyage isn't currently archived.
--     Note: if archive_voyage's GREATEST(...,0) clamp kicked in (solde would
--     have gone negative), the clamped amount is lost and restore re-adds
--     less than was originally reversed — same clamp-precision trade-off the
--     rest of this codebase already accepts everywhere else solde is adjusted
--     (see delAchat in lib/services/voyage/achats.js). Run
--     reconcile_client_solde-style recomputation from source tables if a
--     solde ever needs to be re-derived exactly.
CREATE OR REPLACE FUNCTION restore_voyage(p_voyage_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v voyages%ROWTYPE;
BEGIN
  SELECT * INTO v FROM voyages WHERE id = p_voyage_id;
  IF NOT FOUND OR v.deleted_at IS NULL THEN RETURN; END IF;

  UPDATE fournisseurs f SET
    solde = f.solde + COALESCE(a.total_achat, a.qte * a.prix_achat, 0)
  FROM voyage_achats a
  WHERE a.voyage_id = p_voyage_id
    AND a.type_produit <> 'grignon'
    AND a.fournisseur_id = f.id;

  UPDATE grignon_fournisseurs gf SET
    solde = gf.solde + COALESCE(a.total_achat, a.qte * a.prix_achat, 0)
  FROM voyage_achats a
  WHERE a.voyage_id = p_voyage_id
    AND a.type_produit = 'grignon'
    AND a.fournisseur_id = gf.id;

  UPDATE voyages SET deleted_at = NULL, deleted_by = NULL WHERE id = p_voyage_id;
END;
$$;
