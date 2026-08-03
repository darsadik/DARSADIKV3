import { supabase } from '../supabase'
import { DEFAULT_REMISE_CARBURANT_RATE } from './profitability'

const REMISE_CARBURANT_KEY = 'remise_carburant_rate'
const FUEL_OPENING_BALANCE_KEY = 'fuel_opening_balance'

// Global (not per-truck) starting balance for the Fuel module, representing
// whatever fuel balance existed before this ERP was used. Entered once by an
// administrator in /parametres — never a transaction, purchase, or Plein;
// see pages/gasoil/index.js for how it folds into "Balance Carburant Actuelle".
export const DEFAULT_FUEL_OPENING_BALANCE = 0

export async function fetchFuelOpeningBalance() {
  const { data } = await supabase.from('app_settings').select('value').eq('key', FUEL_OPENING_BALANCE_KEY).maybeSingle()
  const v = parseFloat(data?.value)
  return Number.isFinite(v) ? v : DEFAULT_FUEL_OPENING_BALANCE
}

export async function saveFuelOpeningBalance(value) {
  return supabase.from('app_settings').upsert({
    key: FUEL_OPENING_BALANCE_KEY,
    value: String(value),
    updated_at: new Date().toISOString(),
  })
}

// DH/L discount our fuel supplier gives on GASOIL only (never AdBlue).
// Falls back to DEFAULT_REMISE_CARBURANT_RATE if the row is missing so the
// app keeps working even before sql/11_remise_carburant.sql has been run.
export async function fetchRemiseCarburantRate() {
  const { data } = await supabase.from('app_settings').select('value').eq('key', REMISE_CARBURANT_KEY).maybeSingle()
  const v = parseFloat(data?.value)
  return Number.isFinite(v) ? v : DEFAULT_REMISE_CARBURANT_RATE
}

export async function saveRemiseCarburantRate(rate) {
  return supabase.from('app_settings').upsert({
    key: REMISE_CARBURANT_KEY,
    value: String(rate),
    updated_at: new Date().toISOString(),
  })
}
