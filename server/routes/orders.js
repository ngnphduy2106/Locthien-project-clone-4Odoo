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

// PUT /api/orders/:id - Edit order (customer, address, notes, products)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { customer, address, note, notes, products, productUpdates } = req.body;

        console.log(`📝 Edit Order Request for ${id}:`, JSON.stringify(req.body, null, 2));

        // First, fetch existing order to get current products
        const existingOrder = await db.getOrder(id);
        if (!existingOrder) {
            return res.json(createResponse(true, 'Không tìm thấy đơn hàng!'));
        }

        // Build update object
        const updateData = {};
        if (customer !== undefined) updateData.khach = customer;
        if (address !== undefined) updateData.diaChi = address;
        if (note !== undefined || notes !== undefined) updateData.ghiChu = note || notes;

        // Handle productUpdates (from frontend - array of {idx, qty})
        if (productUpdates && Array.isArray(productUpdates) && productUpdates.length > 0) {
            const existingCart = existingOrder.cart || existingOrder.products || existingOrder.chiTiet || [];
            const updatedCart = existingCart.map((p, idx) => {
                const update = productUpdates.find(u => u.idx === idx);
                return {
                    code: p.code || p.product_code || '',
                    name: p.name || p.product || '',
                    qty: update ? Number(update.qty) : (Number(p.qty) || Number(p.quantity) || 0),
                    unit: p.unit || 'Kg'
                };
            });
            updateData.cart = updatedCart;
            console.log(`📝 Updated Cart:`, JSON.stringify(updatedCart, null, 2));
        }
        // Handle full products array (if provided directly)
        else if (products && Array.isArray(products)) {
            updateData.cart = products.map(p => ({
                code: p.code || '',
                name: p.name || p.product || '',
                qty: Number(p.qty) || 0,
                unit: p.unit || 'Kg'
            }));
        }

        const order = await db.updateOrder(id, updateData);

        if (!order) {
            return res.json(createResponse(true, 'Không thể cập nhật đơn hàng!'));
        }


        // Sync to MISA - preserve current order status
        const fullOrder = await db.getOrder(id);
        try {
            console.log(`📤 Edit Order Sync - Order: ${fullOrder?.sale_order_no}, Status: ${fullOrder?.status}`);

            // Map Supabase status to MISA status text
            let misaStatusForEdit = undefined;
            const currentStatus = fullOrder?.status;
            if (currentStatus === 'COMPLETED' || currentStatus === 'Hoàn thành' || currentStatus === 'Đã thực hiện' || currentStatus === 'completed') {
                misaStatusForEdit = 'Đã thực hiện';
            } else if (currentStatus === 'DELIVERING' || currentStatus === 'Đang thực hiện' || currentStatus === 'Đang giao' || currentStatus === 'in_transit') {
                misaStatusForEdit = 'Đang thực hiện';
            }

            console.log(`📤 Mapped MISA Status: ${misaStatusForEdit}`);

            await updateMisaOrder(fullOrder?.sale_order_no || id, {
                misa_id: fullOrder?.misa_id,
                cart: updateData.cart || fullOrder?.cart || [],
                status: misaStatusForEdit  // Pass explicitly mapped status
            });

        } catch (syncErr) {
            console.error('MISA Sync Error on Edit:', syncErr.message);
        }


        res.json(createResponse(false, 'Đã cập nhật đơn hàng!'));

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

        // Sync to MISA (Synchronous - mandatory for feedback)
        const fullOrder = await db.getOrder(id);
        const syncResult = await updateMisaOrder(fullOrder?.sale_order_no || id, {
            misa_id: fullOrder?.misa_id,
            delivery_status: 'Đang giao hàng',
            status: 'Đang thực hiện',
            driver: driverName,
            plate: plate,
            cart: fullOrder?.cart || fullOrder?.products || []
        });

        if (!syncResult.success) {
            console.error('MISA Sync Failed during Assign:', syncResult.message);
            // We don't block assignment, but we notify
            return res.json(createResponse(false, `Đã gán tài xế locally, nhưng ${syncResult.message}`));
        }

        res.json(createResponse(false, 'Đã gán tài xế và đồng bộ MISA!'));

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

        // Sync to MISA (Synchronous - Wait for MISA before responding)
        const fullOrder = await db.getOrder(id);
        if (fullOrder?.misa_id) {
            const misaCart = mergedProducts.map(p => ({
                product_code: p.code || '',
                unit: p.unit || 'kg',
                qty: Number(p.qty || 0),
                amount: Number(p.qty || 0)
            }));

            const syncResult = await updateMisaOrder(fullOrder.sale_order_no || id, {
                misa_id: fullOrder.misa_id,
                cart: misaCart
            });

            if (!syncResult.success) {
                return res.json(createResponse(true, `Lỗi đồng bộ CRM: ${syncResult.message}`));
            }
        }

        res.json(createResponse(false, 'Đã cập nhật số lượng và đồng bộ MISA!', { products: mergedProducts }));

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

