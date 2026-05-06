// ===============================================
// ORDER ROUTES
// ===============================================

import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { CONFIG, createResponse, formatDate, getTimestamp, standardizeData, generateOrderCode } from '../config.js';
import db from '../db/index.js';
import { updateMisaOrder } from '../services/misa.js';
import { uploadImages } from '../services/storage.js';
import { createNotification } from './notifications.js';

// AUDIT: Log all status changes to order_status_log table for debugging
// Fire-and-forget — never blocks the main operation
function logStatusChange(orderId, oldStatus, newStatus, changedBy, reason) {
    if (!orderId || oldStatus === newStatus) return;
    console.log(`📋 STATUS LOG: ${orderId} "${oldStatus}" → "${newStatus}" by ${changedBy} (${reason})`);
    supabase.from('order_status_log').insert({
        order_id: String(orderId),
        old_status: oldStatus || null,
        new_status: newStatus || null,
        changed_by: changedBy || 'SYSTEM',
        reason: reason || null
    }).then(() => {}).catch(err => console.error('Status log error:', err.message));
}

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

// GET /api/orders - Get orders with pagination support for completed tab
// Default: only pending+assigned (fast). ?tab=completed&page=1&limit=50 for completed orders.
router.get('/', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const tab = req.query.tab || ''; // 'completed' for paginated completed orders
        const includeDeleted = req.query.includeDeleted === 'true';

        // === COMPLETED TAB: Paginated, separate query ===
        if (tab === 'completed') {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const offset = (page - 1) * limit;

            const orders = await db.getOrders(true); // include all statuses
            const completedStatuses = ['đã thực hiện'];
            const cancelledStatuses = ['đã hủy bỏ'];

            let completedOrders = [];
            let cancelledOrders = [];
            for (const order of orders) {
                const s = String(order.status || '').trim().toLowerCase();
                if (completedStatuses.includes(s)) completedOrders.push(order);
                else if (cancelledStatuses.includes(s)) cancelledOrders.push(order);
            }

            // Combine completed + cancelled, sort by date desc
            const allDone = [...completedOrders, ...cancelledOrders];
            const total = allDone.length;
            const totalPages = Math.ceil(total / limit);
            const paginatedOrders = allDone.slice(offset, offset + limit);

            // Strip heavy fields for completed list (save bandwidth)
            const lightOrders = paginatedOrders.map(o => ({
                id: o.id,
                soDon: o.soDon || o.sale_order_no,
                ngay: o.ngay || o.sale_order_date,
                khach: o.khach || o.account_name,
                diaChi: o.diaChi || o.shipping_address || '',
                status: o.status,
                taiXe: o.taiXe || o.custom_field13 || '',
                bienSo: o.bienSo || o.custom_field14 || '',
                amount: o.amount || o.sale_order_amount || 0,
                description: o.description || '',
                delivery_time: o.delivery_time || '',
                assistant_name: o.assistant_name || '',
                merged_order_no: o.merged_order_no || '',
                is_pinned: o.is_pinned || false,
                products: o.products || o.cart || [],
                completed_at: o.completed_at || o.updated_at || ''
            }));

            return res.json({
                error: false,
                tab: 'completed',
                completed: lightOrders,
                pagination: { page, limit, total, totalPages, hasNext: page < totalPages }
            });
        }

        // === DEFAULT: Only pending + assigned (OPTIMIZED: filter at DB level) ===
        // Instead of fetching ALL 1000+ orders and filtering in memory,
        // query Supabase directly for non-completed/non-cancelled orders
        const completedStatuses = ['Đã thực hiện'];
        const cancelledStatuses = ['Đã hủy bỏ'];

        const startTime = Date.now();

        // Parallel: fetch active orders + users + counts + assignments
        const [activeResult, usersResult, countResult, assignResult] = await Promise.allSettled([
            // 1. Active orders only (NOT completed, NOT cancelled) — the key optimization
            supabase.from('orders').select('*')
                .not('status', 'in', '("Đã thực hiện","Đã hủy bỏ")')
                .order('sale_order_date', { ascending: false, nullsFirst: false })
                .order('created_date', { ascending: false, nullsFirst: false }),
            // 2. Users (for driver list)
            db.getUsers(),
            // 3. Counts only (no data transfer) for completed/cancelled badges
            Promise.all([
                supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'Đã thực hiện'),
                supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'Đã hủy bỏ')
            ]),
            // 4. Driver assignments
            supabase.from('order_driver_assignments')
                .select('order_id, assigned_products, status, driver_type')
                .in('status', ['pending', 'completed'])
        ]);

        // Parse active orders
        let activeOrders = [];
        if (activeResult.status === 'fulfilled' && activeResult.value.data) {
            // Map to frontend field names (same as db.getOrders)
            activeOrders = activeResult.value.data.map(o => {
                let products = [];
                try {
                    if (typeof o.sale_order_product_mappings === 'string') {
                        products = JSON.parse(o.sale_order_product_mappings);
                    } else if (Array.isArray(o.sale_order_product_mappings)) {
                        products = o.sale_order_product_mappings;
                    }
                } catch (e) { }
                return {
                    ...o,
                    soDon: o.sale_order_no,
                    ngay: o.sale_order_date,
                    khach: o.account_name,
                    diaChi: o.shipping_address || o.billing_address || '',
                    amount: o.sale_order_amount || 0,
                    taiXe: o.custom_field13 || '',
                    bienSo: o.custom_field14 || '',
                    driver: o.custom_field13 || '',
                    plate: o.custom_field14 || '',
                    misa_note: o.description || '',
                    creator_name: o.owner_name || '',
                    products,
                    cart: products,
                    is_pinned: o.is_pinned || false
                };
            });
        } else {
            console.error('Active orders query failed, falling back to full fetch');
            activeOrders = (await db.getOrders(includeDeleted)).filter(o => {
                const s = String(o.status || '').trim();
                return !completedStatuses.some(cs => cs.toLowerCase() === s.toLowerCase())
                    && !cancelledStatuses.some(cs => cs.toLowerCase() === s.toLowerCase());
            });
        }

        // Split into pending/assigned
        const pending = [];
        const assigned = [];
        for (const order of activeOrders) {
            if (!order.taiXe) {
                pending.push(order);
            } else {
                assigned.push(order);
            }
        }

        // Parse counts
        let completedCount = 0;
        let cancelledCount = 0;
        if (countResult.status === 'fulfilled') {
            const [compRes, cancRes] = countResult.value;
            completedCount = compRes.count || 0;
            cancelledCount = cancRes.count || 0;
        }

        // Attach driver assignments
        if (assignResult.status === 'fulfilled' && assignResult.value.data) {
            const allAssignments = assignResult.value.data;
            if (allAssignments.length > 0) {
                const assignmentsByOrder = {};
                for (const a of allAssignments) {
                    if (!a.order_id) continue;
                    if (!assignmentsByOrder[a.order_id]) assignmentsByOrder[a.order_id] = [];
                    assignmentsByOrder[a.order_id].push(a);
                }

                for (const order of [...pending, ...assigned]) {
                    const orderId = order.soDon || order.sale_order_no || order.id;
                    const assigns = assignmentsByOrder[orderId] || assignmentsByOrder[order.id] || [];
                    if (assigns.length === 0) continue;

                    const dispatchedMap = {};
                    for (const a of assigns) {
                        let prods = a.assigned_products;
                        if (typeof prods === 'string') { try { prods = JSON.parse(prods); } catch (e) { continue; } }
                        if (!Array.isArray(prods)) continue;
                        for (const p of prods) {
                            const key = p.code || p.name;
                            if (!dispatchedMap[key]) dispatchedMap[key] = { code: p.code, name: p.name, qty: 0, unit: p.unit };
                            dispatchedMap[key].qty += Number(p.qty || 0);
                        }
                    }
                    order.dispatched_products = Object.values(dispatchedMap);
                    order.driver_count = assigns.length;
                    order.has_external_driver = assigns.some(a => a.driver_type === 'external');
                }
            }
        }

        // Parse users for driver/assistant lists
        const users = usersResult.status === 'fulfilled' ? usersResult.value : [];
        const drivers = users
            .filter(u => u.status === 'ACTIVE' && u.role === CONFIG.ROLES.DRIVER && String(u.role).toUpperCase() !== 'TESTER')
            .map(u => ({ name: u.fullName, plate: u.plate }));

        const assistants = users
            .filter(u => u.status === 'ACTIVE' && String(u.role).toUpperCase() === 'ASSISTANT')
            .map(u => ({ name: u.fullName }));

        const elapsed = Date.now() - startTime;
        console.log(`📦 Orders API: ${pending.length} pending + ${assigned.length} assigned (${elapsed}ms) | Skipped ${completedCount} completed + ${cancelledCount} cancelled`);

        res.json({
            error: false,
            pending,
            assigned,
            completed: [],
            completedCount,
            cancelled: [],
            cancelledCount,
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




        // =========================================================
        // OPTIMIZED: Fetch assignments first, then ONLY relevant orders
        // (NO db.getOrders() — that fetches ALL orders and times out)
        // =========================================================
        const startTime = Date.now();

        const queryExportAssigns = isAdmin 
            ? supabase.from('order_driver_assignments').select('*').or(`driver_type.eq.external,driver_name.ilike.%${driverName}%,assistant_name.ilike.%${driverName}%`)
            : supabase.from('order_driver_assignments').select('*').or(`driver_name.ilike.%${driverName}%,assistant_name.ilike.%${driverName}%`);

        const queryImportAssigns = isAdmin
            ? supabase.from('import_driver_assignments').select('*').or(`driver_type.eq.external,driver_name.ilike.%${driverName}%,driver_name.eq.${driverName}`)
            : supabase.from('import_driver_assignments').select('*').or(`driver_name.ilike.%${driverName}%,driver_name.eq.${driverName}`);

        // Legacy fallback: orders assigned directly via custom_field13 (no assignment table)
        const queryLegacyOrders = isAdmin
            ? supabase.from('orders').select('*').not('custom_field13', 'is', null).neq('custom_field13', '')
            : supabase.from('orders').select('*').ilike('custom_field13', `%${driverName}%`);

        const mainResults = await Promise.allSettled([
            queryExportAssigns,
            queryImportAssigns,
            queryLegacyOrders,
            db.getUsers()
        ]);

        function dedupe(arr) {
            const seen = new Set();
            return arr.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
        }

        const assignments = dedupe(mainResults[0].status === 'fulfilled' ? (mainResults[0].value.data || []) : []);
        const preFetchedImportAssignments = dedupe(mainResults[1].status === 'fulfilled' ? (mainResults[1].value.data || []) : []);
        const legacyOrdersRaw = mainResults[2].status === 'fulfilled' ? (mainResults[2].value.data || []) : [];
        const users = mainResults[3].status === 'fulfilled' ? (mainResults[3].value || []) : [];

        if (mainResults.some(r => r.status === 'rejected')) {
            console.warn('⚠️ My Orders warning: Some queries failed', mainResults.map((r, i) => r.status === 'rejected' ? `query${i}: ${r.reason}` : 'ok'));
        }

        const internalDrivers = users
            .filter(u => u.role === CONFIG.ROLES.DRIVER)
            .map(u => (u.fullName || '').toUpperCase());

        let myOrders = [];

        // ===== 1. QUERY MULTI-DRIVER ASSIGNMENTS =====
        try {
            console.log(`📋 Assignment query result: ${assignments.length} rows`);

            if (assignments && assignments.length > 0) {
                console.log(`📦 Found ${assignments.length} driver assignments`);

                // Fetch ONLY the orders that have assignments (targeted query, not ALL orders)
                const orderIds = [...new Set(assignments.map(a => a.order_id))];

                // Parallel: fetch matching orders + all assignments for those orders
                const [ordersResult, batchAssignsResult] = await Promise.all([
                    supabase.from('orders').select('*').in('id', orderIds),
                    supabase.from('order_driver_assignments')
                        .select('id, status, assigned_qty, actual_qty, driver_name, order_id')
                        .in('order_id', orderIds)
                ]);

                // Index orders by id for fast lookup
                const orderMap = {};
                (ordersResult.data || []).forEach(o => {
                    // Map Supabase fields to frontend fields
                    let products = [];
                    try {
                        if (typeof o.sale_order_product_mappings === 'string') products = JSON.parse(o.sale_order_product_mappings);
                        else if (Array.isArray(o.sale_order_product_mappings)) products = o.sale_order_product_mappings;
                    } catch (e) {}
                    
                    orderMap[o.id] = {
                        ...o,
                        soDon: o.sale_order_no,
                        ngay: o.sale_order_date,
                        khach: o.account_name,
                        diaChi: o.shipping_address || o.billing_address || '',
                        amount: o.sale_order_amount || 0,
                        taiXe: o.custom_field13 || '',
                        bienSo: o.custom_field14 || '',
                        driver: o.custom_field13 || '',
                        plate: o.custom_field14 || '',
                        misa_note: o.description || '',
                        creator_name: o.owner_name || '',
                        products, cart: products,
                        is_pinned: o.is_pinned || false
                    };
                });
                // Also index by sale_order_no
                Object.values(orderMap).forEach(o => { if (o.soDon) orderMap[o.soDon] = o; });

                // Group assignments by order_id for fast lookup
                const assignsByOrder = {};
                (batchAssignsResult.data || []).forEach(a => {
                    if (!assignsByOrder[a.order_id]) assignsByOrder[a.order_id] = [];
                    assignsByOrder[a.order_id].push(a);
                });

                for (const assign of assignments) {
                    const order = orderMap[assign.order_id];
                    if (!order) continue;

                    let statusCode = 'CHO_NHAN';
                    if (assign.status === 'delivering') statusCode = 'DANG_GIAO';
                    else if (assign.status === 'completed') statusCode = 'HOAN_THANH';

                    const allAssignments = assignsByOrder[assign.order_id] || [];
                    const isSplitOrder = allAssignments.length > 1;
                    const completedCount = allAssignments.filter(a => a.status === 'completed').length;
                    const totalCount = allAssignments.length || 1;

                    myOrders.push({
                        ...order,
                        assignment_id: assign.id,
                        assigned_qty: assign.assigned_qty,
                        assigned_products: assign.assigned_products,
                        actual_qty: assign.actual_qty || 0,
                        assignment_status: assign.status,
                        assignment_plate: assign.plate,
                        is_split_order: isSplitOrder,
                        split_progress: isSplitOrder ? `${completedCount}/${totalCount}` : null,
                        all_assignments: allAssignments,
                        statusCode,
                        type: 'export',
                        taiXe: assign.driver_name,
                        bienSo: assign.plate || order.bienSo
                    });
                }
            }
        } catch (assignErr) {
            console.error('Assignment query error:', assignErr.message);
        }

        // ===== 2. FALLBACK: ORDERS WITHOUT ASSIGNMENTS (legacy/single driver) =====
        try {
            const assignedOrderIds = new Set(myOrders.map(o => o.id));

            // Map legacy orders from Supabase format
            const legacyOrders = legacyOrdersRaw
                .filter(o => !assignedOrderIds.has(o.id))
                .filter(o => {
                    const tName = String(o.custom_field13 || '').trim().toUpperCase();
                    if (!tName) return false;
                    const match = (tName === myName) || tName.includes(myName) || myName.includes(tName);
                    if (isAdmin) {
                        const isExternal = tName && !internalDrivers.includes(tName);
                        return match || isExternal;
                    }
                    return match;
                });

            for (const o of legacyOrders) {
                let products = [];
                try {
                    if (typeof o.sale_order_product_mappings === 'string') products = JSON.parse(o.sale_order_product_mappings);
                    else if (Array.isArray(o.sale_order_product_mappings)) products = o.sale_order_product_mappings;
                } catch (e) {}

                const s = String(o.status || '').toLowerCase();
                let statusCode = 'CHO_GIAO';

                const deliveringStatuses = ['in_transit', 'delivering', 'đang thực hiện', 'đang giao'];
                const pendingStatuses = ['assigned', 'chưa thực hiện'];
                const completedStatuses = ['đã thực hiện', 'completed'];

                if (pendingStatuses.some(ps => s.includes(ps))) statusCode = 'CHO_NHAN';
                else if (deliveringStatuses.some(ds => s.includes(ds))) statusCode = 'DANG_GIAO';
                else if (completedStatuses.some(cs => s.includes(cs))) statusCode = 'HOAN_THANH';

                myOrders.push({
                    ...o,
                    soDon: o.sale_order_no,
                    ngay: o.sale_order_date,
                    khach: o.account_name,
                    diaChi: o.shipping_address || o.billing_address || '',
                    amount: o.sale_order_amount || 0,
                    taiXe: o.custom_field13 || '',
                    bienSo: o.custom_field14 || '',
                    products, cart: products,
                    statusCode,
                    type: 'export',
                    is_split_order: false
                });
            }
        } catch (legacyErr) {
            console.error('Legacy orders error:', legacyErr.message);
        }

        console.log(`📋 Export orders for ${driverName}: ${myOrders.length}`);

        // ===== 3. IMPORT TICKETS - MULTI-DRIVER =====
        try {
            let importAssignments = preFetchedImportAssignments || [];

            if (importAssignments && importAssignments.length > 0) {
                console.log(`📦 Found ${importAssignments.length} import driver assignments`);

                const importIds = [...new Set(importAssignments.map(a => a.import_id))];
                const importResults = await Promise.allSettled([
                    supabase.from('import_tickets').select('*').in('id', importIds),
                    supabase.from('import_driver_assignments')
                        .select('id, status, assigned_qty, actual_qty, driver_name, plate, import_id')
                        .in('import_id', importIds)
                ]);

                const ticketsResult = importResults[0].status === 'fulfilled' ? importResults[0].value : { data: [] };
                const batchImportAssigns = importResults[1].status === 'fulfilled' ? importResults[1].value : { data: [] };

                const ticketMap = {};
                (ticketsResult.data || []).forEach(t => { ticketMap[t.id] = t; });

                const importAssignsByTicket = {};
                (batchImportAssigns.data || []).forEach(a => {
                    if (!importAssignsByTicket[a.import_id]) importAssignsByTicket[a.import_id] = [];
                    importAssignsByTicket[a.import_id].push(a);
                });

                for (const assign of importAssignments) {
                    const imp = ticketMap[assign.import_id];
                    if (!imp) continue;

                    let statusCode = 'CHO_NHAN';
                    if (assign.status === 'delivering') statusCode = 'DANG_GIAO';
                    else if (assign.status === 'completed') statusCode = 'HOAN_THANH';

                    const allImportAssigns = importAssignsByTicket[assign.import_id] || [];
                    const isSplitOrder = allImportAssigns.length > 1;
                    const completedCount = allImportAssigns.filter(a => a.status === 'completed').length;
                    const totalCount = allImportAssigns.length || 1;

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
                        all_assignments: allImportAssigns,
                        type: 'import',
                        statusCode,
                        ngay: (() => {
                            const raw = String(imp.expected_date || imp.created_at || '');
                            const parts = raw.split('T')[0].split('-');
                            if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
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
                        ngay: (() => {
                            const raw = String(imp.expected_date || imp.created_at || '');
                            const parts = raw.split('T')[0].split('-');
                            if (parts.length === 3) {
                                return `${parts[2]}/${parts[1]}/${parts[0]}`;
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

        const elapsed = Date.now() - startTime;
        console.log(`📦 Total orders for ${driverName}: ${myOrders.length} (${elapsed}ms)`);
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


        const type = req.query.type || 'export';

        if (type === 'rejected') {
            // Show rejected import tickets (note starts with [TỪ CHỐI])
            const { data: tickets, error } = await supabase
                .from('import_tickets')
                .select('*')
                .like('note', '[TỪ CHỐI]%')
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) return res.json(createResponse(true, error.message));
            return res.json(createResponse(false, 'OK', tickets || []));
        }

        if (type === 'import') {
            // Only show completed (not yet confirmed) imports
            // Exclude tickets already confirmed (note starts with [XÁC NHẬN])
            const { data: tickets, error } = await supabase
                .from('import_tickets')
                .select('*')
                .eq('status', 'completed')
                .not('note', 'like', '[XÁC NHẬN]%')
                .order('created_at', { ascending: false });

            if (error) return res.json(createResponse(true, error.message));

            // Enrich merged imports with source_order_nos
            const importList = tickets || [];
            const mergedNos = [...new Set(importList.filter(t => t.merged_order_no).map(t => t.merged_order_no))];
            if (mergedNos.length > 0) {
                try {
                    const { data: mergedLogs } = await supabase
                        .from('merged_orders')
                        .select('merged_no, source_order_nos')
                        .in('merged_no', mergedNos);
                    if (mergedLogs) {
                        const mergedMap = {};
                        mergedLogs.forEach(m => { mergedMap[m.merged_no] = m.source_order_nos || []; });
                        importList.forEach(t => {
                            if (t.merged_order_no && mergedMap[t.merged_order_no]) {
                                t.source_order_nos = mergedMap[t.merged_order_no];
                            }
                        });
                    }
                } catch (e) { console.error('Enrich import merged error:', e.message); }
            }

            return res.json(createResponse(false, 'OK', importList));
        }

        if (type === 'approved') {
            // Show recently approved orders (admin_approved = true)
            const { data: orders, error } = await supabase
                .from('orders')
                .select('*')
                .eq('admin_approved', true)
                .not('sale_order_no', 'is', null)
                .neq('sale_order_no', '')
                .order('sale_order_date', { ascending: false })
                .limit(50);

            if (error) return res.json(createResponse(true, error.message));

            const mapped = (orders || []).map(o => {
                // Priority: cart (actual delivery) > sale_order_product_mappings (original MISA)
                let products = [];
                try {
                    const cartData = o.cart;
                    if (cartData && Array.isArray(cartData) && cartData.length > 0) {
                        products = cartData;
                    } else if (typeof o.sale_order_product_mappings === 'string') {
                        products = JSON.parse(o.sale_order_product_mappings);
                    } else if (Array.isArray(o.sale_order_product_mappings)) {
                        products = o.sale_order_product_mappings;
                    }
                } catch (e) { }
                return { ...o, products };
            });

            return res.json(createResponse(false, 'OK', mapped));
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
            // Parse sale_order_product_mappings (contains actual delivery qty after driver completion)
            let products = [];
            try {
                if (typeof o.sale_order_product_mappings === 'string') {
                    products = JSON.parse(o.sale_order_product_mappings);
                } else if (Array.isArray(o.sale_order_product_mappings)) {
                    products = o.sale_order_product_mappings;
                }
            } catch (e) { }
            return { ...o, products };
        });

        // Enrich merged orders with source_order_nos (list of all order codes in the merged trip)
        const mergedNos = [...new Set(mapped.filter(o => o.merged_order_no).map(o => o.merged_order_no))];
        if (mergedNos.length > 0) {
            try {
                const { data: mergedLogs } = await supabase
                    .from('merged_orders')
                    .select('merged_no, source_order_nos')
                    .in('merged_no', mergedNos);

                if (mergedLogs) {
                    const mergedMap = {};
                    mergedLogs.forEach(m => { mergedMap[m.merged_no] = m.source_order_nos || []; });
                    mapped.forEach(o => {
                        if (o.merged_order_no && mergedMap[o.merged_order_no]) {
                            o.source_order_nos = mergedMap[o.merged_order_no];
                        }
                    });
                }
            } catch (mergedErr) {
                console.error('Enrich merged orders error:', mergedErr.message);
            }
        }

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


        // Sync to MISA - preserve current order status (skip E-prefix local orders)
        const fullOrder = await db.getOrder(id);
        const editOrderNo = fullOrder?.sale_order_no || fullOrder?.soDon || id;
        const isLocalEditOrder = String(editOrderNo).startsWith('E');

        if (!isLocalEditOrder) {
            try {
                console.log(`📤 Edit Order Sync - Order: ${editOrderNo}, Status: ${fullOrder?.status}`);

                // Map Supabase status to MISA status text
                let misaStatusForEdit = undefined;
                const currentStatus = fullOrder?.status;
                if (currentStatus === 'COMPLETED' || currentStatus === 'Hoàn thành' || currentStatus === 'Đã thực hiện' || currentStatus === 'completed') {
                    misaStatusForEdit = 'Đã thực hiện';
                } else if (currentStatus === 'DELIVERING' || currentStatus === 'Đang thực hiện' || currentStatus === 'Đang giao' || currentStatus === 'in_transit') {
                    misaStatusForEdit = 'Đang thực hiện';
                }

                await updateMisaOrder(editOrderNo, {
                    misa_id: fullOrder?.misa_id,
                    cart: updateData.cart || fullOrder?.cart || [],
                    status: misaStatusForEdit
                });

            } catch (syncErr) {
                console.error('MISA Sync Error on Edit:', syncErr.message);
            }
        }

        // Send Telegram notification about the edit — skip only completed/cancelled orders
        const orderStatus = (existingOrder?.status || '').toLowerCase();
        const isFinishedOrder = ['đã thực hiện', 'hoàn thành', 'completed', 'đã hủy bỏ', 'cancelled'].includes(orderStatus);

        if (!isFinishedOrder) {
            try {
                const { sendTelegramMessage } = await import('../services/telegram.js');
                const updatedOrder = fullOrder || await db.getOrder(id);
                const orderNo = updatedOrder?.sale_order_no || updatedOrder?.soDon || id;
                const customerName = customer || updatedOrder?.account_name || updatedOrder?.khach || '';
                const orderAddress = address || updatedOrder?.shipping_address || updatedOrder?.diaChi || '';

                let msg = `🔴 <b>‼️ ĐƠN HÀNG ĐÃ CHỈNH SỬA ‼️</b>\n`;
                msg += `#${orderNo}\n`;
                msg += `👤 KH: <b>${customerName}</b>\n`;

                // Detect and highlight address change
                const oldAddress = existingOrder?.diaChi || existingOrder?.shipping_address || '';
                const newAddress = address || updatedOrder?.shipping_address || updatedOrder?.diaChi || '';
                if (address !== undefined && oldAddress && newAddress && oldAddress !== newAddress) {
                    msg += `\n📍 <b>ĐỔI ĐỊA CHỈ:</b>\n`;
                    msg += `<blockquote>❌ ${oldAddress}\n✅ ${newAddress}</blockquote>`;
                } else if (newAddress) {
                    msg += `📍 ${newAddress}\n`;
                }

                // Detect and highlight date change
                const oldDate = existingOrder?.ngay || existingOrder?.sale_order_date || '';
                if (date && oldDate && date !== oldDate) {
                    const fmtOld = oldDate ? new Date(oldDate).toLocaleDateString('vi-VN') : oldDate;
                    const fmtNew = new Date(date).toLocaleDateString('vi-VN');
                    msg += `\n📅 <b>ĐỔI NGÀY:</b>\n`;
                    msg += `<blockquote>❌ ${fmtOld}\n✅ ${fmtNew}</blockquote>`;
                }

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

                // Detect and highlight description/note change
                const oldNote = existingOrder?.description || existingOrder?.ghiChu || existingOrder?.misa_note || '';
                const newNote = note || notes || '';
                if (newNote && oldNote !== newNote) {
                    msg += `\n📝 <b>Đổi mô tả:</b>\n`;
                    if (oldNote) {
                        msg += `<blockquote>❌ ${oldNote}\n✅ ${newNote}</blockquote>`;
                    } else {
                        msg += `<blockquote>✅ ${newNote}</blockquote>`;
                    }
                } else if (newNote) {
                    msg += `\n📝 Ghi chú: ${newNote}`;
                }

                // Reply to original order message if available
                const replyId = updatedOrder?.telegram_message_id || null;
                await sendTelegramMessage(msg, 'NOTIFY', replyId);
            } catch (tgErr) {
                console.error('Telegram Edit Notification Error:', tgErr.message);
            }
        }

        // In-app notification for assigned driver (so they see changes in their app)
        if (!isFinishedOrder) {
            try {
                const driverName = fullOrder?.custom_field13 || fullOrder?.taiXe || '';
                if (driverName) {
                    const orderNo = fullOrder?.sale_order_no || fullOrder?.soDon || id;
                    const changeDesc = (note || notes) ? `Mô tả: ${note || notes}` : 'Sản phẩm/địa chỉ đã thay đổi';
                    await createNotification(
                        driverName,
                        'order_edited',
                        '⚠️ Đơn đã chỉnh sửa',
                        `#${orderNo} — ${changeDesc}`,
                        id,
                        orderNo
                    );
                }
            } catch (notifyErr) {
                console.error('In-app edit notification error:', notifyErr.message);
            }
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

        // Get current status for audit log
        const currentOrder = await db.getOrder(id);
        const oldStatus = currentOrder?.status || 'unknown';

        const order = await db.updateOrder(id, {
            taiXe: driverName,
            bienSo: plate,
            assistant_name: assistantName,
            delivery_time: deliveryTime,
            status: CONFIG.STATUS.DELIVERING,
            delivery_status: 'Đang giao hàng',
            note: note || '' // Save internal note
        });

        logStatusChange(id, oldStatus, CONFIG.STATUS.DELIVERING, req.body.dispatcherName || 'DISPATCHER', `Assign driver: ${driverName}`);

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

        // Send Telegram notification to DRIVER group (async, don't block response)
        try {
            // === DISPATCH FORMAT: Clean multi-line with full product details ===
            const orderInfo = await db.getOrder(id);
            const poNo = orderInfo?.soDon || orderInfo?.sale_order_no || id;

            // Parse products — full names with qty
            let prods = orderInfo?.products || orderInfo?.sale_order_product_mappings || [];
            if (typeof prods === 'string') { try { prods = JSON.parse(prods); } catch (e) { prods = []; } }
            const prodLines = (Array.isArray(prods) ? prods : []).map(p => {
                const name = (p.name || p.code || '').replace(/^(Hóa chất |HC |Hoá chất )/i, '');
                const qty = Number(p.qty || p.weight_kg || 0);
                return `  • ${name}: ${qty.toLocaleString('vi-VN')} ${p.unit || 'Kg'}`;
            }).filter(Boolean);

            const customer = orderInfo?.khach || orderInfo?.account_name || '';
            const address = orderInfo?.diaChi || orderInfo?.shipping_address || '';
            const drvShort = driverName || '';
            const asstShort = assistantName || '';
            const fmtDate = orderInfo?.sale_order_date ? new Date(orderInfo.sale_order_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }) : '';

            // Build clean multi-line message
            let msg = `🚛 <b>ĐIỀU PHỐI</b> | 📅 ${fmtDate}`;
            if (orderInfo?.merged_order_no) msg += ` | 🔗 ${orderInfo.merged_order_no}`;
            msg += `\n📦 <b>${poNo}</b>`;
            msg += `\n👤 ${customer}`;
            if (address) msg += `\n📍 ${address.substring(0, 80)}`;
            if (prodLines.length > 0) msg += `\n${prodLines.join('\n')}`;
            msg += `\n🚗 <b>${drvShort}</b>${asstShort ? ' + ' + asstShort : ''}${plate ? ' (' + plate + ')' : ''}`;
            if (deliveryTime) msg += ` ⏰ ${deliveryTime}`;
            if (note) msg += `\n📝 ${note}`;

            // Mention tags at the bottom
            const users = await db.getUsers();
            const mentionTags = [];
            const driverObj = users.find(u => u.fullName === driverName || u.username === driverName);
            const driverMention = getTelegramTag(driverObj?.telegramUsername, driverObj?.telegramUserId, driverName);
            if (driverMention) mentionTags.push(driverMention.trim());
            if (assistantName) {
                const assistantObj = users.find(u => u.fullName === assistantName || u.username === assistantName);
                const assistantMention = getTelegramTag(assistantObj?.telegramUsername, assistantObj?.telegramUserId, assistantName);
                if (assistantMention) mentionTags.push(assistantMention.trim());
            }
            if (mentionTags.length > 0) msg += `\n${mentionTags.join(' ')}`;

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

        // Notify dispatchers about new assignment
        try {
            const orderNo = fullOrder?.soDon || fullOrder?.sale_order_no || id;
            const customer = fullOrder?.khach || fullOrder?.account_name || '';
            await createNotification(
                'DISPATCHER',
                'order_assigned',
                '🚛 Đơn hàng mới',
                `#${orderNo} — ${customer} → ${driverName}`,
                id,
                orderNo
            );
        } catch (e) { console.error('Dispatcher assign notification error:', e.message); }

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

// PUT /api/orders/:id/unassign - Cancel dispatch (hủy điều phối)
router.put('/:id/unassign', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        console.log(`\n⚠️ UNASSIGN ORDER - ID: ${id}, reason: ${reason || 'Không có lý do'}`);

        // Get order info first
        const order = await db.getOrder(id);
        if (!order) {
            return res.json(createResponse(true, 'Không tìm thấy đơn hàng!'));
        }

        // Check if order is already completed
        const currentStatus = String(order.status || '').toLowerCase();
        if (currentStatus === 'completed' || currentStatus === 'đã thực hiện') {
            return res.json(createResponse(true, 'Không thể hủy điều phối đơn đã hoàn thành!'));
        }

        const previousDriver = order.taiXe || order.driver_name || '';
        const previousPlate = order.bienSo || order.plate || '';
        const orderNo = order.soDon || order.sale_order_no || id;

        // 1. Delete driver assignments


        const { data: deletedAssigns } = await supabase
            .from('order_driver_assignments')
            .delete()
            .or(`order_id.eq.${id},order_id.eq.${orderNo}`)
            .select();
        console.log(`🗑️ Deleted ${deletedAssigns?.length || 0} driver assignments`);

        // 2. Reset order status to pending
        await db.updateOrder(id, {
            taiXe: '',
            bienSo: '',
            assistant_name: '',
            delivery_time: '',
            status: CONFIG.STATUS.NEW,
            delivery_status: CONFIG.STATUS.NEW,
            note: reason ? `[HỦY ĐIỀU PHỐI] ${reason}` : '[HỦY ĐIỀU PHỐI]'
        });
        logStatusChange(id, order.status, CONFIG.STATUS.NEW, req.body.userName || 'DISPATCHER', `Unassign driver: ${previousDriver}. Reason: ${reason || 'N/A'}`);
        console.log(`✅ Order ${orderNo} reset to ${CONFIG.STATUS.NEW}`);

        // 3. Sync to MISA
        try {
            const syncResult = await updateMisaOrder(order.sale_order_no || id, {
                misa_id: order.misa_id,
                delivery_status: CONFIG.STATUS.NEW,
                status: CONFIG.STATUS.NEW,
                driver: '',
                plate: '',
                cart: order.cart || order.products || []
            });
            if (syncResult.success) {
                console.log(`✅ MISA synced: order ${orderNo} -> Mới`);
            }
        } catch (misaErr) {
            console.error('MISA sync error during unassign:', misaErr.message);
        }

        // 4. Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            let msg = `⚠️ <b>ĐÃ HỦY ĐIỀU PHỐI</b>\n`;
            msg += `📦 <b>#${orderNo}</b>\n`;
            msg += `🏢 ${order.khach || order.account_name || 'N/A'}\n`;
            if (previousDriver) msg += `🚗 TX cũ: ${previousDriver}${previousPlate ? ` (${previousPlate})` : ''}\n`;
            if (reason) msg += `📝 Lý do: ${reason}\n`;
            msg += `🔄 Đơn đã về trạng thái <b>${CONFIG.STATUS.NEW}</b>`;
            await sendTelegramMessage(msg, 'DRIVER');
        } catch (tgErr) {
            console.error('Telegram unassign error:', tgErr.message);
        }

        res.json(createResponse(false, `Đã hủy điều phối đơn #${orderNo}!`));

    } catch (e) {
        console.error('Unassign order error:', e);
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// PUT /api/orders/:id/edit-assignment - Edit driver name & plate for external driver assignments
// Allows updating external driver info without re-dispatching the entire order
router.put('/:id/edit-assignment', async (req, res) => {
    try {
        const { id } = req.params;
        const { assignment_id, driver_name, plate } = req.body;

        if (!assignment_id) {
            return res.json(createResponse(true, 'Thiếu assignment_id!'));
        }
        if (!driver_name) {
            return res.json(createResponse(true, 'Vui lòng nhập tên tài xế!'));
        }

        console.log(`\n✏️ EDIT ASSIGNMENT - Order: ${id}, Assignment: ${assignment_id}`);
        console.log(`   New driver: ${driver_name}, plate: ${plate}`);




        // Verify assignment exists and belongs to this order
        const { data: assignment, error: lookupErr } = await supabase
            .from('order_driver_assignments')
            .select('id, order_id, driver_name, plate, status')
            .eq('id', assignment_id)
            .single();

        if (lookupErr || !assignment) {
            return res.json(createResponse(true, 'Không tìm thấy phân công!'));
        }

        // Don't allow editing completed assignments
        if (assignment.status === 'completed') {
            return res.json(createResponse(true, 'Không thể chỉnh sửa phân công đã hoàn thành!'));
        }

        const oldDriverName = assignment.driver_name;
        const oldPlate = assignment.plate;

        // Update assignment
        const { error: updateErr } = await supabase
            .from('order_driver_assignments')
            .update({
                driver_name: driver_name.trim(),
                plate: (plate || '').trim()
            })
            .eq('id', assignment_id);

        if (updateErr) {
            return res.json(createResponse(true, 'Lỗi cập nhật: ' + updateErr.message));
        }

        // Also update the order's main driver fields if this is the primary assignment
        // (first/only assignment determines order-level driver)
        const { data: allAssignments } = await supabase
            .from('order_driver_assignments')
            .select('id, driver_name, plate')
            .eq('order_id', assignment.order_id)
            .order('created_at', { ascending: true });

        if (allAssignments && allAssignments.length > 0) {
            const primary = allAssignments[0];
            if (primary.id === assignment_id) {
                // This is the primary driver — sync to order level
                await db.updateOrder(assignment.order_id, {
                    taiXe: driver_name.trim(),
                    bienSo: (plate || '').trim()
                });
                console.log(`✅ Also updated order-level driver: ${driver_name}`);
            }
        }

        // Sync to merged/sister orders — same truck should have same driver info
        try {
            const orderInfo = await db.getOrder(assignment.order_id);
            if (orderInfo?.merged_order_no) {
                const { data: mergedLog } = await supabase
                    .from('merged_orders')
                    .select('source_order_nos')
                    .eq('merged_no', orderInfo.merged_order_no)
                    .single();

                if (mergedLog?.source_order_nos) {
                    const currentNo = orderInfo.soDon || orderInfo.sale_order_no || assignment.order_id;
                    const sisters = mergedLog.source_order_nos.filter(no => no !== currentNo);

                    for (const sisterNo of sisters) {
                        // Update assignment for sister order (match by driver name to find the right one)
                        const { data: sisterAssigns } = await supabase
                            .from('order_driver_assignments')
                            .select('id, driver_name, status')
                            .eq('order_id', sisterNo)
                            .eq('driver_name', oldDriverName)
                            .neq('status', 'completed');

                        if (sisterAssigns) {
                            for (const sa of sisterAssigns) {
                                await supabase.from('order_driver_assignments').update({
                                    driver_name: driver_name.trim(),
                                    plate: (plate || '').trim()
                                }).eq('id', sa.id);
                            }
                        }

                        // Also update order-level driver
                        const sisterOrder = await db.getOrder(sisterNo);
                        if (sisterOrder && sisterOrder.taiXe === oldDriverName) {
                            await db.updateOrder(sisterNo, {
                                taiXe: driver_name.trim(),
                                bienSo: (plate || '').trim()
                            });
                        }

                        console.log(`🔗 Synced driver to sister order: ${sisterNo}`);
                    }
                }
            }
        } catch (mergeErr) {
            console.error('Merge sync error (non-critical):', mergeErr.message);
        }

        console.log(`✅ Assignment ${assignment_id} updated: ${oldDriverName} → ${driver_name}`);
        res.json(createResponse(false, `Đã cập nhật tài xế: ${driver_name}!`));

    } catch (e) {
        console.error('Edit assignment error:', e);
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// PUT /api/orders/:id/start - Driver starts order (supports multi-driver)
router.put('/:id/start', async (req, res) => {
    try {
        const { id } = req.params;
        const { assignment_id } = req.body; // Optional: for multi-driver orders

        // If multi-driver order, update assignment status
        if (assignment_id) {



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
            assignment_id,
            // Flag: client will send images via add-proof-images (skip text-only Telegram)
            hasImages
        } = req.body;

        console.log(`\n🏁 COMPLETE ORDER - ID: ${id}`);
        console.log(`📦 Request body keys:`, Object.keys(req.body));
        console.log(`🔑 assignment_id: ${assignment_id || 'NONE'}`);
        console.log(`🛒 cart length: ${cart?.length || 0}, products length: ${products?.length || 0}`);
        console.log(`👤 driver_name: ${driver_name}, admin_completed: ${admin_completed}`);




        // PERF: Single getOrder() call — reused everywhere
        let orderInfo = null;
        let alreadyCompleted = false;
        try {
            orderInfo = await db.getOrder(id);
            if (orderInfo) {
                const s = (orderInfo.status || '').toLowerCase();
                if (s === 'đã thực hiện' || s === 'completed' || s === 'hoàn thành') {
                    alreadyCompleted = true;
                    console.log(`⚠️ Order ${id} already completed (status: ${orderInfo.status}) — will skip Telegram notification`);
                }
            }
        } catch (e) { /* ignore */ }

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

            const assignUpdate = {
                    status: 'completed',
                    actual_qty: myActualQty,
                    actual_products: actualProducts,
                    local_items: local_items || [],
                    delivery_note: note || delivery_note || '',
                    completed_at: new Date().toISOString()
                };
            // Only set proof_images if provided in body (merged orders send images with completion)
            // For normal orders, images are uploaded separately via add-proof-images endpoint
            if (images && images.length > 0) {
                // Upload to Supabase Storage for fast CDN loading
                const uploadedUrls = await uploadImages(images, id);
                assignUpdate.proof_images = uploadedUrls;
            }
            const { data: updateResult, error: updateErr } = await supabase
                .from('order_driver_assignments')
                .update(assignUpdate)
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

            // PERF: Reuse orderInfo for price lookup
            const originalPriceMap = {};
            (orderInfo?.products || []).forEach(p => {
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

            // For multi-driver orders: ALWAYS combine products from ALL assignments
            // This runs every time a driver completes, so the order accumulates actual quantities
            // - Completed drivers: use actual_products (real delivered quantities)
            // - Not-yet-completed drivers: use assigned_products (dispatch quantities as placeholder)
            if (isMultiDriverOrder && allAssignments.length > 0) {
                console.log(`📦 Combining products from ${allAssignments.length} driver assignments...`);

                const combinedProducts = {};

                allAssignments.forEach(assign => {
                    // Priority: actual_products (completed) > assigned_products (pending)
                    const products = assign.actual_products || assign.assigned_products || [];
                    const source = assign.actual_products ? 'actual' : 'assigned';
                    console.log(`📋 Assignment ${assign.id?.slice(-8)} [${assign.status}]: using ${source}_products (${products.length} items)`);

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
                console.log(`✅ Combined ${updatedProducts.length} products (sum of all drivers):`, updatedProducts.map(p => `${p.name}: ${p.qty}${p.unit}`));
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
                delivery_note: note || delivery_note || '',
                crm_sync_status: 'PENDING_APPROVAL',
                sync_error: null
            });

            // PERF: crm_sync_status already set in merged updateOrder above
            const crmSyncStatus = 'PENDING_APPROVAL';

            // PERF: Send response to driver IMMEDIATELY — move heavy I/O to background
            const orderNo = orderInfo?.soDon || orderInfo?.sale_order_no || id;
            res.json(createResponse(false, 'Đơn của bạn đã hoàn thành!', { ticketId, crmStatus: crmSyncStatus }));

            // BACKGROUND: Warehouse tickets, export ticket, notifications, merged auto-complete
            setImmediate(async () => {
                try {
                    // 0. Upload images to Supabase Storage (CDN) — used by export_ticket + assignment
                    let uploadedUrls = null;
                    if (images && images.length > 0) {
                        try {
                            uploadedUrls = await uploadImages(images, id);
                            console.log(`📸 BG: Uploaded ${uploadedUrls.filter(u => u.startsWith('http')).length}/${images.length} images to CDN`);
                        } catch (uploadErr) {
                            console.warn('BG: Image upload to storage failed, keeping base64:', uploadErr.message);
                        }
                    }

                    // 0a. Create warehouse tickets (moved from blocking path)
                    try {
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
                            if (type === 'NHAP') await db.addDataNhap(data);
                            else await db.addDataXuat(data);
                        }
                    } catch (whErr) { console.error('BG: Warehouse ticket error:', whErr.message); }

                    // 0b. Create Export Ticket in Supabase (moved from blocking path)
                    try {
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
                            images: uploadedUrls || images || []
                        });
                    } catch (etErr) { console.error('BG: Export ticket error:', etErr.message); }

                    // 0c. Update assignment proof images (moved from blocking path)
                    if (images && images.length > 0) {
                        try {
                            const { data: existingAssigns } = await supabase
                                .from('order_driver_assignments')
                                .select('id, status')
                                .or(`order_id.eq.${id},order_id.eq.${orderInfo?.soDon || id}`)
                                .eq('status', 'pending');
                            if (existingAssigns && existingAssigns.length > 0) {
                                for (const assign of existingAssigns) {
                                    await supabase.from('order_driver_assignments').update({
                                        status: 'completed',
                                        proof_images: uploadedUrls || images,
                                        delivery_note: note || delivery_note || '',
                                        completed_at: new Date().toISOString()
                                    }).eq('id', assign.id);
                                }
                            }
                        } catch (assignErr) { console.error('BG: Assignment update error:', assignErr.message); }
                    }
                    // 1. Admin notification
                    try {
                        // Priority: multi-driver names > DB assigned driver > resolved driver > body driver
                        const notifyDriverName = firstDriverName || orderInfo?.taiXe || orderInfo?.custom_field13 || resolvedDriverName || driver_name;
                        await createNotification('ADMIN', 'order_completed', '✅ Đơn hoàn thành',
                            `Đơn #${orderNo} đã được giao bởi ${notifyDriverName}`, id, orderNo);
                    } catch (e) { console.error('Admin notification error:', e.message); }

                    // 1b. Dispatcher notification
                    try {
                        const notifyDriverName2 = firstDriverName || orderInfo?.taiXe || orderInfo?.custom_field13 || resolvedDriverName || driver_name;
                        await createNotification('DISPATCHER', 'order_completed', '✅ Đơn hoàn thành',
                            `Đơn #${orderNo} — ${notifyDriverName2}`, id, orderNo);
                    } catch (e) { console.error('Dispatcher complete notification error:', e.message); }

                    // 2. Telegram notification
                    // If driver has images → SKIP text here (photos+caption sent from add-proof-images)
                    // If no images (admin complete, etc.) → send text notification here
                    if (!alreadyCompleted && !hasImages) {
                        try {
                            const { sendTelegramMessage } = await import('../services/telegram.js');
                            const isImport = type === 'NHAP';
                            const tgGroup = isImport ? 'NHAP' : 'XUAT';
                            const label = isImport ? 'ĐƠN NHẬP HOÀN THÀNH' : 'ĐƠN ĐÃ HOÀN THÀNH';
                            let msg = `✅ <b>${label}</b>\n📦 Mã: <b>#${orderNo}</b>\n`;
                            msg += `👤 ${isImport ? 'NCC' : 'Khách'}: ${orderInfo?.khach || orderInfo?.account_name || 'N/A'}\n`;
                            const orderDriver = orderInfo?.taiXe || orderInfo?.custom_field13 || '';
                            const drvName = isMultiDriverOrder ? firstDriverName : (orderDriver || resolvedDriverName || driver_name || '');
                            const drvPlate = isMultiDriverOrder && firstDriverPlate ? firstDriverPlate : (orderInfo?.bienSo || orderInfo?.custom_field14 || resolvedPlate || plate || '');
                            if (drvName) {
                                const isSenderDriver = !admin_completed && (!sender || sender === drvName);
                                msg += `🚛 TX: ${isSenderDriver ? '<b>' + drvName + '</b>' : drvName}${drvPlate ? ` (${drvPlate})` : ''}\n`;
                            }
                            if (orderInfo?.assistant_name) {
                                const isSenderPX = !admin_completed && sender === orderInfo.assistant_name;
                                msg += `👷 PX: ${isSenderPX ? '<b>' + orderInfo.assistant_name + '</b>' : orderInfo.assistant_name}\n`;
                            }
                            (updatedProducts || orderInfo?.cart || orderInfo?.products || cart || []).forEach(p => {
                                const pName = p.product?.name || p.name || p.product || p.code || '';
                                const pQty = Number(p.weight_kg || p.qty || p.quantity || 0);
                                if (pName) msg += `📦 ${pName} — ${pQty.toLocaleString('vi-VN')} ${p.unit || 'Kg'}\n`;
                            });
                            await sendTelegramMessage(msg, tgGroup);
                            console.log(`📨 Telegram text sent to ${tgGroup} for ${orderNo}`);
                        } catch (tgErr) { console.error('Telegram error:', tgErr.message); }
                    } else if (hasImages) {
                        console.log(`⏳ Skipping Telegram text — images will be sent via add-proof-images`);
                    }

                    // Merged auto-complete DISABLED — drivers complete each order manually
                } catch (bgErr) { console.error('Background task error:', bgErr.message); }
            }); // end setImmediate

            return; // Response already sent
        }

        // ============================================================
        // ADMIN COMPLETE FLOW: Quick complete without detailed cart
        // ============================================================
        console.log(`👔 Admin Complete Flow - Order: ${id}`);

        // Update order status to completed
        const prevOrder = await db.getOrder(id);
        const order = await db.updateOrder(id, {
            status: CONFIG.STATUS.COMPLETED,
            delivery_status: 'Hoàn thành',
            completed_at: new Date().toISOString(),
            delivery_note: delivery_note || '',
            local_items: local_items || [],
            admin_completed: admin_completed || false
        });
        logStatusChange(id, prevOrder?.status, CONFIG.STATUS.COMPLETED, req.body.admin_name || 'ADMIN', 'Admin complete flow');

        if (!order) {
            return res.json(createResponse(true, 'Không tìm thấy đơn hàng!'));
        }

        // Create export ticket for Admin Complete (so images can be added later)
        try {


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
            const tgGroup = isImport ? 'SALES' : 'XUAT'; // Import admin-complete → SALES, Export → XUAT
            const label = isImport ? 'ĐƠN NHẬP HOÀN THÀNH' : 'ĐƠN ĐÃ HOÀN THÀNH';

            let msg = `✅ <b>${label}</b>\n`;
            msg += `📦 Mã: <b>#${orderNo}</b>\n`;
            msg += `👤 ${isImport ? 'NCC' : 'Khách'}: ${fullOrder?.khach || fullOrder?.account_name || 'N/A'}\n`;

            // Driver with plate in parentheses
            const drvPlate = adminResolvedPlate || fullOrder?.bienSo || fullOrder?.custom_field14 || '';
            if (driverDisplay) msg += `🚛 TX: ${driverDisplay}${drvPlate ? ` (${drvPlate})` : ''}\n`;

            // Assistant driver
            const adminAssistant = fullOrder?.assistant_name || '';
            if (adminAssistant) msg += `👷 PX: ${adminAssistant}\n`;

            // Product list
            const adminProdList = fullOrder?.cart || fullOrder?.products || [];
            if (adminProdList.length > 0) {
                adminProdList.forEach(p => {
                    const pName = p.product?.name || p.name || p.product || p.code || '';
                    const pQty = Number(p.weight_kg || p.qty || p.quantity || 0);
                    const pUnit = p.unit || 'Kg';
                    if (pName) msg += `📦 ${pName} — ${pQty.toLocaleString('vi-VN')} ${pUnit}\n`;
                });
            }

            // Try to get proof images from export ticket
            let proofImages = images || [];
            if (proofImages.length === 0) {
                try {

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

        // Merged auto-complete DISABLED — drivers complete each order manually

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




            if (existingMergedNo) {
                // Join existing merged order
                finalMergedOrderNo = existingMergedNo;
                const { data: existingMerged } = await supabase
                    .from('merged_orders')
                    .select('source_order_nos, total_amount')
                    .eq('merged_no', finalMergedOrderNo)
                    .single();

                if (existingMerged) {
                    const allNos = [...new Set([...(existingMerged.source_order_nos || []), currentSaleOrderNo, ...mergeOrderNos])];
                    let totalAmount = Number(existingMerged.total_amount || 0) + Number(currentOrder?.sale_order_amount || 0);

                    await supabase
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
                        const { data: impTicket } = await supabase
                            .from('import_tickets')
                            .select('total_amount')
                            .eq('ticket_no', partnerNo)
                            .single();
                        if (impTicket) totalAmount += Number(impTicket.total_amount || 0);
                    }
                }

                await supabase
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
                    const { data: impTicket } = await supabase
                        .from('import_tickets')
                        .select('id')
                        .eq('ticket_no', partnerNo)
                        .single();
                    if (impTicket) {
                        await supabase
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
            const poNo = orderInfo?.soDon || id;

            // Parse products — full names with qty
            let prods = orderInfo?.products || orderInfo?.sale_order_product_mappings || [];
            if (typeof prods === 'string') { try { prods = JSON.parse(prods); } catch (e) { prods = []; } }
            const prodLines = (Array.isArray(prods) ? prods : []).map(p => {
                const name = (p.name || p.code || '').replace(/^(Hóa chất |HC |Hoá chất )/i, '');
                const qty = Number(p.qty || p.weight_kg || 0);
                return `  • ${name}: ${qty.toLocaleString('vi-VN')} ${p.unit || 'Kg'}`;
            }).filter(Boolean);

            const customer = orderInfo?.khach || orderInfo?.account_name || '';
            const address = orderInfo?.diaChi || orderInfo?.shipping_address || '';

            // Build clean multi-line per driver
            const users = await db.getUsers();
            const mentionTags = [];

            // Header
            const fmtDate = orderInfo?.sale_order_date ? new Date(orderInfo.sale_order_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }) : '';
            let msg = `🚛 <b>ĐIỀU PHỐI</b> | 📅 ${fmtDate}`;
            if (orderInfo?.merged_order_no) msg += ` | 🔗 ${orderInfo.merged_order_no}`;
            msg += `\n📦 <b>${poNo}</b>`;
            msg += `\n👤 ${customer}`;
            if (address) msg += `\n📍 ${address.substring(0, 80)}`;
            if (prodLines.length > 0) msg += `\n${prodLines.join('\n')}`;

            // Driver list
            assignments.forEach((a, i) => {
                const driverObj = users.find(u => u.fullName === a.driver_name || u.username === a.driver_name);
                const driverMention = getTelegramTag(driverObj?.telegramUsername, driverObj?.telegramUserId, a.driver_name);
                if (driverMention) mentionTags.push(driverMention.trim());
                if (a.assistant_name) {
                    const assistantObj = users.find(u => u.fullName === a.assistant_name || u.username === a.assistant_name);
                    const assistantMention = getTelegramTag(assistantObj?.telegramUsername, assistantObj?.telegramUserId, a.assistant_name);
                    if (assistantMention) mentionTags.push(assistantMention.trim());
                }
                const qtyStr = assignments.length > 1 ? ` ${Number(a.qty).toLocaleString('vi-VN')}kg` : '';
                const asstStr = a.assistant_name ? ' + ' + a.assistant_name : '';
                const plateStr = a.plate ? ` (${a.plate})` : '';
                msg += `\n🚗 <b>${a.driver_name}</b>${qtyStr}${asstStr}${plateStr}`;
            });

            // Show old drivers if this is a change
            if (hadPreviousAssignments && previousDrivers.length > 0) {
                msg += `\n⚠️ Cũ: ${previousDrivers.join(', ')}`;
            }

            if (mentionTags.length > 0) msg += `\n${mentionTags.join(' ')}`;

            console.log(`📤 Telegram compact msg: ${msg}`);
            await sendTelegramMessage(msg, 'DRIVER');
            console.log(`✅ Telegram DRIVER notification sent for order ${id}`);
        } catch (tgErr) {
            console.error('❌ Telegram Error in driver assign:', tgErr.message);
        }

        // In-app + FCM push notification to each assigned driver
        try {
            const orderInfo2 = await db.getOrder(id);
            const poNo2 = orderInfo2?.soDon || orderInfo2?.sale_order_no || id;
            const customer2 = orderInfo2?.khach || orderInfo2?.account_name || '';
            
            // Notify each unique driver
            const notifiedDrivers = new Set();
            for (const a of assignments) {
                if (a.driver_name && !notifiedDrivers.has(a.driver_name)) {
                    notifiedDrivers.add(a.driver_name);
                    await createNotification(
                        a.driver_name,
                        'order_assigned',
                        '🚛 Đơn hàng mới',
                        `#${poNo2} - ${customer2}`,
                        id,
                        poNo2
                    );
                    console.log(`📬 Dispatch FCM sent to driver: ${a.driver_name}`);
                }
            }
        } catch (notifyErr) {
            console.error('Dispatch FCM notification error:', notifyErr.message);
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



        // Resolve order UUID and soDon once
        const orderInfo = await db.getOrder(id);
        const orderUuid = orderInfo?.id || id;
        const orderSoDon = orderInfo?.soDon || orderInfo?.sale_order_no || id;
        const lookupIds = [...new Set([orderUuid, orderSoDon, id])]; // Deduplicate IDs

        // Run BOTH lookups in parallel for speed
        const [assignResult, ticketResult] = await Promise.all([
            // 1. order_driver_assignments
            supabase
                .from('order_driver_assignments')
                .select('driver_name, proof_images')
                .in('order_id', lookupIds)
                .order('created_at', { ascending: false }),
            // 2. export_tickets
            supabase
                .from('export_tickets')
                .select('ticket_no, images, created_at, driver_name')
                .or(lookupIds.map(lid => `order_id.eq.${lid},order_no.eq.${lid}`).join(','))
                .order('created_at', { ascending: false })
                .limit(1)
        ]);

        const allImages = [];
        const seen = new Set();

        // Collect from assignments
        if (assignResult.data) {
            for (const a of assignResult.data) {
                if (Array.isArray(a.proof_images)) {
                    for (const img of a.proof_images) {
                        if (!seen.has(img)) { seen.add(img); allImages.push(img); }
                    }
                }
            }
        }

        // Collect from export ticket
        const ticket = ticketResult.data?.[0];
        if (ticket?.images && Array.isArray(ticket.images)) {
            for (const img of ticket.images) {
                if (!seen.has(img)) { seen.add(img); allImages.push(img); }
            }
        }

        res.json({
            error: false,
            images: allImages,
            ticket_no: ticket?.ticket_no || null,
            created_at: ticket?.created_at || null,
            driver_name: ticket?.driver_name || null
        });
    } catch (e) {
        console.error('Get proof images error:', e.message);
        res.json({ error: false, images: [] });
    }
});

// POST /api/orders/:id/add-proof-images - Add more proof images to completed order
router.post('/:id/add-proof-images', async (req, res) => {
    try {
        const { id } = req.params;
        const { images, sendTelegram } = req.body;

        console.log(`📸 Add proof images for order: ${id}, images count: ${images?.length || 0}, sendTelegram: ${!!sendTelegram}`);

        if (!images || !Array.isArray(images) || images.length === 0) {
            return res.json(createResponse(true, 'Vui lòng chọn ít nhất 1 ảnh!'));
        }

        // STEP 1: Save base64 to DB IMMEDIATELY (fast, <500ms)
        // Driver gets instant response — no waiting for storage upload

        // Save to order_driver_assignments
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
            // No export ticket exists - create one with images
            const orderInfo = await db.getOrder(id);
            const ts = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);

            await supabase.from('export_tickets').insert({
                ticket_no: 'X' + ts,
                order_id: id,
                order_no: orderInfo?.soDon || id,
                customer_name: orderInfo?.khach || orderInfo?.account_name || '',
                driver_name: orderInfo?.taiXe || 'Admin',
                plate: orderInfo?.bienSo || '',
                warehouse: 'LT1',
                products: orderInfo?.cart || [],
                images: images.slice(0, 10),
                note: 'Ảnh bổ sung'
            });

            console.log(`✅ Saved ${images.length} images to DB`);
            res.json(createResponse(false, `Đã thêm ${images.length} ảnh!`));
        } else {
            // Ticket exists - append
            const existingImages = ticket.images || [];
            const totalAllowed = 10 - existingImages.length;

            if (totalAllowed <= 0) {
                return res.json(createResponse(true, 'Đã đạt giới hạn 10 ảnh!'));
            }

            const newImages = images.slice(0, totalAllowed);
            const updatedImages = [...existingImages, ...newImages];

            await supabase
                .from('export_tickets')
                .update({ images: updatedImages })
                .eq('id', ticket.id);

            console.log(`✅ Saved ${newImages.length} images to DB (${updatedImages.length}/10)`);
            res.json(createResponse(false, `Đã thêm ${newImages.length} ảnh (${updatedImages.length}/10)!`));
        }

        // STEP 2: BACKGROUND — Upload to Supabase Storage, replace base64, send Telegram
        // This runs AFTER response is sent to driver (fire-and-forget)
        setImmediate(async () => {
            // 2a. Try CDN upload (non-blocking, best-effort)
            try {
                const imageUrls = await uploadImages(images, id);
                const cdnCount = imageUrls.filter(u => u.startsWith('http')).length;

                if (cdnCount > 0) {
                    // Replace base64 in DB with CDN URLs
                    try {
                        const { data: freshTicket } = await supabase
                            .from('export_tickets')
                            .select('id, images')
                            .eq('order_id', id)
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .single();

                        if (freshTicket) {
                            const currentImages = freshTicket.images || [];
                            const updatedWithUrls = currentImages.map(img => {
                                if (img.startsWith('http')) return img;
                                const idx = images.indexOf(img);
                                return (idx >= 0 && imageUrls[idx]?.startsWith('http')) ? imageUrls[idx] : img;
                            });

                            await supabase.from('export_tickets')
                                .update({ images: updatedWithUrls })
                                .eq('id', freshTicket.id);

                            console.log(`📸 BG: Replaced ${cdnCount} base64 with CDN URLs for order ${id}`);
                        }
                    } catch (bgErr) {
                        console.warn('BG: CDN URL replacement failed:', bgErr.message);
                    }
                } else {
                    console.warn(`⚠️ BG: CDN upload returned 0 URLs for order ${id} — keeping base64`);
                }
            } catch (storageErr) {
                console.warn('BG: Storage upload failed (base64 preserved):', storageErr.message);
            }

            // 2b. Send Telegram photos — ALWAYS runs when sendTelegram=true
            // Uses ALL images from ticket (includes previously uploaded images)
            if (sendTelegram) {
                try {
                    const { sendTelegramPhotos } = await import('../services/telegram.js');
                    const orderInfo = await db.getOrder(id);
                    const orderNo = orderInfo?.soDon || orderInfo?.sale_order_no || id;
                    const customer = orderInfo?.khach || orderInfo?.account_name || '';
                    const driverName = orderInfo?.taiXe || orderInfo?.custom_field13 || '';
                    const drvPlate = orderInfo?.bienSo || orderInfo?.custom_field14 || '';
                    const assistant = orderInfo?.assistant_name || '';

                    let caption = `✅ <b>ĐƠN ĐÃ HOÀN THÀNH</b>\n📦 Mã: <b>#${orderNo}</b>\n`;
                    caption += `👤 Khách: <b>${customer}</b>\n`;
                    if (driverName) caption += `🚛 TX: ${driverName}${drvPlate ? ` (${drvPlate})` : ''}\n`;
                    if (assistant) caption += `👷 PX: ${assistant}\n`;
                    (orderInfo?.products || orderInfo?.cart || []).forEach(p => {
                        const pName = p.name || p.code || '';
                        const pQty = Number(p.qty || 0);
                        if (pName) caption += `📦 ${pName} — ${pQty.toLocaleString('vi-VN')} ${p.unit || 'Kg'}\n`;
                    });

                    // Fetch ALL images from the ticket (includes CDN URLs + any remaining base64)
                    const { data: finalTicket } = await supabase.from('export_tickets')
                        .select('images').eq('order_id', id)
                        .order('created_at', { ascending: false }).limit(1).single();

                    const allImages = (finalTicket?.images || images)
                        .filter(i => i && !i.startsWith('blob:'));

                    if (allImages.length > 0) {
                        await sendTelegramPhotos(allImages, caption, 'XUAT');
                        console.log(`📨 Telegram: ${allImages.length} proof photos sent for ${orderNo}`);
                    } else {
                        console.warn(`⚠️ No valid images for Telegram on order ${orderNo}`);
                    }
                } catch (tgErr) {
                    console.error('BG: Telegram photo send failed:', tgErr.message);
                }
            }
        });

    } catch (e) {
        console.error('Add proof images error:', e.message);
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// DELETE /api/orders/:id/proof-images/:imageIndex - Remove specific proof image
// Searches BOTH export_tickets AND order_driver_assignments (matching GET logic)
router.delete('/:id/proof-images/:imageIndex', async (req, res) => {
    try {
        const { id, imageIndex } = req.params;
        const idx = parseInt(imageIndex);

        if (isNaN(idx) || idx < 0) {
            return res.json(createResponse(true, 'Chỉ số ảnh không hợp lệ!'));
        }




        // Resolve order IDs (same logic as GET proof-images)
        const orderInfo = await db.getOrder(id);
        const orderUuid = orderInfo?.id || id;
        const orderSoDon = orderInfo?.soDon || orderInfo?.sale_order_no || id;
        const lookupIds = [...new Set([orderUuid, orderSoDon, id])];

        // Rebuild the same allImages list as GET (to find the image at idx)
        const [assignResult, ticketResult] = await Promise.all([
            supabase
                .from('order_driver_assignments')
                .select('id, driver_name, proof_images')
                .in('order_id', lookupIds)
                .order('created_at', { ascending: false }),
            supabase
                .from('export_tickets')
                .select('id, ticket_no, images')
                .or(lookupIds.map(lid => `order_id.eq.${lid},order_no.eq.${lid}`).join(','))
                .order('created_at', { ascending: false })
                .limit(1)
        ]);

        // Build ordered list with source tracking
        const allImages = []; // { url, source: 'assignment'|'ticket', sourceId, indexInSource }
        const seen = new Set();

        // 1. assignment images first (same order as GET)
        if (assignResult.data) {
            for (const a of assignResult.data) {
                if (Array.isArray(a.proof_images)) {
                    a.proof_images.forEach((img, i) => {
                        if (!seen.has(img)) {
                            seen.add(img);
                            allImages.push({ url: img, source: 'assignment', sourceId: a.id, indexInSource: i });
                        }
                    });
                }
            }
        }

        // 2. export ticket images
        const ticket = ticketResult.data?.[0];
        if (ticket?.images && Array.isArray(ticket.images)) {
            ticket.images.forEach((img, i) => {
                if (!seen.has(img)) {
                    seen.add(img);
                    allImages.push({ url: img, source: 'ticket', sourceId: ticket.id, indexInSource: i });
                }
            });
        }

        if (idx >= allImages.length) {
            return res.json(createResponse(true, 'Ảnh không tồn tại!'));
        }

        const target = allImages[idx];
        console.log(`🗑️ Deleting image #${idx}: source=${target.source}, sourceId=${target.sourceId}`);

        // Remove from the correct source
        if (target.source === 'assignment') {
            // Remove from order_driver_assignments.proof_images
            const { data: assign } = await supabase
                .from('order_driver_assignments')
                .select('proof_images')
                .eq('id', target.sourceId)
                .single();

            if (assign) {
                const updatedImages = (assign.proof_images || []).filter(img => img !== target.url);
                await supabase
                    .from('order_driver_assignments')
                    .update({ proof_images: updatedImages })
                    .eq('id', target.sourceId);
                console.log(`✅ Removed from assignment ${target.sourceId} (${updatedImages.length} remaining)`);
            }
        } else {
            // Remove from export_tickets.images
            const updatedImages = (ticket.images || []).filter(img => img !== target.url);
            await supabase
                .from('export_tickets')
                .update({ images: updatedImages })
                .eq('id', target.sourceId);
            console.log(`✅ Removed from ticket ${target.sourceId} (${updatedImages.length} remaining)`);
        }

        res.json(createResponse(false, `Đã xóa ảnh (còn ${allImages.length - 1} ảnh)!`));

    } catch (e) {
        console.error('Delete proof image error:', e.message);
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// GET /api/orders/:id/chat - Get chat messages
router.get('/:id/chat', async (req, res) => {
    try {
        const { id } = req.params;



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

// POST /api/orders/:id/chat - Send chat message (legacy endpoint)
router.post('/:id/chat', async (req, res) => {
    try {
        const { id } = req.params;
        const { sender_name, sender_role, message, image } = req.body;

        const { error } = await supabase.from('order_messages').insert({
            order_id: id,
            sender_name,
            sender_role,
            message,
            image
        });

        if (error) return res.json(createResponse(true, error.message));

        // In-app notification for chat
        try {
            const senderRoleUpper = (sender_role || '').toUpperCase();
            const msgPreview = (message || '📷 Ảnh').substring(0, 60);

            if (senderRoleUpper === 'DRIVER' || senderRoleUpper === 'TÀI XẾ') {
                await createNotification('ADMIN', 'message', `💬 ${sender_name}`, `#${id}: ${msgPreview}`, id, id);
                // Also notify dispatchers when driver sends chat
                await createNotification('DISPATCHER', 'message', `💬 ${sender_name}`, `#${id}: ${msgPreview}`, id, id);
            } else {
                // Find driver to notify
                const { data: ord } = await supabase.from('orders').select('custom_field13').eq('id', id).single();
                let driverName = ord?.custom_field13;
                if (!driverName) {
                    const { data: ord2 } = await supabase.from('orders').select('custom_field13').eq('sale_order_no', id).single();
                    driverName = ord2?.custom_field13;
                }
                if (driverName) {
                    await createNotification(driverName, 'message', `💬 ${sender_name}`, `#${id}: ${msgPreview}`, id, id);
                }
                // Also notify dispatchers when admin/sales sends chat
                await createNotification('DISPATCHER', 'message', `💬 ${sender_name}`, `#${id}: ${msgPreview}`, id, id);
            }
        } catch (notifyErr) {
            console.error('Chat notification error:', notifyErr.message);
        }

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




        const orderNo = await generateOrderCode('E'); // E2603001 format

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



        // Get order
        const order = await db.getOrder(id);
        if (!order) return res.json(createResponse(true, 'Không tìm thấy đơn hàng'));

        // Build list of all IDs to search for images
        const soDon = order.soDon || order.sale_order_no || id;
        const searchIds = new Set([id, soDon]);

        // For merged orders: also search sibling order IDs and the merged order ID
        const mergedNo = order.merged_order_no;
        if (mergedNo) {
            searchIds.add(mergedNo);
            // Find all sibling orders in the same merge group
            const { data: siblings } = await supabase
                .from('orders')
                .select('id, sale_order_no')
                .eq('merged_order_no', mergedNo);
            if (siblings) {
                for (const s of siblings) {
                    searchIds.add(s.id);
                    if (s.sale_order_no) searchIds.add(s.sale_order_no);
                }
            }
        }

        // Build OR filter string for all IDs
        const allIds = [...searchIds].filter(Boolean);
        const orAssignFilter = allIds.map(x => `order_id.eq.${x}`).join(',');
        const orExportFilter = allIds.map(x => `order_id.eq.${x}`).join(',') + ',' + allIds.map(x => `order_no.eq.${x}`).join(',');
        const orImportFilter = allIds.map(x => `order_id.eq.${x}`).join(',');

        let proofImages = [];
        const existingUrls = new Set();

        // 1. Check order_driver_assignments
        const { data: assigns } = await supabase
            .from('order_driver_assignments')
            .select('id, driver_name, proof_images, actual_products, completed_at, delivery_note, actual_qty, status')
            .or(orAssignFilter);

        if (assigns) {
            for (const a of assigns) {
                if (a.proof_images?.length > 0) {
                    for (const img of a.proof_images) {
                        if (!existingUrls.has(img)) {
                            existingUrls.add(img);
                            proofImages.push({ url: img, driver: a.driver_name });
                        }
                    }
                }
            }
        }

        // 2. Check export_tickets
        const { data: tickets } = await supabase
            .from('export_tickets')
            .select('images, ticket_no')
            .or(orExportFilter);

        if (tickets) {
            for (const t of tickets) {
                if (t.images?.length > 0) {
                    for (const img of t.images) {
                        if (!existingUrls.has(img)) {
                            existingUrls.add(img);
                            proofImages.push({ url: img, ticket: t.ticket_no });
                        }
                    }
                }
            }
        }

        // 3. Check import_tickets
        const { data: importTickets } = await supabase
            .from('import_tickets')
            .select('images, ticket_no')
            .or(orImportFilter);

        if (importTickets) {
            for (const t of importTickets) {
                if (t.images?.length > 0) {
                    for (const img of t.images) {
                        if (!existingUrls.has(img)) {
                            existingUrls.add(img);
                            proofImages.push({ url: img, ticket: t.ticket_no });
                        }
                    }
                }
            }
        }

        // Enrich order with source_order_nos for merged display
        if (mergedNo) {
            try {
                const { data: mergedLog } = await supabase
                    .from('merged_orders')
                    .select('source_order_nos')
                    .eq('merged_no', mergedNo)
                    .single();
                if (mergedLog?.source_order_nos) {
                    order.source_order_nos = mergedLog.source_order_nos;
                }
            } catch (e) { }
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

        // Sales confirm: set checkmark + update delivery status
        const updateData = {
            sale_confirmed: true,
            sale_confirmed_at: new Date().toISOString(),
            sale_confirmed_by: confirmed_by || 'sales',
            delivery_status: 'Đã giao hàng'
        };

        if (products && Array.isArray(products)) {
            updateData.sale_order_product_mappings = products;
        }

        await db.updateOrder(id, updateData);

        // Sync to MISA CRM — SKIP for E-prefix orders (local Supabase only)
        const orderNo = order.soDon || order.sale_order_no || id;
        const isLocalOrder = String(orderNo).startsWith('E');
        let crmStatus = isLocalOrder ? 'SKIP' : 'OK';

        if (!isLocalOrder) {
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
                    console.error('MISA confirm sync failed:', crmStatus);
                }
            } catch (syncErr) {
                crmStatus = syncErr.message;
                console.error('MISA confirm sync error:', syncErr.message);
            }
        }

        // Telegram: notify sales confirmed
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            let msg = `☑️ <b>SALES XÁC NHẬN ĐƠN</b>\n`;
            msg += `📦 <b>#${orderNo}</b>\n`;
            msg += `👤 ${order.khach || order.account_name || 'N/A'}\n`;
            msg += `👔 Bởi: ${confirmed_by || 'sales'}`;
            if (!isLocalOrder) {
                msg += `\n📤 CRM: ${crmStatus === 'OK' ? '✅ Đã đồng bộ' : '⚠️ ' + crmStatus}`;
            }
            await sendTelegramMessage(msg, 'NOTIFY');
        } catch (tgErr) {
            console.error('Telegram confirm error:', tgErr.message);
        }

        // In-app notification for the assigned driver
        try {
            const driverName = order.taiXe || order.custom_field13 || '';
            if (driverName) {
                await createNotification(
                    driverName,
                    'order_completed',
                    '✅ Đơn đã xác nhận',
                    `#${orderNo} — ${order.khach || order.account_name || ''} đã được duyệt`,
                    id,
                    orderNo
                );
            }
        } catch (notifyErr) {
            console.error('In-app confirm notification error:', notifyErr.message);
        }

        // Notify dispatchers about confirmation
        try {
            await createNotification(
                'DISPATCHER',
                'order_completed',
                '✅ Đơn đã xác nhận',
                `#${orderNo} — ${order.khach || order.account_name || ''}`,
                id,
                orderNo
            );
        } catch (e) { console.error('Dispatcher confirm notification error:', e.message); }

        res.json(createResponse(false, isLocalOrder ? 'Đã xác nhận!' : 'Đã xác nhận & đồng bộ MISA!', { crmStatus }));
    } catch (e) {
        console.error('confirm error:', e.message);
        res.json(createResponse(true, e.message));
    }
});

// POST /api/orders/:id/approve - Admin duyệt → sync to MISA CRM
router.post('/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { approved_by, products: editedProducts } = req.body;

        const order = await db.getOrder(id);
        if (!order) return res.json(createResponse(true, 'Không tìm thấy đơn hàng'));

        // Update admin approval fields + delivery status
        const updateData = {
            admin_approved: true,
            admin_approved_at: new Date().toISOString(),
            admin_approved_by: approved_by || 'admin',
            delivery_status: 'Đã giao hàng'
        };

        // If admin sent edited products, update them BEFORE MISA sync
        if (editedProducts && Array.isArray(editedProducts) && editedProducts.length > 0) {
            // Preserve price/total from original products
            const originalPriceMap = {};
            (order.products || []).forEach(p => {
                originalPriceMap[p.code] = { price: Number(p.price || 0), total: Number(p.total || 0) };
            });

            updateData.cart = editedProducts.map(p => ({
                code: p.code || '',
                name: p.name || '',
                qty: Number(p.qty || 0),
                unit: p.unit || 'Kg',
                price: originalPriceMap[p.code]?.price || Number(p.price || 0),
                total: (originalPriceMap[p.code]?.price || Number(p.price || 0)) * Number(p.qty || 0) || originalPriceMap[p.code]?.total || 0
            }));
            console.log(`📝 Admin edited products for ${id}:`, updateData.cart.map(p => `${p.name}: ${p.qty} ${p.unit}`));
        }

        // If sales hasn't confirmed yet, auto-confirm (admin can do both)
        if (!order.sale_confirmed) {
            updateData.sale_confirmed = true;
            updateData.sale_confirmed_at = new Date().toISOString();
            updateData.sale_confirmed_by = approved_by || 'admin';
        }

        await db.updateOrder(id, updateData);

        // Sync to MISA CRM — SKIP for E-prefix orders (local Supabase only, not in MISA)
        const orderNo = order.soDon || order.sale_order_no || id;
        const isLocalOrder = String(orderNo).startsWith('E');
        let crmStatus = isLocalOrder ? 'SKIP' : 'OK';

        if (!isLocalOrder) {
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
        } else {
            console.log(`📦 Skipping MISA sync for local order ${orderNo} (E-prefix)`);
        }

        // Telegram notification → SALES group
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const products = (order.products || []).map(p => `  • ${p.name || p.code}: ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`).join('\n');
            let msg = `✅ <b>DUYỆT ĐƠN${isLocalOrder ? '' : ' & ĐẨY MISA'}</b>\n`;
            msg += `📦 <b>#${orderNo}</b>\n`;
            msg += `👤 ${order.khach || order.account_name || 'N/A'}\n`;
            msg += `📍 ${order.diaChi || order.shipping_address || ''}\n`;
            msg += `🚛 ${order.taiXe || order.custom_field13 || 'N/A'}\n`;
            if (products) msg += `📋 Sản phẩm:\n${products}\n`;
            msg += `👔 Duyệt bởi: ${approved_by || 'admin'}`;
            if (!isLocalOrder) {
                msg += `\n📤 CRM: ${crmStatus === 'OK' ? '✅ Đã đồng bộ' : '⚠️ ' + crmStatus}`;
            }
            await sendTelegramMessage(msg, 'SALES');
        } catch (tgErr) {
            console.error('Telegram approve error:', tgErr.message);
        }

        // In-app + FCM push notification to the assigned driver
        try {
            const driverName = order.taiXe || order.custom_field13 || '';
            if (driverName) {
                await createNotification(
                    driverName,
                    'order_completed',
                    '✅ Đơn đã được duyệt',
                    `#${orderNo} — Đã duyệt bởi ${approved_by || 'admin'}`,
                    id,
                    orderNo
                );
                console.log(`📬 Approve notification sent to driver: ${driverName}`);
            }
        } catch (notifyErr) {
            console.error('In-app approve notification error:', notifyErr.message);
        }

        // Notify dispatchers about approval
        try {
            const orderNo2 = order.soDon || order.sale_order_no || id;
            await createNotification(
                'DISPATCHER',
                'order_completed',
                '✅ Đơn đã được duyệt',
                `#${orderNo2} — Duyệt bởi ${approved_by || 'admin'}`,
                id,
                orderNo2
            );
        } catch (e) { console.error('Dispatcher approve notification error:', e.message); }

        res.json(createResponse(false, 'Duyệt thành công!', { crmStatus }));
    } catch (e) {
        console.error('approve error:', e.message);
        res.json(createResponse(true, e.message));
    }
});

// POST /api/orders/:id/reject - Admin từ chối đơn (không đẩy MISA)
router.post('/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const { rejected_by, reason } = req.body;

        const order = await db.getOrder(id);
        if (!order) return res.json(createResponse(true, 'Không tìm thấy đơn hàng'));

        // Update order with rejection - keep status as 'Đang thực hiện' to preserve dispatch assignment
        const rejectNote = `[TỪ CHỐI] Bởi ${rejected_by || 'admin'} lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}${reason ? ' - Lý do: ' + reason : ''}`;
        const updateData = {
            admin_approved: false,
            admin_approved_at: null,
            admin_approved_by: null,
            sale_confirmed: false,
            sale_confirmed_at: null,
            sale_confirmed_by: null,
            status: 'Đang thực hiện',
            delivery_status: 'Đang giao hàng',
            description: rejectNote
        };

        await db.updateOrder(id, updateData);

        // Reset driver assignments from completed → pending
        try {


            const { error: assignErr } = await supabase
                .from('order_driver_assignments')
                .update({ status: 'pending' })
                .eq('order_id', id)
                .eq('status', 'completed');
            if (assignErr) console.error('Reset assignments error:', assignErr.message);
            else console.log(`🔄 Reset driver assignments to pending for order ${id}`);
        } catch (assignResetErr) {
            console.error('Assignment reset error:', assignResetErr.message);
        }

        // Telegram notification → SALES group
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const orderNo = order.soDon || order.sale_order_no || id;
            const products = (order.products || []).map(p => `  • ${p.name || p.code}: ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`).join('\n');
            let msg = `❌ <b>TỪ CHỐI ĐƠN</b>\n`;
            msg += `📦 <b>#${orderNo}</b>\n`;
            msg += `👤 ${order.khach || order.account_name || 'N/A'}\n`;
            msg += `📍 ${order.diaChi || order.shipping_address || ''}\n`;
            if (products) msg += `📋 Sản phẩm:\n${products}\n`;
            msg += `👔 Từ chối bởi: ${rejected_by || 'admin'}\n`;
            if (reason) msg += `📝 Lý do: ${reason}`;
            await sendTelegramMessage(msg, 'SALES');
        } catch (tgErr) {
            console.error('Telegram reject error:', tgErr.message);
        }

        // In-app notification for the assigned driver
        try {
            const driverName = order.taiXe || order.custom_field13 || '';
            if (driverName) {
                const orderNo = order.soDon || order.sale_order_no || id;
                await createNotification(
                    driverName,
                    'order_rejected',
                    '❌ Đơn bị từ chối',
                    `#${orderNo} — ${reason || 'Vui lòng kiểm tra lại'}`,
                    id,
                    orderNo
                );
            }
        } catch (notifyErr) {
            console.error('In-app reject notification error:', notifyErr.message);
        }

        // Notify dispatchers about rejection
        try {
            const orderNo2 = order.soDon || order.sale_order_no || id;
            await createNotification(
                'DISPATCHER',
                'order_rejected',
                '❌ Đơn bị từ chối',
                `#${orderNo2} — ${reason || 'Không có lý do'}`,
                id,
                orderNo2
            );
        } catch (e) { console.error('Dispatcher reject notification error:', e.message); }

        res.json(createResponse(false, 'Đã từ chối đơn hàng!'));
    } catch (e) {
        console.error('reject error:', e.message);
        res.json(createResponse(true, e.message));
    }
});

export default router;



