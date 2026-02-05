// ===============================================
// ORDER ROUTES
// ===============================================

import { Router } from 'express';
import { CONFIG, createResponse, formatDate, getTimestamp, standardizeData } from '../config.js';
import db from '../db/index.js';
import { updateMisaOrder } from '../services/misa.js';
import { createNotification } from './notifications.js';

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

// GET /api/orders/assignment/:id - Get single assignment with assigned_products
router.get('/assignment/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        const { data, error } = await supabase
            .from('order_driver_assignments')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            return res.json(createResponse(true, 'Không tìm thấy assignment!'));
        }

        res.json({ error: false, data });
    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// GET /api/orders/:orderId/assignments - Get ALL assignments for an order
router.get('/:orderId/assignments', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        console.log(`📦 Fetching assignments for order: ${orderId}`);

        // Query by order_id first (primary key)
        let { data, error } = await supabase
            .from('order_driver_assignments')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true });

        // If no results, try searching by sale_order_no (soDon)
        if ((!data || data.length === 0) && !error) {
            console.log(`⚠️ No assignments found by order_id, trying sale_order_no...`);
            const result = await supabase
                .from('order_driver_assignments')
                .select('*')
                .eq('sale_order_no', orderId)
                .order('created_at', { ascending: true });

            data = result.data;
            error = result.error;
        }

        console.log(`📦 Found ${data?.length || 0} assignments for ${orderId}:`,
            data?.map(a => ({ id: a.id, driver: a.driver_name, qty: a.assigned_qty })));

        if (error) {
            return res.json(createResponse(true, error.message));
        }

        // Combine all driver names, plates, and delivery notes
        const allDrivers = (data || []).map(a => a.driver_name).filter(Boolean).join(' và ');
        const allPlates = (data || []).map(a => a.plate).filter(Boolean).join(' và ');

        // Combine delivery notes from all drivers
        const allNotes = (data || [])
            .filter(a => a.delivery_note && a.delivery_note.trim())
            .map(a => `${a.driver_name}: ${a.delivery_note}`)
            .join(' | ');

        res.json({
            error: false,
            data: data || [],
            combined: {
                drivers: allDrivers,
                plates: allPlates,
                notes: allNotes,
                count: data?.length || 0
            }
        });
    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// GET /api/orders/my/:driverName - Get orders for driver (both export and import)
