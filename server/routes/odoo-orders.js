// ===============================================
// ODOO ORDERS ROUTE
// Đọc dữ liệu đơn từ bảng `odoo_orders` (sync từ Odoo) rồi map sang shape
// MISA-compatible mà frontend dispatch.js đã quen — đổi 1 dòng `window.api.getOrders`
// → `window.api.getOdooOrders` là chạy.
// ===============================================

import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as odoo from '../integration/odoo/odoo-client.js';

const router = Router();

// ---- Map x_lt_status Odoo → status frontend filter ----
function mapStatus(x) {
    switch (x) {
        case 'lt_approved':
            return 'Chờ nhận';
        case 'lt_delivering':
            return 'Đang giao';
        case 'lt_delivered':
        case 'lt_confirmed':
        case 'lt_invoiced':
        case 'lt_closed':
            return 'Hoàn thành';
        case 'lt_cancelled':
            return 'Đã hủy';
        default:
            return 'Báo giá';      // lt_draft / lt_pending — không hiện ở dispatch tab
    }
}

/**
 * 1 row odoo_orders → object frontend hiểu (đa-alias để khớp cả 2 schema).
 */
function toFrontend(row) {
    const detail = row.detail || {};
    const lines  = detail.lines || [];
    const ship   = detail.shipping || {};
    const part   = detail.partner || {};

    const mappedLines = lines.map(l => {
        const uomVal = (!l.uom || l.uom.trim().toLowerCase() === 'units' || l.uom.trim().toLowerCase() === 'unit') ? 'kg' : l.uom;
        return {
            ...l,
            uom: uomVal,
            unit: uomVal
        };
    });

    return {
        // ID
        id:                 row.odoo_id,
        odoo_id:            row.odoo_id,
        soDon:              row.name,
        sale_order_no:      row.name,

        // Status
        status:             mapStatus(row.x_lt_status),
        x_lt_status:        row.x_lt_status,

        // Khách
        khach:              row.partner_name,
        customer:           row.partner_name,
        customer_name:      row.partner_name,
        account_name:       row.partner_name,
        customer_phone:     part.phone || part.mobile || '',
        customer_tax:       part.vat || '',

        // Giao đến — ưu tiên x_lt_shipping_address (custom field trên đơn), fallback partner address
        diaChi:             row.x_lt_shipping_address || [ship.street, ship.street2, ship.city].filter(Boolean).join(', '),
        address:            row.x_lt_shipping_address || [ship.street, ship.street2, ship.city].filter(Boolean).join(', '),
        shipping_address:   row.x_lt_shipping_address || [ship.street, ship.street2, ship.city].filter(Boolean).join(', '),
        delivery_address:   row.x_lt_shipping_address || [ship.street, ship.street2, ship.city].filter(Boolean).join(', '),
        shipping_name:      row.partner_shipping_name,
        shipping_phone:     ship.phone || ship.mobile || '',

        // Ngày
        ngay:               row.date_order,
        date:               row.date_order,
        order_date:         row.date_order,
        sale_order_date:    row.date_order,
        delivery_time:      row.commitment_date || '',

        // Tiền
        amount:             row.amount_total,
        total:              row.amount_total,
        total_amount:       row.amount_total,
        sale_order_amount:  row.amount_total,
        amount_untaxed:     row.amount_untaxed,
        amount_tax:         row.amount_tax,

        // Tài xế & Phụ xe
        taiXe:              row.x_lt_driver_name || detail.x_driver_name || detail.x_lt_driver_name || '',
        driver:             row.x_lt_driver_name || detail.x_driver_name || detail.x_lt_driver_name || '',
        driver_name:        row.x_lt_driver_name || detail.x_driver_name || detail.x_lt_driver_name || '',
        custom_field13:     row.x_lt_driver_name || detail.x_driver_name || detail.x_lt_driver_name || '',
        bienSo:             row.x_lt_plate || detail.x_plate || detail.x_lt_plate || '',
        plate:              row.x_lt_plate || detail.x_plate || detail.x_lt_plate || '',
        vehicle_plate:      row.x_lt_plate || detail.x_plate || detail.x_lt_plate || '',
        custom_field14:     row.x_lt_plate || detail.x_plate || detail.x_lt_plate || '',
        phuXe:              detail.x_assistant_name || '',
        assistant_name:     detail.x_assistant_name || '',

        // Hàng hóa (lines)
        products: mappedLines.map(l => ({
            code:           l.product_code || '',
            material_code:  l.product_code || '',
            name:           l.product_name || '',
            material_name:  l.product_name || '',
            description:    l.description || '',
            quantity:       l.qty || 0,
            qty:            l.qty || 0,
            unit:           l.uom,
            uom:            l.uom,
            delivered_qty:  0,                          // mặc định — frontend tự cộng dồn
            price:          l.price_unit || 0,
            price_unit:     l.price_unit || 0,
            discount:       l.discount || 0,
            subtotal:       l.price_subtotal || 0,
            price_subtotal: l.price_subtotal || 0,
            price_total:    l.price_total || 0,
            quy_cach:       l.quy_cach || '',
            ma_quy_cach:    l.ma_quy_cach || '',
        })),
        cart: mappedLines,        // alias cho code cũ check `o.cart || o.products`

        // Ghi chú — ưu tiên row.note (sync), fallback detail.note (webhook)
        description:        row.note || detail.note || '',
        note:               row.note || detail.note || '',
        payment_term:       detail.payment_term || '',

        // Phụ thu (chỉ tham khảo)
        surcharge:          row.x_phi_phu_thu || 0,

        // Meta
        is_pinned:          false,                      // chưa có khái niệm pin trong odoo_orders
        created_date:       row.date_order,
        write_date:         row.write_date,
        synced_at:          row.synced_at,
    };
}

