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

        // Admin sees ALL notifications from last 7 days; non-admin sees only their own
        const isAdmin = ['admin'].includes((role || '').toLowerCase());

        let query = supabase
            .from('notifications')
            .select('*');

        if (isAdmin) {
            // Admin: see all notifications but limit to recent (7 days)
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            query = query.gte('created_at', sevenDaysAgo);
        } else {
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

        if (isAdmin) {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            countQuery = countQuery.gte('created_at', sevenDaysAgo);
        } else {
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

        console.log(`🔔 Notification created: ${type} for "${userId}"`);

        // 2. Send FCM push to device (lock screen notification)
        try {
            const { sendPushNotification } = await import('../services/firebase.js');

            // Find user's FCM token from users table
            let fcmToken = null;

            if (userId === 'ADMIN') {
                // For ADMIN-targeted notifications, push to all admin devices
                const { data: admins } = await supabase
                    .from('users')
                    .select('fcm_token, fullname')
                    .in('role', ['admin', 'ADMIN'])
                    .not('fcm_token', 'is', null);

                console.log(`📬 ADMIN push: found ${admins?.length || 0} admin(s) with tokens`);

                if (admins?.length) {
                    for (const admin of admins) {
                        if (admin.fcm_token && !admin.fcm_token.startsWith('mock_')) {
                            const result = await sendPushNotification(admin.fcm_token, title, body, {
                                orderId: String(orderId || ''),
                                orderNo: String(orderNo || ''),
                                type: type
                            });
                            console.log(`📬 FCM push to admin "${admin.fullname}": ${result ? '✅' : '❌'}`);
                        }
                    }
                }
            } else if (userId === 'DISPATCHER') {
                // For DISPATCHER-targeted notifications, push to all dispatcher devices
                const { data: dispatchers } = await supabase
                    .from('users')
                    .select('fcm_token, fullname')
                    .in('role', ['DISPATCHER', 'dispatcher'])
                    .not('fcm_token', 'is', null);

                console.log(`📬 DISPATCHER push: found ${dispatchers?.length || 0} dispatcher(s) with tokens`);

                if (dispatchers?.length) {
                    for (const disp of dispatchers) {
                        if (disp.fcm_token && !disp.fcm_token.startsWith('mock_')) {
                            const result = await sendPushNotification(disp.fcm_token, title, body, {
                                orderId: String(orderId || ''),
                                orderNo: String(orderNo || ''),
                                type: type
                            });
                            console.log(`📬 FCM push to dispatcher "${disp.fullname}": ${result ? '✅' : '❌'}`);
                        }
                    }
                }
            } else {
                // Find specific user by name (fullName match)
                // Use ilike for case-insensitive match to handle name variations
                const { data: users, error: userErr } = await supabase
                    .from('users')
                    .select('fcm_token, fullname, role')
                    .ilike('fullname', userId)
                    .limit(5);

                console.log(`🔍 FCM lookup for "${userId}": found ${users?.length || 0} user(s)${userErr ? ' (error: ' + userErr.message + ')' : ''}`);
                
                if (users?.length) {
                    users.forEach(u => console.log(`   → "${u.fullname}" [${u.role}] token: ${u.fcm_token ? u.fcm_token.substring(0, 15) + '...' : 'NULL'}`));
                }

                // Use first user with valid token
                const validUser = (users || []).find(u => u.fcm_token && !u.fcm_token.startsWith('mock_'));
                fcmToken = validUser?.fcm_token;

                if (fcmToken) {
                    const result = await sendPushNotification(fcmToken, title, body, {
                        orderId: String(orderId || ''),
                        orderNo: String(orderNo || ''),
                        type: type
                    });
                    console.log(`📬 FCM push sent to "${userId}": ${result ? '✅ OK' : '❌ FAILED'}`);
                } else {
                    console.log(`⚠️ No valid FCM token for "${userId}" — push notification skipped`);
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
