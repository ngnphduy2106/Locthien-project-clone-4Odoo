// ===============================================
// ORDER ROUTES
// ===============================================

import { Router } from 'express';
import { CONFIG, createResponse, formatDate, getTimestamp, standardizeData } from '../config.js';
import db from '../db/index.js';
import { updateMisaOrder } from '../services/misa.js';

const router = Router();

// GET /api/orders - Get all orders for admin
router.get('/', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const orders = await db.getOrders();
        const users = await db.getUsers();

        const completedStatuses = ['Đã thực hiện', 'Đã hủy bỏ']; // MISA status values

        const pending = [];
        const assigned = [];
        const completed = [];

        for (const order of orders) {
            const s = String(order.status || '').trim();
            // Check if status is in the completed list (Case Insensitive for foreign keys)
            if (completedStatuses.some(cs => cs.toLowerCase() === s.toLowerCase())) {
                completed.push(order);
                continue;
            }

            if (!order.taiXe) {
                pending.push(order);
            } else {
                assigned.push(order);
            }
        }

        const drivers = users
            .filter(u => u.status === 'ACTIVE' && u.role === CONFIG.ROLES.DRIVER)
            .map(u => ({ name: u.fullName, plate: u.plate }));

        console.log('DEBUG: Sending response. Pending:', pending.length, 'Completed:', completed.length);

        res.json({
            error: false,
            pending,
            assigned,
            completed,
            drivers
        });

    } catch (e) {
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// GET /api/orders/export-tickets - Get recent export tickets
router.get('/export-tickets', async (req, res) => {
    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        const { data, error } = await supabase
            .from('export_tickets')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            return res.json(createResponse(true, 'Lỗi: ' + error.message));
        }

        res.json({
            error: false,
            data: data || []
        });
    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// GET /api/orders/my/:driverName - Get orders for driver
router.get('/my/:driverName', async (req, res) => {
    try {
        const { driverName } = req.params;
        const { role } = req.query;

        const orders = await db.getOrders();
        const users = await db.getUsers();

        const completedStatuses = ['Đã thực hiện', 'Đã hủy bỏ']; // MISA status values
        const myName = String(driverName).trim().toUpperCase();

        const internalDrivers = users
            .filter(u => u.role === CONFIG.ROLES.DRIVER)
            .map(u => u.fullName.toUpperCase());

        let myOrders = orders.filter(o => {
            if (!o.taiXe) return false;

            const tName = String(o.taiXe).trim().toUpperCase();
            const match = (tName === myName);

            if (match) console.log(`DEBUG: Found match for ${driverName}: ${o.soDon}`);

            if (role === 'ADMIN' || role === 'TESTER') {
                const isMe = match;
                const isExternal = tName && !internalDrivers.includes(tName);
                return isMe || isExternal;
            }

            return match;
        });

        console.log(`DEBUG: Driver ${driverName} (${role}) | Total DB Orders: ${orders.length} | Matches: ${myOrders.length}`);

        myOrders = myOrders.map(o => ({
            ...o,
            statusCode: o.status === CONFIG.STATUS.DELIVERING ? 'DANG_GIAO' : 'CHO_GIAO'
        }));

        res.json({ error: false, data: myOrders });

    } catch (e) {
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// POST /api/orders - Create import order
router.post('/', async (req, res) => {
    try {
        const { date, customer, address, products } = req.body;

        const ts = getTimestamp();
        const id = 'NK' + ts.short;

        const order = await db.addOrder({
            soDon: id,
            ngay: formatDate(date),
            khach: customer,
            diaChi: address,
            status: CONFIG.STATUS.WAITING,
            type: 'IMPORT',
            products: products.map(p => ({
                name: p.name,
                qty: Number(p.qty),
                unit: p.unit || 'Kg',
                density: p.density || ''
            }))
        });

        res.json(createResponse(false, 'Đã tạo đơn nhập: ' + id, { orderId: id }));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/orders/:id/assign - Assign driver
router.put('/:id/assign', async (req, res) => {
    try {
        const { id } = req.params;
        const { driverName, plate, note } = req.body;

        const order = await db.updateOrder(id, {
            taiXe: driverName,
            bienSo: plate,
            status: CONFIG.STATUS.DELIVERING,
            delivery_status: 'Đang giao hàng',
            note: note || '' // Save internal note
        });

        if (!order) {
            return res.json(createResponse(true, 'Không tìm thấy đơn hàng!'));
        }

        res.json(createResponse(false, 'Đã gán tài xế!'));

        // Sync to MISA (Background)
        const fullOrder = await db.getOrder(id);
        updateMisaOrder(fullOrder?.sale_order_no || id, {
            misa_id: fullOrder?.misa_id,
            delivery_status: 'Đang giao hàng',
            status: 'Đang thực hiện', // Maps to MISA status 2
            driver: driverName,
            plate: plate,
            cart: fullOrder?.cart || fullOrder?.products || [] // Include cart to avoid empty product error
        }).catch(console.error);

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/orders/:id/update-products - Edit order products (quantity only, no deletion)
router.put('/:id/update-products', async (req, res) => {
    try {
        const { id } = req.params;
        const { products } = req.body; // Expected: [{ code, name, qty, unit }, ...]

        if (!products || !Array.isArray(products)) {
            return res.json(createResponse(true, 'Danh sách sản phẩm không hợp lệ!'));
        }

        // Get original order to merge (no-delete logic)
        const originalOrder = await db.getOrder(id);
        if (!originalOrder) {
            return res.json(createResponse(true, 'Không tìm thấy đơn hàng!'));
        }

        const originalProducts = originalOrder.products || originalOrder.cart || [];
        const originalMap = {};
        originalProducts.forEach(p => {
            const key = p.code || p.name || '';
            originalMap[key] = { ...p };
        });

        // Update quantities from request (no deletion)
        products.forEach(p => {
            const key = p.code || p.name || '';
            if (originalMap[key]) {
                // Update quantity only
                originalMap[key].qty = Number(p.qty || 0);
            } else {
                // New product added
                originalMap[key] = {
                    code: p.code || '',
                    name: p.name || '',
                    qty: Number(p.qty || 0),
                    unit: p.unit || 'Kg'
                };
            }
        });

        // Convert back to array
        const mergedProducts = Object.values(originalMap);

        // Update in database
        await db.updateOrder(id, {
            cart: mergedProducts
        });

        res.json(createResponse(false, 'Đã cập nhật số lượng sản phẩm!', { products: mergedProducts }));

        // Sync to MISA (Background)
        (async () => {
            try {
                const fullOrder = await db.getOrder(id);
                if (!fullOrder?.misa_id) return;

                const misaCart = mergedProducts.map(p => ({
                    product_code: p.code || '',
                    unit: p.unit || 'kg',
                    qty: Number(p.qty || 0),
                    amount: Number(p.qty || 0)
                }));

                await updateMisaOrder(fullOrder.sale_order_no || id, {
                    misa_id: fullOrder.misa_id,
                    cart: misaCart
                });
            } catch (e) {
                console.error('MISA Update Error:', e.message);
            }
        })();

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/orders/:id/start - Driver starts order
router.put('/:id/start', async (req, res) => {
    try {
        const { id } = req.params;

        const order = await db.updateOrder(id, {
            status: CONFIG.STATUS.DELIVERING
        });

        if (!order) {
            return res.json(createResponse(true, 'Không tìm thấy đơn hàng!'));
        }

        res.json(createResponse(false, 'Đã nhận đơn!'));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// POST /api/orders/:id/assign-multi - Multi-driver assignment
router.post('/:id/assign-multi', async (req, res) => {
    try {
        const { id } = req.params;
        const { assignments } = req.body;

        if (!assignments || !assignments.length) {
            return res.json(createResponse(true, 'Chưa có phân công nào!'));
        }

        // Get Supabase client
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        // Delete existing assignments for this order
        await supabase.from('order_driver_assignments').delete().eq('order_id', id);

        // Insert new assignments
        const insertData = assignments.map(a => ({
            order_id: id,
            driver_name: a.driver_name,
            driver_type: a.type || 'internal',
            plate: a.plate || '',
            assigned_qty: Number(a.qty) || 0,
            status: 'pending',
            note: a.note || ''
        }));

        const { error } = await supabase.from('order_driver_assignments').insert(insertData);

        if (error) {
            return res.json(createResponse(true, 'Lỗi lưu phân công: ' + error.message));
        }

        // Update order with first driver info (main driver)
        const mainDriver = assignments[0];
        await db.updateOrder(id, {
            status: CONFIG.STATUS.ASSIGNED,
            taiXe: mainDriver.driver_name,
            bienSo: mainDriver.plate || '',
            note: assignments.length > 1 ? `Chia ${assignments.length} tài xế` : (mainDriver.note || '')
        });

        // Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const orderInfo = await db.getOrder(id);

            let msg = `🚛 <b>PHÂN CÔNG NHIỀU TÀI XẾ</b>\n`;
            msg += `#${orderInfo?.soDon || id}\n`;
            msg += `👤 KH: ${orderInfo?.khach || ''}\n\n`;
            msg += `<b>Danh sách tài xế:</b>\n`;

            assignments.forEach((a, i) => {
                const typeLabel = a.type === 'external' ? '(Ngoài)' : '(NB)';
                msg += `${i + 1}. ${a.driver_name} ${typeLabel} - ${a.qty}kg\n`;
            });

            msg += `\n🔔 @sales`;

            await sendTelegramMessage(msg);
        } catch (tgErr) {
            console.error('Telegram Error:', tgErr.message);
        }

        res.json(createResponse(false, `Đã phân công ${assignments.length} tài xế!`));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// POST /api/orders/:id/complete - Complete delivery
router.post('/:id/complete', async (req, res) => {
    try {
        const { id } = req.params;
        const { type, warehouse, partner, driver_name, plate, cart, note, sender, images } = req.body;

        const ts = getTimestamp();
        const prefix = type === 'NHAP' ? 'N' : 'X';
        const ticketId = prefix + ts.short;

        // Prepare actual delivered products for DB update
        const updatedProducts = cart.filter(c => !c.isShell).map(item => ({
            code: item.product?.code || item.product?.id || item.code || '',
            name: item.product?.name || item.name || item.product || '',
            qty: Number(item.weight_kg || item.qty || 0),
            unit: item.unit || 'Kg'
            // density: item.density
        }));

        // Update order status AND products
        await db.updateOrder(id, {
            status: CONFIG.STATUS.DELIVERED,
            delivery_status: 'Đã giao hàng',
            taiXe: driver_name,
            bienSo: plate,
            cart: updatedProducts
        });

        // Create warehouse tickets
        for (const item of cart) {
            if (item.isShell) continue;

            const data = {
                id: ticketId,
                date: ts.date,
                warehouse,
                partner,
                driver: driver_name,
                plate,
                product: standardizeData(item.product, 'PRODUCT'),
                density: item.density,
                qty: Number(item.weight_kg),
                note,
                sender
            };

            if (type === 'NHAP') {
                await db.addDataNhap(data);
            } else {
                await db.addDataXuat(data);
            }
        }

        res.json(createResponse(false, 'Hoàn thành! Mã phiếu: ' + ticketId, { ticketId }));

        // Create Export Ticket in Supabase (Background)
        (async () => {
            try {
                const { createClient } = await import('@supabase/supabase-js');
                const supabase = createClient(
                    process.env.SUPABASE_URL,
                    process.env.SUPABASE_KEY
                );

                const orderInfo = await db.getOrder(id);
                const totalQty = cart.reduce((sum, c) => sum + Number(c.weight_kg || c.qty || 0), 0);

                await supabase.from('export_tickets').insert({
                    ticket_no: ticketId,
                    order_id: id,
                    order_no: orderInfo?.soDon || id,
                    customer_name: partner,
                    customer_address: orderInfo?.diaChi || '',
                    driver_name: driver_name,
                    plate: plate,
                    warehouse: warehouse,
                    products: cart.map(c => ({
                        code: c.product?.code || c.code || '',
                        name: c.product?.name || c.product || c.name || '',
                        qty: Number(c.weight_kg || c.qty || 0),
                        unit: c.unit || 'kg',
                        isShell: c.isShell || false
                    })),
                    total_qty: totalQty,
                    note: note,
                    images: images || [],
                    created_by: sender || driver_name
                });

                console.log(`✅ Export Ticket Created: ${ticketId}`);
            } catch (err) {
                console.error('Export Ticket Error:', err.message);
            }
        })();

        // Sync to MISA (Background) & Notification
        (async () => {
            try {
                const orderInfo = await db.getOrder(id);
                if (!orderInfo) return;

                // --- NO-DELETE LOGIC: Merge delivered quantities with original products ---
                const originalProducts = orderInfo.products || [];
                // Create a map for easy lookup of original items
                const originalMap = {};
                originalProducts.forEach(p => {
                    const code = p.code || p.product_code || '';
                    originalMap[p.name || code] = { ...p, qty_planned: p.qty, actual_qty: 0 };
                });

                // Update with delivered quantities
                cart.filter(c => !c.isShell).forEach(item => {
                    const name = item.product?.name || item.name || '';
                    const code = item.product?.code || item.product?.id || item.code || '';
                    const key = name || code;

                    if (originalMap[key]) {
                        originalMap[key].actual_qty += Number(item.weight_kg || item.qty || 0);
                    } else {
                        // Extra item not in plan
                        originalMap[key] = {
                            name,
                            code,
                            qty_planned: 0,
                            actual_qty: Number(item.weight_kg || item.qty || 0),
                            unit: item.unit || 'Kg'
                        };
                    }
                });

                // Final merged products list for DB (preserve all items)
                const mergedProducts = Object.values(originalMap).map(m => ({
                    ...m,
                    qty: m.actual_qty // This is what MISA/Warehouse normally sees as "Delivered"
                }));

                // Update order in DB with merged products
                await db.updateOrder(id, {
                    status: CONFIG.STATUS.DELIVERED,
                    delivery_status: 'Đã giao hàng',
                    taiXe: driver_name,
                    bienSo: plate,
                    cart: mergedProducts
                });

                // 2. Diff Detection
                let diffMsg = [];
                Object.values(originalMap).forEach(m => {
                    if (m.qty_planned > 0 && Math.abs(m.actual_qty - m.qty_planned) > 0.5) {
                        diffMsg.push(`- ${m.name}: KH ${m.qty_planned}kg -> THỰC TẾ ${m.actual_qty}kg`);
                    } else if (m.qty_planned === 0 && m.actual_qty > 0) {
                        diffMsg.push(`- ➕ PHÁT SINH: ${m.name} (${m.actual_qty}kg)`);
                    }
                });

                // 3. Telegram Message
                const isDiff = diffMsg.length > 0;
                let msg = `🚛 <b>GIAO HÀNG THÀNH CÔNG</b>\n`;
                msg += `#${orderInfo.soDon || id}\n`;
                msg += `👤 KH: ${partner}\n`;
                msg += `👮 Tài xế: ${driver_name} (${plate})\n`;

                if (isDiff) {
                    msg += `\n⚠️ <b>CÓ THAY ĐỔI (LỆCH):</b>\n${diffMsg.join('\n')}\n`;
                    msg += `\n‼️ @sales (kiểm tra lại)`;
                } else {
                    msg += `\n✅ <i>Đúng số lượng yêu cầu</i>`;
                }

                // Notify about extra shell items
                const shellItems = cart.filter(c => c.isShell);
                if (shellItems.length > 0) {
                    const shellSummary = shellItems.map(s => `${s.product?.name || s.product} x${s.weight_kg || s.qty}`).join(', ');
                    msg += `\n\n📦 <b>HÀNG PHỤ:</b> ${shellSummary}`;
                    msg += `\n🔔 @sales`;
                }

                if (note) msg += `\n📝 Note: ${note}`;
                if (images && images.length) msg += `\n📸 Đã tải lên ${images.length} ảnh.`;

                // Send Telegram with type 'XUAT'
                try {
                    const { sendTelegramMessage } = await import('../services/telegram.js');
                    await sendTelegramMessage(msg, 'XUAT');
                } catch (errTg) {
                    console.error("Telegram Error:", errTg.message);
                }


                // 3. Sync to MISA
                // We only send Quantity info. The updateMisaOrder service will handle Price/Tax lookup from original order.
                const misaCart = cart.filter(item => !item.isShell).map(item => {
                    // Get product code from the item
                    const productCode = item.product?.code || item.product?.id ||
                        item.code || item.product || '';

                    return {
                        product_code: productCode,
                        warehouse: warehouse,
                        unit: item.unit || 'kg',
                        qty: Number(item.weight_kg || item.qty || 0),
                        weight_kg: Number(item.weight_kg || 0),
                        note: item.note || ''
                        // Price, Tax, Discount are purposely OMITTED here.
                        // The 'updateMisaOrder' service will retrieve them from the original MISA order 
                        // to ensure exact preservation of financial data.
                    };
                });

                await updateMisaOrder(orderInfo.sale_order_no || id, {
                    misa_id: orderInfo.misa_id,
                    delivery_status: 'Đã giao hàng',
                    status: 'Đã thực hiện', // Maps to MISA status 3
                    driver: driver_name,
                    plate: plate,
                    description: `Hoàn thành bởi ${driver_name} (${plate}). Phiếu: ${ticketId}. ${isDiff ? '(CÓ LỆCH)' : ''}`,
                    cart: misaCart
                });
            } catch (err) {
                console.error("⚠️ Background Task Error:", err.message);
            }
        })();

    } catch (e) {
        if (!res.headersSent) {
            res.json(createResponse(true, e.message));
        } else {
            console.error("❌ Error after response sent:", e.message);
        }
    }
});

export default router;



