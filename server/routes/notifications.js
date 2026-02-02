// ===============================================
// NOTIFICATION ROUTES
// In-app notifications for drivers and admins
// ===============================================

import { Router } from 'express';
import { createResponse } from '../config.js';

const router = Router();

// Helper to create Supabase client
async function getSupabase() {
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
}

// GET /api/notifications/:userId - Get user's notifications
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 50, unreadOnly = false } = req.query;
        const supabase = await getSupabase();

        let query = supabase
            .from('notifications')
            .select('*')
            .or(`user_id.eq.${userId},user_id.eq.ADMIN`)
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

        // Get unread count
        const { count } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .or(`user_id.eq.${userId},user_id.eq.ADMIN`)
            .eq('is_read', false);

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
        const supabase = await getSupabase();

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .or(`user_id.eq.${userId},user_id.eq.ADMIN`)
            .eq('is_read', false);

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

// === HELPER: Create notification ===
export async function createNotification(userId, type, title, body, orderId = null, orderNo = null) {
    try {
        const supabase = await getSupabase();

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
        return true;

    } catch (e) {
        console.error('❌ Notification exception:', e.message);
        return false;
    }
}

export default router;
