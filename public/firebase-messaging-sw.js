// ===============================================
// FIREBASE MESSAGING SERVICE WORKER
// Handles background push notifications (lock screen)
// ===============================================

// Import Firebase compat libraries for background messaging
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase config — must match the project
const firebaseConfig = {
    apiKey: "AIzaSyD-locthien-scm",
    authDomain: "locthien-scm.firebaseapp.com",
    projectId: "locthien-scm",
    storageBucket: "locthien-scm.firebasestorage.app",
    messagingSenderId: "831814732608",
    appId: "1:105188454064471829082:web:locthien"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle background push messages (when app is NOT in focus)
// This is what shows on LOCK SCREEN
messaging.onBackgroundMessage((payload) => {
    console.log('📬 BG push received:', payload);

    const title = payload.notification?.title || payload.data?.title || 'Lộc Thiên ERP';
    const body = payload.notification?.body || payload.data?.body || 'Bạn có thông báo mới';
    const orderId = payload.data?.orderId || '';
    const type = payload.data?.type || 'general';

    // Choose icon based on type
    const iconMap = {
        'order_assigned': '🚛',
        'order_edited': '⚠️',
        'order_rejected': '❌',
        'order_completed': '✅',
        'message': '💬'
    };

    const options = {
        body: body,
        icon: '/logo.png',
        badge: '/logo.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: orderId || type, // Group by order to avoid spam
        data: { orderId, type, ...payload.data },
        requireInteraction: true, // Stay on lock screen until tap
        actions: [
            { action: 'view', title: '📋 Xem đơn' },
            { action: 'dismiss', title: 'Bỏ qua' }
        ]
    };

    return self.registration.showNotification(title, options);
});

// Handle notification click on lock screen
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;

    const orderId = event.notification.data?.orderId;
    const url = orderId ? `/?order=${orderId}` : '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Focus existing tab
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
            // Open new tab
            return clients.openWindow(url);
        })
    );
});

// Handle direct push events (fallback)
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

console.log('🔔 Firebase Messaging SW loaded');
