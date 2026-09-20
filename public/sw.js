/*
 * Service worker for the Lebombo field app.
 *
 * The job is narrow: make sure the app itself opens with no signal. The data is
 * already local — it lives in IndexedDB — so nothing here touches job cards, and
 * calls to the platform are never cached. A cached sync response would be a lie
 * about whether work reached the office.
 */

const VERSION = "v3"
const SHELL_CACHE = `lebombo-shell-${VERSION}`
const ASSET_CACHE = `lebombo-assets-${VERSION}`

/* Every route the app has. Job cards are edited at /job?id=… rather than a
 * dynamic path, so this short list really is the whole app — a technician can
 * open a card they have never opened before while out of signal. */
const SHELL_ROUTES = ["/", "/setup", "/job", "/sign", "/settings"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ROUTES))
      // A failed precache must not block activation; the runtime handler will
      // fill the cache on first visit instead.
      .catch(() => {})
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

/** Cache a copy without making the caller wait on it. */
function stash(cacheName, request, response) {
  if (!response || !response.ok || response.type === "opaque") return response
  const copy = response.clone()
  caches.open(cacheName).then((cache) => cache.put(request, copy)).catch(() => {})
  return response
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)

  // The platform's API. Always live — never served from cache.
  if (url.origin !== self.location.origin) return

  // Navigations: try the network so a deployed update is picked up, fall back
  // to the cached shell for that route.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => stash(SHELL_CACHE, request, response))
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE)
          return (
            (await cache.match(request, { ignoreSearch: true })) ??
            (await cache.match("/")) ??
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
          )
        })
    )
    return
  }

  // Build output is content-hashed, so a cache hit is always correct.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) => hit ?? fetch(request).then((r) => stash(ASSET_CACHE, request, r))
      )
    )
    return
  }

  // Icons, manifest and anything else same-origin: serve from cache when the
  // network is not there.
  event.respondWith(
    fetch(request)
      .then((response) => stash(ASSET_CACHE, request, response))
      .catch(() => caches.match(request).then((hit) => hit ?? Response.error()))
  )
})

/*
 * Background Sync, where the browser supports it (Chrome on Android). The app
 * also syncs whenever it is opened or the connection returns, which is what
 * carries iOS — Safari has no Background Sync.
 */
self.addEventListener("sync", (event) => {
  if (event.tag !== "lebombo-job-cards") return
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
      // The sync logic needs IndexedDB and the saved token, both of which the
      // page already has open. Waking a client is simpler and less duplicated
      // than reimplementing sync here.
      clients.forEach((client) => client.postMessage({ type: "sync-now" }))
    })
  )
})
