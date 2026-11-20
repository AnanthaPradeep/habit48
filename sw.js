const CACHE = 'habit48-v10'
const APP_SHELL = [
  './', './index.html', './routine.css', './routine-ui.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './brand/logo.svg',
]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll(APP_SHELL))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys
      .filter(key => key.startsWith('habit48-') && key !== CACHE)
      .map(key => caches.delete(key))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(CACHE)
    return await cache.match(request) ||
      (request.mode === 'navigate' ? await cache.match('./index.html') : null) ||
      Response.error()
  }))
})
