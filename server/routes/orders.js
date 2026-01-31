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
        // Support query param to include deleted/cancelled orders
        const includeDeleted = req.query.includeDeleted === 'true';
        const orders = await db.getOrders(includeDeleted);
        const users = await db.getUsers();

        const completedStatuses = ['Đã thực hiện']; // Only completed, not cancelled
        const cancelledStatuses = ['Đã hủy bỏ'];

        const pending = [];
        const assigned = [];
        const completed = [];
        const cancelled = [];

        for (const order of orders) {
            const s = String(order.status || '').trim();

            // Check for cancelled first
            if (cancelledStatuses.some(cs => cs.toLowerCase() === s.toLowerCase())) {
                cancelled.push(order);
                continue;
            }

            // Check if status is completed
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

        console.log('DEBUG: Sending response. Pending:', pending.length, 'Assigned:', assigned.length, 'Completed:', completed.length, 'Cancelled:', cancelled.length);

        res.json({
            error: false,
            pending,
            assigned,
            completed,
            cancelled,
            cancelledCount: cancelled.length,
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

        const completedStatuses = ['Đã thực hiện', 'Đã hủy bỏ', 'completed', 'COMPLETED']; // MISA + internal statuses
        const myName = String(driverName).trim().toUpperCase();

        console.log(`🔍 My Orders Search: driverName="${driverName}" -> normalized="${myName}"`);

        const internalDrivers = users
            .filter(u => u.role === CONFIG.ROLES.DRIVER)
            .map(u => (u.fullName || '').toUpperCase());

        let myOrders = orders.filter(o => {
            if (!o.taiXe) return false;

            const tName = String(o.taiXe).trim().toUpperCase();

            // More flexible matching: includes or exact match
            const match = (tName === myName) ||
                tName.includes(myName) ||
                myName.includes(tName);

            if (match) console.log(`✅ Found match: "${o.taiXe}" ~ "${driverName}" for order ${o.soDon}`);

            if (role === 'ADMIN' || role === 'TESTER') {
                const isMe = match;
                const isExternal = tName && !internalDrivers.includes(tName);
                return isMe || isExternal;
            }

            return match;
        });

        console.log(`📋 Driver ${driverName} (${role}) | Total DB Orders: ${orders.length} | Matches: ${myOrders.length}`);

        // Map status codes for frontend
        myOrders = myOrders.map(o => {
            const s = String(o.status || '').toLowerCase();
            let statusCode = 'CHO_GIAO';

            // Defining status arrays for flexible matching
            const deliveringStatuses = ['in_transit', 'delivering', 'đang thực hiện', 'đang giao'];
            const pendingStatuses = ['assigned', 'chưa thực hiện'];

            if (pendingStatuses.some(ps => s.includes(ps))) statusCode = 'CHO_NHAN';
            else if (deliveringStatuses.some(ds => s.includes(ds))) statusCode = 'DANG_GIAO';
            else if (completedStatuses.some(cs => cs.toLowerCase() === s)) statusCode = 'HOAN_THANH';

            console.log(`   Order ${o.soDon}: status="${o.status}" -> statusCode="${statusCode}"`);

            return { ...o, statusCode };
        });

        res.json({ error: false, data: myOrders });

    } catch (e) {
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// GET /api/orders/:id - Get single order detail by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📄 Get Order Detail: ${id}`);

        // Try to get order from database
        const order = await db.getOrder(id);

        if (!order) {
            // Try to find by sale_order_no if not found by id
            const orders = await db.getOrders();
            const searchId = String(id).toLowerCase().trim();
            const foundOrder = orders.find(o => {
                const oId = String(o.id || '').toLowerCase().trim();
                const oSoDon = String(o.soDon || '').toLowerCase().trim();
                const oSaleOrderNo = String(o.sale_order_no || '').toLowerCase().trim();
                return oId === searchId || oSoDon === searchId || oSaleOrderNo === searchId;
            });

            if (foundOrder) {
                console.log(`✅ Found order by search: ${foundOrder.id}`);
                return res.json({ error: false, data: foundOrder });
            }

            console.log(`❌ Order not found: ${id}`);
            return res.json(createResponse(true, 'Không tìm thấy đơn hàng!'));
        }

        console.log(`✅ Found order: ${order.id}, soDon: ${order.soDon}`);
        res.json({ error: false, data: order });
    } catch (e) {
        console.error('Get order detail error:', e.message);
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// PUT /api/orders/:id/local-items - Update local items (vỏ can, phuy, tank) - NO MISA SYNC
router.put('/:id/local-items', async (req, res) => {
    try {
        const { id } = req.params;
        const { local_items } = req.body;

        console.log(`📦 Updating local items for order ${id}:`, JSON.stringify(local_items, null, 2));

        // Validate local_items is array
        if (!Array.isArray(local_items)) {
            return res.json(createResponse(true, 'local_items phải là mảng!'));
        }

        // Update order with local_items only (NO MISA SYNC)
        const order = await db.updateOrder(id, { local_items });

        if (!order) {
            return res.json(createResponse(true, 'Không tìm thấy đơn hàng!'));
        }

        res.json(createResponse(false, 'Đã lưu mặt hàng phụ!', { local_items: order.local_items }));

    } catch (e) {
        console.error('Local items update error:', e.message);
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/orders/:id - Edit order (customer, address, notes, products)

router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { customer, address, note, notes, products, productUpdates, local_items } = req.body;

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

        // Local items (vỏ can, phuy, tank) - NOT synced to MISA
        if (local_items !== undefined && Array.isArray(local_items)) {
            updateData.local_items = local_items;
            console.log(`📦 Local items update:`, JSON.stringify(local_items, null, 2));
        }

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

        // Send push notification to driver (async, don't block response)
        try {
            const { notifyDriverOrderAssigned } = await import('../services/firebase.js');
            const users = await db.getUsers();
            const driver = users.find(u =>
                u.fullName?.toLowerCase() === driverName?.toLowerCase() ||
                u.username?.toLowerCase() === driverName?.toLowerCase()
            );

            if (driver?.fcm_token) {
                notifyDriverOrderAssigned(driver.fcm_token, {
                    orderId: id,
                    orderNo: fullOrder?.soDon || fullOrder?.sale_order_no || id,
                    customerName: fullOrder?.khach || fullOrder?.account_name,
                    address: fullOrder?.diaChi || fullOrder?.shipping_address,
                    type: 'export'
                });
                console.log(`📬 Push notification sent to driver ${driverName}`);
            } else {
                console.log(`⚠️ No FCM token for driver ${driverName}`);
            }
        } catch (notifyErr) {
            console.error('Push notification error:', notifyErr.message);
        }

        // Send Telegram notification (async, don't block response)
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const orderInfo = await db.getOrder(id);

            let msg = `🚛 <b>PHÂN CÔNG TÀI XẾ</b>\n`;
            msg += `#${orderInfo?.soDon || orderInfo?.sale_order_no || id}\n`;
            msg += `👤 KH: ${orderInfo?.khach || orderInfo?.account_name || ''}\n`;
            msg += `📍 ${orderInfo?.diaChi || orderInfo?.shipping_address || ''}\n`;
            msg += `──────────────\n`;
            msg += `🚗 Tài xế: <b>${driverName}</b>\n`;
            msg += `🔢 Biển số: ${plate || 'Chưa có'}\n`;
            if (note) msg += `📝 Ghi chú: ${note}\n`;

            await sendTelegramMessage(msg, 'XUAT');
            console.log(`📬 Telegram notification sent for order ${id}`);
        } catch (tgErr) {
            console.error('Telegram notification error:', tgErr.message);
        }

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

// POST /api/orders/:id/complete - Unified complete order handler (Admin & Driver)
router.post('/:id/complete', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            // Admin complete fields
            products, delivery_note, admin_completed,
            // Driver complete fields
            type, warehouse, partner, driver_name, plate, cart, note, sender, images
        } = req.body;

        // ============================================================
        // DRIVER COMPLETE FLOW: Has cart with actual delivered products
        // ============================================================
        if (cart && Array.isArray(cart) && cart.length > 0) {
            console.log(`🚚 Driver Complete Flow - Order: ${id}, Cart items: ${cart.length}`);

            const ts = getTimestamp();
            const prefix = type === 'NHAP' ? 'N' : 'X';
            const ticketId = prefix + ts.short;

            // Prepare actual delivered products for DB update
            const updatedProducts = cart.filter(c => !c.isShell).map(item => ({
                code: item.product?.code || item.product?.id || item.code || '',
                name: item.product?.name || item.name || item.product || '',
                qty: Number(item.weight_kg || item.qty || 0),
                unit: item.unit || 'Kg'
            }));

            // Update order status AND products + Set initial sync status
            await db.updateOrder(id, {
                status: CONFIG.STATUS.DELIVERED,
                delivery_status: 'Đã giao hàng',
                taiXe: driver_name,
                bienSo: plate,
                cart: updatedProducts,
                crm_sync_status: 'PUSHING'
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

            // Sync to MISA & Supabase
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
                    note: note || `Tạo bởi: ${sender || driver_name}`,
                    images: images || []
                });
            } catch (err) {
                console.error('Supabase Export Ticket Error:', err.message);
            }

            // 2. Sync to MISA CRM
            try {
                const orderInfo = await db.getOrder(id);
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
                return res.json(createResponse(!syncResult.success, syncResult.success ? 'Hoàn thành!' : 'Đã lưu cục bộ nhưng CRM lỗi' + syncStatusMsg, { ticketId, crmStatus: crmSyncStatus }));

            } catch (syncErr) {
                await db.updateOrder(id, { crm_sync_status: 'FAILED', sync_error: syncErr.message });
                return res.json(createResponse(true, 'Hoàn thành locally nhưng lỗi hệ thống CRM: ' + syncErr.message));
            }
        }

        // ============================================================
        // ADMIN COMPLETE FLOW: Quick complete without detailed cart
        // ============================================================
        console.log(`👔 Admin Complete Flow - Order: ${id}`);

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

        // Create export ticket for Admin Complete (so images can be added later)
        try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
            const fullOrderForTicket = await db.getOrder(id);

            const ts = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
            const ticketNo = 'X' + ts;

            // Check if export ticket already exists
            const { data: existingTicket } = await supabase
                .from('export_tickets')
                .select('id')
                .eq('order_id', id)
                .limit(1)
                .single();

            if (!existingTicket) {
                const orderProducts = products || fullOrderForTicket?.cart || fullOrderForTicket?.products || [];
                const totalQty = orderProducts.reduce((sum, p) => sum + Number(p.qty || p.quantity || 0), 0);

                await supabase.from('export_tickets').insert({
                    ticket_no: ticketNo,
                    order_id: id,
                    order_no: fullOrderForTicket?.soDon || fullOrderForTicket?.sale_order_no || id,
                    customer_name: fullOrderForTicket?.khach || fullOrderForTicket?.account_name || '',
                    customer_address: fullOrderForTicket?.diaChi || fullOrderForTicket?.shipping_address || '',
                    driver_name: fullOrderForTicket?.taiXe || fullOrderForTicket?.driver || 'Admin',
                    plate: fullOrderForTicket?.bienSo || fullOrderForTicket?.plate || '',
                    warehouse: 'LT1',
                    products: orderProducts,
                    total_qty: totalQty,
                    note: delivery_note || 'Admin Complete',
                    images: images || [] // Store images if provided
                });
                console.log(`📦 Export ticket created for Admin Complete: ${ticketNo}`);
            }
        } catch (ticketErr) {
            console.error('Export ticket creation error:', ticketErr.message);
            // Don't fail the completion - just log the error
        }

        // Sync to MISA
        const fullOrder = await db.getOrder(id);
        console.log(`📤 Complete Order Sync - Order: ${fullOrder?.sale_order_no}, Cart items: ${(products || fullOrder?.cart || []).length}`);
        try {
            const syncResult = await updateMisaOrder(fullOrder?.sale_order_no || id, {
                misa_id: fullOrder?.misa_id,
                delivery_status: 'Đã giao hàng',
                status: 'Đã thực hiện',
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


// GET /api/orders/:id/proof-images - Get proof images from export ticket
router.get('/:id/proof-images', async (req, res) => {
    try {
        const { id } = req.params;
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        // Try to find by order_id or order_no
        let { data, error } = await supabase
            .from('export_tickets')
            .select('ticket_no, images, created_at, driver_name')
            .eq('order_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        // If not found by order_id, try by order_no
        if (error || !data) {
            const orderInfo = await db.getOrder(id);
            if (orderInfo?.soDon) {
                const result = await supabase
                    .from('export_tickets')
                    .select('ticket_no, images, created_at, driver_name')
                    .eq('order_no', orderInfo.soDon)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (!result.error) data = result.data;
            }
        }

        res.json({
            error: false,
            images: data?.images || [],
            ticket_no: data?.ticket_no || null,
            created_at: data?.created_at || null,
            driver_name: data?.driver_name || null
        });
    } catch (e) {
        console.error('Get proof images error:', e.message);
        res.json({ error: false, images: [] }); // Return empty array on error
    }
});

// POST /api/orders/:id/add-proof-images - Add more proof images to completed order
router.post('/:id/add-proof-images', async (req, res) => {
    try {
        const { id } = req.params;
        const { images } = req.body;

        if (!images || !Array.isArray(images) || images.length === 0) {
            return res.json(createResponse(true, 'Vui lòng chọn ít nhất 1 ảnh!'));
        }

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        // Find existing export ticket
        let { data: ticket, error } = await supabase
            .from('export_tickets')
            .select('id, images')
            .eq('order_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        // If not found by order_id, try by order_no
        if (error || !ticket) {
            const orderInfo = await db.getOrder(id);
            if (orderInfo?.soDon) {
                const result = await supabase
                    .from('export_tickets')
                    .select('id, images')
                    .eq('order_no', orderInfo.soDon)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (!result.error) ticket = result.data;
            }
        }

        if (!ticket) {
            // No export ticket exists - create one with just images
            const orderInfo = await db.getOrder(id);
            const ts = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);

            const { error: insertError } = await supabase.from('export_tickets').insert({
                ticket_no: 'X' + ts,
                order_id: id,
                order_no: orderInfo?.soDon || id,
                customer_name: orderInfo?.khach || orderInfo?.account_name || '',
                driver_name: orderInfo?.taiXe || 'Admin',
                plate: orderInfo?.bienSo || '',
                warehouse: 'LT1',
                products: orderInfo?.cart || [],
                images: images.slice(0, 10), // Max 10 images
                note: 'Ảnh bổ sung bởi Admin'
            });

            if (insertError) {
                return res.json(createResponse(true, 'Lỗi tạo phiếu: ' + insertError.message));
            }

            return res.json(createResponse(false, `Đã thêm ${images.length} ảnh chứng minh!`));
        }

        // Ticket exists - append new images
        const existingImages = ticket.images || [];
        const totalAllowed = 10 - existingImages.length;

        if (totalAllowed <= 0) {
            return res.json(createResponse(true, 'Đã đạt giới hạn 10 ảnh!'));
        }

        const newImages = images.slice(0, totalAllowed);
        const updatedImages = [...existingImages, ...newImages];

        const { error: updateError } = await supabase
            .from('export_tickets')
            .update({ images: updatedImages })
            .eq('id', ticket.id);

        if (updateError) {
            return res.json(createResponse(true, 'Lỗi cập nhật: ' + updateError.message));
        }

        res.json(createResponse(false, `Đã thêm ${newImages.length} ảnh (${updatedImages.length}/10)!`));

    } catch (e) {
        console.error('Add proof images error:', e.message);
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// DELETE /api/orders/:id/proof-images/:imageIndex - Remove specific proof image
router.delete('/:id/proof-images/:imageIndex', async (req, res) => {
    try {
        const { id, imageIndex } = req.params;
        const idx = parseInt(imageIndex);

        if (isNaN(idx) || idx < 0) {
            return res.json(createResponse(true, 'Chỉ số ảnh không hợp lệ!'));
        }

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        // Find export ticket
        let { data: ticket, error } = await supabase
            .from('export_tickets')
            .select('id, images')
            .eq('order_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        // If not found by order_id, try by order_no
        if (error || !ticket) {
            const orderInfo = await db.getOrder(id);
            if (orderInfo?.soDon) {
                const result = await supabase
                    .from('export_tickets')
                    .select('id, images')
                    .eq('order_no', orderInfo.soDon)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (!result.error) ticket = result.data;
            }
        }

        if (!ticket) {
            return res.json(createResponse(true, 'Không tìm thấy phiếu xuất!'));
        }

        const images = ticket.images || [];
        if (idx >= images.length) {
            return res.json(createResponse(true, 'Ảnh không tồn tại!'));
        }

        // Remove image at index
        images.splice(idx, 1);

        // Update database
        const { error: updateError } = await supabase
            .from('export_tickets')
            .update({ images })
            .eq('id', ticket.id);

        if (updateError) {
            return res.json(createResponse(true, 'Lỗi xóa ảnh: ' + updateError.message));
        }

        res.json(createResponse(false, `Đã xóa ảnh (còn ${images.length}/10)!`));

    } catch (e) {
        console.error('Delete proof image error:', e.message);
        res.json(createResponse(true, 'Lỗi: ' + e.message));
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



