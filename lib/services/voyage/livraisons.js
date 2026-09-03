import { supabase } from '../../supabase'

// frais items carry a `kind`: 'charge' (default, increases balance) or
// 'deduction' (decreases balance). montant is always stored as a positive
// magnitude — kind alone determines the sign applied to the net total.
function computeFrais(frais = []) {
  const items = (frais || []).filter(f => f.label && parseFloat(f.montant) > 0)
  const total = Math.round(items.reduce((s, f) => {
    const amt = parseFloat(f.montant) || 0
    return s + (f.kind === 'deduction' ? -amt : amt)
  }, 0) * 100) / 100
  // Magnitude of deduction-kind items only — stored separately so
  // profitability can add it back on top of `total` (net) to recover
  // charges-only revenue. See sql/24_livraison_deductions_total.sql: a
  // déduction reduces what the client owes, never the company's profit.
  const deductionsTotal = Math.round(items.reduce((s, f) => {
    return s + (f.kind === 'deduction' ? (parseFloat(f.montant) || 0) : 0)
  }, 0) * 100) / 100
  const noteStr = items.length > 0
    ? items.map(f => `${f.label} ${f.kind === 'deduction' ? '-' : ''}${parseFloat(f.montant).toLocaleString('fr-MA')} DHS`).join(' · ')
    : null
  return { items, total, deductionsTotal, noteStr }
}

