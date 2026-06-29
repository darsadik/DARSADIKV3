import { supabase } from '../../supabase'

// CRITICAL: Promise.all query order is load-bearing.
// index 5 → type_briques  (ty) — must stay at index 5
// index 6 → grignon_clients (gc) — must stay at index 6
// Swapping these two causes form dropdowns to silently show wrong data.
export async function loadVoyageData(id) {
  const [
    { data: v,   error: ev  },
    { data: ca,  error: eca },
    { data: cl },
    { data: fo },
    { data: gf },
    { data: ty },
    { data: gc },
    { data: ac },
    { data: li },
    { data: re },
    { data: ga },
    { data: ch },
    { data: loc },
    { data: lo },
  ] = await Promise.all([
    supabase.from('voyages').select('*').eq('id', id).single(),
    supabase.from('camions').select('*').order('plaque'),
    supabase.from('clients').select('*').order('nom'),
    supabase.from('fournisseurs').select('*').order('nom'),
    supabase.from('grignon_fournisseurs').select('*').order('nom'),
    supabase.from('type_briques').select('*').order('nom'),       // index 5 → ty
    supabase.from('grignon_clients').select('*').order('nom'),    // index 6 → gc
    supabase.from('voyage_achats').select('*').eq('voyage_id', id).order('created_at'),
    supabase.from('voyage_livraisons').select('*').eq('voyage_id', id).order('created_at'),
    supabase.from('voyage_retours').select('*').eq('voyage_id', id).order('created_at'),
    supabase.from('voyage_gasoil').select('*').eq('voyage_id', id).order('created_at'),
    supabase.from('voyage_charges').select('*').eq('voyage_id', id).order('created_at'),
    supabase.from('voyage_locations').select('*').eq('voyage_id', id).order('created_at'),
    supabase.from('loueurs').select('*').order('nom'),
  ])

  if (ev)  throw new Error('Voyage introuvable')
  if (eca) throw new Error('Erreur chargement camions')

  // Attach frais to each livraison (silent fail if table not yet created)
  const livIds = (li || []).map(l => l.id)
  let fraisMap = {}
  if (livIds.length > 0) {
    const { data: fraisData } = await supabase
      .from('voyage_livraison_frais')
      .select('*')
      .in('livraison_id', livIds)
    ;(fraisData || []).forEach(f => {
      if (!fraisMap[f.livraison_id]) fraisMap[f.livraison_id] = []
      fraisMap[f.livraison_id].push(f)
    })
  }
  const livraisons = (li || []).map(l => ({ ...l, frais: fraisMap[l.id] || [] }))

  return {
    voyage:              v,
    camions:             ca  || [],
    clients:             cl  || [],
    fournisseurs:        fo  || [],
    grignonFournisseurs: gf  || [],
    typeBriques:         ty  || [],
    grignonClients:      gc  || [],
    achats:              ac  || [],
    livraisons,
    retours:             re  || [],
    gasoil:              ga  || [],
    charges:             ch  || [],
    locations:           loc || [],
    loueurs:             lo  || [],
  }
}
