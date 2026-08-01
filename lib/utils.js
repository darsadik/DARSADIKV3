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
