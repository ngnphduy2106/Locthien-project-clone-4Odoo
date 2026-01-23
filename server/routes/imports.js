// ===============================================
// IMPORT TICKETS ROUTES (Phiếu nhập)
// ===============================================

import { Router } from 'express';
import { createResponse, getTimestamp } from '../config.js';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// GET /api/imports - List all import tickets
router.get('/', async (req, res) => {
    try {
        const { status } = req.query;

        let query = supabase
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

        const { data, error } = await supabase
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

// PUT /api/imports/:id/assign - Assign driver to import ticket
router.put('/:id/assign', async (req, res) => {
    try {
        const { id } = req.params;
        const { driver_name, plate } = req.body;

        const { data, error } = await supabase
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

        const { data, error } = await supabase
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

        const { data, error } = await supabase
            .from('import_tickets')
            .update({
                status: 'completed',
                products: actual_products || undefined,
                note: note || undefined,
                completed_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lỗi hoàn thành: ' + error.message));
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

        const { error } = await supabase
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
