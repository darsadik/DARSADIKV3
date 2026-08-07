import { useState, useEffect } from 'react'

// ── Number & date formatters ─────────────────────────────────────────────────
// Rounds to integer and formats with Moroccan locale (e.g. 1 234)
export const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')

// Two-decimal float string (e.g. 1.75)
export const fmtD = n => parseFloat(n || 0).toFixed(2)

// French accounting format for monetary amounts: "." thousands, "," decimals, always 2 decimals (e.g. 300.000,00)
export const fmtMoney = n => {
  const num = Number(n) || 0
  const sign = num < 0 ? '-' : ''
  const [intPart, decPart] = Math.abs(num).toFixed(2).split('.')
  return sign + intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + decPart
}

// ── French number-to-words (for "Arrêté à la somme de" statement wording) ────
const FR_UNITS = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
const FR_TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']

// 0-99. "soixante-dix"/"quatre-vingt-dix" ranges reuse the 60/80 stem + a "teen" tail.
function frTwoDigits(n) {
  if (n < 20) return FR_UNITS[n]
  const t = Math.floor(n / 10), u = n % 10
  if (t === 7 || t === 9) {
    if (u === 1 && t === 7) return FR_TENS[t] + ' et onze'
    return FR_TENS[t] + '-' + FR_UNITS[10 + u]
  }
  if (u === 0) return FR_TENS[t] + (t === 8 ? 's' : '')
  if (u === 1) return FR_TENS[t] + ' et un'
  return FR_TENS[t] + '-' + FR_UNITS[u]
}

// 0-999. "cent"/"vingt" only pluralize when they close the group with nothing after.
function frChunk(n) {
  const h = Math.floor(n / 100), rem = n % 100
  const words = []
  if (h > 0) words.push(h === 1 ? 'cent' : FR_UNITS[h] + ' cent' + (rem === 0 ? 's' : ''))
  if (rem > 0) words.push(frTwoDigits(rem))
  return words.join(' ')
}

function numberToFrenchWords(n) {
  let v = Math.floor(Math.abs(n || 0))
  if (v === 0) return 'zéro'
  const milliards = Math.floor(v / 1e9); v %= 1e9
  const millions = Math.floor(v / 1e6); v %= 1e6
  const mille = Math.floor(v / 1e3); v %= 1e3
  const unites = v
  // "million(s)"/"milliard(s)" take "de" before the noun only when nothing numeric follows them.
  const bareTail = mille === 0 && unites === 0
  const parts = []
  if (milliards > 0) {
    const bare = bareTail && millions === 0
    parts.push((milliards === 1 ? 'un' : frChunk(milliards)) + ' milliard' + (milliards > 1 ? 's' : '') + (bare ? ' de' : ''))
  }
  if (millions > 0) parts.push((millions === 1 ? 'un' : frChunk(millions)) + ' million' + (millions > 1 ? 's' : '') + (bareTail ? ' de' : ''))
  if (mille > 0) parts.push(mille === 1 ? 'mille' : frChunk(mille) + ' mille')
  if (unites > 0) parts.push(frChunk(unites))
  return parts.join(' ')
}

// Full monetary amount in French words, e.g. 621120 → "Six cent vingt et un mille cent vingt dirhams."
export function montantEnLettres(n) {
  const num = Math.abs(Number(n) || 0)
  const intPart = Math.floor(num)
  const centimes = Math.round((num - intPart) * 100)
  let words = numberToFrenchWords(intPart) + ' dirham' + (intPart > 1 ? 's' : '')
  if (centimes > 0) words += ' et ' + numberToFrenchWords(centimes) + ' centime' + (centimes > 1 ? 's' : '')
  return words.charAt(0).toUpperCase() + words.slice(1) + '.'
}

// YYYY-MM-DD → DD/MM/YYYY
export const fmtDate = d => {
  if (!d) return '—'
  const [y, m, j] = d.split('-')
  return `${j}/${m}/${y}`
}

// ── Date helpers ─────────────────────────────────────────────────────────────
export const today = () => new Date().toISOString().split('T')[0]

export const startOfMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// ── Grignon statement ordering ───────────────────────────────────────────────
// Natural operational order for grignon achats/livraisons: date, then truck
// (so every operation of a given camion on a given day stays together), then
// voyage (chronological — assumes serial voyage_id roughly tracks creation
// order, which is the closest proxy available since operations carry no
// separate trip-sequence field), then record id as the final tie-breaker.
// Screen table, print view, and PDF all render the same filtered array this
// sorts, so applying it once here keeps all three in sync automatically.
export function sortGrignonRecords(list) {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    const ca = a.camion_plaque || '', cb = b.camion_plaque || ''
    if (ca !== cb) return ca.localeCompare(cb)
    const va = a.voyage_id ?? -1, vb = b.voyage_id ?? -1
    if (va !== vb) return va - vb
    return (a.id ?? 0) - (b.id ?? 0)
  })
}

// Maps a 0-80 confidence score (lib/services/voyage/fuelSuggestions.js's cap)
// to a 1-5 star count for display — never 0 stars, since the function that
// produces these scores only ever returns candidates worth showing at all.
export function confidenceToStars(confidence, maxStars = 5) {
  const pct = Math.max(0, Math.min(80, confidence || 0)) / 80
  return Math.max(1, Math.round(pct * maxStars))
}

// ── Responsive hook ──────────────────────────────────────────────────────────
export function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const check = () => setM(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return m
}

// ── Print overlay (iframe-based, PWA-safe) ───────────────────────────────────
// Opens a full-screen overlay containing the given HTML in a sandboxed iframe.
// The user triggers print from inside the iframe — the host page never navigates.
export function openPrintWindow(html) {
  const old = document.getElementById('__print_overlay')
  if (old) old.remove()
  const isMobile = window.innerWidth < 768
  const overlay = document.createElement('div')
  overlay.id = '__print_overlay'
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9999;background:#1e293b;display:flex;flex-direction:column'
  const bar = document.createElement('div')
  bar.style.cssText =
    'display:flex;align-items:center;gap:8px;padding:10px 16px;background:#0f172a;flex-shrink:0'
  const printBtn = isMobile
    ? '<button onclick="document.getElementById(\'__pframe\').contentWindow.print()" style="padding:7px 18px;background:#16a34a;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">📥 Télécharger PDF</button>'
    : '<button onclick="document.getElementById(\'__pframe\').contentWindow.print()" style="padding:7px 18px;background:#1a5fa8;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">🖨️ Imprimer</button>'
  bar.innerHTML =
    printBtn +
    '<button onclick="document.getElementById(\'__print_overlay\').remove()" style="padding:7px 18px;background:#ef4444;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">✕ Fermer</button>'
  const iframe = document.createElement('iframe')
  iframe.id = '__pframe'
  iframe.style.cssText = 'flex:1;border:none;width:100%;background:#fff'
  overlay.appendChild(bar)
  overlay.appendChild(iframe)
  document.body.appendChild(overlay)
  iframe.contentWindow.document.write(html)
  iframe.contentWindow.document.close()
}
