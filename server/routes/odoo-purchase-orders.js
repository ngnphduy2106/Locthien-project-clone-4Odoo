// ===============================================
// ODOO PURCHASE ORDERS ROUTE
// Đọc đơn mua từ bảng `odoo_purchase_orders` (sync từ Odoo qua webhook).
// Frontend dùng cho tab "Đơn mua" trong dispatch module.
// ===============================================

import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as odoo from '../integration/odoo/odoo-client.js';

const router = Router();

// Map x_lt_po_status -> nhãn hiển thị (giống sale)
function mapStatus(x) {
    switch (x) {
        case 'lt_approved':  return 'Chờ nhận';      // đồng bộ với đơn bán hàng
        case 'lt_receiving': return 'Đang lấy hàng';
        case 'lt_received':
        case 'lt_billed':
        case 'lt_closed':    return 'Đã nhận';
        case 'lt_cancelled': return 'Đã hủy';
        default:             return 'Khác';
    }
}

function toFrontend(row) {
    const detail = row.detail || {};
    const lines  = detail.lines || [];
    const sup    = detail.supplier || {};
    return {
        id:                  row.odoo_id,
        odoo_id:             row.odoo_id,
        po_no:               row.name,
        soDon:               row.name,
        status:              mapStatus(row.x_lt_po_status),
        x_lt_po_status:      row.x_lt_po_status,

        supplier:            row.supplier_name,
        supplier_name:       row.supplier_name,
        supplier_id:         row.supplier_id,
        supplier_phone:      sup.phone || sup.mobile || '',
        supplier_address:    [sup.street, sup.city].filter(Boolean).join(', '),

        ngay:                row.date_order,
        date:                row.date_order,
        date_planned:        row.date_planned,

        amount:              row.amount_total,
        total:               row.amount_total,
        total_amount:        row.amount_total,
        amount_untaxed:      row.amount_untaxed,
        amount_tax:          row.amount_tax,

        taiXe:               row.x_lt_po_driver_name || '',
        bienSo:              row.x_lt_po_plate || '',

        // Kho đích — tài xế chở hàng về (vd "Kho LT1" / "Kho LT2")
        kho:                 row.warehouse_name || '',
        warehouse:           row.warehouse_name || '',
        warehouse_name:      row.warehouse_name || '',
        warehouse_id:        row.warehouse_id || null,

        products: lines.map(l => ({
            code:           l.product_code || '',
            name:           l.product_name || '',
            description:    l.description || '',
            qty:            l.qty || 0,
            qty_received:   l.qty_received || 0,
            unit:           (!l.uom || l.uom.trim().toLowerCase() === 'units' || l.uom.trim().toLowerCase() === 'unit') ? 'kg' : l.uom,
            price_unit:     l.price_unit || 0,
            price_subtotal: l.price_subtotal || 0,
            price_total:    l.price_total || 0,
        })),

        note:                row.note || '',
        created_date:        row.date_order,
        write_date:          row.write_date,
        synced_at:           row.synced_at,
    };
}

// GET /api/odoo-purchase-orders  ?tab=dispatch|receiving|done
router.get('/', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const tab = req.query.tab || '';
        let q = supabase
            .from('odoo_purchase_orders')
            .select('*')
            .order('date_order', { ascending: false });

        if (tab === 'dispatch')       q = q.eq('x_lt_po_status', 'lt_approved');
        else if (tab === 'receiving') q = q.eq('x_lt_po_status', 'lt_receiving');
        else if (tab === 'done')      q = q.in('x_lt_po_status',
            ['lt_received', 'lt_billed', 'lt_closed']);

        const { data, error } = await q;
        if (error) throw error;
        return res.json({ error: false, orders: (data || []).map(toFrontend) });
    } catch (e) {
        console.error('[odoo-po] list fail:', e.message);
        return res.json({ error: true, msg: e.message, orders: [] });
    }
});

// GET /api/odoo-purchase-orders/:poId
router.get('/:poId', async (req, res) => {
    try {
        const id = parseInt(req.params.poId, 10);
        const { data, error } = await supabase
            .from('odoo_purchase_orders')
            .select('*')
            .eq('odoo_id', id)
            .maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: true, msg: 'Not found' });
        return res.json({ error: false, order: toFrontend(data) });
    } catch (e) {
        return res.json({ error: true, msg: e.message });
    }
});

// POST /api/odoo-purchase-orders/:poId/assign-driver  body {driver, plate, autoStart?}
// Gán tài xế + (mặc định) đổi trạng thái sang "Đang lấy hàng" (lt_receiving)
router.post('/:poId/assign-driver', async (req, res) => {
    try {
        const id = parseInt(req.params.poId, 10);
        const { driver, plate, autoStart = true } = req.body || {};
        if (!driver || !plate) {
            return res.status(400).json({ error: true, msg: 'Thiếu driver hoặc plate' });
        }
        await odoo.assignPickupDriver(id, driver, plate);
        if (autoStart) {
            // PO chưa có action riêng cho 'lt_receiving' — write trực tiếp
            await odoo.call('purchase.order', 'write',
                [[id], { x_lt_po_status: 'lt_receiving' }], {});
        }
        return res.json({ error: false, msg: 'Đã ghi tài xế + chuyển sang Đang lấy hàng' });
    } catch (e) {
        console.error('[odoo-po] assign fail:', e.message);
        return res.status(500).json({ error: true, msg: e.message });
    }
});

// POST /api/odoo-purchase-orders/:poId/received — đã nhận đủ hàng
router.post('/:poId/received', async (req, res) => {
    try {
        await odoo.markPurchaseReceived(parseInt(req.params.poId, 10));
        return res.json({ error: false, msg: 'Đã đánh dấu nhận đủ' });
    } catch (e) {
        return res.status(500).json({ error: true, msg: e.message });
    }
});

export default router;
