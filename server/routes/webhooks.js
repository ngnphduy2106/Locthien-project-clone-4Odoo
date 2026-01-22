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

export default router;
