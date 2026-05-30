// DAR SADIK — Service Worker
// Caches the app shell for offline use

const CACHE_NAME = 'darsadik-v1'
const STATIC_ASSETS = [
  '/',
  '/ventes',
  '/clients',
  '/paiements',
  '/retours',
  '/grignon',
  '/gasoil',
]

// Install — cache static pages
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {})
    })
  )
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch — network first, fallback to cache
self.addEventListener('fetch', event => {
  // Skip non-GET and Supabase API calls
  if (event.request.method !== 'GET') return
  if (event.request.url.includes('supabase.co')) return
  if (event.request.url.includes('_next/')) return

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful page responses
        if (response.ok && event.request.mode === 'navigate') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => {
        // Offline fallback — return cached version
        return caches.match(event.request).then(cached => {
          if (cached) return cached
          // Return cached home if nothing found
          return caches.match('/')
        })
      })
  )
})
