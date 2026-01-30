// ===============================================
// NOTIFICATION MODULE
// Handles push notification registration and display
// ===============================================

const NotificationModule = {
    vapidKey: null, // Will be set from Firebase Console
    initialized: false,

    // Initialize Firebase Messaging in browser
    async init() {
        if (this.initialized) return true;

        // Check if notifications are supported
        if (!('Notification' in window)) {
            console.log('❌ This browser does not support notifications');
            return false;
        }

        // Check if service workers are supported
        if (!('serviceWorker' in navigator)) {
            console.log('❌ Service workers not supported');
            return false;
        }

        try {
            // Register service worker
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            console.log('✅ Service Worker registered:', registration.scope);

            this.initialized = true;
            return true;
        } catch (e) {
            console.error('❌ Service Worker registration failed:', e);
            return false;
        }
    },

    // Request notification permission
    async requestPermission() {
        const permission = await Notification.requestPermission();
        console.log('🔔 Notification permission:', permission);
        return permission === 'granted';
    },

    // Get FCM token and register with backend
    async registerForNotifications(userId) {
        if (!userId) {
            console.log('⚠️ No userId provided');
            return false;
        }

        try {
            // Make sure we're initialized
            if (!this.initialized) {
                await this.init();
            }

            // Request permission
            const granted = await this.requestPermission();
            if (!granted) {
                console.log('⚠️ Notification permission denied');
                return false;
            }

            // Get the service worker registration
            const registration = await navigator.serviceWorker.ready;

            // Subscribe to push (using web push API)
            // Note: For FCM, we need to use Firebase SDK in frontend
            // This is a simplified version using localStorage mock
            const token = await this.getMockToken();

            if (token) {
                // Register token with backend
                const res = await api.registerFcmToken(userId, token);
                if (!res.error) {
                    localStorage.setItem('LT_FCM_TOKEN', token);
                    console.log('✅ Push notification registered');
                    return true;
                }
            }

            return false;
        } catch (e) {
            console.error('❌ Push registration error:', e);
            return false;
        }
    },

    // Mock token for development (replace with real FCM SDK)
    async getMockToken() {
        // In production, use Firebase SDK: messaging.getToken({ vapidKey: this.vapidKey })
        const existingToken = localStorage.getItem('LT_FCM_TOKEN');
        if (existingToken) return existingToken;

        // Generate mock token for development
        const mockToken = 'mock_fcm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        return mockToken;
    },

    // Show in-app notification
    showInAppNotification(title, body, options = {}) {
        const container = document.getElementById('notification-toast') || this.createToastContainer();

        const toast = document.createElement('div');
        toast.className = 'notification-toast';
        toast.innerHTML = `
            <div class="toast-icon">🔔</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-body">${body}</div>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;

        // Play sound
        if (options.sound !== false) {
            this.playNotificationSound();
        }

        container.appendChild(toast);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 5000);

        // Click handler
        if (options.onClick) {
            toast.style.cursor = 'pointer';
            toast.addEventListener('click', options.onClick);
        }
    },

    // Play notification sound
    playNotificationSound() {
        try {
            const audio = new Audio('/sounds/notification.mp3');
            audio.volume = 0.5;
            audio.play().catch(() => { });
        } catch (e) {
            console.log('Could not play notification sound');
        }
    },

    // Create toast container if not exists
    createToastContainer() {
        let container = document.getElementById('notification-toast');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-toast';
            container.className = 'notification-container';
            document.body.appendChild(container);
        }
        return container;
    }
};

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    NotificationModule.init();
});

// Listen for messages from service worker
navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data.type === 'NOTIFICATION_CLICK') {
        console.log('📬 Notification clicked:', event.data);
        // Handle navigation to order
        if (event.data.data?.orderId) {
            window.viewOrderDetail?.(event.data.data.orderId);
        }
    }
});

window.NotificationModule = NotificationModule;
