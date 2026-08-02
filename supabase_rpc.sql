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
      DELETE FROM grignon_operations
      WHERE client_id   = v.client_id
        AND date        = v.date_livraison
        AND qte         = v.qte;
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


-- 2. Update a voyage livraison atomically:
--    updates voyage_livraisons + linked ventes row
--    + adjusts client solde by the difference (new - old)
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
  diff NUMERIC;
BEGIN
  SELECT * INTO v FROM voyage_livraisons WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Compute new total_vente from formula (these columns are GENERATED in DB)
  diff := (p_qte * p_prix_vente - p_remise) - COALESCE(v.total_vente, 0);

  UPDATE voyage_livraisons SET
    date_livraison = p_date,
    qte            = p_qte,
    prix_vente     = p_prix_vente,
    prix_achat     = p_prix_achat,
    remise         = p_remise,
    note           = p_note
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

  IF diff <> 0 THEN
    IF v.type_produit = 'grignon' THEN
      UPDATE grignon_clients SET solde = solde + diff WHERE id = v.client_id;
    ELSE
      UPDATE clients SET solde = solde + diff WHERE id = v.client_id;
    END IF;
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
        DELETE FROM grignon_operations
          WHERE client_id = liv.client_id AND date = liv.date_livraison AND qte = liv.qte;
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