export async function saveLiv(voyageId, form, { clients, grignonClients, typeBriques, voyage, achats }) {
  const qte = parseFloat(form.qte) || 0
  const pv  = parseFloat(form.prix_vente) || 0
  const pa  = parseFloat(form.prix_achat) || 0
  const rem = parseFloat(form.remise) || 0
  const total_vente = Math.round((qte * pv - rem) * 100) / 100
  const total_achat = Math.round(qte * pa * 100) / 100
  const marge       = Math.round((total_vente - total_achat) * 100) / 100
  const clientId    = parseInt(form.client_id)

  const cl = form.type_produit === 'grignon'
    ? grignonClients.find(c => c.id === clientId)
    : clients.find(c => c.id === clientId)
  const ty = typeBriques.find(t => t.id === parseInt(form.type_brique_id))

  const { items: fraisItems, total: frais_total, deductionsTotal: deductions_total, noteStr: frais_note } = computeFrais(form.frais)
  const accounting_total = Math.round((total_vente + frais_total) * 100) / 100

  // ── BRIQUES: try atomic RPC first, fallback with rollback ──────────────────
  if (form.type_produit === 'brique') {
    const { error: rpcErr } = await supabase.rpc('save_livraison_brique', {
      p_voyage_id:      parseInt(voyageId),
      p_date:           form.date_livraison,
      p_client_id:      clientId,
      p_client_nom:     cl?.nom || '',
      p_camion_id:      voyage?.camion_id || null,
      p_camion_plaque:  voyage?.camion_plaque || '',
      p_chauffeur:      voyage?.chauffeur || '',
      p_type_brique_id: form.type_brique_id ? parseInt(form.type_brique_id) : null,
      p_type_brique:    ty?.nom || '',
      p_qte:            qte,
      p_prix_vente:     pv,
      p_prix_achat:     pa,
      p_remise:         rem,
      p_frais_total:    frais_total,
      p_deductions_total: deductions_total,
      p_accounting_total: accounting_total,
      p_frais_note:     frais_note || null,
      p_note:           form.note || null,
      p_frais:          fraisItems.map(f => ({ label: f.label, montant: parseFloat(f.montant) || 0, note: f.note || null, kind: f.kind || 'charge' })),
    })
    if (!rpcErr) return  // committed atomically — done

    // RPC not installed yet — fallback with manual rollback on any failure
    let venteId = null
    try {
      const { data: vd, error: vErr } = await supabase.from('ventes').insert({
        date: form.date_livraison, date_fournisseur: form.date_livraison,
        client_id: clientId, client_nom: cl?.nom || '',
        camion_id: voyage?.camion_id || null, camion_plaque: voyage?.camion_plaque || '', chauffeur: voyage?.chauffeur || '',
        type_brique_id: form.type_brique_id ? parseInt(form.type_brique_id) : null,
        type_brique: ty?.nom || '', qte, prix_vente: pv, prix_achat: pa,
        total_vente: accounting_total,
        voyage_id: parseInt(voyageId),
        note: form.note || null,
      }).select().single()
      if (vErr) throw vErr
      venteId = vd.id
      if (frais_note) await supabase.from('ventes').update({ frais_note }).eq('id', venteId)

      const { data: ld, error: lErr } = await supabase.from('voyage_livraisons').insert({
        voyage_id: parseInt(voyageId), date_livraison: form.date_livraison, type_produit: 'brique',
        client_id: clientId, client_nom: cl?.nom || '',
        type_brique: ty?.nom || '',
        type_brique_id: form.type_brique_id ? parseInt(form.type_brique_id) : null,
        qte, prix_vente: pv, prix_achat: pa, remise: rem,
        frais_total, deductions_total, note: form.note || null, vente_id: venteId,
      }).select().single()
      if (lErr) throw lErr

      if (ld?.id) {
        // total_vente is NOT included here — voyage_livraisons.total_vente is a
        // Postgres GENERATED ALWAYS AS (qte * prix_vente) STORED column (same
        // discovery as voyage_achats.total_achat, see saveAchat above). Including
        // it made this whole UPDATE statement fail — Postgres rejects any direct
        // write to a GENERATED column — which meant total_achat/marge were NEVER
        // actually persisted (silently: the error was never checked here).
        const { error: totErr } = await supabase.from('voyage_livraisons').update({ total_achat, marge }).eq('id', ld.id)
        if (totErr) throw totErr
        if (fraisItems.length > 0) {
          const { error: fraisInsErr } = await supabase.from('voyage_livraison_frais').insert(
            fraisItems.map(f => ({ livraison_id: ld.id, label: f.label, montant: parseFloat(f.montant) || 0, note: f.note || null, kind: f.kind || 'charge' }))
          )
          // Must not fail silently: a lost frais/déduction row still bills the client
          // (accounting_total already applied below) but becomes invisible on the statement.
          if (fraisInsErr) throw fraisInsErr
        }
      }

      const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', clientId).single()
      if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde || 0) + accounting_total }).eq('id', clientId)
    } catch (err) {
      // Rollback: remove orphaned ventes row so the client statement stays clean
      if (venteId) await supabase.from('ventes').delete().eq('id', venteId)
      throw err
    }
    return
  }

  // ── GRIGNON ────────────────────────────────────────────────────────────────
  const { data: ld, error: lErr } = await supabase.from('voyage_livraisons').insert({
    voyage_id: parseInt(voyageId), date_livraison: form.date_livraison, type_produit: 'grignon',
    client_id: clientId, client_nom: cl?.nom || '',
    type_brique: 'Grignon',
    qte, prix_vente: pv, prix_achat: pa, remise: rem,
    frais_total, deductions_total, note: form.note || null,
  }).select().single()
  if (lErr) throw lErr

  if (ld?.id) {
    // total_vente omitted — GENERATED column, see the brique branch above for why.
    const { error: totErr } = await supabase.from('voyage_livraisons').update({ total_achat, marge }).eq('id', ld.id)
    if (totErr) throw totErr
    if (fraisItems.length > 0) {
      const { error: fraisInsErr } = await supabase.from('voyage_livraison_frais').insert(
        fraisItems.map(f => ({ livraison_id: ld.id, label: f.label, montant: parseFloat(f.montant) || 0, note: f.note || null, kind: f.kind || 'charge' }))
      )
      if (fraisInsErr) throw fraisInsErr
    }
  }

  const grignonAchats      = achats.filter(a => a.type_produit === 'grignon')
  const grignonAchat       = grignonAchats[grignonAchats.length - 1]
  const prixAchatGrignon   = pa > 0 ? pa : (grignonAchat?.prix_achat || 0)
  const totalAchatGrignon  = Math.round(qte * prixAchatGrignon * 100) / 100
  const margeGrignon       = Math.round((total_vente - totalAchatGrignon) * 100) / 100

  const grignonPayload = {
    date: form.date_livraison,
    client_id: clientId, client_nom: cl?.nom || '',
    camion_id: voyage?.camion_id || null, camion_plaque: voyage?.camion_plaque || '', chauffeur: voyage?.chauffeur || '',
    fournisseur_id: grignonAchat?.fournisseur_id || null,
    fournisseur_nom: grignonAchat?.fournisseur_nom || '',
    qte, prix_vente: pv, prix_achat: prixAchatGrignon,
    total_vente: accounting_total, total_achat: totalAchatGrignon, marge: margeGrignon,
    voyage_id: parseInt(voyageId),
  }
  let { data: grigData, error: grigErr } = await supabase.from('grignon_operations').insert(grignonPayload).select().single()
  if (grigErr) {
    // Same guard as saveAchat above: only retry when the column is genuinely
    // missing (Postgres undefined_column, 42703). Retrying on any other error
    // risked re-inserting a row that had already committed on the first
    // attempt, producing a duplicate grignon_operations record.
    const isMissingVoyageIdCol = grigErr.code === '42703' && /voyage_id/i.test(grigErr.message || '')
    if (!isMissingVoyageIdCol) throw new Error('Erreur grignon_operations: ' + grigErr.message)
    const { voyage_id: _vid, ...payloadWithoutVid } = grignonPayload
    const { data: grigData2, error: grigErr2 } = await supabase.from('grignon_operations').insert(payloadWithoutVid).select().single()
    if (grigErr2) throw new Error('Erreur grignon_operations: ' + grigErr2.message)
    grigData = grigData2
  }
  // Link back so update/delete can target this exact mirror row instead of
  // matching by client_id+date (sql/14_grignon_livraison_link.sql) — that
  // match is not unique and was silently corrupting/deleting unrelated rows.
  if (ld?.id && grigData?.id) {
    await supabase.from('voyage_livraisons').update({ grignon_operation_id: grigData.id }).eq('id', ld.id)
  }
  const { data: freshGcl } = await supabase.from('grignon_clients').select('solde').eq('id', clientId).single()
  if (freshGcl) await supabase.from('grignon_clients').update({ solde: (freshGcl.solde || 0) + accounting_total }).eq('id', clientId)
}

