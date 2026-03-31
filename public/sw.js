// ===============================================
// LỘC THIÊN ERP — Service Worker
// Caching strategy: Network-first for API, Cache-first for static assets
// ===============================================

const CACHE_NAME = 'lt-erp-v2';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/api.js',
    '/js/app.js',
    '/logo.png',
    '/manifest.json'
];

// External CDN resources to cache
const CDN_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css',
    'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css'
];

// Install — pre-cache critical assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker v2...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching static assets');
            // Cache local assets (ignore failures for CDN)
            return cache.addAll(STATIC_ASSETS).catch(err => {
                console.warn('[SW] Pre-cache partial failure:', err.message);
            });
        })
    );
    // Activate immediately (skip waiting)
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker v2...');
    event.waitUntil(
        caches.keys().then((names) => {
            return Promise.all(
                names.filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] Removing old cache:', name);
                        return caches.delete(name);
                    })
            );
        })
    );
    // Take control of all pages immediately
    self.clients.claim();
});

// Fetch — Network-first for API, Stale-while-revalidate for static
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests (POST, PUT, DELETE)
    if (request.method !== 'GET') return;

    // === API requests: Network-first, fallback to cache ===
    if (url.pathname.startsWith('/api/')) {
        // Dashboard stats: cache for 2 minutes
        if (url.pathname === '/api/reports/dashboard') {
            event.respondWith(networkFirstWithTimeout(request, 3000));
            return;
        }
        // Other API calls: always network (no cache)
        return;
    }

    // === Static assets: Stale-while-revalidate ===
    event.respondWith(
        caches.match(request).then((cached) => {
            // Return cached immediately, fetch fresh in background
            const fetchPromise = fetch(request).then((response) => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return response;
            }).catch(() => {
                // Network failed — cached version is all we have
                return cached;
            });

            return cached || fetchPromise;
        })
    );
});

// Helper: Network-first with timeout fallback to cache
async function networkFirstWithTimeout(request, timeoutMs) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response && response.status === 200) {
            const clone = response.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, clone);
        }
        return response;
    } catch (err) {
        // Network failed or timed out — use cache
        const cached = await caches.match(request);
        if (cached) {
            console.log('[SW] Serving from cache (network failed):', request.url);
            return cached;
        }
        // No cache either — return error response
        return new Response(JSON.stringify({ error: true, msg: 'Offline' }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Listen for messages from main thread
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
    // Invalidate specific cache entries
    if (event.data?.type === 'INVALIDATE_CACHE') {
        caches.open(CACHE_NAME).then(cache => {
            cache.delete(event.data.url);
        });
    }
});
