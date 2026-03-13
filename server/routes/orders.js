// ===============================================
// ORDER ROUTES
// ===============================================

import { Router } from 'express';
import { CONFIG, createResponse, formatDate, getTimestamp, standardizeData } from '../config.js';
import db from '../db/index.js';
import { updateMisaOrder } from '../services/misa.js';
import { createNotification } from './notifications.js';

// Helper: Create Telegram mention tag
// Priority: 1) tg://user?id= (works without username), 2) @username, 3) skip
function getTelegramTag(telegramUsername, telegramUserId, displayName) {
    // Method 1: Use Telegram User ID for text mention (works even without username)
    if (telegramUserId) {
        const name = displayName || 'user';
        return ` (<a href="tg://user?id=${telegramUserId}">${name}</a>)`;
    }
    // Method 2: Use @username if valid (5-32 chars, ASCII alphanumeric + underscore)
    if (telegramUsername) {
        const cleaned = telegramUsername.trim().replace(/^@/, '');
        if (/^[a-zA-Z0-9_]{5,32}$/.test(cleaned)) {
            return ` (@${cleaned})`;
        }
    }
    return ''; // No valid mention method available
}

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

        const assistants = users
            .filter(u => u.status === 'ACTIVE' && String(u.role).toUpperCase() === 'ASSISTANT')
            .map(u => ({ name: u.fullName }));

        console.log('DEBUG: Sending response. Pending:', pending.length, 'Assigned:', assigned.length, 'Completed:', completed.length, 'Cancelled:', cancelled.length);

        res.json({
            error: false,
            pending,
            assigned,
            completed,
            cancelled,
            cancelledCount: cancelled.length,
            drivers,
            assistants
        });

    } catch (e) {
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// PUT /api/orders/:id/pin - Toggle pin status for order
router.put('/:id/pin', async (req, res) => {
    try {
        const { id } = req.params;
        const { is_pinned } = req.body;

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        const { error } = await supabase
            .from('orders')
            .update({ is_pinned: is_pinned === true })
            .eq('id', id);

        if (error) {
            return res.json(createResponse(true, 'Lỗi ghim đơn: ' + error.message));
        }

        console.log(`📌 Order ${id} pinned: ${is_pinned}`);
        res.json(createResponse(false, is_pinned ? 'Đã ghim đơn hàng!' : 'Đã bỏ ghim đơn hàng!'));
    } catch (e) {
        res.json(createResponse(true, e.message));
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
        // Allow SALES to see external drivers in "My Orders" tab just like ADMIN
        const isAdmin = ['ADMIN', 'TESTER', 'SALES'].includes(normalizedRole);

        console.log(`🔍 My Orders Search: driverName="${driverName}" role="${role}", isAdmin=${isAdmin}`);

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
                    .or(`driver_name.ilike.%${driverName}%,assistant_name.ilike.%${driverName}%`);

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
                // Regular driver or assistant - see their own assignments
                const { data: driverAssignments, error: assignErr } = await supabase
                    .from('order_driver_assignments')
                    .select('*')
                    .or(`driver_name.ilike.%${driverName}%,assistant_name.ilike.%${driverName}%`);

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

// GET /api/orders/pending-confirm?type=export|import
// MUST be defined BEFORE /:id to avoid Express matching 'pending-confirm' as :id
router.get('/pending-confirm', async (req, res) => {
    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
        const type = req.query.type || 'export';

        if (type === 'import') {
            const { data: tickets, error } = await supabase
                .from('import_tickets')
                .select('*')
                .eq('status', 'completed')
                .order('created_at', { ascending: false });

            if (error) return res.json(createResponse(true, error.message));

            const result = [];
            for (const t of (tickets || [])) {
                // Skip already admin-confirmed imports
                if (t.admin_approved) continue;

                if (t.order_id) {
                    const { data: order } = await supabase.from('orders')
                        .select('sale_confirmed, admin_approved, account_name, shipping_address, sale_order_date')
                        .eq('id', t.order_id).single();
                    if (!order?.admin_approved) {
                        result.push({ ...t, parent_order: order, sale_confirmed: order?.sale_confirmed || false });
                    }
                } else {
                    result.push(t);
                }
            }
            return res.json(createResponse(false, 'OK', result));
        }

        // Export orders: MISA orders completed but not yet admin_approved
        // Matches both: PENDING_APPROVAL (new flow) and legacy completed orders
        const { data: orders, error } = await supabase
            .from('orders')
            .select('*')
            .in('status', ['Đã thực hiện', 'Hoàn thành'])
            .or('admin_approved.is.null,admin_approved.eq.false')
            .not('sale_order_no', 'is', null)
            .neq('sale_order_no', '')
            .order('sale_order_date', { ascending: false });

        if (error) return res.json(createResponse(true, error.message));

        const mapped = (orders || []).map(o => {
            let products = [];
            try {
                if (typeof o.sale_order_product_mappings === 'string') products = JSON.parse(o.sale_order_product_mappings);
                else if (Array.isArray(o.sale_order_product_mappings)) products = o.sale_order_product_mappings;
            } catch (e) { }
            return { ...o, products };
        });

        res.json(createResponse(false, 'OK', mapped));
    } catch (e) {
        console.error('pending-confirm error:', e.message);
        res.json(createResponse(true, e.message));
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
        const { customer, address, note, notes, date, products, productUpdates, local_items } = req.body;

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
        if (date) updateData.ngay = date; // Update order date

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
                const unitPrice = Number(p.price || p.saleprice || p.unit_price || 0);
                const newQty = update ? Number(update.qty) : (Number(p.qty) || Number(p.quantity) || 0);
                return {
                    code: p.code || p.product_code || '',
                    name: p.name || p.product || '',
                    qty: newQty,
                    unit: p.unit || 'Kg',
                    price: unitPrice,
                    saleprice: unitPrice,
                    amount: newQty * unitPrice
                };
            });
            updateData.cart = updatedCart;
            // Recalculate total amount from cart
            updateData.sale_order_amount = updatedCart.reduce((sum, p) => sum + (p.amount || 0), 0);
            console.log(`📝 Updated Cart:`, JSON.stringify(updatedCart, null, 2));
            console.log(`💰 Recalculated total: ${updateData.sale_order_amount}`);
        }
        // Handle full products array (if provided directly)
        else if (products && Array.isArray(products)) {
            updateData.cart = products.map(p => {
                const unitPrice = Number(p.price || p.saleprice || p.unit_price || 0);
                const qty = Number(p.qty) || 0;
                return {
                    code: p.code || '',
                    name: p.name || p.product || '',
                    qty: qty,
                    unit: p.unit || 'Kg',
                    price: unitPrice,
                    saleprice: unitPrice,
                    amount: qty * unitPrice
                };
            });
            updateData.sale_order_amount = updateData.cart.reduce((sum, p) => sum + (p.amount || 0), 0);
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

        // Send Telegram notification about the edit
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const updatedOrder = fullOrder || await db.getOrder(id);
            const orderNo = updatedOrder?.sale_order_no || updatedOrder?.soDon || id;
            const customerName = customer || updatedOrder?.account_name || updatedOrder?.khach || '';
            const orderAddress = address || updatedOrder?.shipping_address || updatedOrder?.diaChi || '';

            let msg = `🔴 <b>‼️ ĐƠN HÀNG ĐÃ CHỈNH SỬA ‼️</b>\n`;
            msg += `#${orderNo}\n`;
            msg += `👤 KH: <b>${customerName}</b>\n`;
            if (orderAddress) msg += `📍 ${orderAddress}\n`;

            // Compare old vs new products and show changes in blockquote
            const oldProducts = existingOrder?.products || existingOrder?.cart || [];
            const newProducts = updateData.cart || updatedOrder?.products || [];

            if (newProducts.length > 0) {
                // Check if anything changed
                const changes = [];
                const unchanged = [];

                newProducts.forEach((p, i) => {
                    const newName = p.name || p.product || p.code || '';
                    const newQty = Number(p.qty || p.quantity || 0);
                    const newUnit = p.unit || 'Kg';
                    const oldP = oldProducts[i];
                    const oldName = oldP ? (oldP.name || oldP.product || oldP.code || '') : '';
                    const oldQty = oldP ? Number(oldP.qty || oldP.quantity || 0) : 0;

                    if (oldP && (oldName !== newName || oldQty !== newQty)) {
                        changes.push({ oldName, oldQty, newName, newQty, newUnit, oldUnit: oldP.unit || 'Kg' });
                    } else {
                        unchanged.push({ name: newName, qty: newQty, unit: newUnit });
                    }
                });

                if (changes.length > 0) {
                    msg += `\n📦 <b>Thay đổi sản phẩm:</b>\n`;
                    changes.forEach(c => {
                        msg += `<blockquote>❌ ${c.oldName}: ${c.oldQty.toLocaleString('vi-VN')} ${c.oldUnit}\n✅ ${c.newName}: ${c.newQty.toLocaleString('vi-VN')} ${c.newUnit}</blockquote>`;
                    });
                }

                if (unchanged.length > 0) {
                    unchanged.forEach(p => {
                        msg += `- ${p.name}: ${p.qty.toLocaleString('vi-VN')} ${p.unit}\n`;
                    });
                }
            }

            if (note || notes) msg += `\n📝 Ghi chú: ${note || notes}`;

            // Reply to original order message if available
            const replyId = updatedOrder?.telegram_message_id || null;
            await sendTelegramMessage(msg, 'NOTIFY', replyId);
        } catch (tgErr) {
            console.error('Telegram Edit Notification Error:', tgErr.message);
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
        const { driverName, plate, note, assistantName, deliveryTime } = req.body;

        const order = await db.updateOrder(id, {
            taiXe: driverName,
            bienSo: plate,
            assistant_name: assistantName,
            delivery_time: deliveryTime,
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
            console.log(`📨 [TELEGRAM DEBUG] Starting Telegram notification for order ${id}, driver: ${driverName}`);
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const orderInfo = await db.getOrder(id);
            console.log(`📨 [TELEGRAM DEBUG] Order info retrieved:`, { soDon: orderInfo?.soDon, khach: orderInfo?.khach });

            let msg = `🚛 <b>PHÂN CÔNG TÀI XẾ</b>\n`;
            msg += `#${orderInfo?.soDon || orderInfo?.sale_order_no || id}\n`;
            msg += `👤 KH: <b>${orderInfo?.khach || orderInfo?.account_name || ''}</b>\n`;
            if (orderInfo?.sale_order_date) {
                const fmtDate = new Date(orderInfo.sale_order_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                msg += `📅 Ngày: ${fmtDate}\n`;
            }
            msg += `📍 ${orderInfo?.diaChi || orderInfo?.shipping_address || ''}\n`;

            // Merged order info
            if (orderInfo?.merged_order_no) {
                msg += `🔗 Ghép chuyến: ${orderInfo.merged_order_no}\n`;
            }

            msg += `──────────────\n`;

            // Lookup telegram user IDs for bottom mentions
            const users = await db.getUsers();
            const driverObj = users.find(u => u.fullName === driverName || u.username === driverName);

            const mentionTags = [];
            const driverMention = getTelegramTag(driverObj?.telegramUsername, driverObj?.telegramUserId, driverName);
            if (driverMention) mentionTags.push(driverMention.trim());

            msg += `🚗 Tài xế: <b>${driverName}</b>\n`;
            if (assistantName) {
                const assistantObj = users.find(u => u.fullName === assistantName || u.username === assistantName);
                const assistantMention = getTelegramTag(assistantObj?.telegramUsername, assistantObj?.telegramUserId, assistantName);
                if (assistantMention) mentionTags.push(assistantMention.trim());
                msg += `🧑‍🔧 Phụ xe: ${assistantName}\n`;
            }
            msg += `🔢 Biển số: ${plate || 'Chưa có'}\n`;
            if (deliveryTime) msg += `⏰ Tgian giao: ${deliveryTime}\n`;
            if (note) msg += `📝 Ghi chú: ${note}\n`;

            // Add mention tags at the bottom
            if (mentionTags.length > 0) {
                msg += `\n${mentionTags.join(' ')}`;
            }

            console.log(`📨 [TELEGRAM DEBUG] Calling sendTelegramMessage to DRIVER group...`);
            await sendTelegramMessage(msg, 'DRIVER');
            console.log(`📬 Telegram DRIVER notification sent for order ${id}`);
        } catch (tgErr) {
            console.error('❌ Telegram notification error:', tgErr.message, tgErr.stack);
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

                // MODIFIED: If any driver (or assistant) completes their assignment, mark the entire order as completed
                allDriversCompleted = patchedAssignments.some(a => a.status === 'completed');
                totalActualQty = patchedAssignments.reduce((sum, a) => sum + Number(a.actual_qty || 0), 0);

                const completedCount = patchedAssignments.filter(a => a.status === 'completed').length;
                console.log(`📊 Multi-driver status: ${completedCount}/${patchedAssignments.length} completed, Total: ${totalActualQty}kg`);

                // We skip the early return for partial completion here to allow the order to fully close on the first completion.
                // It treats the entire order as delivered.

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
            // Lookup original products to preserve price/total from MISA sync
            const originalOrderForPrice = await db.getOrder(id);
            const originalPriceMap = {};
            (originalOrderForPrice?.products || []).forEach(p => {
                originalPriceMap[p.code] = { price: Number(p.price || 0), total: Number(p.total || 0) };
            });

            let updatedProducts = cart.filter(c => !c.isShell).map(item => {
                const code = item.product?.code || item.product?.id || item.code || '';
                const qty = Number(item.weight_kg || item.qty || 0);
                const origPrice = originalPriceMap[code]?.price || 0;
                return {
                    code,
                    name: item.product?.name || item.name || item.product || '',
                    qty,
                    unit: item.unit || 'Kg',
                    price: origPrice,
                    total: origPrice > 0 ? qty * origPrice : (originalPriceMap[code]?.total || 0)
                };
            });

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
                                    unit: p.unit || 'Kg',
                                    price: Number(p.price || originalPriceMap[p.code]?.price || 0),
                                    total: 0
                                };
                            }
                            combinedProducts[key].qty += qty;
                            combinedProducts[key].total += Number(p.total || 0) || (qty * combinedProducts[key].price);
                        });
                    }
                });

                // Convert to array with integer quantities
                updatedProducts = Object.values(combinedProducts).map(p => ({
                    ...p,
                    qty: Math.round(p.qty),  // Ensure integer
                    total: p.price > 0 ? Math.round(p.qty) * p.price : p.total
                }));
                console.log(`✅ Combined ${updatedProducts.length} products (from actual_products):`, updatedProducts.map(p => `${p.name}: ${p.qty}${p.unit}`));
            }

            // RESOLVE REAL DRIVER: Query order_driver_assignments for dispatched driver
            let resolvedDriverName = driver_name;
            let resolvedPlate = plate;
            if (!isMultiDriverOrder) {
                try {
                    const { data: dispatchAssigns } = await supabase
                        .from('order_driver_assignments')
                        .select('driver_name, plate, assistant_name')
                        .eq('order_id', id)
                        .order('created_at', { ascending: false })
                        .limit(1);

                    if (dispatchAssigns && dispatchAssigns.length > 0) {
                        resolvedDriverName = dispatchAssigns[0].driver_name || driver_name;
                        resolvedPlate = dispatchAssigns[0].plate || plate;
                        console.log(`✅ Resolved dispatched driver: ${resolvedDriverName} (plate: ${resolvedPlate})`);
                    } else {
                        console.log(`⚠️ No assignments found for order ${id}, using request body driver: ${driver_name}`);
                    }
                } catch (assignErr) {
                    console.warn('Assignment lookup for driver name failed:', assignErr.message);
                }
            }

            // Update order status AND products + Set initial sync status
            await db.updateOrder(id, {
                status: CONFIG.STATUS.DELIVERED,
                delivery_status: 'Đã giao hàng',
                taiXe: isMultiDriverOrder ? firstDriverName : resolvedDriverName,
                bienSo: isMultiDriverOrder && firstDriverPlate ? firstDriverPlate : resolvedPlate,
                cart: updatedProducts,
                local_items: local_items || [],
                delivery_note: note || delivery_note || ''
            });

            // Create warehouse tickets
            for (const item of cart) {
                if (item.isShell) continue;

                const data = {
                    id: ticketId,
                    date: ts.date,
                    warehouse,
                    partner,
                    driver: isMultiDriverOrder ? firstDriverName : (resolvedDriverName || driver_name),
                    plate: isMultiDriverOrder && firstDriverPlate ? firstDriverPlate : (resolvedPlate || plate),
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
                    driver_name: isMultiDriverOrder ? firstDriverName : (resolvedDriverName || driver_name),
                    plate: isMultiDriverOrder && firstDriverPlate ? firstDriverPlate : (resolvedPlate || plate),
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

            // MISA sync is now handled via 2-step confirmation (Sales confirm → Admin approve)
            // Mark order as pending approval instead of direct MISA sync
            let orderInfo;
            try {
                orderInfo = await db.getOrder(id);
                await db.updateOrder(id, {
                    crm_sync_status: 'PENDING_APPROVAL',
                    sync_error: null
                });
                crmSyncStatus = 'PENDING_APPROVAL';
                console.log(`⏳ Order ${id} marked PENDING_APPROVAL (MISA sync deferred to Admin approve)`);
            } catch (syncErr) {
                crmSyncStatus = 'PENDING_APPROVAL';
                console.error('Error marking pending approval:', syncErr.message);
            }

            // Reload order info if not loaded yet (e.g. MISA sync failed on getOrder)
            if (!orderInfo) {
                try { orderInfo = await db.getOrder(id); } catch (e) { orderInfo = {}; }
            }

            // Create notification for ADMIN about completed order
            try {
                const orderNo = orderInfo?.soDon || orderInfo?.sale_order_no || id;
                await createNotification(
                    'ADMIN',
                    'order_completed',
                    '✅ Đơn hoàn thành',
                    `Đơn #${orderNo} đã được giao bởi ${firstDriverName || resolvedDriverName || orderInfo?.taiXe || driver_name}`,
                    id,
                    orderNo
                );
            } catch (notifyErr) {
                console.error('Admin notification error:', notifyErr.message);
            }

            // Send Telegram notification for order completion (ALWAYS runs)
            try {
                const { sendTelegramMessage, sendTelegramPhotos } = await import('../services/telegram.js');
                const orderNo = orderInfo?.soDon || orderInfo?.sale_order_no || id;
                const isImport = type === 'NHAP';
                const tgGroup = isImport ? 'NHAP' : 'XUAT';
                const label = isImport ? 'ĐƠN NHẬP HOÀN THÀNH' : 'ĐƠN ĐÃ HOÀN THÀNH';

                let msg = `✅ <b>${label}</b>\n`;
                msg += `📦 Mã: <b>#${orderNo}</b>\n`;
                msg += `👤 ${isImport ? 'NCC' : 'Khách'}: ${orderInfo?.khach || 'N/A'}\n`;
                msg += `🚛 Tài xế: ${firstDriverName || resolvedDriverName || orderInfo?.taiXe || driver_name}`;

                const proofImages = images || [];
                if (proofImages.length > 0) {
                    await sendTelegramPhotos(proofImages, msg, tgGroup);
                } else {
                    await sendTelegramMessage(msg, tgGroup);
                }
                console.log(`📨 Telegram completion sent to ${tgGroup} for ${orderNo}`);
            } catch (tgErr) {
                console.error('Telegram completion error:', tgErr.message);
            }

            // AUTO-COMPLETE SISTER ORDERS IN MERGED TRIP (DRIVER FLOW)
            let mergeMsg = '';
            if (orderInfo?.merged_order_no && !req.body.prevent_loop) {
                console.log(`🔗 Auto-completing sister orders for merged trip: ${orderInfo.merged_order_no}`);
                try {
                    const { createClient } = await import('@supabase/supabase-js');
                    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

                    const { data: mergedLog } = await supabase
                        .from('merged_orders')
                        .select('source_order_nos')
                        .eq('merged_no', orderInfo.merged_order_no)
                        .single();

                    if (mergedLog && mergedLog.source_order_nos) {
                        const currentNo = orderInfo.soDon || orderInfo.sale_order_no || id;
                        const sisters = mergedLog.source_order_nos.filter(no => no !== currentNo);

                        for (const sister of sisters) {
                            console.log(`🤖 Triggering auto-completion for sister order: ${sister}`);
                            try {
                                if (sister.startsWith('N')) {
                                    const { createClient: createSC } = await import('@supabase/supabase-js');
                                    const sbClient = createSC(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
                                    await sbClient
                                        .from('import_tickets')
                                        .update({
                                            status: 'completed',
                                            completed_at: new Date().toISOString()
                                        })
                                        .eq('ticket_no', sister);
                                    mergeMsg += ` (Đã hoàn thành kèm phiếu nhập ${sister})`;
                                    console.log(`✅ Auto-completed import sister: ${sister}`);
                                } else {
                                    const fetch = (await import('node-fetch')).default;
                                    const protocol = req.protocol || 'http';
                                    const host = req.get('host') || 'localhost:3000';

                                    const sisterOrder = await db.getOrder(sister);
                                    const sisterProducts = sisterOrder?.products || sisterOrder?.cart || [];
                                    const sisterCart = sisterProducts.map(p => ({
                                        product: { code: p.code || '', name: p.name || '' },
                                        weight_kg: Number(p.qty || 0),
                                        qty: Number(p.qty || 0),
                                        unit: p.unit || 'Kg'
                                    }));

                                    const assignedDriver = firstDriverName || resolvedDriverName || orderInfo?.taiXe || driver_name;
                                    const assignedPlate = firstDriverPlate || resolvedPlate || plate || '';

                                    const sisterPayload = {
                                        type: req.body.type || 'XUAT',
                                        warehouse: req.body.warehouse || sisterOrder?.warehouse || '',
                                        partner: sisterOrder?.khach || sisterOrder?.account_name || req.body.partner || '',
                                        driver_name: assignedDriver,
                                        plate: assignedPlate,
                                        cart: sisterCart,
                                        note: req.body.delivery_note ? (req.body.delivery_note + ` (Ghép chung ${currentNo})`) : `Tự động hoàn thành theo đơn ghép ${currentNo}`,
                                        delivery_note: req.body.delivery_note ? (req.body.delivery_note + ` (Ghép chung ${currentNo})`) : `Tự động hoàn thành theo đơn ghép ${currentNo}`,
                                        sender: req.body.sender || assignedDriver,
                                        prevent_loop: true,
                                        admin_completed: true
                                    };

                                    console.log(`📦 Sister ${sister} own products: ${sisterCart.length} items, driver: ${assignedDriver}`);

                                    const resFetch = await fetch(`${protocol}://${host}/api/orders/${sister}/complete`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify(sisterPayload)
                                    });
                                    const resData = await resFetch.json();
                                    if (resData.error) {
                                        console.error(`❌ Auto-completion failed for ${sister}:`, resData.message);
                                    } else {
                                        mergeMsg += ` (Đã hoàn thành kèm mã ${sister})`;
                                        console.log(`✅ Auto-completed sister order: ${sister}`);
                                    }
                                }
                            } catch (loopErr) {
                                console.error(`❌ Auto-complete internal fetch error for ${sister}:`, loopErr.message);
                            }
                        }
                    }
                } catch (err) {
                    console.error('Auto-complete merged orders error:', err.message);
                }
            }

            return res.json(createResponse(false, 'Đơn của bạn đã hoàn thành!' + mergeMsg, { ticketId, crmStatus: crmSyncStatus }));
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

        // Resolve driver from order_driver_assignments for MISA sync
        let adminResolvedDriver = '';
        let adminResolvedPlate = '';
        try {
            const { createClient: createSC } = await import('@supabase/supabase-js');
            const sbLookup = createSC(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
            const { data: assigns } = await sbLookup
                .from('order_driver_assignments')
                .select('driver_name, plate')
                .eq('order_id', id)
                .order('created_at', { ascending: false })
                .limit(1);

            if (assigns && assigns.length > 0) {
                adminResolvedDriver = assigns[0].driver_name || '';
                adminResolvedPlate = assigns[0].plate || '';
                console.log(`✅ Admin Complete: Resolved driver from assignments: ${adminResolvedDriver} (${adminResolvedPlate})`);

                // Update order DB with resolved driver
                await db.updateOrder(id, {
                    taiXe: adminResolvedDriver,
                    bienSo: adminResolvedPlate
                });
            }
        } catch (e) {
            console.warn('Admin driver resolution error:', e.message);
        }

        // MISA sync is now handled via 2-step confirmation (Sales confirm → Admin approve)
        // Mark order as pending approval instead of direct MISA sync
        console.log(`⏳ Admin Complete: Order ${id} marked PENDING_APPROVAL (MISA sync deferred to Admin approve)`);

        // Send Telegram notification for admin complete
        try {
            const { sendTelegramMessage, sendTelegramPhotos } = await import('../services/telegram.js');
            const orderNo = fullOrder?.soDon || fullOrder?.sale_order_no || id;
            const driverDisplay = adminResolvedDriver || fullOrder?.custom_field13 || fullOrder?.taiXe || '';
            const isImport = type === 'NHAP';
            const tgGroup = isImport ? 'NHAP' : 'XUAT';
            const label = isImport ? 'ĐƠN NHẬP HOÀN THÀNH' : 'ĐƠN ĐÃ HOÀN THÀNH';

            let msg = `✅ <b>${label}</b>\n`;
            msg += `📦 Mã: <b>#${orderNo}</b>\n`;
            msg += `👤 ${isImport ? 'NCC' : 'Khách'}: ${fullOrder?.khach || fullOrder?.account_name || 'N/A'}\n`;
            if (driverDisplay) msg += `🚛 Tài xế: ${driverDisplay}\n`;
            if (adminResolvedPlate) msg += `🔢 Biển số: ${adminResolvedPlate}\n`;

            // Try to get proof images from export ticket
            let proofImages = images || [];
            if (proofImages.length === 0) {
                try {
                    const { createClient: sc } = await import('@supabase/supabase-js');
                    const sbImg = sc(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
                    const ticketTable = isImport ? 'import_tickets' : 'export_tickets';
                    const { data: ticket } = await sbImg
                        .from(ticketTable)
                        .select('images')
                        .eq('order_id', id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();
                    if (ticket?.images) proofImages = ticket.images;
                } catch (e) { /* no images */ }
            }

            if (proofImages.length > 0) {
                await sendTelegramPhotos(proofImages, msg, tgGroup);
            } else {
                await sendTelegramMessage(msg, tgGroup);
            }
            console.log(`📨 Telegram completion sent to ${tgGroup} for ${orderNo}`);
        } catch (tgErr) {
            console.error('Telegram admin completion error:', tgErr.message);
        }

        // AUTO-COMPLETE SISTER ORDERS IN MERGED TRIP
        let mergeMsg = '';
        if (fullOrder?.merged_order_no && !req.body.prevent_loop) {
            console.log(`🔗 Auto-completing sister orders for merged trip: ${fullOrder.merged_order_no}`);
            try {
                const { createClient } = await import('@supabase/supabase-js');
                const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

                const { data: mergedLog } = await supabase
                    .from('merged_orders')
                    .select('source_order_nos')
                    .eq('merged_no', fullOrder.merged_order_no)
                    .single();

                if (mergedLog && mergedLog.source_order_nos) {
                    const currentNo = fullOrder.soDon || fullOrder.sale_order_no || id;
                    const sisters = mergedLog.source_order_nos.filter(no => no !== currentNo);

                    for (const sister of sisters) {
                        console.log(`🤖 Triggering auto-completion for sister order: ${sister}`);
                        try {
                            // Check if sister is an import ticket (N-prefix)
                            if (sister.startsWith('N')) {
                                await supabase
                                    .from('import_tickets')
                                    .update({
                                        status: 'completed',
                                        completed_at: new Date().toISOString()
                                    })
                                    .eq('ticket_no', sister);
                                mergeMsg += ` (Đã hoàn thành kèm phiếu nhập ${sister})`;
                                console.log(`✅ Auto-completed import sister: ${sister}`);
                            } else {
                                // Forward the admin completion internally
                                const fetch = (await import('node-fetch')).default;
                                const protocol = req.protocol || 'http';
                                const host = req.get('host') || 'localhost:3000';

                                // Fetch sister order's OWN products from DB
                                const sisterOrder = await db.getOrder(sister);
                                const sisterProducts = sisterOrder?.products || sisterOrder?.cart || [];
                                const sisterCart = sisterProducts.map(p => ({
                                    product: { code: p.code || '', name: p.name || '' },
                                    weight_kg: Number(p.qty || 0),
                                    qty: Number(p.qty || 0),
                                    unit: p.unit || 'Kg'
                                }));

                                // Resolve driver from current order's assignments
                                const assignedDriver = fullOrder?.taiXe || fullOrder?.custom_field13 || driver_name;
                                const assignedPlate = fullOrder?.bienSo || fullOrder?.custom_field14 || plate || '';

                                const sisterPayload = {
                                    type: 'XUAT',
                                    warehouse: sisterOrder?.warehouse || 'LT1',
                                    partner: sisterOrder?.khach || sisterOrder?.account_name || '',
                                    driver_name: assignedDriver,
                                    plate: assignedPlate,
                                    cart: sisterCart,
                                    note: `Tự động hoàn thành theo đơn ghép ${currentNo}`,
                                    delivery_note: `Tự động hoàn thành theo đơn ghép ${currentNo}`,
                                    sender: assignedDriver,
                                    prevent_loop: true,
                                    admin_completed: true
                                };

                                console.log(`📦 Sister ${sister} own products: ${sisterCart.length} items, driver: ${assignedDriver}`);

                                const resFetch = await fetch(`${protocol}://${host}/api/orders/${sister}/complete`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(sisterPayload)
                                });
                                const resData = await resFetch.json();
                                if (resData.error) {
                                    console.error(`❌ Auto-completion failed for ${sister}:`, resData.message);
                                } else {
                                    mergeMsg += ` (Đã hoàn thành kèm mã ${sister})`;
                                    console.log(`✅ Auto-completed sister order: ${sister}`);
                                }
                            }
                        } catch (loopErr) {
                            console.error(`❌ Auto-complete internal fetch error for ${sister}:`, loopErr.message);
                        }
                    }
                }
            } catch (err) {
                console.error('Auto-complete merged orders error:', err.message);
            }
        }

        res.json(createResponse(false, 'Đã hoàn thành đơn hàng!' + mergeMsg));

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

        // Check existing assignments to determine notification type and get previous driver names
        const { data: existingAssignments } = await supabase
            .from('order_driver_assignments')
            .select('id, assigned_qty, driver_name, plate')
            .eq('order_id', id);

        const hadPreviousAssignments = existingAssignments && existingAssignments.length > 0;
        const previousDrivers = hadPreviousAssignments
            ? existingAssignments.map(a => a.driver_name).filter(Boolean)
            : [];
        const previousTotalQty = hadPreviousAssignments
            ? existingAssignments.reduce((sum, a) => sum + (a.assigned_qty || 0), 0)
            : 0;

        console.log(`📊 Previous assignments: ${existingAssignments?.length || 0}, drivers: ${previousDrivers.join(', ')}, total qty: ${previousTotalQty}kg`);

        // Delete existing assignments for this order
        const { error: delErr } = await supabase.from('order_driver_assignments').delete().eq('order_id', id);
        if (delErr) console.error('Delete existing assignments error:', delErr.message);

        // Insert new assignments
        const insertData = assignments.map(a => ({
            order_id: id,
            driver_name: a.driver_name,
            driver_type: a.type || 'internal',
            plate: a.plate || '',
            assistant_name: a.assistant_name || null,
            delivery_time: a.delivery_time || null,
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

        let finalMergedOrderNo = null;
        const mergeOrderNos = req.body.mergeWithOrderNos || (req.body.mergeWithOrderNo ? [req.body.mergeWithOrderNo] : []);

        if (mergeOrderNos.length > 0) {
            console.log(`🔗 Processing merge request with ${mergeOrderNos.length} orders: ${mergeOrderNos.join(', ')}`);
            const currentOrder = await db.getOrder(id);
            const mainDriverName = assignments[0]?.driver_name || '';
            const mainPlate = assignments[0]?.plate || '';
            const currentSaleOrderNo = currentOrder?.sale_order_no || id;

            // Check if any partner already has a merged_order_no → join existing trip
            let existingMergedNo = null;
            for (const partnerNo of mergeOrderNos) {
                const partner = await db.getOrder(partnerNo);
                if (partner?.merged_order_no) {
                    existingMergedNo = partner.merged_order_no;
                    break;
                }
            }

            const { createClient } = await import('@supabase/supabase-js');
            const supabase2 = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

            if (existingMergedNo) {
                // Join existing merged order
                finalMergedOrderNo = existingMergedNo;
                const { data: existingMerged } = await supabase2
                    .from('merged_orders')
                    .select('source_order_nos, total_amount')
                    .eq('merged_no', finalMergedOrderNo)
                    .single();

                if (existingMerged) {
                    const allNos = [...new Set([...(existingMerged.source_order_nos || []), currentSaleOrderNo, ...mergeOrderNos])];
                    let totalAmount = Number(existingMerged.total_amount || 0) + Number(currentOrder?.sale_order_amount || 0);

                    await supabase2
                        .from('merged_orders')
                        .update({
                            source_order_nos: allNos,
                            total_stops: allNos.length,
                            total_amount: totalAmount
                        })
                        .eq('merged_no', finalMergedOrderNo);
                    console.log(`✅ Added to existing merged order ${finalMergedOrderNo}, total stops: ${allNos.length}`);
                }
            } else {
                // Create new merged order with ALL partners
                const { getTimestamp } = await import('../config.js');
                const ts = getTimestamp();
                finalMergedOrderNo = 'M' + ts.short;

                const allSourceNos = [currentSaleOrderNo, ...mergeOrderNos];
                let totalAmount = Number(currentOrder?.sale_order_amount || 0);

                // Sum amounts from all partners
                for (const partnerNo of mergeOrderNos) {
                    const partner = await db.getOrder(partnerNo);
                    if (partner) {
                        totalAmount += Number(partner.sale_order_amount || 0);
                    } else {
                        // Check import tickets
                        const { data: impTicket } = await supabase2
                            .from('import_tickets')
                            .select('total_amount')
                            .eq('ticket_no', partnerNo)
                            .single();
                        if (impTicket) totalAmount += Number(impTicket.total_amount || 0);
                    }
                }

                await supabase2
                    .from('merged_orders')
                    .insert({
                        merged_no: finalMergedOrderNo,
                        source_order_nos: allSourceNos,
                        total_stops: allSourceNos.length,
                        total_amount: totalAmount,
                        status: 'assigned',
                        driver_name: mainDriverName,
                        plate: mainPlate
                    });
                console.log(`✅ Created merged order ${finalMergedOrderNo} with ${allSourceNos.length} stops`);
            }

            // Update ALL partner orders with merged_order_no + driver + status
            for (const partnerNo of mergeOrderNos) {
                const partner = await db.getOrder(partnerNo);
                if (partner) {
                    // Export order
                    await db.updateOrder(partnerNo, {
                        merged_order_no: finalMergedOrderNo,
                        status: CONFIG.STATUS.DELIVERING,
                        taiXe: mainDriverName,
                        bienSo: mainPlate
                    });
                    console.log(`✅ Export partner ${partnerNo} updated: merged=${finalMergedOrderNo}`);
                } else {
                    // Try import ticket
                    const { data: impTicket } = await supabase2
                        .from('import_tickets')
                        .select('id')
                        .eq('ticket_no', partnerNo)
                        .single();
                    if (impTicket) {
                        await supabase2
                            .from('import_tickets')
                            .update({
                                merged_order_no: finalMergedOrderNo,
                                status: 'assigned',
                                assigned_driver: mainDriverName,
                                assigned_plate: mainPlate
                            })
                            .eq('ticket_no', partnerNo);
                        console.log(`✅ Import partner ${partnerNo} updated: merged=${finalMergedOrderNo}`);
                    }
                }
            }
        }

        // Update order with first driver info (main driver)
        const mainDriver = assignments[0];
        await db.updateOrder(id, {
            status: CONFIG.STATUS.DELIVERING,
            taiXe: mainDriver.driver_name,
            bienSo: mainDriver.plate || '',
            note: assignments.length > 1 ? `Chia ${assignments.length} tài xế` : (mainDriver.note || ''),
            phuXe: mainDriver.assistant_name || null,
            thoiGianGiao: mainDriver.delivery_time || null,
            merged_order_no: finalMergedOrderNo // Bind to merge trip if applicable
        });

        // Send Telegram notification
        try {
            console.log(`📨 Sending Telegram for ${assignments.length} driver assignment on order ${id}...`);
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const orderInfo = await db.getOrder(id);

            // Determine notification type based on:
            // 1. Number of drivers (1 vs multi)
            // 2. Whether this is a new assignment or change
            let notificationType;
            if (hadPreviousAssignments) {
                notificationType = 'THAY ĐỔI TÀI XẾ';
            } else {
                notificationType = assignments.length > 1 ? 'PHÂN CÔNG NHIỀU TÀI XẾ' : 'PHÂN CÔNG TÀI XẾ';
            }

            let msg = `🚛 <b>${notificationType}</b>\n`;
            msg += `#${orderInfo?.soDon || id}\n`;
            msg += `👤 KH: <b>${orderInfo?.khach || ''}</b>\n`;
            if (orderInfo?.sale_order_date) {
                const fmtDate = new Date(orderInfo.sale_order_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                msg += `📅 Ngày: ${fmtDate}\n`;
            }

            // Merged order info
            if (orderInfo?.merged_order_no) {
                msg += `🔗 Ghép chuyến: ${orderInfo.merged_order_no}\n`;
            }
            // Split driver info
            if (assignments.length > 1) {
                msg += `✂️ Chia ${assignments.length} tài xế\n`;
            }

            // Show previous drivers if this is a change
            if (hadPreviousAssignments && previousDrivers.length > 0) {
                msg += `\n<b>Tài xế cũ:</b> ${previousDrivers.join(', ')}\n`;
            }

            msg += `\n<b>Danh sách tài xế${hadPreviousAssignments ? ' mới' : ''}:</b>\n`;

            const users = await db.getUsers();
            const mentionTags = [];

            assignments.forEach((a, i) => {
                const typeLabel = a.type === 'external' ? '(Ngoài)' : '(NB)';

                // Collect tags for bottom mention
                const driverObj = users.find(u => u.fullName === a.driver_name || u.username === a.driver_name);
                const driverMention = getTelegramTag(driverObj?.telegramUsername, driverObj?.telegramUserId, a.driver_name);
                if (driverMention) mentionTags.push(driverMention.trim());

                let assistantLine = '';
                if (a.assistant_name) {
                    const assistantObj = users.find(u => u.fullName === a.assistant_name || u.username === a.assistant_name);
                    const assistantMention = getTelegramTag(assistantObj?.telegramUsername, assistantObj?.telegramUserId, a.assistant_name);
                    if (assistantMention) mentionTags.push(assistantMention.trim());
                    assistantLine = `\n    🧑‍🔧 PX: ${a.assistant_name}`;
                }

                msg += `${i + 1}. <b>${a.driver_name}</b> ${typeLabel} - ${Number(a.qty).toLocaleString('vi-VN')}kg${assistantLine}\n`;
                if (a.plate) msg += `    🔢 Xe: ${a.plate}\n`;
                if (a.delivery_time) msg += `    ⏰ Giao: ${a.delivery_time}\n`;
                if (a.note) msg += `    📝 Ghi chú: ${a.note}\n`;
            });

            // Add mention tags at the bottom instead of @sales
            if (mentionTags.length > 0) {
                msg += `\n${mentionTags.join(' ')}`;
            }

            console.log(`📤 Telegram message to DRIVER group:\n${msg}`);
            await sendTelegramMessage(msg, 'DRIVER');
            console.log(`✅ Telegram DRIVER notification sent for order ${id}`);
        } catch (tgErr) {
            console.error('❌ Telegram Error in driver assign:', tgErr.message);
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

// ===============================================
// POST /api/orders/local - Create LOCAL export order (không sync MISA)
// Tạo đơn xuất ngoài chỉ lưu database
// ===============================================
router.post('/local', async (req, res) => {
    try {
        const { customer_name, customer_address, products, expected_date, warehouse, description, note, created_by } = req.body;

        console.log('📤 Create Local Export - Received body:', JSON.stringify({ customer_name, description, note }, null, 2));
        console.log('📦 Products received:', JSON.stringify(products, null, 2));
        console.log('📦 Products count:', products?.length, 'Type:', typeof products);

        if (!customer_name || !products || !products.length) {
            return res.json(createResponse(true, 'Thiếu thông tin khách hàng hoặc sản phẩm'));
        }

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        const ts = getTimestamp();
        const orderNo = 'X' + ts.short;  // Prefix X for export

        const totalQty = products.reduce((sum, p) => sum + Number(p.qty || 0), 0);
        const totalAmount = products.reduce((sum, p) => sum + Number(p.total || p.qty * (p.price || 0) || 0), 0);

        // Insert to orders table (local order)
        // Using actual column names from orders table schema
        const insertPayload = {
            id: orderNo,
            sale_order_no: orderNo,
            // Fix: Handle empty string - use today if expected_date is null, undefined, or empty
            sale_order_date: (expected_date && expected_date.trim()) || new Date().toISOString().split('T')[0],
            account_name: customer_name,
            shipping_address: customer_address || '',
            sale_order_product_mappings: products,  // Same column as MISA orders for frontend compatibility
            sale_order_amount: totalAmount,
            deadline_date: expected_date || null,  // Correct column name
            status: 'Chưa thực hiện',
            delivery_status: 'Chưa giao hàng',
            description: description || '',  // Mô tả + ghi chú
            delivery_note: note || '',  // Ghi chú giao hàng
            is_local: true,  // Flag đánh dấu đơn local (không sync MISA)
            created_by: created_by || 'Admin',
            created_date: new Date().toISOString()
        };

        console.log('🔄 Insert payload sale_order_product_mappings:', JSON.stringify(insertPayload.sale_order_product_mappings));

        const { data, error } = await supabase
            .from('orders')
            .insert(insertPayload)
            .select()
            .single();

        if (error) {
            console.error('❌ Create local export error:', error.message, error.details, error.hint);
            return res.json(createResponse(true, 'Lỗi tạo đơn: ' + error.message));
        }

        console.log(`✅ Created local export order: ${orderNo}`);
        console.log('📦 Saved data sale_order_product_mappings:', JSON.stringify(data?.sale_order_product_mappings));

        // Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const productsList = (products || [])
                .map(p => `- ${p.name}: ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`)
                .join('\n');

            let msg = `🟩 <b>XUẤT ERP</b>\n`;
            msg += `📦 <b>#${orderNo}</b>\n`;
            if (expected_date) {
                try {
                    const fmtDate = new Date(expected_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                    msg += `📅 ${fmtDate}\n`;
                } catch { msg += `📅 ${expected_date}\n`; }
            }
            msg += `👤 <b>${customer_name}</b>\n`;
            if (productsList) {
                msg += `📦 ${(products || []).map(p => `${p.name} — ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`).join(', ')}\n`;
            }
            msg += `📍 ${customer_address || 'N/A'}\n`;
            if (description || note) msg += `📝 ${description || note}\n`;

            await sendTelegramMessage(msg, 'NOTIFY');
        } catch (tgErr) {
            console.error('Telegram Error:', tgErr.message);
        }

        res.json({
            error: false,
            msg: 'Tạo đơn xuất thành công! Mã: ' + orderNo,
            data
        });

    } catch (e) {
        console.error('❌ Create local export error:', e.message);
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/orders/:id/cancel - Cancel an order (export)
router.put('/:id/cancel', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, cancelled_by } = req.body;

        const order = await db.getOrder(id);
        if (!order) {
            return res.json(createResponse(true, 'Không tìm thấy đơn hàng'));
        }

        // Don't cancel already completed or cancelled orders
        const status = String(order.status || '').toLowerCase();
        if (status === 'đã thực hiện' || status === 'đã hủy bỏ' || status === 'cancelled') {
            return res.json(createResponse(true, 'Đơn đã hoàn thành hoặc đã hủy, không thể hủy'));
        }

        await db.updateOrder(id, {
            status: 'Đã hủy bỏ',
            delivery_note: reason ? `[HỦY] ${reason}` : '[HỦY bởi ' + (cancelled_by || 'admin') + ']'
        });

        // Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const orderNo = order.soDon || order.sale_order_no || id;
            let msg = `❌ <b>ĐƠN XUẤT ĐÃ HỦY</b>\n`;
            msg += `📦 <b>#${orderNo}</b>\n`;
            msg += `👤 ${order.khach || order.account_name || 'N/A'}\n`;
            if (reason) msg += `📝 Lý do: ${reason}\n`;
            msg += `👔 Hủy bởi: ${cancelled_by || 'admin'}`;
            await sendTelegramMessage(msg, 'NOTIFY');
        } catch (tgErr) {
            console.error('Telegram cancel error:', tgErr.message);
        }

        res.json(createResponse(false, 'Đã hủy đơn hàng!'));
    } catch (e) {
        console.error('Cancel order error:', e.message);
        res.json(createResponse(true, e.message));
    }
});

// ============================================================
// ORDER CONFIRMATION (Xác nhận đơn - Sale review before CRM sync)
// ============================================================

// pending-confirm route moved above /:id handler to fix Express route matching

// GET /api/orders/:id/review - Get order details + proof images for review
router.get('/:id/review', async (req, res) => {
    try {
        const { id } = req.params;
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        // Get order
        const order = await db.getOrder(id);
        if (!order) return res.json(createResponse(true, 'Không tìm thấy đơn hàng'));

        // Get proof images from driver assignments
        let proofImages = [];
        const { data: assigns } = await supabase
            .from('order_driver_assignments')
            .select('id, driver_name, proof_images, actual_products, completed_at, delivery_note, actual_qty')
            .eq('order_id', id)
            .eq('status', 'completed');

        if (assigns) {
            for (const a of assigns) {
                if (a.proof_images?.length > 0) {
                    proofImages.push(...a.proof_images.map(img => ({ url: img, driver: a.driver_name })));
                }
            }
        }

        // Also check export_tickets for images
        const { data: tickets } = await supabase
            .from('export_tickets')
            .select('images, ticket_no')
            .eq('order_id', id);

        if (tickets) {
            for (const t of tickets) {
                if (t.images?.length > 0) {
                    proofImages.push(...t.images.map(img => ({ url: img, ticket: t.ticket_no })));
                }
            }
        }

        // Also check import_tickets
        const { data: importTickets } = await supabase
            .from('import_tickets')
            .select('images, ticket_no')
            .eq('order_id', id);

        if (importTickets) {
            for (const t of importTickets) {
                if (t.images?.length > 0) {
                    proofImages.push(...t.images.map(img => ({ url: img, ticket: t.ticket_no })));
                }
            }
        }

        res.json(createResponse(false, 'OK', {
            order,
            proofImages,
            driverAssignments: assigns || []
        }));
    } catch (e) {
        console.error('review error:', e.message);
        res.json(createResponse(true, e.message));
    }
});

// POST /api/orders/:id/confirm - Sales xác nhận (checkmark only, NO MISA sync)
router.post('/:id/confirm', async (req, res) => {
    try {
        const { id } = req.params;
        const { products, confirmed_by } = req.body;

        const order = await db.getOrder(id);
        if (!order) return res.json(createResponse(true, 'Không tìm thấy đơn hàng'));

        // Sales confirm: only set checkmark, no MISA sync
        const updateData = {
            sale_confirmed: true,
            sale_confirmed_at: new Date().toISOString(),
            sale_confirmed_by: confirmed_by || 'sales'
        };

        if (products && Array.isArray(products)) {
            updateData.sale_order_product_mappings = products;
        }

        await db.updateOrder(id, updateData);

        // Telegram: notify sales confirmed (no CRM sync)
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const orderNo = order.soDon || order.sale_order_no || id;
            let msg = `☑️ <b>SALES XÁC NHẬN ĐƠN</b>\n`;
            msg += `📦 <b>#${orderNo}</b>\n`;
            msg += `👤 ${order.khach || order.account_name || 'N/A'}\n`;
            msg += `👔 Bởi: ${confirmed_by || 'sales'}\n`;
            msg += `⏳ Chờ Admin duyệt`;
            await sendTelegramMessage(msg, 'NOTIFY');
        } catch (tgErr) {
            console.error('Telegram confirm error:', tgErr.message);
        }

        res.json(createResponse(false, 'Đã xác nhận! Chờ Admin duyệt.'));
    } catch (e) {
        console.error('confirm error:', e.message);
        res.json(createResponse(true, e.message));
    }
});

// POST /api/orders/:id/approve - Admin duyệt → sync to MISA CRM
router.post('/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { approved_by } = req.body;

        const order = await db.getOrder(id);
        if (!order) return res.json(createResponse(true, 'Không tìm thấy đơn hàng'));

        // Update admin approval fields
        const updateData = {
            admin_approved: true,
            admin_approved_at: new Date().toISOString(),
            admin_approved_by: approved_by || 'admin'
        };

        // If sales hasn't confirmed yet, auto-confirm (admin can do both)
        if (!order.sale_confirmed) {
            updateData.sale_confirmed = true;
            updateData.sale_confirmed_at = new Date().toISOString();
            updateData.sale_confirmed_by = approved_by || 'admin';
        }

        await db.updateOrder(id, updateData);

        // Sync to MISA CRM
        let crmStatus = 'OK';
        try {
            const updatedOrder = await db.getOrder(id);
            const syncResult = await updateMisaOrder(updatedOrder?.sale_order_no || id, {
                misa_id: updatedOrder?.misa_id,
                delivery_status: 'Đã giao hàng',
                status: 'Đã thực hiện',
                driver: updatedOrder?.taiXe || updatedOrder?.custom_field13 || '',
                plate: updatedOrder?.bienSo || updatedOrder?.custom_field14 || '',
                cart: updatedOrder?.products || []
            });
            if (!syncResult?.success) {
                crmStatus = syncResult?.message || 'MISA sync failed';
                console.error('MISA approve sync failed:', crmStatus);
            }
        } catch (syncErr) {
            crmStatus = syncErr.message;
            console.error('MISA approve sync error:', syncErr.message);
        }

        // Telegram notification → SALES group
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const orderNo = order.soDon || order.sale_order_no || id;
            const products = (order.products || []).map(p => `  • ${p.name || p.code}: ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`).join('\n');
            let msg = `✅ <b>DUYỆT ĐƠN & ĐẨY MISA</b>\n`;
            msg += `📦 <b>#${orderNo}</b>\n`;
            msg += `👤 ${order.khach || order.account_name || 'N/A'}\n`;
            msg += `📍 ${order.diaChi || order.shipping_address || ''}\n`;
            msg += `🚛 ${order.taiXe || order.custom_field13 || 'N/A'}\n`;
            if (products) msg += `📋 Sản phẩm:\n${products}\n`;
            msg += `👔 Duyệt bởi: ${approved_by || 'admin'}\n`;
            msg += `📤 CRM: ${crmStatus === 'OK' ? '✅ Đã đồng bộ' : '⚠️ ' + crmStatus}`;
            await sendTelegramMessage(msg, 'SALES');
        } catch (tgErr) {
            console.error('Telegram approve error:', tgErr.message);
        }

        res.json(createResponse(false, 'Duyệt thành công!', { crmStatus }));
    } catch (e) {
        console.error('approve error:', e.message);
        res.json(createResponse(true, e.message));
    }
});

export default router;



