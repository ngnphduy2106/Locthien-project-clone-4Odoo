// ===============================================
// ODOO PURCHASE ORDERS ROUTE
// Đọc đơn mua từ bảng `odoo_purchase_orders` (sync từ Odoo qua webhook).
// Frontend dùng cho tab "Đơn mua" trong dispatch module.
// ===============================================

import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as odoo from '../integration/odoo/odoo-client.js';
import { uploadImages } from '../services/storage.js';
import { pushProofToOdoo } from '../services/odoo-proof.js';

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

// is_pinned: cột boolean của odoo_purchase_orders (thêm bằng ALTER TABLE). Ép boolean
// thật phòng trường hợp lưu chuỗi "false"/"False" (truthy trong JS) như bảng cũ.
const pinBool = (v) => v === true || v === 1 || (typeof v === 'string' && ['true', 't', '1', 'yes'].includes(v.trim().toLowerCase()));

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
        is_pinned:           pinBool(row.is_pinned),
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

        // Lazy-load: PO sync qua cron/pull chỉ có header (không có order_line). Nếu chưa có
        // chi tiết sản phẩm thì kéo live từ Odoo (get_lt_po_dispatch_detail) rồi cache lại.
        if (!data.detail || !data.detail.lines || data.detail.lines.length === 0) {
            try {
                console.log(`[odoo-po] Lazy-loading detail for PO ${id} from Odoo...`);
                const fullDetail = await odoo.getPurchaseOrderDetail(id);
                if (fullDetail && fullDetail.lines && fullDetail.lines.length > 0) {
                    data.detail = fullDetail;
                    await supabase
                        .from('odoo_purchase_orders')
                        .update({ detail: fullDetail })
                        .eq('odoo_id', id);
                    console.log(`[odoo-po] Cached detail for PO ${id} (${fullDetail.lines.length} dòng).`);
                }
            } catch (odooErr) {
                console.error(`[odoo-po] Lazy-loading detail failed for PO ${id}:`, odooErr.message);
            }
        }

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
        
        let odooFailed = false;
        try {
            await odoo.assignPickupDriver(id, driver, plate);
            if (autoStart) {
                // PO chưa có action riêng cho 'lt_receiving' — write trực tiếp
                await odoo.call('purchase.order', 'write',
                    [[id], { x_lt_po_status: 'lt_receiving' }], {});
            }
        } catch (e) {
            console.error('[odoo-po] Odoo API assign fail, fallback to local update:', e.message);
            odooFailed = true;
        }

        // Cập nhật trực tiếp vào Supabase để đảm bảo hoạt động ngay cả khi Odoo offline
        const { error: dbErr } = await supabase
            .from('odoo_purchase_orders')
            .update({
                x_lt_po_driver_name: driver,
                x_lt_po_plate: plate,
                x_lt_po_status: autoStart ? 'lt_receiving' : 'lt_approved'
            })
            .eq('odoo_id', id);

        if (dbErr) throw dbErr;

        return res.json({ 
            error: false, 
            msg: odooFailed 
                ? 'Đã ghi nhận tài xế lấy hàng trên ERP (Không thể kết nối Odoo)' 
                : 'Đã ghi tài xế + chuyển sang Đang lấy hàng' 
        });
    } catch (e) {
        console.error('[odoo-po] assign fail:', e.message);
        return res.status(500).json({ error: true, msg: e.message });
    }
});

// POST /api/odoo-purchase-orders/:poId/received — đã nhận đủ hàng
// Body (optional): { images: [base64 dataURL, ...] } — ảnh phiếu nhận hàng.
// Ảnh: upload CDN (lưu trữ) + push webhook Odoo → tab "📎 Chứng từ xác thực"
// trên purchase.order (x_lt_po_delivery_proof_ids).
router.post('/:poId/received', async (req, res) => {
    try {
        const id = parseInt(req.params.poId, 10);
        const images = Array.isArray(req.body?.images) ? req.body.images : [];
        let odooFailed = false;
        try {
            await odoo.markPurchaseReceived(id);
        } catch (e) {
            console.error('[odoo-po] Odoo markPurchaseReceived fail, fallback to local update:', e.message);
            odooFailed = true;
        }

        const { error: dbErr } = await supabase
            .from('odoo_purchase_orders')
            .update({ x_lt_po_status: 'lt_received' })
            .eq('odoo_id', id);

        if (dbErr) throw dbErr;

        // Ảnh xử lý ĐỒNG BỘ trước khi trả lời — serverless (Vercel) đóng băng mọi việc
        // nền (setImmediate) sau res.json nên không bao giờ chạy.
        if (images.length > 0) {
            try {
                const urls = await uploadImages(images, `odoo_po_${id}`);
                const r = await pushProofToOdoo('purchase.order', id, images);
                console.log(`📸 [odoo-po] received#${id}: ${images.length} ảnh | CDN ${urls.filter(u => u.startsWith('http')).length} | Odoo pushed ${r.pushed}/${images.length}`);
            } catch (proofErr) {
                console.error(`⚠️ [odoo-po] proof #${id} fail:`, proofErr.message);
            }
        }

        return res.json({
            error: false,
            msg: odooFailed
                ? 'Đã đánh dấu nhận hàng trên ERP (Không thể kết nối Odoo)'
                : 'Đã đánh dấu nhận đủ'
        });
    } catch (e) {
        return res.status(500).json({ error: true, msg: e.message });
    }
});

// PUT /api/odoo-purchase-orders/:poId/pin — ghim/bỏ ghim đơn mua Odoo
// Yêu cầu cột boolean `is_pinned` trên odoo_purchase_orders:
//   ALTER TABLE odoo_purchase_orders ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
router.put('/:poId/pin', async (req, res) => {
    try {
        const id = parseInt(req.params.poId, 10);
        const { is_pinned } = req.body;
        const { error } = await supabase
            .from('odoo_purchase_orders')
            .update({ is_pinned: is_pinned === true })
            .eq('odoo_id', id);
        if (error) {
            return res.json({ error: true, msg: 'Lỗi ghim đơn mua: ' + error.message });
        }
        console.log(`📌 Odoo PO ${id} pinned: ${is_pinned === true}`);
        return res.json({ error: false, msg: is_pinned ? 'Đã ghim đơn mua!' : 'Đã bỏ ghim đơn mua!' });
    } catch (e) {
        return res.json({ error: true, msg: e.message });
    }
});

export default router;
