import { supabase } from '../../supabase'
import { recalcOdometerChain } from './updates'

// Truck ↔ Voyage ("Plan") linking — same shape as gasoilLink.js: one small
// service file, two primitives, shared by every UI caller (Truck Control
// Center's Link/Change/Unlink actions). Writes only voyages.camion_id/
// camion_plaque/chauffeur — the exact same fields pages/voyages/index.js's
// own "Modifier le voyage" form (updateVoyage) already writes when the user
// changes a voyage's Camion dropdown. Never touches achats/livraisons/
// charges/retours/voyage_gasoil/gasoil — all of those key off voyage_id,
// not camion_id, so they stay untouched and fully intact.
export async function linkCamionToVoyage({ voyageId, camion, previousCamionId }) {
  const { error } = await supabase.from('voyages').update({
    camion_id: camion.id,
    camion_plaque: camion.plaque || '',
    chauffeur: camion.chauffeur || '',
  }).eq('id', voyageId)
  if (error) throw error
  await recalcOdometerChain(camion.id)
  if (previousCamionId && previousCamionId !== camion.id) await recalcOdometerChain(previousCamionId)
}

// "Unlink" — clears the truck association only. voyage_gasoil/gasoil/
// achats/livraisons/charges/retours rows for this voyage are never touched,
// so all fuel-voyage and accounting history stays intact and stays linked
// to this voyage by its own id. Every reader of camion_id already treats
// null as an anticipated case (deriveVoyageStatus, buildFuelMapsByCamion,
// etc. all null-guard it) — this is not a new edge case for the app.
export async function unlinkCamionFromVoyage({ voyageId, camionId }) {
  const { error } = await supabase.from('voyages').update({
    camion_id: null, camion_plaque: '', chauffeur: '',
  }).eq('id', voyageId)
  if (error) throw error
  if (camionId) await recalcOdometerChain(camionId)
}