function poToFrontend(row) {
    const detail = row.detail || {};
    const lines  = detail.lines || [];
    const sup    = detail.supplier || {};
    const supplierAddress = [sup.street, sup.city].filter(Boolean).join(', ');
    
    // Status mapping for drivers (imports):
    let status = 'Chờ nhận';
    let statusCode = 'CHO_NHAN';
    
    switch (row.x_lt_po_status) {
        case 'lt_approved':
            status = 'Chờ nhận';
            statusCode = 'CHO_NHAN';
            break;
        case 'lt_receiving':
            status = 'Đang giao';
            statusCode = 'DANG_GIAO';
            break;
        case 'lt_received':
        case 'lt_billed':
        case 'lt_closed':
            status = 'Hoàn thành';
            statusCode = 'HOAN_THANH';
            break;
        case 'lt_cancelled':
            status = 'Đã hủy';
            statusCode = 'HOAN_THANH';
            break;
    }

    return {
        id:                  row.odoo_id,
        odoo_id:             row.odoo_id,
        soDon:               row.name,
        sale_order_no:       row.name,
        status:              status,
        statusCode:          statusCode,
        type:                'import',

        khach:               row.supplier_name,
        customer:            row.supplier_name,
        customer_name:       row.supplier_name,
        
        diaChi:              row.supplier_address || supplierAddress,
        address:             row.supplier_address || supplierAddress,
        delivery_address:    row.supplier_address || supplierAddress,
        
        ngay:                row.date_order,
        date:                row.date_order,
        expected_date:       row.date_planned,
        
        amount:              row.amount_total,
        total:               row.amount_total,
        total_amount:        row.amount_total,
        
        taiXe:               row.x_lt_po_driver_name || '',
        driver:              row.x_lt_po_driver_name || '',
        driver_name:         row.x_lt_po_driver_name || '',
        custom_field13:      row.x_lt_po_driver_name || '',
        bienSo:              row.x_lt_po_plate || '',
        plate:               row.x_lt_po_plate || '',
        custom_field14:      row.x_lt_po_plate || '',
        
        products: lines.map(l => ({
            code:           l.product_code || '',
            name:           l.product_name || '',
            description:    l.description || '',
            qty:            l.qty || 0,
            unit:           (!l.uom || l.uom.trim().toLowerCase() === 'units' || l.uom.trim().toLowerCase() === 'unit') ? 'kg' : l.uom,
        })),
        
        note:                row.note || '',
        created_date:        row.date_order,
        write_date:          row.write_date,
    };
}


