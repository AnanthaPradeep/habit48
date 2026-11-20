const CACHE = '__CACHE__'
const FILES = /* __ASSETS__ */ []
const scope = self.registration.scope
const index = new URL('index.html', scope).href
const assets = new Set(FILES.map(path => new URL(path, scope).href))

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll([...assets].map(url => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('habit48-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET' || !request.url.startsWith(scope) || request.headers.has('Authorization')) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-cache' }).catch(async () => {
      const cache = await caches.open(CACHE)
      return await cache.match(index, { ignoreVary: true }) ?? Response.error()
    }))
  } else if (assets.has(request.url) && request.url !== index) {
    // Module requests can send Origin while the install request omits it.
    // The allowlist below contains only public files with invariant contents.
    event.respondWith(caches.open(CACHE).then(async cache =>
      await cache.match(request.url, { ignoreVary: true }) ?? fetch(request)))
  }
})