export async function updateLiv(old, editForm) {
  const qte = parseFloat(editForm.qte) || 0
  const pv  = parseFloat(editForm.prix_vente) || 0
  const pa  = parseFloat(editForm.prix_achat) || 0
  const rem = parseFloat(editForm.remise) || 0
  const total_vente = Math.round((qte * pv - rem) * 100) / 100
  const total_achat = Math.round(qte * pa * 100) / 100
  const marge       = Math.round((total_vente - total_achat) * 100) / 100

  const { items: fraisItems, total: new_frais_total, deductionsTotal: new_deductions_total, noteStr: frais_note } = computeFrais(editForm.frais)
  const new_accounting_total = Math.round((total_vente + new_frais_total) * 100) / 100
  const old_accounting_total = Math.round(((old.total_vente || 0) + (old.frais_total || 0)) * 100) / 100
  const diff = new_accounting_total - old_accounting_total

  // Try atomic RPC first
  const { error: rpcErr } = await supabase.rpc('update_voyage_livraison', {
    p_id: old.id, p_date: editForm.date_livraison, p_qte: qte,
    p_prix_vente: pv, p_prix_achat: pa, p_remise: rem,
    p_total_vente: total_vente, p_total_achat: total_achat, p_marge: marge,
    p_note: editForm.note || null,
  })

  if (rpcErr) {
    // Fallback: manual updates. total_vente omitted — GENERATED column
    // (qte * prix_vente); including it made this entire UPDATE statement
    // fail (Postgres rejects any direct write to a GENERATED column), so
    // NOTHING in this fallback — not even date/qte/prix — was ever actually
    // persisted, silently, because the error here was never checked.
    const { error: fallbackErr } = await supabase.from('voyage_livraisons').update({
      date_livraison: editForm.date_livraison, qte, prix_vente: pv, prix_achat: pa,
      remise: rem, note: editForm.note || null, total_achat, marge,
    }).eq('id', old.id)
    if (fallbackErr) throw fallbackErr
    if (old.vente_id) await supabase.from('ventes').update({
      qte, prix_vente: pv, prix_achat: pa,
      total_vente: new_accounting_total,
      note: editForm.note || null,
    }).eq('id', old.vente_id)
  } else {
    if (old.vente_id) await supabase.from('ventes').update({
      total_vente: new_accounting_total,
      note: editForm.note || null,
    }).eq('id', old.vente_id)
  }

  // Always sync note + frais on voyage_livraisons
  await supabase.from('voyage_livraisons').update({ note: editForm.note || null, frais_total: new_frais_total, deductions_total: new_deductions_total }).eq('id', old.id)
  if (old.vente_id) await supabase.from('ventes').update({ frais_note: frais_note || null }).eq('id', old.vente_id)

  // Replace frais records
  await supabase.from('voyage_livraison_frais').delete().eq('livraison_id', old.id)
  if (fraisItems.length > 0) {
    const { error: fraisInsErr } = await supabase.from('voyage_livraison_frais').insert(
      fraisItems.map(f => ({ livraison_id: old.id, label: f.label, montant: parseFloat(f.montant) || 0, note: f.note || null, kind: f.kind || 'charge' }))
    )
    if (fraisInsErr) throw fraisInsErr
  }

  // Update solde by difference. This is the SINGLE place solde is adjusted
  // for an edit — update_voyage_livraison (the RPC path above) used to also
  // apply its own diff to clients/grignon_clients.solde, so a successful RPC
  // call double-counted every edit that changed the billed amount. The RPC
  // no longer touches solde (see supabase_rpc.sql) precisely so this one
  // computation — which correctly includes frais/déductions, unlike the
  // RPC's product-only diff — is the only place it happens, on both the
  // RPC-success and RPC-fallback paths.
  if (diff !== 0 && old.client_id) {
    const tbl = old.type_produit === 'grignon' ? 'grignon_clients' : 'clients'
    const { data: freshCl } = await supabase.from(tbl).select('solde').eq('id', old.client_id).single()
    if (freshCl) await supabase.from(tbl).update({ solde: (freshCl.solde || 0) + diff }).eq('id', old.client_id)
  }

  // Sync grignon_operations — always target the exact mirror row by id when
  // linked (sql/14_grignon_livraison_link.sql). The client_id+date match
  // below is only a best-effort fallback for rows saved before that link
  // existed; it is not unique and can hit an unrelated row for the same
  // client on the same day (a different voyage, or historical data), so it
  // must never be the primary path.
  if (old.type_produit === 'grignon' && old.client_id) {
    const grigUpdate = {
      date: editForm.date_livraison, qte, prix_vente: pv, prix_achat: pa,
      total_vente: new_accounting_total, total_achat, marge,
    }
    if (old.grignon_operation_id) {
      await supabase.from('grignon_operations').update(grigUpdate).eq('id', old.grignon_operation_id)
    } else {
      // voyage_id narrows this to the one voyage being edited — without it,
      // two voyages delivering the same qte to the same client on the same
      // date (not unusual for recurring routes) would both match and both
      // get overwritten with this voyage's new values.
      await supabase.from('grignon_operations')
        .update(grigUpdate).eq('client_id', old.client_id).eq('date', old.date_livraison).eq('qte', old.qte).eq('voyage_id', old.voyage_id)
    }
  }
}