// POST /api/orders/:id/complete - Admin complete order
router.post('/:id/complete', async (req, res) => {
    try {
        const { id } = req.params;
        const { products, delivery_note, admin_completed } = req.body;

        // Update order status to completed
        const order = await db.updateOrder(id, {
            status: CONFIG.STATUS.COMPLETED,
            delivery_status: 'Hoàn thành',
            completed_at: new Date().toISOString(),
            delivery_note: delivery_note || '',
            admin_completed: admin_completed || false
        });

        if (!order) {
            return res.json(createResponse(true, 'Không tìm thấy đơn hàng!'));
        }

        // Sync to MISA
        const fullOrder = await db.getOrder(id);
        console.log(`📤 Complete Order Sync - Order: ${fullOrder?.sale_order_no}, Cart items: ${(products || fullOrder?.cart || []).length}`);
        try {
            const syncResult = await updateMisaOrder(fullOrder?.sale_order_no || id, {
                misa_id: fullOrder?.misa_id,
                delivery_status: 'Đã giao hàng',  // MISA recognizes this to set status = 'Đã thực hiện'
                status: 'Đã thực hiện',  // Direct MISA status text
                driver: fullOrder?.custom_field13 || fullOrder?.taiXe || fullOrder?.driver || '',
                plate: fullOrder?.custom_field14 || fullOrder?.bienSo || fullOrder?.plate || '',
                cart: products || fullOrder?.cart || fullOrder?.products || []
            });




            if (!syncResult.success) {
                console.error('MISA Sync Failed during Complete:', syncResult.message);
            }
        } catch (syncErr) {
            console.error('MISA Sync Error:', syncErr.message);
        }

        res.json(createResponse(false, 'Đã hoàn thành đơn hàng!'));

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

        // Update order status AND products + Set initial sync status
        await db.updateOrder(id, {
            status: CONFIG.STATUS.DELIVERED,
            delivery_status: 'Đã giao hàng',
            taiXe: driver_name,
            bienSo: plate,
            cart: updatedProducts,
            crm_sync_status: 'PUSHING' // Mark as in progress
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

        // Sync to MISA & Supabase (Synchronous for critical flow)
        let syncStatusMsg = '';
        let crmSyncStatus = 'SYNCED';

        // 1. Create Export Ticket in Supabase
        try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
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
        } catch (err) {
            console.error('Supabase Export Ticket Error:', err.message);
        }

        // 2. Sync to MISA CRM
        try {
            const orderInfo = await db.getOrder(id);
            const originalProducts = orderInfo.products || [];
            const originalMap = {};
            originalProducts.forEach(p => {
                const code = p.code || p.product_code || '';
                originalMap[p.name || code] = { ...p, qty_planned: p.qty, actual_qty: 0 };
            });

            cart.filter(c => !c.isShell).forEach(item => {
                const name = item.product?.name || item.name || '';
                const code = item.product?.code || item.product?.id || item.code || '';
                const key = name || code;
                if (originalMap[key]) {
                    originalMap[key].actual_qty += Number(item.weight_kg || item.qty || 0);
                } else {
                    originalMap[key] = {
                        name, code, qty_planned: 0,
                        actual_qty: Number(item.weight_kg || item.qty || 0),
                        unit: item.unit || 'Kg'
                    };
                }
            });

            const mergedProducts = Object.values(originalMap).map(m => ({
                ...m,
                qty: m.actual_qty
            }));

            // Prepare MISA Payload
            const misaCart = cart.filter(item => !item.isShell).map(item => ({
                product_code: item.product?.code || item.product?.id || item.code || item.product || '',
                warehouse,
                unit: item.unit || 'kg',
                qty: Number(item.weight_kg || item.qty || 0)
            }));

            const syncResult = await updateMisaOrder(orderInfo.sale_order_no || id, {
                misa_id: orderInfo.misa_id,
                delivery_status: 'Đã giao hàng',
                status: 'Đã thực hiện',
                driver: driver_name,
                plate,
                cart: misaCart
            });

            if (syncResult.success) {
                crmSyncStatus = 'SYNCED';
            } else {
                crmSyncStatus = 'FAILED';
                syncStatusMsg = ` (⚠️ CRM Lỗi: ${syncResult.message})`;
            }

            // Update Database with Final Sync Result
            await db.updateOrder(id, {
                crm_sync_status: crmSyncStatus,
                sync_error: syncResult.success ? null : syncResult.message
            });

            // Final response
            res.json(createResponse(!syncResult.success, syncResult.success ? 'Hoàn thành!' : 'Đã lưu cục bộ nhưng CRM lỗi' + syncStatusMsg, { ticketId, crmStatus: crmSyncStatus }));

        } catch (syncErr) {
            await db.updateOrder(id, { crm_sync_status: 'FAILED', sync_error: syncErr.message });
            res.json(createResponse(true, 'Hoàn thành locally nhưng lỗi hệ thống CRM: ' + syncErr.message));
        }

    } catch (e) {
        if (!res.headersSent) {
            res.json(createResponse(true, e.message));
        } else {
            console.error("❌ Error after response sent:", e.message);
        }
    }
});

// GET /api/orders/:id/chat - Get chat messages
router.get('/:id/chat', async (req, res) => {
    try {
        const { id } = req.params;
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        const { data, error } = await supabase
            .from('order_messages')
            .select('*')
            .eq('order_id', id)
            .order('created_at', { ascending: true });

        if (error) return res.json(createResponse(true, error.message));
        res.json({ error: false, messages: data || [] });
    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// POST /api/orders/:id/chat - Send chat message
router.post('/:id/chat', async (req, res) => {
    try {
        const { id } = req.params;
        const { sender_name, sender_role, message, image } = req.body;

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        const { error } = await supabase.from('order_messages').insert({
            order_id: id,
            sender_name,
            sender_role,
            message,
            image
        });

        if (error) return res.json(createResponse(true, error.message));
        res.json(createResponse(false, 'Đã gửi!'));
    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

export default router;



