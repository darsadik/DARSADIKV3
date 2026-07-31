import { supabase } from '../../supabase'
import { CHARGE_CATS } from '../../voyage-constants'

export async function saveChargeGrid(voyageId, date, chgGrid, chgFactureMap, { clients, voyage }) {
  const rows = CHARGE_CATS.filter(cat => parseFloat(chgGrid[cat.key]) > 0)
  const vcIds = []

  for (const cat of rows) {
    const montant = parseFloat(chgGrid[cat.key])||0
    const clientId = chgFactureMap[cat.key] ? parseInt(chgFactureMap[cat.key]) : null
    const cl = clientId ? clients.find(c=>c.id===clientId) : null
    const { data: vcData, error } = await supabase.from('voyage_charges').insert({
      voyage_id: parseInt(voyageId), date_charge: date, categorie: cat.key, description: cat.label,
      montant, facture_client: !!cl, client_id: cl ? clientId : null, client_nom: cl?.nom||null,
    }).select().single()
    if (error) throw error
    if (vcData?.id) vcIds.push(vcData.id)
    if (cl) {
      const { data: vd } = await supabase.from('ventes').insert({
        date: date, client_id: clientId, client_nom: cl.nom,
        camion_id: voyage?.camion_id||null, camion_plaque: voyage?.camion_plaque||'',
        type_entree: 'mdo', montant_mdo: montant, description_mdo: cat.label, voyage_id: parseInt(voyageId),
      }).select().single()
      // Best-effort back-link so statement pages can resolve this charge's
      // source row (sql/08_transaction_mirror_links.sql).
      if (vcData?.id && vd?.id) {
        await supabase.from('voyage_charges').update({ vente_id: vd.id }).eq('id', vcData.id)
      }
      // Fresh-read client before updating solde
      const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', clientId).single()
      if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde||0)+montant }).eq('id', clientId)
    }
  }

  // Mirror to global charges table so /charges page shows voyage charges
  const globalPayload = {
    date:          date,
    camion_id:     voyage?.camion_id     || null,
    camion_plaque: voyage?.camion_plaque || '',
    note:          voyage?.reference     || `Voyage #${voyageId}`,
    total:         rows.reduce((s, cat) => s + (parseFloat(chgGrid[cat.key]) || 0), 0),
  }
  CHARGE_CATS.forEach(cat => { globalPayload[cat.key] = parseFloat(chgGrid[cat.key]) || 0 })
  const { data: chData } = await supabase.from('charges').insert(globalPayload).select().single()

  // Link every voyage_charges row from this save back to the single
  // aggregate charges row (sql/15_charges_mirror_link.sql) so update/delete
  // can target it by exact id instead of date+camion_id, which isn't unique
  // when the same truck has two voyages on the same day.
  if (chData?.id && vcIds.length > 0) {
    await supabase.from('voyage_charges').update({ charge_id: chData.id }).in('id', vcIds)
  }
}

export async function updateCharge(old, editForm, camionId) {
  const montant = parseFloat(editForm.montant)||0
  const { error } = await supabase.from('voyage_charges').update({
    date_charge: editForm.date_charge, montant
  }).eq('id', old.id)
  if (error) throw error

  const diff = montant - (old.montant||0)
  if (diff !== 0) {
    // Sync client solde + linked vente if billed to client
    if (old.facture_client && old.client_id) {
      const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', old.client_id).single()
      if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde||0)+diff }).eq('id', old.client_id)
      await supabase.from('ventes')
        .update({ montant_mdo: montant })
        .eq('voyage_id', old.voyage_id)
        .eq('client_id', old.client_id)
        .eq('type_entree', 'mdo')
        .eq('montant_mdo', old.montant)
        .eq('description_mdo', old.description)
    }
    // Sync global charges table — exact link first (sql/15), since
    // date+camion_id alone can collide when a truck has two voyages the
    // same day, silently updating the wrong voyage's charges row.
    if (old.categorie) {
      const chRow = old.charge_id
        ? (await supabase.from('charges').select('*').eq('id', old.charge_id).maybeSingle()).data
        : camionId
          ? (await supabase.from('charges').select('*').eq('date', old.date_charge).eq('camion_id', camionId).limit(1).maybeSingle()).data
          : null
      if (chRow) {
        const newCatVal = Math.max(0, (chRow[old.categorie] || 0) + diff)
        const newTotal  = Math.max(0, (chRow.total || 0) + diff)
        await supabase.from('charges')
          .update({ [old.categorie]: newCatVal, total: newTotal })
          .eq('id', chRow.id)
      }
    }
  }
}

export async function delCharge(row, camionId) {
  const { error } = await supabase.from('voyage_charges').delete().eq('id', row.id)
  if (error) throw error

  // Reverse client solde + linked vente if billed to client
  if (row.facture_client && row.client_id) {
    const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', row.client_id).single()
    if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde||0) - (row.montant||0) }).eq('id', row.client_id)
    await supabase.from('ventes')
      .delete()
      .eq('voyage_id', row.voyage_id)
      .eq('client_id', row.client_id)
      .eq('type_entree', 'mdo')
      .eq('montant_mdo', row.montant)
      .eq('description_mdo', row.description)
  }

  // Update the mirrored charges row: zero out this category and reduce
  // total — exact link first (sql/15), same collision risk as updateCharge.
  if (row.categorie) {
    const chRow = row.charge_id
      ? (await supabase.from('charges').select('*').eq('id', row.charge_id).maybeSingle()).data
      : camionId
        ? (await supabase.from('charges').select('*').eq('date', row.date_charge).eq('camion_id', camionId).limit(1).maybeSingle()).data
        : null
    if (chRow) {
      const newTotal = Math.max(0, (chRow.total || 0) - (row.montant || 0))
      await supabase.from('charges')
        .update({ [row.categorie]: 0, total: newTotal })
        .eq('id', chRow.id)
    }
  }
}
