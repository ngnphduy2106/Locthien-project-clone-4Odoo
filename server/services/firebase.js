// ===============================================
// FIREBASE CLOUD MESSAGING SERVICE
// Push notifications for driver order assignments
// ===============================================

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let firebaseInitialized = false;

// Initialize Firebase Admin SDK
function initFirebase() {
    if (firebaseInitialized) return true;

    try {
        // Load service account from file
        const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');
        
        if (!fs.existsSync(serviceAccountPath)) {
            console.log('⚠️ Firebase service account not found');
            return false;
        }

        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        firebaseInitialized = true;
        console.log('🔥 Firebase Admin SDK initialized');
        return true;
    } catch (e) {
        console.error('❌ Firebase init error:', e.message);
        return false;
    }
}

// Initialize on module load
initFirebase();

/**
 * Send push notification to a device
 * @param {string} fcmToken - The device FCM token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Optional data payload
 * @returns {Promise<boolean>} Success status
 */
async function sendPushNotification(fcmToken, title, body, data = {}) {
    if (!firebaseInitialized) {
        console.log('⚠️ Firebase not initialized, skipping notification');
        return false;
    }

    if (!fcmToken) {
        console.log('⚠️ No FCM token provided');
        return false;
    }

    try {
        const message = {
            token: fcmToken,
            notification: {
                title: title,
                body: body
            },
            data: {
                ...data,
                click_action: 'OPEN_APP',
                timestamp: new Date().toISOString()
            },
            webpush: {
                notification: {
                    icon: '/icons/icon-192.png',
                    badge: '/icons/badge-72.png',
                    vibrate: [200, 100, 200],
                    requireInteraction: true,
                    actions: [
                        { action: 'view', title: 'Xem đơn' },
                        { action: 'dismiss', title: 'Bỏ qua' }
                    ]
                },
                fcmOptions: {
                    link: data.orderId ? `/order/${data.orderId}` : '/'
                }
            }
        };

        const response = await admin.messaging().send(message);
        console.log('📬 Push notification sent:', response);
        return true;
    } catch (e) {
        console.error('❌ Push notification error:', e.message);
        // Handle invalid token
        if (e.code === 'messaging/invalid-registration-token' ||
            e.code === 'messaging/registration-token-not-registered') {
            console.log('🗑️ Invalid token, should be removed from database');
            return { success: false, invalidToken: true };
        }
        return false;
    }
}

/**
 * Send notification to multiple devices
 * @param {string[]} fcmTokens - Array of FCM tokens
 * @param {string} title - Notification title  
 * @param {string} body - Notification body
 * @param {object} data - Optional data payload
 */
async function sendMulticastNotification(fcmTokens, title, body, data = {}) {
    if (!firebaseInitialized || !fcmTokens?.length) return;

    try {
        const message = {
            tokens: fcmTokens,
            notification: { title, body },
            data: { ...data, timestamp: new Date().toISOString() },
            webpush: {
                notification: {
                    icon: '/icons/icon-192.png',
                    vibrate: [200, 100, 200]
                }
            }
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`📬 Multicast sent: ${response.successCount}/${fcmTokens.length} successful`);
        return response;
    } catch (e) {
        console.error('❌ Multicast error:', e.message);
        return null;
    }
}

/**
 * Notify driver about new order assignment
 */
async function notifyDriverOrderAssigned(driverFcmToken, orderDetails) {
    const { orderId, orderNo, customerName, address, type = 'export' } = orderDetails;
    
    const typeLabel = type === 'import' ? 'Đơn nhập' : 'Đơn xuất';
    const title = `🚚 ${typeLabel} mới được giao cho bạn!`;
    const body = `#${orderNo || orderId} - ${customerName || 'Khách hàng'}\n📍 ${address || 'Chưa có địa chỉ'}`;

    return sendPushNotification(driverFcmToken, title, body, {
        orderId: String(orderId),
        orderNo: String(orderNo || orderId),
        type: type,
        action: 'ORDER_ASSIGNED'
    });
}

/**
 * Notify about new chat message
 */
async function notifyNewChatMessage(recipientFcmToken, messageDetails) {
    const { orderId, orderNo, senderName, preview, type = 'export' } = messageDetails;
    
    const title = `💬 Tin nhắn mới - #${orderNo || orderId}`;
    const body = `${senderName}: ${preview}`;

    return sendPushNotification(recipientFcmToken, title, body, {
        orderId: String(orderId),
        type: type,
        action: 'NEW_MESSAGE'
    });
}

export {
    initFirebase,
    sendPushNotification,
    sendMulticastNotification,
    notifyDriverOrderAssigned,
    notifyNewChatMessage
};