// ============================================================
// GET /api/odoo-orders
// Trả tất cả đơn (filter báo giá ra). Optional ?status=pending|delivering|completed
// ============================================================
router.get('/', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const tab = req.query.tab || '';
        let q = supabase
            .from('odoo_orders')
            .select('*')
            .eq('x_lt_is_quotation', false)
            .order('date_order', { ascending: false });

        // Filter sớm theo tab — đỡ truyền data thừa
        if (tab === 'pending')      q = q.eq('x_lt_status', 'lt_approved');
        else if (tab === 'delivering') q = q.eq('x_lt_status', 'lt_delivering');
        else if (tab === 'completed')  q = q.in('x_lt_status',
            ['lt_delivered', 'lt_confirmed', 'lt_invoiced', 'lt_closed']);

        const { data, error } = await q;
        if (error) throw error;
        return res.json({ error: false, orders: (data || []).map(toFrontend) });
    } catch (e) {
        console.error('[odoo-orders] list fail:', e.message);
        return res.json({ error: true, msg: e.message, orders: [] });
    }
});

// ============================================================
// GET /api/odoo-orders/my/:driverName — đơn của tài xế (cho MyOrdersModule)
// ============================================================
router.get('/my/:driverName', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const driverName = decodeURIComponent(req.params.driverName).trim();
        
        // Parallel queries to both tables
        const [ordersRes, poRes] = await Promise.all([
            supabase
                .from('odoo_orders')
                .select('*')
                .eq('x_lt_is_quotation', false)
                .ilike('x_lt_driver_name', `%${driverName}%`)
                .order('date_order', { ascending: false }),
            supabase
                .from('odoo_purchase_orders')
                .select('*')
                .ilike('x_lt_po_driver_name', `%${driverName}%`)
                .order('date_order', { ascending: false })
        ]);
        
        if (ordersRes.error) throw ordersRes.error;
        if (poRes.error) throw poRes.error;

        const saleOrders = (ordersRes.data || []).map(row => {
            const o = toFrontend(row);
            const s = o.status;
            if (s === 'Đang giao')      { o.statusCode = 'DANG_GIAO'; }
            else if (s === 'Chờ nhận')  { o.statusCode = 'CHO_NHAN'; }
            else if (s === 'Hoàn thành'){ o.statusCode = 'HOAN_THANH'; }
            return o;
        });

        const purchaseOrders = (poRes.data || []).map(row => poToFrontend(row));

        // Combine both
        const combined = [...saleOrders, ...purchaseOrders];
        // Sort by date_order descending
        combined.sort((a, b) => new Date(b.created_date || b.ngay || 0) - new Date(a.created_date || a.ngay || 0));

        return res.json({ error: false, data: combined });
    } catch (e) {
        console.error('[odoo-orders] my-orders fail:', e.message);
        return res.json({ error: true, msg: e.message, data: [] });
    }
});

// ============================================================
// GET /api/odoo-orders/:odooId — chi tiết 1 đơn
// ============================================================
router.get('/:odooId', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const id = parseInt(req.params.odooId, 10);
        const { data, error } = await supabase
            .from('odoo_orders')
            .select('*')
            .eq('odoo_id', id)
            .maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: true, msg: 'Not found' });

        // Lazy-loading: Nếu chưa có detail hoặc không có lines (danh sách sản phẩm)
        if (!data.detail || !data.detail.lines || data.detail.lines.length === 0) {
            try {
                console.log(`[odoo-orders] Lazy-loading detail for order ${id} from Odoo...`);
                const fullDetail = await odoo.getOrderDetail(id);
                if (fullDetail && fullDetail.lines && fullDetail.lines.length > 0) {
                    // Fetch thêm các trường tài xế/biển số/phụ xe hiện hành từ Odoo
                    try {
                        const odooRows = await odoo.call('sale.order', 'search_read', [[['id', '=', id]]], {
                            fields: ['x_driver_name', 'x_plate', 'x_assistant_name', 'x_lt_driver_name', 'x_lt_plate']
                        });
                        if (odooRows && odooRows.length > 0) {
                            const activeFields = odooRows[0];
                            fullDetail.x_driver_name = activeFields.x_driver_name || '';
                            fullDetail.x_plate = activeFields.x_plate || '';
                            fullDetail.x_assistant_name = activeFields.x_assistant_name || '';
                            fullDetail.x_lt_driver_name = activeFields.x_lt_driver_name || '';
                            fullDetail.x_lt_plate = activeFields.x_lt_plate || '';
                            
                            // Đồng bộ ngược lại object hiện hành
                            data.x_lt_driver_name = activeFields.x_driver_name || activeFields.x_lt_driver_name || '';
                            data.x_lt_plate = activeFields.x_plate || activeFields.x_lt_plate || '';
                        }
                    } catch (fieldsErr) {
                        console.error(`[odoo-orders] Fetch active fields failed for order ${id}:`, fieldsErr.message);
                    }

                    data.detail = fullDetail;
                    // Cập nhật vào DB để cache lần sau không cần gọi Odoo
                    await supabase
                        .from('odoo_orders')
                        .update({ 
                            detail: fullDetail,
                            x_lt_driver_name: data.x_lt_driver_name,
                            x_lt_plate: data.x_lt_plate
                        })
                        .eq('odoo_id', id);
                    console.log(`[odoo-orders] Cached detail for order ${id} in Supabase.`);
                }
            } catch (odooErr) {
                console.error(`[odoo-orders] Lazy-loading detail failed for order ${id}:`, odooErr.message);
            }
        }

        return res.json({ error: false, order: toFrontend(data) });
    } catch (e) {
        return res.json({ error: true, msg: e.message });
    }
});