// Supports multi-driver splitting via order_driver_assignments table
router.get('/my/:driverName', async (req, res) => {
    try {
        const { driverName } = req.params;
        const { role } = req.query;
        const myName = String(driverName).trim().toUpperCase();
        const normalizedRole = (role || '').toUpperCase();
        const isAdmin = normalizedRole === 'ADMIN' || normalizedRole === 'TESTER';

        console.log(`🔍 My Orders Search: driverName="${driverName}" role="${role}"`);

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        const orders = await db.getOrders();
        const users = await db.getUsers();
        const internalDrivers = users
            .filter(u => u.role === CONFIG.ROLES.DRIVER)
            .map(u => (u.fullName || '').toUpperCase());

        let myOrders = [];

        // ===== 1. QUERY MULTI-DRIVER ASSIGNMENTS =====
        try {
            console.log(`🔍 Querying assignments for driver: "${driverName}" (isAdmin: ${isAdmin})`);

            let assignments = [];

            if (isAdmin) {
                // Admin sees ALL external driver assignments
                const { data: allAssignments, error: allErr } = await supabase
                    .from('order_driver_assignments')
                    .select('*')
                    .eq('driver_type', 'external');

                if (allErr) console.error('Admin assignment query error:', allErr.message);

                // Also get assignments matching admin name (if admin has personal orders)
                const { data: myAssignments } = await supabase
                    .from('order_driver_assignments')
                    .select('*')
                    .ilike('driver_name', `%${driverName}%`);

                // Merge and dedupe
                const allIds = new Set();
                assignments = [];
                for (const a of [...(allAssignments || []), ...(myAssignments || [])]) {
                    if (!allIds.has(a.id)) {
                        allIds.add(a.id);
                        assignments.push(a);
                    }
                }
                console.log(`📋 Admin sees ${assignments.length} total assignments (external + personal)`);
            } else {
                // Regular driver - only see their own assignments
                const { data: driverAssignments, error: assignErr } = await supabase
                    .from('order_driver_assignments')
                    .select('*')
                    .ilike('driver_name', `%${driverName}%`);

                if (assignErr) console.error('Assignment query error:', assignErr.message);
                assignments = driverAssignments || [];
            }

            console.log(`📋 Assignment query result: ${assignments.length} rows`);

            if (assignments && assignments.length > 0) {
                console.log(`📦 Found ${assignments.length} driver assignments:`,
                    assignments.map(a => ({ id: a.id, driver_name: a.driver_name, order_id: a.order_id, qty: a.assigned_qty, assigned_products: a.assigned_products })));

                for (const assign of assignments) {
                    // Find the parent order
                    const order = orders.find(o =>
                        o.id === assign.order_id ||
                        o.soDon === assign.order_id ||
                        String(o.id) === String(assign.order_id)
                    );

                    if (!order) {
                        console.log(`⚠️ Order not found for assignment: ${assign.order_id}`);
                        continue;
                    }

                    // Calculate status based on assignment status
                    let statusCode = 'CHO_NHAN';
                    if (assign.status === 'delivering') statusCode = 'DANG_GIAO';
                    else if (assign.status === 'completed') statusCode = 'HOAN_THANH';

                    // Check if this is a split order (multiple assignments)
                    const { data: allAssignments } = await supabase
                        .from('order_driver_assignments')
                        .select('id, status, assigned_qty, actual_qty, driver_name')
                        .eq('order_id', assign.order_id);

                    const isSplitOrder = allAssignments && allAssignments.length > 1;
                    const completedCount = allAssignments?.filter(a => a.status === 'completed').length || 0;
                    const totalCount = allAssignments?.length || 1;

                    // DEBUG: Log what we're returning to frontend
                    console.log(`🚀 Returning to frontend - assignment_id: ${assign.id}, assigned_products:`, assign.assigned_products);

                    myOrders.push({
                        ...order,
                        // Override with assignment-specific data
                        assignment_id: assign.id,
                        assigned_qty: assign.assigned_qty,
                        assigned_products: assign.assigned_products, // Custom products for this driver
                        actual_qty: assign.actual_qty || 0,
                        assignment_status: assign.status,
                        assignment_plate: assign.plate,
                        is_split_order: isSplitOrder,
                        split_progress: isSplitOrder ? `${completedCount}/${totalCount}` : null,
                        all_assignments: allAssignments,
                        statusCode,
                        type: 'export',
                        // Use assignment driver info
                        taiXe: assign.driver_name,
                        bienSo: assign.plate || order.bienSo
                    });
                }
            }
        } catch (assignErr) {
            console.error('Assignment query error:', assignErr.message);
        }

        // ===== 2. FALLBACK: ORDERS WITHOUT ASSIGNMENTS (legacy/single driver) =====
        const assignedOrderIds = myOrders.map(o => o.id);
        const legacyOrders = orders.filter(o => {
            if (assignedOrderIds.includes(o.id)) return false; // Already have from assignments
            if (!o.taiXe) return false;

            const tName = String(o.taiXe).trim().toUpperCase();
            const match = (tName === myName) || tName.includes(myName) || myName.includes(tName);

            if (isAdmin) {
                const isExternal = tName && !internalDrivers.includes(tName);
                return match || isExternal;
            }
            return match;
        });

        for (const order of legacyOrders) {
            const s = String(order.status || '').toLowerCase();
            let statusCode = 'CHO_GIAO';

            const deliveringStatuses = ['in_transit', 'delivering', 'đang thực hiện', 'đang giao'];
            const pendingStatuses = ['assigned', 'chưa thực hiện'];
            const completedStatuses = ['đã thực hiện', 'completed'];

            if (pendingStatuses.some(ps => s.includes(ps))) statusCode = 'CHO_NHAN';
            else if (deliveringStatuses.some(ds => s.includes(ds))) statusCode = 'DANG_GIAO';
            else if (completedStatuses.some(cs => s.includes(cs))) statusCode = 'HOAN_THANH';

            myOrders.push({
                ...order,
                statusCode,
                type: 'export',
                is_split_order: false
            });
        }

        console.log(`📋 Export orders for ${driverName}: ${myOrders.length}`);

        // ===== 3. IMPORT TICKETS - MULTI-DRIVER =====
        try {
            // First check import_driver_assignments
            let importAssignments = [];

            if (isAdmin) {
                // Admin sees ALL external driver assignments for imports
                const { data: allExternalImports, error: extErr } = await supabase
                    .from('import_driver_assignments')
                    .select('*')
                    .eq('driver_type', 'external');

                if (extErr) console.error('Admin import assignment query error:', extErr.message);

                // Also get personal import assignments
                const { data: myImportAssigns } = await supabase
                    .from('import_driver_assignments')
                    .select('*')
                    .ilike('driver_name', `%${driverName}%`);

                // Merge and dedupe
                const allIds = new Set();
                for (const a of [...(allExternalImports || []), ...(myImportAssigns || [])]) {
                    if (!allIds.has(a.id)) {
                        allIds.add(a.id);
                        importAssignments.push(a);
                    }
                }
                console.log(`📦 Admin sees ${importAssignments.length} import assignments (external + personal)`);
            } else {
                // Regular driver - only see their own import assignments
                const { data: driverImportAssigns, error: assignErr } = await supabase
                    .from('import_driver_assignments')
                    .select('*')
                    .or(`driver_name.ilike.%${driverName}%,driver_name.eq.${driverName}`);

                if (assignErr) console.error('Import assignment query error:', assignErr.message);
                importAssignments = driverImportAssigns || [];
            }

            if (importAssignments && importAssignments.length > 0) {
                console.log(`📦 Found ${importAssignments.length} import driver assignments`);

                for (const assign of importAssignments) {
                    const { data: imp } = await supabase
                        .from('import_tickets')
                        .select('*')
                        .eq('id', assign.import_id)
                        .single();

                    if (!imp) continue;

                    let statusCode = 'CHO_NHAN';
                    if (assign.status === 'delivering') statusCode = 'DANG_GIAO';
                    else if (assign.status === 'completed') statusCode = 'HOAN_THANH';

                    // Check for split
                    const { data: allImportAssigns } = await supabase
                        .from('import_driver_assignments')
                        .select('id, status, assigned_qty, actual_qty, driver_name, plate')
                        .eq('import_id', assign.import_id);

                    const isSplitOrder = allImportAssigns && allImportAssigns.length > 1;
                    const completedCount = allImportAssigns?.filter(a => a.status === 'completed').length || 0;
                    const totalCount = allImportAssigns?.length || 1;

                    myOrders.push({
                        id: imp.id,
                        order_id: imp.id,
                        soDon: imp.ticket_no,
                        khach: imp.supplier_name,
                        diaChi: imp.supplier_address,
                        taiXe: assign.driver_name,
                        bienSo: assign.plate,
                        status: imp.status,
                        products: imp.products,
                        assignment_id: assign.id,
                        assigned_qty: assign.assigned_qty,
                        actual_qty: assign.actual_qty || 0,
                        is_split_order: isSplitOrder,
                        split_progress: isSplitOrder ? `${completedCount}/${totalCount}` : null,
                        all_assignments: allImportAssigns || [],  // Include all assignments for frontend display
                        type: 'import',
                        statusCode,
                        // Date fields - extract directly from ISO string (no parsing)
                        ngay: (() => {
                            const raw = String(imp.expected_date || imp.created_at || '');
                            console.log(`📅 Import ${imp.id} expected_date raw:`, imp.expected_date, '| created_at:', imp.created_at, '| raw string:', raw);
                            // ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
                            const parts = raw.split('T')[0].split('-');
                            if (parts.length === 3) {
                                const result = `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
                                console.log(`📅 Import ${imp.id} formatted ngay:`, result);
                                return result;
                            }
                            return raw;
                        })(),
                        expected_date: imp.expected_date,
                        created_at: imp.created_at
                    });
                }
            }

            // Fallback: imports without assignments (legacy)
            const assignedImportIds = myOrders.filter(o => o.type === 'import').map(o => o.id);

            let query = supabase
                .from('import_tickets')
                .select('*')
                .neq('status', 'cancelled');

            if (!isAdmin) {
                query = query.or(`assigned_driver.ilike.%${driverName}%,assigned_driver.eq.${driverName}`);
            } else {
                query = query.not('assigned_driver', 'is', null);
            }

            const { data: importTickets } = await query;

            if (importTickets) {
                let filteredImports = importTickets.filter(imp => !assignedImportIds.includes(imp.id));

                if (isAdmin) {
                    filteredImports = filteredImports.filter(imp => {
                        const assignedUpper = (imp.assigned_driver || '').toUpperCase();
                        const isMyImport = assignedUpper.includes(myName) || myName.includes(assignedUpper);
                        const isExternalDriver = assignedUpper && !internalDrivers.includes(assignedUpper);
                        return isMyImport || isExternalDriver;
                    });
                }

                for (const imp of filteredImports) {
                    myOrders.push({
                        id: imp.id,
                        order_id: imp.id,
                        soDon: imp.ticket_no,
                        khach: imp.supplier_name,
                        diaChi: imp.supplier_address,
                        taiXe: imp.assigned_driver,
                        bienSo: imp.assigned_plate,
                        status: imp.status,
                        products: imp.products,
                        type: 'import',
                        is_split_order: false,
                        statusCode: imp.status === 'assigned' ? 'CHO_NHAN' :
                            imp.status === 'in_transit' ? 'DANG_GIAO' :
                                imp.status === 'completed' ? 'HOAN_THANH' : 'CHO_NHAN',
                        // Date fields - extract directly from ISO string (no parsing)
                        ngay: (() => {
                            const raw = String(imp.expected_date || imp.created_at || '');
                            const parts = raw.split('T')[0].split('-');
                            if (parts.length === 3) {
                                return `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
                            }
                            return raw;
                        })(),
                        expected_date: imp.expected_date,
                        created_at: imp.created_at
                    });
                }
            }
        } catch (importErr) {
            console.error('Import tickets fetch error:', importErr.message);
        }

        console.log(`📦 Total orders for ${driverName}: ${myOrders.length}`);
        res.json({ error: false, data: myOrders });

    } catch (e) {
        console.error('My orders error:', e.message);
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

        // Send Telegram notification to DRIVER group (async, don't block response)
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

            await sendTelegramMessage(msg, 'DRIVER');
            console.log(`📬 Telegram DRIVER notification sent for order ${id}`);
        } catch (tgErr) {
            console.error('Telegram notification error:', tgErr.message);
        }

        // Create in-app notification for driver
        try {
            const orderNo = fullOrder?.soDon || fullOrder?.sale_order_no || id;
            await createNotification(
                driverName,
                'order_assigned',
                '🚛 Đơn hàng mới',
                `Bạn được phân công đơn #${orderNo}`,
                id,
                orderNo
            );
        } catch (notifyErr) {
            console.error('In-app notification error:', notifyErr.message);
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

// PUT /api/orders/:id/start - Driver starts order (supports multi-driver)
router.put('/:id/start', async (req, res) => {
    try {
        const { id } = req.params;
        const { assignment_id } = req.body; // Optional: for multi-driver orders

        // If multi-driver order, update assignment status
        if (assignment_id) {
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

            const { error } = await supabase
                .from('order_driver_assignments')
                .update({ status: 'delivering' })
                .eq('id', assignment_id);

            if (error) {
                console.error('Assignment status update error:', error.message);
            } else {
                console.log(`✅ Assignment ${assignment_id} status -> delivering`);
            }
        }

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
// Supports multi-driver partial completion
router.post('/:id/complete', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            // Admin complete fields
            products, delivery_note, admin_completed, local_items,
            // Driver complete fields
            type, warehouse, partner, driver_name, plate, cart, note, sender, images,
            // Multi-driver fields
            assignment_id
        } = req.body;

        console.log(`\n🏁 COMPLETE ORDER - ID: ${id}`);
        console.log(`📦 Request body keys:`, Object.keys(req.body));
        console.log(`🔑 assignment_id: ${assignment_id || 'NONE'}`);
        console.log(`🛒 cart length: ${cart?.length || 0}, products length: ${products?.length || 0}`);
        console.log(`👤 driver_name: ${driver_name}, admin_completed: ${admin_completed}`);

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        // ============================================================
        // MULTI-DRIVER COMPLETION: Check if this is a split order
        // ============================================================
        let isMultiDriverOrder = false;
        let allDriversCompleted = true;
        let firstDriverName = driver_name;
        let totalActualQty = 0;
        let allAssignments = [];
        let firstDriverPlate = null; // Plate of first driver who completed (for MISA sync)

        if (assignment_id) {
            console.log(`🔀 Multi-driver completion - Assignment: ${assignment_id}`);

            // Calculate total qty from cart
            const myActualQty = cart?.reduce((sum, item) => {
                if (item.isShell) return sum;
                return sum + Number(item.weight_kg || item.qty || 0);
            }, 0) || 0;
            console.log(`📊 My actual qty from cart: ${myActualQty}kg`);

            // STEP 1: First get the assignment to find the correct order_id BEFORE updating
            // This ensures we have the source-of-truth order_id regardless of URL format
            const { data: assignmentBeforeUpdate, error: lookupErr } = await supabase
                .from('order_driver_assignments')
                .select('order_id, driver_name')
                .eq('id', assignment_id)
                .single();

            if (lookupErr || !assignmentBeforeUpdate) {
                console.error(`❌ Assignment lookup failed: ${lookupErr?.message || 'Not found'}`);
                return res.json(createResponse(true, 'Không tìm thấy assignment!'));
            }

            // Use order_id from database (source of truth) - NOT from URL params
            const actualOrderId = assignmentBeforeUpdate.order_id;
            console.log(`📍 Source-of-truth order_id: "${actualOrderId}" (URL param was: "${id}")`);

            // STEP 2: Update this assignment as completed
            // Save actual_products = cart with REAL delivered quantities
            const actualProducts = (cart || []).filter(c => !c.isShell).map(item => ({
                code: item.product?.code || item.code || '',
                name: item.product?.name || item.name || item.product || '',
                qty: Number(item.weight_kg || item.qty || 0),
                unit: item.unit || 'Kg'
            }));
            console.log(`🔧 Updating assignment id: ${assignment_id} to status: completed`);
            console.log(`📊 Saving actual_products:`, actualProducts);

            const { data: updateResult, error: updateErr } = await supabase
                .from('order_driver_assignments')
                .update({
                    status: 'completed',
                    actual_qty: myActualQty,
                    actual_products: actualProducts,  // NEW: store actual delivered products
                    local_items: local_items || [],
                    delivery_note: note || delivery_note || '',
                    proof_images: images || [],
                    completed_at: new Date().toISOString() // Track completion time for MISA priority
                })
                .eq('id', assignment_id)
                .select();

            if (updateErr) {
                console.error('❌ Assignment update error:', updateErr.message);
                return res.json(createResponse(true, 'Lỗi cập nhật assignment: ' + updateErr.message));
            } else if (!updateResult || updateResult.length === 0) {
                console.error(`⚠️ Assignment update: NO ROWS AFFECTED! assignment_id=${assignment_id}`);
                return res.json(createResponse(true, 'Assignment không được cập nhật!'));
            }
            console.log(`✅ Assignment ${assignment_id} updated successfully: status=${updateResult[0].status}`);

            // STEP 3: Query ALL assignments for this order using the correct order_id
            const { data: assignments, error: assignQueryErr } = await supabase
                .from('order_driver_assignments')
                .select('*')
                .eq('order_id', actualOrderId)
                .order('created_at', { ascending: true });

            if (assignQueryErr) {
                console.error('❌ Assignment query error:', assignQueryErr.message);
            }
            console.log(`📋 Found ${assignments?.length || 0} assignments for order_id: "${actualOrderId}"`);

            // STEP 4: Force-patch the current assignment's status in our local array
            // This handles any Supabase replication delay
            const patchedAssignments = (assignments || []).map(a => {
                if (a.id === assignment_id) {
                    return { ...a, status: 'completed', actual_qty: myActualQty };
                }
                return a;
            });

            console.log(`🔍 Patched assignment statuses:`, patchedAssignments.map(a => ({ id: a.id.slice(-8), status: a.status, driver: a.driver_name })));

            if (patchedAssignments && patchedAssignments.length > 1) {
                isMultiDriverOrder = true;
                allAssignments = patchedAssignments;

                // COMBINE all driver names and plates with " và " for MISA
                const allDriverNames = patchedAssignments
                    .map(a => a.driver_name)
                    .filter(Boolean)
                    .join(' và ');
                const allPlates = patchedAssignments
                    .map(a => a.plate)
                    .filter(Boolean)
                    .join(' và ');

                firstDriverName = allDriverNames || patchedAssignments[0]?.driver_name;
                firstDriverPlate = allPlates || patchedAssignments[0]?.plate;
                console.log(`🔍 MISA Multi-driver: taiXe="${firstDriverName}", bienSo="${firstDriverPlate}"`);

                // Check if ALL drivers completed (using patched data)
                allDriversCompleted = patchedAssignments.every(a => a.status === 'completed');
                totalActualQty = patchedAssignments.reduce((sum, a) => sum + Number(a.actual_qty || 0), 0);

                const completedCount = patchedAssignments.filter(a => a.status === 'completed').length;
                console.log(`📊 Multi-driver status: ${completedCount}/${patchedAssignments.length} completed, Total: ${totalActualQty}kg`);

                if (!allDriversCompleted) {
                    // Partial completion - return early, don't sync MISA yet
                    // Use actualOrderId for updateOrder to handle ID format differences
                    try {
                        await db.updateOrder(actualOrderId, {
                            delivery_status: `${completedCount}/${patchedAssignments.length} hoàn thành`,
                            partial_completion: true
                        });
                    } catch (orderUpdateErr) {
                        // Fallback to URL param id if actualOrderId doesn't work
                        console.log(`⚠️ updateOrder with actualOrderId failed, trying URL param id`);
                        await db.updateOrder(id, {
                            delivery_status: `${completedCount}/${patchedAssignments.length} hoàn thành`,
                            partial_completion: true
                        });
                    }

                    return res.json(createResponse(false,
                        `Bạn đã hoàn thành phần của mình! (${completedCount}/${patchedAssignments.length} tài xế)`,
                        {
                            partial: true,
                            progress: `${completedCount}/${patchedAssignments.length}`,
                            yourQty: myActualQty,
                            // Debug info
                            _debug: {
                                actualOrderId,
                                paramId: id,
                                assignmentId: assignment_id,
                                assignmentStatuses: patchedAssignments.map(a => ({ id: a.id, status: a.status, driver: a.driver_name }))
                            }
                        }
                    ));
                }

                // All completed - will proceed to sync MISA with combined data
                console.log(`🎉 All drivers completed! Syncing to MISA with ${totalActualQty}kg`);
            }
        }

        // ============================================================
        // DRIVER COMPLETE FLOW: Has cart with actual delivered products
        // ============================================================
        if (cart && Array.isArray(cart) && cart.length > 0) {
            console.log(`🚚 Driver Complete Flow - Order: ${id}, Cart items: ${cart.length}`);

            const ts = getTimestamp();
            const prefix = type === 'NHAP' ? 'N' : 'X';
            const ticketId = prefix + ts.short;

            // Prepare actual delivered products for DB update
            let updatedProducts = cart.filter(c => !c.isShell).map(item => ({
                code: item.product?.code || item.product?.id || item.code || '',
                name: item.product?.name || item.name || item.product || '',
                qty: Number(item.weight_kg || item.qty || 0),
                unit: item.unit || 'Kg'
            }));

            // For multi-driver orders: combine products from ALL assignments
            if (isMultiDriverOrder && allDriversCompleted && allAssignments.length > 0) {
                console.log(`📦 Combining cart from ${allAssignments.length} driver assignments...`);

                const combinedProducts = {};

                // Collect ACTUAL delivered products from all assignments
                // Priority: actual_products (real delivered) > assigned_products (original)
                allAssignments.forEach(assign => {
                    // Use actual_products if available (real delivered quantities)
                    // Fallback to assigned_products if actual not saved yet
                    const products = assign.actual_products || assign.assigned_products || [];
                    console.log(`📋 Assignment ${assign.id?.slice(-8)}: using ${assign.actual_products ? 'actual_products' : 'assigned_products'}`);

                    if (Array.isArray(products)) {
                        products.forEach(p => {
                            const key = p.code || p.name;
                            const qty = Math.round(Number(p.qty || 0));

                            if (!combinedProducts[key]) {
                                combinedProducts[key] = {
                                    code: p.code || '',
                                    name: p.name || '',
                                    qty: 0,
                                    unit: p.unit || 'Kg'
                                };
                            }
                            combinedProducts[key].qty += qty;
                        });
                    }
                });

                // Convert to array with integer quantities
                updatedProducts = Object.values(combinedProducts).map(p => ({
                    ...p,
                    qty: Math.round(p.qty)  // Ensure integer
                }));
                console.log(`✅ Combined ${updatedProducts.length} products (from actual_products):`, updatedProducts.map(p => `${p.name}: ${p.qty}${p.unit}`));
            }

            // Update order status AND products + Set initial sync status
            await db.updateOrder(id, {
                status: CONFIG.STATUS.DELIVERED,
                delivery_status: 'Đã giao hàng',
                taiXe: isMultiDriverOrder ? firstDriverName : driver_name,
                bienSo: isMultiDriverOrder && firstDriverPlate ? firstDriverPlate : plate,
                cart: updatedProducts,
                local_items: local_items || [],
                delivery_note: note || delivery_note || '',
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
                    note: note || delivery_note || `Tạo bởi: ${sender || driver_name}`,
                    local_items: local_items || [],
                    images: images || []
                });
            } catch (err) {
                console.error('Supabase Export Ticket Error:', err.message);
            }

            // 2. Sync to MISA CRM
            try {
                const orderInfo = await db.getOrder(id);

                // For multi-driver: combine actual_qty from all assignments
                let misaCart;
                if (isMultiDriverOrder && allAssignments && allAssignments.length > 0) {
                    // Use original order product info but with combined actual quantities
                    const originalProducts = orderInfo?.products || orderInfo?.cart || [];
                    console.log(`📦 Multi-driver sync: Using combined qty ${totalActualQty}kg from ${allAssignments.length} drivers`);

                    // Map original products but use total actual qty from all drivers
                    // If order has single product, use totalActualQty
                    // If multiple products, use the last driver's cart as base (best we can do)
                    if (cart.length === 1 || originalProducts.length === 1) {
                        // Single product - use totalActualQty
                        misaCart = [{
                            product_code: updatedProducts[0]?.code || cart[0]?.product?.code || cart[0]?.code || originalProducts[0]?.code || '',
                            warehouse,
                            unit: updatedProducts[0]?.unit || cart[0]?.unit || 'kg',
                            qty: Math.round(updatedProducts[0]?.qty || totalActualQty)
                        }];
                    } else {
                        // Multiple products - use COMBINED updatedProducts from all drivers
                        console.log(`� Multi-driver MISA sync: Using combined products:`, updatedProducts);

                        misaCart = updatedProducts.map(item => ({
                            product_code: item.code || '',
                            warehouse,
                            unit: item.unit || 'kg',
                            qty: Math.round(item.qty || 0)
                        }));
                    }
                } else {
                    // Single driver - use cart as-is
                    misaCart = cart.filter(item => !item.isShell).map(item => ({
                        product_code: item.product?.code || item.product?.id || item.code || item.product || '',
                        warehouse,
                        unit: item.unit || 'kg',
                        qty: Number(item.weight_kg || item.qty || 0)
                    }));
                }

                // For multi-driver: use first COMPLETED driver's name and plate (from DB) for MISA
                const misaDriverName = isMultiDriverOrder ? firstDriverName : driver_name;
                const misaPlate = isMultiDriverOrder && firstDriverPlate ? firstDriverPlate : plate;
                console.log(`📤 MISA Sync - Driver: ${misaDriverName}, Plate: ${misaPlate}, isMultiDriver: ${isMultiDriverOrder}, TotalQty: ${isMultiDriverOrder ? totalActualQty : 'N/A'}`);

                const syncResult = await updateMisaOrder(orderInfo.sale_order_no || id, {
                    misa_id: orderInfo.misa_id,
                    delivery_status: 'Đã giao hàng',
                    status: 'Đã thực hiện',
                    driver: misaDriverName,
                    plate: misaPlate,
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
                // Create notification for ADMIN about completed order
                try {
                    const orderNo = orderInfo?.soDon || orderInfo?.sale_order_no || id;
                    await createNotification(
                        'ADMIN',
                        'order_completed',
                        '✅ Đơn hoàn thành',
                        `Đơn #${orderNo} đã được giao bởi ${driver_name}`,
                        id,
                        orderNo
                    );
                } catch (notifyErr) {
                    console.error('Admin notification error:', notifyErr.message);
                }

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
            local_items: local_items || [],
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
                .select('id, images')
                .eq('order_id', id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (existingTicket) {
                // Ticket exists - update images if provided
                if (images && images.length > 0) {
                    const existingImages = existingTicket.images || [];
                    const newImages = [...existingImages, ...images].slice(0, 10); // Max 10 images

                    await supabase
                        .from('export_tickets')
                        .update({ images: newImages })
                        .eq('id', existingTicket.id);

                    console.log(`📸 Updated export ticket ${existingTicket.id} with ${images.length} new images`);
                }
            } else {
                // No ticket exists - create new one
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

        console.log(`\n📦 ASSIGN-MULTI for order ${id}`);
        console.log(`📋 Received ${assignments?.length || 0} assignments:`, JSON.stringify(assignments, null, 2));

        if (!assignments || !assignments.length) {
            return res.json(createResponse(true, 'Chưa có phân công nào!'));
        }

        // Get Supabase client
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        // Delete existing assignments for this order
        const { error: delErr } = await supabase.from('order_driver_assignments').delete().eq('order_id', id);
        if (delErr) console.error('Delete existing assignments error:', delErr.message);

        // Insert new assignments
        const insertData = assignments.map(a => ({
            order_id: id,
            driver_name: a.driver_name,
            driver_type: a.type || 'internal',
            plate: a.plate || '',
            assigned_qty: Number(a.qty) || 0,
            assigned_products: a.products || null, // NEW: custom products per driver
            status: 'pending',
            note: a.note || ''
        }));

        console.log(`🔄 Insert data (${insertData.length} rows):`, JSON.stringify(insertData, null, 2));

        const { data: insertedRows, error } = await supabase.from('order_driver_assignments').insert(insertData).select();
        console.log(`✅ Inserted ${insertedRows?.length || 0} rows, error: ${error?.message || 'none'}`);

        if (error) {
            console.error('❌ Insert error:', error.message);
            return res.json(createResponse(true, 'Lỗi lưu phân công: ' + error.message));
        }

        console.log(`✅ Successfully inserted ${insertedRows?.length || 'N/A'} assignments`);

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


// GET /api/orders/:id/proof-images - Get proof images from export ticket OR order_driver_assignments
router.get('/:id/proof-images', async (req, res) => {
    try {
        const { id } = req.params;
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        console.log(`📸 Loading proof images for order: ${id}`);

        let allImages = [];
        let ticketInfo = null;

        // First, try to get the actual order to find correct UUID
        let orderUuid = id;
        let orderSoDon = id;
        const orderInfo = await db.getOrder(id);
        if (orderInfo) {
            orderUuid = orderInfo.id || id;
            orderSoDon = orderInfo.soDon || orderInfo.sale_order_no || id;
            console.log(`   Resolved order: UUID=${orderUuid}, soDon=${orderSoDon}`);
        }

        // STEP 1: Check order_driver_assignments (search by UUID)
        try {
            let { data: assignments } = await supabase
                .from('order_driver_assignments')
                .select('id, driver_name, proof_images, completed_at')
                .eq('order_id', orderUuid)
                .order('created_at', { ascending: false });

            // If not found by UUID, also try soDon in case order_id was stored as soDon
            if (!assignments || assignments.length === 0) {
                const result = await supabase
                    .from('order_driver_assignments')
                    .select('id, driver_name, proof_images, completed_at')
                    .eq('order_id', orderSoDon)
                    .order('created_at', { ascending: false });

                if (result.data && result.data.length > 0) {
                    assignments = result.data;
                }
            }

            if (assignments && assignments.length > 0) {
                for (const a of assignments) {
                    if (a.proof_images && Array.isArray(a.proof_images) && a.proof_images.length > 0) {
                        allImages = [...allImages, ...a.proof_images];
                        console.log(`   Found ${a.proof_images.length} images from assignment (driver: ${a.driver_name})`);
                    }
                }
            }
        } catch (assignErr) {
            console.warn('Assignment image lookup error:', assignErr.message);
        }

        // STEP 2: Also check export_tickets
        let { data, error } = await supabase
            .from('export_tickets')
            .select('ticket_no, images, created_at, driver_name')
            .eq('order_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) {
            // Try by order_no
            const result = await supabase
                .from('export_tickets')
                .select('ticket_no, images, created_at, driver_name')
                .eq('order_no', id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (!result.error && result.data) {
                data = result.data;
            }
        }

        // If still not found, try soDon
        if (!data) {
            const orderInfo = await db.getOrder(id);
            if (orderInfo?.soDon) {
                const result = await supabase
                    .from('export_tickets')
                    .select('ticket_no, images, created_at, driver_name')
                    .eq('order_no', orderInfo.soDon)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (!result.error) {
                    data = result.data;
                }
            }
        }

        if (data) {
            ticketInfo = {
                ticket_no: data.ticket_no,
                created_at: data.created_at,
                driver_name: data.driver_name
            };

            if (data.images && Array.isArray(data.images)) {
                // Merge with assignment images, avoid duplicates
                for (const img of data.images) {
                    if (!allImages.includes(img)) {
                        allImages.push(img);
                    }
                }
                console.log(`   Found ${data.images.length} images from export_ticket`);
            }
        }

        console.log(`📸 Total: ${allImages.length} images found`);

        res.json({
            error: false,
            images: allImages,
            ticket_no: ticketInfo?.ticket_no || null,
            created_at: ticketInfo?.created_at || null,
            driver_name: ticketInfo?.driver_name || null
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

        console.log(`📸 Add proof images for order: ${id}, images count: ${images?.length || 0}`);

        if (!images || !Array.isArray(images) || images.length === 0) {
            return res.json(createResponse(true, 'Vui lòng chọn ít nhất 1 ảnh!'));
        }

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        // Also save to order_driver_assignments if any exist for this order
        try {
            const { data: assignments } = await supabase
                .from('order_driver_assignments')
                .select('id, proof_images')
                .eq('order_id', id)
                .order('created_at', { ascending: false })
                .limit(1);

            if (assignments && assignments.length > 0) {
                const assignment = assignments[0];
                const existingImages = assignment.proof_images || [];
                const updatedImages = [...existingImages, ...images].slice(0, 10);

                await supabase
                    .from('order_driver_assignments')
                    .update({ proof_images: updatedImages })
                    .eq('id', assignment.id);

                console.log(`✅ Updated order_driver_assignments with ${updatedImages.length} images`);
            }
        } catch (assignErr) {
            console.warn('Assignment image update skipped:', assignErr.message);
        }

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
                note: 'Ảnh bổ sung'
            });

            if (insertError) {
                console.error('Export ticket insert error:', insertError.message);
                return res.json(createResponse(true, 'Lỗi tạo phiếu: ' + insertError.message));
            }

            console.log(`✅ Created export_ticket with ${images.length} images`);
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

        console.log(`✅ Updated export_ticket with ${updatedImages.length} images`);
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



