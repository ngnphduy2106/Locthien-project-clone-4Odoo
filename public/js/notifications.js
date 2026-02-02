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

// ===============================================
// IN-APP NOTIFICATION PANEL
// ===============================================

let notificationPollingInterval = null;

// Toggle notification panel visibility
function toggleNotificationPanel(event) {
    event?.stopPropagation();
    const panel = document.getElementById('notification-panel');
    const isHidden = panel.classList.contains('hidden');

    // Close user menu if open
    const userMenu = document.getElementById('user-menu');
    if (userMenu) userMenu.classList.add('hidden');

    if (isHidden) {
        panel.classList.remove('hidden');
        loadNotifications();
    } else {
        panel.classList.add('hidden');
    }
}

// Load notifications from API
async function loadNotifications() {
    const user = JSON.parse(localStorage.getItem('LT_USER') || '{}');
    const userId = user.fullName || user.name || user.phone;

    if (!userId) return;

    try {
        const res = await fetch(`/api/notifications/${encodeURIComponent(userId)}`);
        const data = await res.json();

        if (!data.error) {
            renderNotifications(data.data || []);
            updateNotificationBadge(data.unreadCount || 0);
        }
    } catch (e) {
        console.error('Load notifications error:', e);
    }
}

// Render notifications in panel
function renderNotifications(notifications) {
    const list = document.getElementById('notification-list');
    if (!list) return;

    if (!notifications.length) {
        list.innerHTML = `
            <div class="notification-empty">
                <i class="bi bi-bell-slash"></i>
                <span>Không có thông báo mới</span>
            </div>
        `;
        return;
    }

    const iconMap = {
        'message': '💬',
        'order_assigned': '🚛',
        'order_completed': '✅',
        'misa_new_order': '📦'
    };

    const typeClassMap = {
        'message': 'message',
        'order_assigned': 'order',
        'order_completed': 'complete',
        'misa_new_order': 'misa'
    };

    list.innerHTML = notifications.map(n => {
        const icon = iconMap[n.type] || '🔔';
        const typeClass = typeClassMap[n.type] || 'order';
        const unreadClass = n.is_read ? '' : 'unread';
        const time = formatNotificationTime(n.created_at);

        return `
            <div class="notification-item ${unreadClass}" onclick="handleNotificationClick('${n.id}', '${n.order_id || ''}')">
                <div class="notification-icon ${typeClass}">${icon}</div>
                <div class="notification-content">
                    <div class="notification-title">${escapeHtml(n.title)}</div>
                    <div class="notification-body">${escapeHtml(n.body)}</div>
                    <div class="notification-time">${time}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Handle notification click
async function handleNotificationClick(notificationId, orderId) {
    // Mark as read
    try {
        await fetch(`/api/notifications/${notificationId}/read`, { method: 'PUT' });
    } catch (e) { }

    // Close panel
    document.getElementById('notification-panel')?.classList.add('hidden');

    // Navigate to order if available
    if (orderId && window.viewOrderDetail) {
        window.viewOrderDetail(orderId);
    }

    // Reload notifications
    loadNotifications();
}

// Mark all notifications as read
async function markAllNotificationsRead() {
    const user = JSON.parse(localStorage.getItem('LT_USER') || '{}');
    const userId = user.fullName || user.name || user.phone;

    if (!userId) return;

    try {
        await fetch(`/api/notifications/mark-all-read/${encodeURIComponent(userId)}`, { method: 'PUT' });
        loadNotifications();
    } catch (e) {
        console.error('Mark all read error:', e);
    }
}

// Update badge count
function updateNotificationBadge(count) {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;

    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// Format notification time
function formatNotificationTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Vừa xong';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} phút trước`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ trước`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} ngày trước`;

    return date.toLocaleDateString('vi-VN');
}

// Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Start polling for notifications
function startNotificationPolling() {
    if (notificationPollingInterval) return;

    // Initial load
    loadNotifications();

    // Poll every 30 seconds
    notificationPollingInterval = setInterval(() => {
        loadNotifications();
    }, 30000);
}

// Close panel when clicking outside
document.addEventListener('click', (e) => {
    const panel = document.getElementById('notification-panel');
    const wrapper = document.querySelector('.notification-wrapper');

    if (panel && wrapper && !wrapper.contains(e.target)) {
        panel.classList.add('hidden');
    }
});

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    NotificationModule.init();

    // Start polling after login
    setTimeout(() => {
        const user = localStorage.getItem('LT_USER');
        if (user) {
            startNotificationPolling();
        }
    }, 2000);
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

// Export functions globally
window.NotificationModule = NotificationModule;
window.toggleNotificationPanel = toggleNotificationPanel;
window.loadNotifications = loadNotifications;
window.markAllNotificationsRead = markAllNotificationsRead;
window.handleNotificationClick = handleNotificationClick;
window.startNotificationPolling = startNotificationPolling;
