// ===============================================
// LỘC THIÊN ERP — Service Worker v4
// Handles: Caching ONLY (FCM handled by firebase-messaging-sw.js)
// ===============================================

// NOTE: Firebase Cloud Messaging is handled by firebase-messaging-sw.js
// DO NOT import firebase here — it causes conflicts with the FCM service worker

// === CACHING ===
const CACHE_NAME = 'lt-erp-v4';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/api.js',
    '/js/app.js',
    '/logo.png',
    '/manifest.json'
];

// Install — pre-cache critical assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker v4...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching static assets');
            return cache.addAll(STATIC_ASSETS).catch(err => {
                console.warn('[SW] Pre-cache partial failure:', err.message);
            });
        })
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker v4...');
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
    self.clients.claim();
});

// Fetch — Network-first for EVERYTHING (ensures fresh JS/HTML after deploy)
// Fallback to cache only when offline
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;

    // Skip API calls (except dashboard) — let browser handle them directly
    if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/reports/dashboard') {
            event.respondWith(networkFirstWithTimeout(request, 3000));
            return;
        }
        return;
    }

    // Network-first for static assets (HTML, JS, CSS)
    // Always try network first → update cache → fallback to cache if offline
    event.respondWith(
        fetch(request).then((response) => {
            if (response && response.status === 200) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
            }
            return response;
        }).catch(() => {
            // Network failed → serve from cache (offline support)
            return caches.match(request).then(cached => {
                return cached || new Response('Offline', { status: 503 });
            });
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
        const cached = await caches.match(request);
        if (cached) {
            console.log('[SW] Serving from cache (network failed):', request.url);
            return cached;
        }
        return new Response(JSON.stringify({ error: true, msg: 'Offline' }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;

    const orderId = event.notification.data?.orderId;
    const url = orderId ? `/?order=${orderId}` : '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (const client of windowClients) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    client.postMessage({
                        type: 'NOTIFICATION_CLICK',
                        data: event.notification.data
                    });
                    return;
                }
            }
            return clients.openWindow(url);
        })
    );
});

// Handle direct push events (fallback for non-FCM push)
self.addEventListener('push', (event) => {
    if (!event.data) return;
    try {
        const payload = event.data.json();
        const title = payload.notification?.title || payload.data?.title || 'Lộc Thiên ERP';
        const body = payload.notification?.body || payload.data?.body || 'Thông báo mới';

        event.waitUntil(
            self.registration.showNotification(title, {
                body,
                icon: '/logo.png',
                badge: '/logo.png',
                vibrate: [200, 100, 200],
                data: payload.data || {},
                requireInteraction: true
            })
        );
    } catch (e) {
        console.error('Push parse error:', e);
    }
});

// Listen for messages from main thread
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
    if (event.data?.type === 'INVALIDATE_CACHE') {
        caches.open(CACHE_NAME).then(cache => {
            cache.delete(event.data.url);
        });
    }
});

console.log('🔔 SW v4 loaded (Caching only — FCM in firebase-messaging-sw.js)');
