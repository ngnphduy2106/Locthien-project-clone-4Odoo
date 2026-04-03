// ===============================================
// NOTIFICATION ROUTES
// In-app notifications for drivers and admins
// ===============================================

import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { createResponse } from '../config.js';

const router = Router();

// Helper to create Supabase client
async function getSupabase() {

    return supabase;
}

// GET /api/notifications/:userId - Get user's notifications
// Admin (role=admin) sees ALL notifications to monitor errors
// Others see only notifications targeted to their name
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 50, unreadOnly = false, role = '' } = req.query;
        const supabase = await getSupabase();

        // Admin sees ALL notifications; non-admin sees only their own
        const isAdmin = ['admin'].includes((role || '').toLowerCase());

        let query = supabase
            .from('notifications')
            .select('*');

        if (!isAdmin) {
            // Non-admin: only their own name-targeted notifications
            query = query.eq('user_id', userId);
        }

        query = query
            .order('created_at', { ascending: false })
            .limit(parseInt(limit));

        if (unreadOnly === 'true') {
            query = query.eq('is_read', false);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Notification fetch error:', error);
            return res.json(createResponse(true, error.message));
        }

        // Get unread count with same filter
        let countQuery = supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('is_read', false);

        if (!isAdmin) {
            countQuery = countQuery.eq('user_id', userId);
        }

        const { count } = await countQuery;

        res.json({
            error: false,
            data: data || [],
            unreadCount: count || 0
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/notifications/:id/read - Mark as read
router.put('/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        const supabase = await getSupabase();

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);

        if (error) {
            return res.json(createResponse(true, error.message));
        }

        res.json(createResponse(false, 'Đã đánh dấu đã đọc'));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/notifications/mark-all-read/:userId - Mark all as read
router.put('/mark-all-read/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { role = '' } = req.query;
        const supabase = await getSupabase();
        const isAdmin = ['admin'].includes((role || '').toLowerCase());

        let markQuery = supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('is_read', false);

        if (!isAdmin) {
            markQuery = markQuery.eq('user_id', userId);
        }

        const { error } = await markQuery;

        if (error) {
            return res.json(createResponse(true, error.message));
        }

        res.json(createResponse(false, 'Đã đánh dấu tất cả đã đọc'));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const supabase = await getSupabase();

        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', id);

        if (error) {
            return res.json(createResponse(true, error.message));
        }

        res.json(createResponse(false, 'Đã xóa thông báo'));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// === HELPER: Create notification + push to device ===
export async function createNotification(userId, type, title, body, orderId = null, orderNo = null) {
    try {
        const supabase = await getSupabase();

        // 1. Save to database (in-app notification)
        const { error } = await supabase
            .from('notifications')
            .insert({
                user_id: userId,
                type: type,
                title: title,
                body: body,
                order_id: orderId,
                order_no: orderNo
            });

        if (error) {
            console.error('❌ Create notification error:', error.message);
            return false;
        }

        console.log(`🔔 Notification created: ${type} for ${userId}`);

        // 2. Send FCM push to device (lock screen notification)
        try {
            const { sendPushNotification } = await import('../services/firebase.js');

            // Find user's FCM token from users table
            let fcmToken = null;

            if (userId === 'ADMIN') {
                // For ADMIN-targeted notifications, push to all admin devices
                const { data: admins } = await supabase
                    .from('users')
                    .select('fcm_token')
                    .eq('role', 'admin')
                    .not('fcm_token', 'is', null);

                if (admins?.length) {
                    for (const admin of admins) {
                        if (admin.fcm_token && !admin.fcm_token.startsWith('mock_')) {
                            await sendPushNotification(admin.fcm_token, title, body, {
                                orderId: String(orderId || ''),
                                orderNo: String(orderNo || ''),
                                type: type
                            });
                        }
                    }
                }
            } else {
                // Find specific user by name (fullName match)
                const { data: users } = await supabase
                    .from('users')
                    .select('fcm_token')
                    .eq('fullName', userId)
                    .not('fcm_token', 'is', null)
                    .limit(1);

                fcmToken = users?.[0]?.fcm_token;

                if (fcmToken && !fcmToken.startsWith('mock_')) {
                    await sendPushNotification(fcmToken, title, body, {
                        orderId: String(orderId || ''),
                        orderNo: String(orderNo || ''),
                        type: type
                    });
                    console.log(`📬 FCM push sent to ${userId}`);
                }
            }
        } catch (pushErr) {
            // FCM push failure should not block in-app notification
            console.log(`⚠️ FCM push skipped: ${pushErr.message}`);
        }

        return true;

    } catch (e) {
        console.error('❌ Notification exception:', e.message);
        return false;
    }
}

export default router;
