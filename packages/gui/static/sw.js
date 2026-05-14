// omo-reader service worker
//
// Two simple strategies:
//   - Hashed Vite assets (/assets/*) are immutable → cache-first, never expire.
//   - Everything else (HTML shell, manifest, icons) → network-first with
//     fallback to cached copy so the app loads offline once visited.
//
// API responses, archive contents, and dynamic images are NEVER cached here.
// The browser's own HTTP cache handles them per the server's Cache-Control.
// Bump CACHE_VERSION to force clients to drop stale shell entries.

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `omo-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `omo-runtime-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
	event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
	event.waitUntil((async () => {
		const keys = await caches.keys();
		await Promise.all(
			keys
				.filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
				.map((k) => caches.delete(k)),
		);
		await self.clients.claim();
	})());
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;

	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;

	// Never intercept API or reader-stream routes.
	if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/reader/')) return;

	// Hashed Vite assets are content-addressed → cache-first forever.
	if (url.pathname.startsWith('/assets/')) {
		event.respondWith(cacheFirst(req, STATIC_CACHE));
		return;
	}

	// Shell (HTML, manifest, icons, top-level static files) → network-first.
	event.respondWith(networkFirst(req, RUNTIME_CACHE));
});

async function cacheFirst(req, cacheName) {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(req);
	if (cached) return cached;
	const res = await fetch(req);
	if (res.ok) cache.put(req, res.clone());
	return res;
}

async function networkFirst(req, cacheName) {
	const cache = await caches.open(cacheName);
	try {
		const res = await fetch(req);
		if (res.ok) cache.put(req, res.clone());
		return res;
	} catch (err) {
		const cached = await cache.match(req);
		if (cached) return cached;
		throw err;
	}
}
