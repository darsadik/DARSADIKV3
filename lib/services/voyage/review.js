import { supabase } from '../../supabase'

// Toggles Review Mode's "reviewed" checkbox (sql/09_voyage_review.sql).
// New file, separate from updates.js, so nothing about the existing
// voyage workflow (statut/km/fuel_mode) is touched by this feature.
export async function setReviewed(id, reviewed, userEmail) {
  await supabase.from('voyages').update({
    reviewed_at: reviewed ? new Date().toISOString() : null,
    reviewed_by: reviewed ? (userEmail || null) : null,
  }).eq('id', id)
}