export async function delLiv(row) {
  const frais_total       = row.frais_total || 0
  const accounting_total  = Math.round(((row.total_vente || 0) + frais_total) * 100) / 100

  const { error: rpcErr } = await supabase.rpc('delete_voyage_livraison', { p_id: row.id })
  if (rpcErr) {
    await supabase.from('voyage_livraisons').delete().eq('id', row.id)
    if (row.client_id) {
      const tbl = row.type_produit === 'grignon' ? 'grignon_clients' : 'clients'
      const { data: freshCl } = await supabase.from(tbl).select('solde').eq('id', row.client_id).single()
      if (freshCl) await supabase.from(tbl).update({ solde: (freshCl.solde || 0) - accounting_total }).eq('id', row.client_id)
    }
  } else if (frais_total !== 0 && row.client_id) {
    const tbl = row.type_produit === 'grignon' ? 'grignon_clients' : 'clients'
    const { data: freshCl } = await supabase.from(tbl).select('solde').eq('id', row.client_id).single()
    if (freshCl) await supabase.from(tbl).update({ solde: (freshCl.solde || 0) - frais_total }).eq('id', row.client_id)
  }

  await supabase.from('voyage_livraison_frais').delete().eq('livraison_id', row.id)

  if (row.vente_id) {
    await supabase.from('ventes').delete().eq('id', row.vente_id)
  } else if (row.type_produit !== 'grignon' && row.voyage_id && row.client_id) {
    await supabase.from('ventes').delete()
      .eq('voyage_id', row.voyage_id).eq('client_id', row.client_id)
      .eq('date', row.date_livraison).is('type_entree', null)
  }

  // When the RPC succeeded, delete_voyage_livraison already removed the
  // grignon_operations mirror row (by exact id — see supabase_rpc.sql).
  // Only handle it here as a fallback when the RPC itself failed/isn't
  // installed, and even then prefer the exact link over the client+date
  // match, which is not unique (sql/14_grignon_livraison_link.sql).
  if (rpcErr && row.type_produit === 'grignon' && row.client_id) {
    if (row.grignon_operation_id) {
      await supabase.from('grignon_operations').delete().eq('id', row.grignon_operation_id)
    } else {
      // voyage_id-scoped for the same reason as updateLiv's fallback above —
      // client_id+date+qte alone is not unique across voyages.
      await supabase.from('grignon_operations')
        .delete().eq('client_id', row.client_id).eq('date', row.date_livraison).eq('qte', row.qte).eq('voyage_id', row.voyage_id)
    }
  }
}
