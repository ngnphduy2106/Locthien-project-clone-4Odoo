// ===============================================
// FIREBASE MESSAGING SERVICE WORKER
// Handles background push notifications
// ===============================================

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase config from Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyD-locthien-scm",
    authDomain: "locthien-scm.firebaseapp.com",
    projectId: "locthien-scm",
    storageBucket: "locthien-scm.firebasestorage.app",
    messagingSenderId: "105188454064471829082",
    appId: "1:105188454064471829082:web:locthien"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('📬 Background message received:', payload);

    const notificationTitle = payload.notification?.title || 'Lộc Thiên ERP';
    const notificationOptions = {
        body: payload.notification?.body || 'Bạn có thông báo mới',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        vibrate: [200, 100, 200],
        tag: payload.data?.orderId || 'general',
        data: payload.data,
        requireInteraction: true,
        actions: [
            { action: 'view', title: 'Xem ngay' },
            { action: 'dismiss', title: 'Bỏ qua' }
        ]
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('🖱️ Notification clicked:', event.action);
    event.notification.close();

    if (event.action === 'dismiss') return;

    // Open or focus the app
    const urlToOpen = event.notification.data?.orderId
        ? `/?section=my-orders&order=${event.notification.data.orderId}`
        : '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                // Focus existing window if open
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
                // Open new window
                return clients.openWindow(urlToOpen);
            })
    );
});

// Handle push event directly (fallback)
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        console.log('📬 Push event:', data);
    }
});

console.log('🔔 Firebase Messaging Service Worker loaded');
