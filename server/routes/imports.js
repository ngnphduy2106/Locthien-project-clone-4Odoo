// ===============================================
// IMPORT TICKETS ROUTES (Phiếu nhập)
// ===============================================

import { Router } from 'express';
import { createResponse, getTimestamp } from '../config.js';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// Lazy Supabase client initialization (env vars may not exist at import time)
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_KEY;
        if (url && key) {
            _supabase = createClient(url, key);
        }
    }
    return _supabase;
}

// GET /api/imports - List all import tickets
router.get('/', async (req, res) => {
    try {
        const { status } = req.query;

        let query = getSupabase()
            .from('import_tickets')
            .select('*')
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) {
            return res.json(createResponse(true, 'Lỗi tải phiếu nhập: ' + error.message));
        }

        res.json({
            error: false,
            data: data || []
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// POST /api/imports - Create new import ticket
router.post('/', async (req, res) => {
    try {
        const { supplier_name, supplier_address, products, expected_date, warehouse, note, created_by } = req.body;

        if (!supplier_name || !products || !products.length) {
            return res.json(createResponse(true, 'Thiếu thông tin nhà cung cấp hoặc sản phẩm'));
        }

        const ts = getTimestamp();
        const ticketNo = 'N' + ts.short;

        const totalQty = products.reduce((sum, p) => sum + Number(p.qty || 0), 0);

        const { data, error } = await getSupabase()
            .from('import_tickets')
            .insert({
                ticket_no: ticketNo,
                supplier_name,
                supplier_address: supplier_address || '',
                products,
                total_qty: totalQty,
                expected_date: expected_date || null,
                warehouse: warehouse || 'LT1',
                note: note || '',
                status: 'pending',
                created_by: created_by || 'Admin'
            })
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lỗi tạo phiếu: ' + error.message));
        }

        // Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            let msg = `📥 <b>PHIẾU NHẬP MỚI</b>\n`;
            msg += `#${ticketNo}\n`;
            msg += `🏭 NCC: ${supplier_name}\n`;
            msg += `📦 SL: ${totalQty} kg (${products.length} SP)\n`;
            if (expected_date) msg += `📅 Ngày dự kiến: ${expected_date}\n`;
            msg += `\n🔔 @sales - Vui lòng điều phối`;

            await sendTelegramMessage(msg);
        } catch (tgErr) {
            console.error('Telegram Error:', tgErr.message);
        }

        res.json({
            error: false,
            msg: 'Tạo phiếu nhập thành công! Mã: ' + ticketNo,
            data
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/imports/:id - Update import ticket basic info
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { supplier_name, supplier_address, expected_date, note, products } = req.body;

        const updateData = {};
        if (supplier_name) updateData.supplier_name = supplier_name;
        if (supplier_address !== undefined) updateData.supplier_address = supplier_address;
        if (expected_date !== undefined) updateData.expected_date = expected_date || null;
        if (note !== undefined) updateData.note = note;

        // Update products and recalculate total qty
        if (products && Array.isArray(products)) {
            updateData.products = products;
            updateData.total_qty = products.reduce((sum, p) => sum + Number(p.qty || 0), 0);
        }

        const { data, error } = await getSupabase()
            .from('import_tickets')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lỗi cập nhật: ' + error.message));
        }

        res.json({
            error: false,
            msg: 'Đã cập nhật phiếu nhập!',
            data
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/imports/:id/assign - Assign driver to import ticket
router.put('/:id/assign', async (req, res) => {
    try {
        const { id } = req.params;
        const { driver_name, plate } = req.body;

        const { data, error } = await getSupabase()
            .from('import_tickets')
            .update({
                status: 'assigned',
                assigned_driver: driver_name,
                assigned_plate: plate
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lỗi gán tài xế: ' + error.message));
        }

        // Send push notification to driver (async, don't block response)
        try {
            const { notifyDriverOrderAssigned } = await import('../services/firebase.js');
            const db = await import('../db/index.js');
            const users = await db.default.getUsers();
            const driver = users.find(u =>
                u.fullName?.toLowerCase() === driver_name?.toLowerCase() ||
                u.username?.toLowerCase() === driver_name?.toLowerCase()
            );

            if (driver?.fcm_token) {
                notifyDriverOrderAssigned(driver.fcm_token, {
                    orderId: id,
                    orderNo: data?.ticket_no || id,
                    customerName: data?.supplier_name,
                    address: data?.supplier_address,
                    type: 'import'
                });
                console.log(`📬 Push notification sent to driver ${driver_name} for import`);
            }
        } catch (notifyErr) {
            console.error('Push notification error:', notifyErr.message);
        }

        res.json({
            error: false,
            msg: 'Đã gán tài xế!',
            data
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/imports/:id/start - Start import delivery (in transit)
router.put('/:id/start', async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await getSupabase()
            .from('import_tickets')
            .update({
                status: 'in_transit',
                started_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lỗi bắt đầu: ' + error.message));
        }

        res.json({
            error: false,
            msg: 'Đã bắt đầu vận chuyển!',
            data
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/imports/:id/complete - Complete import ticket
router.put('/:id/complete', async (req, res) => {
    try {
        const { id } = req.params;
        const { actual_products, note } = req.body;

        // Fetch original to merge (No-Delete logic)
        const { data: original } = await getSupabase().from('import_tickets').select('*').eq('id', id).single();
        if (!original) return res.json(createResponse(true, 'Không tìm thấy phiếu nhập'));

        const originalProducts = original.products || [];
        const originalMap = {};
        originalProducts.forEach(p => {
            originalMap[p.name || p.code || ''] = { ...p, qty_planned: p.qty, actual_qty: 0 };
        });

        // Actual items delivered/restocked
        if (actual_products && Array.isArray(actual_products)) {
            actual_products.forEach(p => {
                const key = p.name || p.code || '';
                if (originalMap[key]) {
                    originalMap[key].actual_qty = Number(p.qty || 0);
                } else {
                    originalMap[key] = { ...p, qty_planned: 0, actual_qty: Number(p.qty || 0) };
                }
            });
        }

        // Final merged list
        const mergedProducts = Object.values(originalMap).map(m => ({
            ...m,
            qty: m.actual_qty || m.qty // Use actual if provided, else keep original
        }));

        const { data, error } = await getSupabase()
            .from('import_tickets')
            .update({
                status: 'completed',
                products: mergedProducts,
                note: note || undefined,
                completed_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lỗi hoàn thành: ' + error.message));
        }

        // Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            let msg = `✅ <b>PHIẾU NHẬP ĐÃ HOÀN THÀNH</b>\n`;
            msg += `#${data.ticket_no}\n`;
            msg += `🏭 NCC: ${data.supplier_name}\n`;
            msg += `\n📋 <b>Chi tiết:</b>\n`;
            mergedProducts.forEach(p => {
                msg += `- ${p.name}: ${p.qty} ${p.unit || 'Kg'}\n`;
            });
            if (note) msg += `\n📝 Note: ${note}`;

            await sendTelegramMessage(msg, 'NHAP');
        } catch (tgErr) {
            console.error('Telegram Error:', tgErr.message);
        }

        res.json({
            error: false,
            msg: 'Hoàn thành phiếu nhập!',
            data
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// DELETE /api/imports/:id - Cancel import ticket
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await getSupabase()
            .from('import_tickets')
            .update({ status: 'cancelled' })
            .eq('id', id);

        if (error) {
            return res.json(createResponse(true, 'Lỗi hủy phiếu: ' + error.message));
        }

        res.json({
            error: false,
            msg: 'Đã hủy phiếu nhập'
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

export default router;
