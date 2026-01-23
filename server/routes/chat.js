// ===============================================
// ORDER CHAT ROUTES
// ===============================================

import { Router } from 'express';
import { createResponse } from '../config.js';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// Initialize Supabase client for chat
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// GET /api/orders/:id/messages - Get chat messages for an order or import ticket
// Supports: ?type=import for import ticket messages
router.get('/:id/messages', async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.query;

        let query = supabase
            .from('order_messages')
            .select('*')
            .order('created_at', { ascending: true });

        // Support import ticket messages
        if (type === 'import') {
            query = query.eq('import_ticket_id', id);
        } else {
            query = query.eq('order_id', id);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Chat fetch error:', error);
            return res.json(createResponse(true, 'Lỗi tải tin nhắn'));
        }

        res.json({
            error: false,
            messages: data || []
        });

    } catch (e) {
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

        // Set the correct reference field
        if (type === 'import') {
            insertData.import_ticket_id = id;
        } else {
            insertData.order_id = id;
        }

        const { data, error } = await supabase
            .from('order_messages')
            .insert(insertData)
            .select()
            .single();

        if (error) {
            console.error('Chat insert error:', error);
            return res.json(createResponse(true, 'Lỗi gửi tin nhắn'));
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