// ============================================================
// POST /api/odoo-orders/:odooId/assign-driver  body: { driver, plate, autoStart? }
// Ghi tài xế NGƯỢC vào Odoo + log chatter + cập nhật local DB.
// ============================================================
router.post('/:odooId/assign-driver', async (req, res) => {
    try {
        const id = parseInt(req.params.odooId, 10);
        const { driver, plate, autoStart = true } = req.body || {};
        if (!driver || !plate) {
            return res.status(400).json({ error: true, msg: 'Thiếu driver hoặc plate' });
        }
        
        let odooFailed = false;
        try {
            await odoo.assignDriver(id, driver, plate);
            if (autoStart) {
                await odoo.startDelivery(id);
            }
        } catch (e) {
            console.error('[odoo-orders] Odoo API assign fail, fallback to local update:', e.message);
            odooFailed = true;
        }

        // Cập nhật trực tiếp vào Supabase để đảm bảo hệ thống hoạt động ngay cả khi Odoo offline
        const { error: dbErr } = await supabase
            .from('odoo_orders')
            .update({
                x_lt_driver_name: driver,
                x_lt_plate: plate,
                x_lt_status: autoStart ? 'lt_delivering' : 'lt_approved'
            })
            .eq('odoo_id', id);

        if (dbErr) throw dbErr;

        return res.json({ 
            error: false, 
            msg: odooFailed 
                ? 'Đã ghi nhận tài xế trên ERP (Không thể kết nối Odoo)' 
                : 'Đã ghi tài xế' + (autoStart ? ' + đã chuyển sang Đang giao' : '') 
        });
    } catch (e) {
        console.error('[odoo-orders] assign fail:', e.message);
        return res.status(500).json({ error: true, msg: e.message });
    }
});

// POST /api/odoo-orders/:odooId/start — bấm "Bắt đầu giao"
router.post('/:odooId/start', async (req, res) => {
    try {
        const id = parseInt(req.params.odooId, 10);
        let odooFailed = false;
        try {
            await odoo.startDelivery(id);
        } catch (e) {
            console.error('[odoo-orders] Odoo startDelivery fail, fallback to local update:', e.message);
            odooFailed = true;
        }

        const { error: dbErr } = await supabase
            .from('odoo_orders')
            .update({ x_lt_status: 'lt_delivering' })
            .eq('odoo_id', id);

        if (dbErr) throw dbErr;

        return res.json({ 
            error: false, 
            msg: odooFailed 
                ? 'Đã bắt đầu giao trên ERP (Không thể kết nối Odoo)' 
                : 'Đã chuyển sang trạng thái đang giao' 
        });
    } catch (e) {
        return res.status(500).json({ error: true, msg: e.message });
    }
});

// POST /api/odoo-orders/:odooId/complete — bấm "Hoàn thành"
router.post('/:odooId/complete', async (req, res) => {
    try {
        const id = parseInt(req.params.odooId, 10);
        let odooFailed = false;
        try {
            await odoo.completeDelivery(id);
        } catch (e) {
            console.error('[odoo-orders] Odoo completeDelivery fail, fallback to local update:', e.message);
            odooFailed = true;
        }

        const { error: dbErr } = await supabase
            .from('odoo_orders')
            .update({ x_lt_status: 'lt_delivered' })
            .eq('odoo_id', id);

        if (dbErr) throw dbErr;

        return res.json({ 
            error: false, 
            msg: odooFailed 
                ? 'Đã hoàn thành trên ERP (Không thể kết nối Odoo)' 
                : 'Đã hoàn thành đơn' 
        });
    } catch (e) {
        return res.status(500).json({ error: true, msg: e.message });
    }
});


export default router;
