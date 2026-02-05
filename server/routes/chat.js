// ===============================================
// ORDER CHAT ROUTES
// ===============================================

import { Router } from 'express';
import { createResponse } from '../config.js';
import { createClient } from '@supabase/supabase-js';
import { createNotification } from './notifications.js';

const router = Router();

// Lazy Supabase client initialization (env vars may not exist at import time)
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
        if (url && key) {
            _supabase = createClient(url, key);
        }
    }
    return _supabase;
}

// GET /api/chat/:id/messages - Get chat messages for an order or import ticket
// Supports: ?type=import for import ticket messages, ?since=ISO_TIMESTAMP for incremental polling
router.get('/:id/messages', async (req, res) => {
    try {
        const { id } = req.params;
        const { type, since } = req.query;

        let query = getSupabase()
            .from('order_messages')
            .select('*')
            .order('created_at', { ascending: true });

        // Filter by specific ID context
        if (type === 'import') {
            query = query.eq('import_ticket_id', id);
        } else {
            query = query.eq('order_id', id);
        }

        // Incremental Polling: Only fetch messages created AFTER since timestamp
        if (since) {
            query = query.gt('created_at', since);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Chat fetch error:', error);
            return res.json(createResponse(true, 'Lỗi tải tin nhắn'));
        }

        res.json({
            error: false,
            messages: data || [],
            serverTime: new Date().toISOString() // Return server time for next polling
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// GET /api/chat/unread-counts - Get unread message counts for all orders/imports
// Query params: ?userId=xxx (required) - the current user identifier
router.get('/unread-counts', async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.json(createResponse(true, 'userId is required'));
        }

        const supabase = getSupabase();
        if (!supabase) {
            return res.json({ error: false, counts: {} });
        }

        // Get all messages where userId is NOT in read_by array
        // For orders (export)
        const { data: orderMessages, error: orderErr } = await supabase
            .from('order_messages')
            .select('order_id')
            .not('order_id', 'is', null)
            .not('read_by', 'cs', `{${userId}}`);

        // For import tickets
        const { data: importMessages, error: importErr } = await supabase
            .from('order_messages')
            .select('import_ticket_id')
            .not('import_ticket_id', 'is', null)
            .not('read_by', 'cs', `{${userId}}`);

        if (orderErr || importErr) {
            console.error('Unread counts error:', orderErr || importErr);
            return res.json({ error: false, counts: {} });
        }

        // Count by order_id
        const counts = {};

        (orderMessages || []).forEach(msg => {
            if (msg.order_id) {
                counts[msg.order_id] = (counts[msg.order_id] || 0) + 1;
            }
        });

        // Count by import_ticket_id (prefix with 'import_' to distinguish)
        (importMessages || []).forEach(msg => {
            if (msg.import_ticket_id) {
                const key = `import_${msg.import_ticket_id}`;
                counts[key] = (counts[key] || 0) + 1;
            }
        });

        res.json({
            error: false,
            counts: counts
        });

    } catch (e) {
        console.error('Unread counts exception:', e);
        res.json({ error: false, counts: {} });
    }
});

// POST /api/chat/:id/mark-read - Mark messages as read for a user
router.post('/:id/mark-read', async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.query;
        const { userId } = req.body;

        if (!userId) {
            return res.json(createResponse(true, 'userId is required'));
        }

        const supabase = getSupabase();
        if (!supabase) {
            return res.json(createResponse(true, 'Supabase not configured'));
        }

        // Build filter based on type
        let query = supabase
            .from('order_messages')
            .select('id, read_by');

        if (type === 'import') {
            query = query.eq('import_ticket_id', id);
        } else {
            query = query.eq('order_id', id);
        }

        const { data: messages, error: fetchErr } = await query;

        if (fetchErr) {
            console.error('Mark read fetch error:', fetchErr);
            return res.json(createResponse(true, 'Lỗi đánh dấu đã đọc'));
        }

        // Update each message to add userId to read_by array
        for (const msg of (messages || [])) {
            const readBy = msg.read_by || [];
            if (!readBy.includes(userId)) {
                readBy.push(userId);
                await supabase
                    .from('order_messages')
                    .update({ read_by: readBy })
                    .eq('id', msg.id);
            }
        }

        res.json({
            error: false,
            message: 'Đã đánh dấu đã đọc'
        });

    } catch (e) {
        console.error('Mark read exception:', e);
        res.json(createResponse(true, e.message));
    }
});

// POST /api/orders/:id/messages - Send a chat message (supports import tickets with ?type=import)
router.post('/:id/messages', async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.query;
        const { sender_name, sender_role, message, image } = req.body;

        if (!sender_name || (!message && !image)) {
            return res.json(createResponse(true, 'Thiếu thông tin người gửi hoặc nội dung'));
        }

        // Build insert object based on type
        const insertData = {
            sender_name: sender_name,
            sender_role: sender_role || 'ADMIN',
            message: (message || '').trim(),
            image: image || null
        };

        // Standardize: always use a string for IDs in Supabase to match Order Numbers
        const safeId = String(id);

        // Set the correct reference field
        if (type === 'import') {
            insertData.import_ticket_id = safeId;
        } else {
            insertData.order_id = safeId;
        }

        const { data, error } = await getSupabase()
            .from('order_messages')
            .insert(insertData)
            .select()
            .single();

        if (error) {
            console.error('Chat insert error:', error);
            return res.json(createResponse(true, `Lỗi gửi tin nhắn: ${error.message || error.code || JSON.stringify(error)}`));
        }

        // Create notification for message recipient
        try {
            const senderRoleUpper = (sender_role || '').toUpperCase();
            const orderNo = safeId;

            if (senderRoleUpper === 'DRIVER') {
                // Driver sent message -> notify ADMIN
                await createNotification(
                    'ADMIN',
                    'message',
                    '💬 Tin nhắn mới',
                    `${sender_name} nhắn trên đơn #${orderNo}`,
                    safeId,
                    orderNo
                );
            } else {
                // Admin/Manager sent -> Need to find driver to notify (we don't have driver info in this context)
                // For now, we'll create a generic notification that the driver can see when they check
                // In a full implementation, we'd query the order to get the assigned driver
                // Let's query the order to get driver name
                const supabase = getSupabase();
                if (supabase && type !== 'import') {
                    const { data: orderData } = await supabase
                        .from('orders')
                        .select('taiXe')
                        .eq('id', safeId)
                        .single();

                    // Also try by sale_order_no if not found by id
                    if (orderData?.taiXe) {
                        await createNotification(
                            orderData.taiXe,
                            'message',
                            '💬 Tin nhắn mới',
                            `Bạn có tin nhắn mới ở đơn #${orderNo}`,
                            safeId,
                            orderNo
                        );
                    }
                }
            }
        } catch (notifyErr) {
            console.error('Message notification error:', notifyErr.message);
        }

        res.json({
            error: false,
            message: 'Đã gửi!',
            data: data
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

export default router;
