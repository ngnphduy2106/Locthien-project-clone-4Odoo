// ===============================================
// WEBHOOK ROUTES (n8n / AMIS CRM Integration)
// ===============================================

import { Router } from 'express';
import { createResponse } from '../config.js';
import db from '../db/index.js';

const router = Router();

// Middleware to verify API Key
const verifyApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.WEBHOOK_API_KEY) {
        return res.status(401).json(createResponse(true, 'Unauthorized: Invalid API Key'));
    }
    next();
};

/**
 * POST /api/webhooks/amis-order
 * Received order data from n8n (triggered by AMIS CRM)
 */
router.post('/amis-order', verifyApiKey, async (req, res) => {
    try {
        const orderData = req.body;

        // Validate required fields from AMIS
        if (!orderData.sale_order_no) {
            return res.status(400).json(createResponse(true, 'Missing sale_order_no'));
        }

        // Map AMIS fields to our internal structure
        const mappedOrder = {
            id: orderData.sale_order_no,
            soDon: orderData.sale_order_no,
            ngay: orderData.sale_order_date || orderData.book_date || new Date().toISOString().split('T')[0],
            khach: orderData.account_name || 'Khách hàng từ CRM',
            diaChi: orderData.description || orderData.shipping_address || '',
            status: 'Mới', // New orders from CRM start as "New"
            amount: Number(orderData.sale_order_amount || 0),
            type: 'EXPORT',
            products: orderData.items || [], // Assume n8n sends items as an array
            crm_id: orderData.id, // Keep the original CRM ID for reference
            updatedAt: new Date().toISOString()
        };

        // Save or Update in Firestore
        await db.addOrder(mappedOrder);

        console.log(`📡 CRM Sync: Order ${mappedOrder.id} received and saved.`);

        res.json(createResponse(false, 'Sync successful', { orderId: mappedOrder.id }));

    } catch (e) {
        console.error('Webhook Error:', e.message);
        res.status(500).json(createResponse(true, 'Internal Server Error: ' + e.message));
    }
});

// ===============================================
// TELEGRAM WEBHOOK - Auto-capture user IDs
// When users send messages in group, bot captures their Telegram user ID
// and auto-maps to our DB users by matching display name
// ===============================================
router.post('/telegram', async (req, res) => {
    try {
        const update = req.body;
        const from = update?.message?.from || update?.edited_message?.from;

        if (!from || from.is_bot) {
            return res.json({ ok: true });
        }

        const tgUserId = from.id;
        const tgFirstName = from.first_name || '';
        const tgLastName = from.last_name || '';
        const tgUsername = from.username || '';
        const tgFullName = `${tgFirstName} ${tgLastName}`.trim();

        console.log(`📡 [TG Webhook] Message from: ${tgFullName} (ID: ${tgUserId}, @${tgUsername || 'N/A'})`);

        // Try to match with a user in our DB
        const users = await db.getUsers();
        const matchedUser = users.find(u => {
            if (!u.fullName) return false;
            const dbName = u.fullName.toLowerCase().trim();
            const tgName = tgFullName.toLowerCase().trim();
            // Match by exact name, first name, or Telegram username
            return dbName === tgName
                || dbName.includes(tgFirstName.toLowerCase())
                || tgName.includes(dbName)
                || (tgUsername && u.username === tgUsername);
        });

        if (matchedUser && !matchedUser.telegramUserId) {
            // Auto-save Telegram user ID
            await db.updateUser(matchedUser.id, {
                telegramUserId: tgUserId,
                telegramUsername: tgUsername || matchedUser.telegramUsername
            });
            console.log(`✅ [TG Webhook] Auto-captured: ${matchedUser.fullName} → TG ID ${tgUserId}`);
        } else if (matchedUser && matchedUser.telegramUserId) {
            // Already captured — skip silently
        } else {
            console.log(`⚠️ [TG Webhook] No DB match for: ${tgFullName} (ID: ${tgUserId})`);
        }

        res.json({ ok: true });
    } catch (e) {
        console.error('❌ [TG Webhook] Error:', e.message);
        res.json({ ok: true }); // Always return 200 to Telegram
    }
});

export default router;
