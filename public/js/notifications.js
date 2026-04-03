// ===============================================
// NOTIFICATION MODULE
// Handles push notification registration and display
// ===============================================

const NotificationModule = {
    // VAPID key from Firebase Console > Cloud Messaging > Web Push certificates
    vapidKey: 'BOlhHKZU6BMEorXN0tDzDXVjRQ8hHWmsPzfTZOBGLdL7I_zRpfDWFCXPb0_AXLPsPzHBhtcD047Kj42aDLQ9kuY',
    initialized: false,
    messaging: null,

    // Load Firebase SDK dynamically (avoid heavy load on every page)
    async loadFirebaseSDK() {
        if (window.firebase?.messaging) return true;

        try {
            // Load Firebase App + Messaging
            await this._loadScript('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
            await this._loadScript('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

            firebase.initializeApp({
                apiKey: "AIzaSyDLjwBvNnhEdn32VgmYqDfbRkVrzflCA8w",
                authDomain: "locthien-scm.firebaseapp.com",
                projectId: "locthien-scm",
                storageBucket: "locthien-scm.firebasestorage.app",
                messagingSenderId: "831814732608",
                appId: "1:831814732608:web:a5962decde0ecb230fc8a5"
            });

            this.messaging = firebase.messaging();
            console.log('🔥 Firebase Messaging SDK loaded');
            return true;
        } catch (e) {
            console.error('❌ Firebase SDK load error:', e.message);
            return false;
        }
    },

    _loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    },

    // Initialize — register service worker
    async init() {
        if (this.initialized) return true;

        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            console.log('❌ Push notifications not supported');
            return false;
        }

        try {
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            console.log('✅ FCM Service Worker registered:', registration.scope);
            this.initialized = true;
            return true;
        } catch (e) {
            console.error('❌ SW registration failed:', e);
            return false;
        }
    },

    // Request permission
    async requestPermission() {
        const permission = await Notification.requestPermission();
        console.log('🔔 Notification permission:', permission);
        return permission === 'granted';
    },

    // Get REAL FCM token and register with backend
    async registerForNotifications(userId) {
        if (!userId) return false;

        try {
            if (!this.initialized) await this.init();

            const granted = await this.requestPermission();
            if (!granted) {
                console.log('⚠️ Notification permission denied by user');
                return false;
            }

            // Load Firebase SDK
            const sdkLoaded = await this.loadFirebaseSDK();
            if (!sdkLoaded || !this.messaging) {
                console.log('⚠️ Firebase SDK not available, using fallback');
                return false;
            }

            // Get REAL FCM token
            const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
            const token = await this.messaging.getToken({
                vapidKey: this.vapidKey,
                serviceWorkerRegistration: registration
            });

            if (token) {
                console.log('🔑 FCM Token obtained:', token.substring(0, 20) + '...');

                // Register token with backend (saves to users table)
                const res = await api.registerFcmToken(userId, token);
                if (!res.error) {
                    localStorage.setItem('LT_FCM_TOKEN', token);
                    console.log('✅ Push notifications active — lock screen notifications enabled!');
                    return true;
                }
            } else {
                console.log('⚠️ No FCM token received');
            }

            return false;
        } catch (e) {
            console.error('❌ Push registration error:', e.message);
            return false;
        }
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
let _lastSeenNotifIds = new Set();
let _firstLoadDone = false;

async function loadNotifications() {
    const session = JSON.parse(localStorage.getItem('LT_SESSION') || '{}');
    const user = session.user || {};
    const userId = user.fullName || user.name || user.phone;
    const userRole = user.role || '';

    if (!userId) return;

    try {
        const res = await fetch(`/api/notifications/${encodeURIComponent(userId)}?role=${encodeURIComponent(userRole)}`);
        const data = await res.json();

        if (!data.error) {
            const notifications = data.data || [];
            renderNotifications(notifications);
            updateNotificationBadge(data.unreadCount || 0);

            // Show toast + native notification for NEW unread notifications
            if (_firstLoadDone) {
                const newNotifs = notifications.filter(n => !n.is_read && !_lastSeenNotifIds.has(n.id));
                newNotifs.forEach(n => {
                    showToastBanner(n);
                    showNativeNotification(n);
                });
            }

            // Track seen IDs
            _lastSeenNotifIds = new Set(notifications.map(n => n.id));
            _firstLoadDone = true;
        }
    } catch (e) {
        console.error('Load notifications error:', e);
    }
}

// Show toast banner at top of screen
function showToastBanner(notif) {
    const iconMap = {
        'order_assigned': '🚛', 'order_completed': '✅',
        'order_edited': '⚠️', 'order_rejected': '❌',
        'misa_new_order': '📦', 'message': '💬'
    };
    const colorMap = {
        'order_rejected': '#ef4444', 'order_edited': '#f59e0b',
        'order_assigned': '#3b82f6', 'order_completed': '#22c55e'
    };
    const icon = iconMap[notif.type] || '🔔';
    const borderColor = colorMap[notif.type] || 'var(--primary)';

    let container = document.getElementById('notification-toast');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-toast';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.style.borderLeftColor = borderColor;
    toast.style.cursor = 'pointer';
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${escapeHtml(notif.title)}</div>
            <div class="toast-body">${escapeHtml(notif.body)}</div>
        </div>
        <button class="toast-close" onclick="event.stopPropagation(); this.parentElement.remove()">×</button>
    `;

    toast.addEventListener('click', () => {
        handleNotificationClick(notif.id, notif.order_id || '');
        toast.remove();
    });

    container.appendChild(toast);
    playNotificationSound();

    // Auto-remove after 15 seconds (enough time to read)
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 15000);
}

// Show native browser notification (works on mobile PWA)
function showNativeNotification(notif) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') {
        // Request permission on first notification
        Notification.requestPermission();
        return;
    }

    try {
        const nativeNotif = new Notification(notif.title || 'Thông báo', {
            body: notif.body || '',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-72.png',
            tag: notif.id, // Prevent duplicate native notifications
            vibrate: [200, 100, 200],
            requireInteraction: true // Stay until user dismisses
        });

        nativeNotif.onclick = () => {
            window.focus();
            handleNotificationClick(notif.id, notif.order_id || '');
            nativeNotif.close();
        };
    } catch (e) {
        console.log('Native notification error:', e.message);
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
        'order_edited': '⚠️',
        'order_rejected': '❌',
        'misa_new_order': '📦'
    };

    const typeClassMap = {
        'message': 'message',
        'order_assigned': 'order',
        'order_completed': 'complete',
        'order_edited': 'warning',
        'order_rejected': 'danger',
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
    const session = JSON.parse(localStorage.getItem('LT_SESSION') || '{}');
    const user = session.user || {};
    const userId = user.fullName || user.name || user.phone;

    if (!userId) return;

    const userRole = user.role || '';
    try {
        await fetch(`/api/notifications/mark-all-read/${encodeURIComponent(userId)}?role=${encodeURIComponent(userRole)}`, { method: 'PUT' });
        loadNotifications();
    } catch (e) {
        console.error('Mark all read error:', e);
    }
}

// Update badge count (with PWA Badge API support for mobile home screen)
let previousUnreadCount = 0;

function updateNotificationBadge(count) {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;

    // Check if new notifications arrived
    const hasNewNotifications = count > previousUnreadCount && previousUnreadCount !== 0;

    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');

        // PWA Badge API - updates badge on home screen icon (mobile)
        if ('setAppBadge' in navigator) {
            navigator.setAppBadge(count).catch(err => console.log('Badge API error:', err));
        }

        // Play sound for NEW notifications only
        if (hasNewNotifications) {
            playNotificationSound();
        }
    } else {
        badge.classList.add('hidden');

        // Clear PWA badge
        if ('clearAppBadge' in navigator) {
            navigator.clearAppBadge().catch(err => { });
        }
    }

    previousUnreadCount = count;
}

// Play notification sound effect
function playNotificationSound() {
    try {
        // Use Web Audio API for better mobile support
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContext();

        // Create a pleasant "ding" sound
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        // Pleasant notification tone (C5 note)
        oscillator.frequency.value = 523.25;
        oscillator.type = 'sine';

        // Fade in and out for smooth sound
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);

        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.3);

        console.log('🔔 Notification sound played');
    } catch (e) {
        console.log('Could not play notification sound:', e.message);
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

    // Poll every 15 seconds (faster for drivers to see rejections quickly)
    notificationPollingInterval = setInterval(() => {
        loadNotifications();
    }, 15000);
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
        const session = localStorage.getItem('LT_SESSION');
        if (session) {
            startNotificationPolling();

            // Register for push notifications (FCM)
            try {
                const parsed = JSON.parse(session);
                const userName = parsed?.user?.name || parsed?.user?.fullName;
                if (userName) {
                    NotificationModule.registerForNotifications(userName);
                }
            } catch (e) { /* ignore parse errors */ }
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
