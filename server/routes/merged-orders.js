// ===============================================
// MERGED ORDERS ROUTES (Đơn ghép)
// Using sale_order_no as primary identifier
// ===============================================

import { Router } from 'express';
import { createResponse, getTimestamp } from '../config.js';
import { createClient } from '@supabase/supabase-js';
import { updateMisaOrder } from '../services/misa.js';
import db from '../db/index.js';

const router = Router();

// Lazy Supabase client
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_KEY;
        if (url && key) {
            _supabase = createClient(url, key);
        }
    }
    return _supabase;
}

// GET /api/merged-orders - List all merged orders with source order details
router.get('/', async (req, res) => {
    try {
        const { status } = req.query;
        const supabase = getSupabase();

        let query = supabase
            .from('merged_orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data: mergedOrders, error } = await query;

        if (error) {
            return res.json(createResponse(true, 'Lỗi tải đơn ghép: ' + error.message));
        }

        // Fetch source orders for each merged order by sale_order_no
        const result = await Promise.all((mergedOrders || []).map(async (merged) => {
            const sourceNos = merged.source_order_nos || [];
            if (sourceNos.length === 0) return { ...merged, source_orders: [] };

            const { data: sourceOrders } = await supabase
                .from('orders')
                .select('id, sale_order_no, account_name, shipping_address, sale_order_amount, status')
                .in('sale_order_no', sourceNos);

            return {
                ...merged,
                source_orders: sourceOrders || []
            };
        }));

        res.json({ error: false, data: result });

    } catch (e) {
        console.error('Get merged orders error:', e.message);
        res.json(createResponse(true, e.message));
    }
});

// GET /api/merged-orders/:id - Get merged order detail with stops
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const supabase = getSupabase();

        // Try by merged_no first (e.g. M2603001), then fallback to UUID id
        let merged = null;
        const { data: byNo } = await supabase
            .from('merged_orders')
            .select('*')
            .eq('merged_no', id)
            .single();

        if (byNo) {
            merged = byNo;
        } else {
            const { data: byId } = await supabase
                .from('merged_orders')
                .select('*')
                .eq('id', id)
                .single();
            merged = byId;
        }

        if (!merged) {
            return res.json(createResponse(true, 'Không tìm thấy đơn ghép'));
        }

        // Fetch source orders (stops) by sale_order_no
        const sourceNos = merged.source_order_nos || [];
        const { data: stops } = await supabase
            .from('orders')
            .select('*')
            .in('sale_order_no', sourceNos);

        // Fetch check-in status for each stop (by sale_order_no)
        const { data: checkIns } = await supabase
            .from('merged_order_checkins')
            .select('*')
            .eq('merged_order_id', id);

        const checkInMap = {};
        (checkIns || []).forEach(c => { checkInMap[c.order_no] = c; });

        const stopsWithStatus = (stops || []).map(stop => ({
            ...stop,
            checked_in: !!checkInMap[stop.sale_order_no],
            checked_in_at: checkInMap[stop.sale_order_no]?.checked_in_at || null,
            check_in_note: checkInMap[stop.sale_order_no]?.note || ''
        }));

        res.json({
            error: false,
            data: {
                ...merged,
                stops: stopsWithStatus,
                completed_stops: stopsWithStatus.filter(s => s.checked_in).length,
                total_stops: stopsWithStatus.length
            }
        });

    } catch (e) {
        console.error('Get merged order detail error:', e.message);
        res.json(createResponse(true, e.message));
    }
});

// POST /api/merged-orders - Create merged order from selected order numbers
router.post('/', async (req, res) => {
    try {
        const { order_ids, note, created_by } = req.body;
        // order_ids here are actually sale_order_no values

        if (!order_ids || order_ids.length < 2) {
            return res.json(createResponse(true, 'Cần chọn ít nhất 2 đơn để ghép!'));
        }

        const supabase = getSupabase();

        // Query by sale_order_no first, then also by id for locally-created orders
        let { data: orders, error: fetchError } = await supabase
            .from('orders')
            .select('id, sale_order_no, sale_order_amount, status')
            .in('sale_order_no', order_ids);

        // If not all orders found, also search by id column (local orders may use id = sale_order_no)
        if (!orders || orders.length < order_ids.length) {
            const foundNos = new Set((orders || []).map(o => o.sale_order_no));
            const missingIds = order_ids.filter(id => !foundNos.has(id));

            if (missingIds.length > 0) {
                const { data: extraOrders } = await supabase
                    .from('orders')
                    .select('id, sale_order_no, sale_order_amount, status')
                    .in('id', missingIds);

                if (extraOrders && extraOrders.length > 0) {
                    orders = [...(orders || []), ...extraOrders];
                }
            }
        }

        if (fetchError || !orders || orders.length < 2) {
            console.error('Fetch orders error:', fetchError?.message, 'Orders found:', orders?.length, 'Requested:', order_ids);
            return res.json(createResponse(true, 'Không tìm thấy đơn hàng hoặc đơn đã được xử lý!'));
        }

        // Extract sale_order_no for storage (use id as fallback for local orders)
        const orderNos = orders.map(o => o.sale_order_no || o.id);

        // Calculate totals
        const totalAmount = orders.reduce((sum, o) => sum + Number(o.sale_order_amount || 0), 0);
        const ts = getTimestamp();
        const mergedNo = 'M' + ts.short;

        // Create merged order with sale_order_no list
        const { data: merged, error: createError } = await supabase
            .from('merged_orders')
            .insert({
                merged_no: mergedNo,
                source_order_nos: orderNos,
                total_amount: totalAmount,
                total_stops: orders.length,
                note: note || '',
                status: 'pending',
                created_by: created_by || 'Admin'
            })
            .select()
            .single();

        if (createError) {
            return res.json(createResponse(true, 'Lỗi tạo đơn ghép: ' + createError.message));
        }

        // Update source orders to "merged" status (by sale_order_no)
        await supabase
            .from('orders')
            .update({
                status: 'Đã ghép',
                merged_order_no: mergedNo
            })
            .in('sale_order_no', orderNos);

        // Also update by id for local orders that might not match sale_order_no
        const orderIds = orders.map(o => o.id);
        await supabase
            .from('orders')
            .update({
                status: 'Đã ghép',
                merged_order_no: mergedNo
            })
            .in('id', orderIds);

        // Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            let msg = `🔗 <b>ĐƠN GHÉP MỚI</b>\n`;
            msg += `#${mergedNo}\n`;
            msg += `📦 Số đơn: ${orders.length}\n`;
            msg += `💰 Tổng: ${totalAmount.toLocaleString('vi-VN')}đ\n`;
            msg += `📍 Điểm giao: ${orders.length} địa chỉ`;

            await sendTelegramMessage(msg, 'NOTIFY');
        } catch (tgErr) {
            console.error('Telegram Error:', tgErr.message);
        }

        console.log(`🔗 Created merged order ${mergedNo} with ${orders.length} orders: ${orderNos.join(', ')}`);

        res.json({
            error: false,
            msg: `Đã ghép ${orders.length} đơn thành ${mergedNo}!`,
            data: merged
        });

    } catch (e) {
        console.error('Create merged order error:', e.message);
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/merged-orders/:id/assign - Assign driver to merged order
router.put('/:id/assign', async (req, res) => {
    try {
        const { id } = req.params;
        const { driver_name, plate, assistant_name, delivery_time } = req.body;

        const supabase = getSupabase();

        const { data, error } = await supabase
            .from('merged_orders')
            .update({
                status: 'assigned',
                driver_name,
                plate,
                assistant_name,
                delivery_time,
                assigned_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lỗi gán tài xế: ' + error.message));
        }

        // Update all source orders with driver info by sale_order_no
        await supabase
            .from('orders')
            .update({
                status: 'Đang thực hiện',
                custom_field13: driver_name,
                custom_field14: plate,
                assistant_name: assistant_name || null,
                delivery_time: delivery_time || null
            })
            .in('sale_order_no', data.source_order_nos || []);

        // Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');

            // Lookup telegram usernames
            const users = await db.getUsers();
            const driverObj = users.find(u => u.fullName === driver_name || u.username === driver_name);
            const driverTag = driverObj && driverObj.telegramUsername ? ` (@${driverObj.telegramUsername.replace('@', '')})` : '';

            let assistantTag = '';
            if (assistant_name) {
                const assistantObj = users.find(u => u.fullName === assistant_name || u.username === assistant_name);
                if (assistantObj && assistantObj.telegramUsername) {
                    assistantTag = ` (@${assistantObj.telegramUsername.replace('@', '')})`;
                }
            }

            let msg = `🚛 <b>PHÂN CÔNG XE - ĐƠN GHÉP</b>\n`;
            msg += `#${data.merged_no || id}\n`;
            msg += `📦 Điểm giao: ${data.total_stops} điểm\n`;
            msg += `──────────────\n`;
            msg += `🚗 Tài xế: <b>${driver_name}</b>${driverTag}\n`;
            if (assistant_name) msg += `🧑‍🔧 Phụ xe: ${assistant_name}${assistantTag}\n`;
            msg += `🔢 Biển số: ${plate || 'Chưa có'}\n`;
            if (delivery_time) msg += `⏰ Tgian giao: ${delivery_time}\n`;

            await sendTelegramMessage(msg, 'DRIVER');
        } catch (tgErr) {
            console.error('Telegram Error in merged order assign:', tgErr.message);
        }

        res.json({
            error: false,
            msg: 'Đã gán tài xế cho đơn ghép!',
            data
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// POST /api/merged-orders/:id/checkin - Check-in at a stop
router.post('/:id/checkin', async (req, res) => {
    try {
        const { id } = req.params;
        const { order_no, note, driver_name, plate, lat, lng, actual_qty, proof_image_urls, cart, images } = req.body;

        if (!order_no) {
            return res.json(createResponse(true, 'Thiếu mã đơn hàng!'));
        }

        const supabase = getSupabase();

        // Handle human-readable merged_no (e.g. "M2603001") passed as ID
        let mergedOrderId = id;
        if (id.startsWith('M') && id.length < 20) {
            const { data: mergedRow } = await supabase
                .from('merged_orders')
                .select('id')
                .eq('merged_no', id)
                .single();
            if (mergedRow) {
                mergedOrderId = mergedRow.id;
            }
        }

        // RESOLVE REAL DRIVER from order_driver_assignments
        let resolvedDriverName = driver_name || '';
        let resolvedPlate = plate || '';
        try {
            // First try by sanitized order ID
            const orderInfo = await db.getOrder(order_no);
            const orderId = orderInfo?.id || order_no;

            const { data: dispatchAssigns } = await supabase
                .from('order_driver_assignments')
                .select('driver_name, plate, assistant_name')
                .eq('order_id', orderId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (dispatchAssigns && dispatchAssigns.length > 0) {
                resolvedDriverName = dispatchAssigns[0].driver_name || resolvedDriverName;
                resolvedPlate = dispatchAssigns[0].plate || resolvedPlate;
                console.log(`✅ Merged checkin: Resolved driver = ${resolvedDriverName} (plate: ${resolvedPlate})`);
            }
        } catch (assignErr) {
            console.warn('Assignment lookup for merged checkin failed:', assignErr.message);
        }

        // Record check-in using sale_order_no
        const { error: checkInError } = await supabase
            .from('merged_order_checkins')
            .upsert({
                merged_order_id: mergedOrderId,
                order_no: order_no,
                driver_name: resolvedDriverName,
                note: note || '',
                lat: lat || null,
                lng: lng || null,
                actual_qty: actual_qty || null,
                proof_image_urls: proof_image_urls || [],
                checked_in_at: new Date().toISOString()
            }, { onConflict: 'merged_order_id,order_no' });

        if (checkInError) {
            return res.json(createResponse(true, 'Lỗi check-in: ' + checkInError.message));
        }

        // Fetch original order info for MISA sync
        const orderInfo = await db.getOrder(order_no);

        // Save proof images to order_driver_assignments if provided
        if (images && Array.isArray(images) && images.length > 0) {
            try {
                const orderInfoForImg = orderInfo || await db.getOrder(order_no);
                const orderIdForImg = orderInfoForImg?.id || order_no;
                const { data: assigns } = await supabase
                    .from('order_driver_assignments')
                    .select('id, proof_images')
                    .eq('order_id', orderIdForImg)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (assigns && assigns.length > 0) {
                    const existing = assigns[0].proof_images || [];
                    const updated = [...existing, ...images].slice(0, 10);
                    await supabase
                        .from('order_driver_assignments')
                        .update({ proof_images: updated })
                        .eq('id', assigns[0].id);
                    console.log(`📸 Saved ${images.length} proof images for merged checkin`);
                }
            } catch (imgErr) {
                console.warn('Proof image save error during checkin:', imgErr.message);
            }
        }

        // Update individual order status by sale_order_no
        await supabase
            .from('orders')
            .update({
                status: 'Đã thực hiện',
                delivery_status: 'Đã giao hàng',
                custom_field13: resolvedDriverName || orderInfo?.custom_field13,
                custom_field14: resolvedPlate || orderInfo?.custom_field14
            })
            .eq('sale_order_no', order_no);

        // SYNC TO MISA (If applicable)
        let syncStatusMsg = '';
        if (orderInfo && orderInfo.misa_id) {
            try {
                let misaCart = [];
                if (cart && Array.isArray(cart)) {
                    // Filter out shells and map quantities
                    misaCart = cart.filter(item => !item.isShell).map(item => ({
                        product_code: item.product?.code || item.product?.id || item.code || item.product || '',
                        warehouse: item.warehouse || '',  // May be empty string if not provided
                        unit: item.unit || 'kg',
                        qty: Number(item.weight_kg || item.qty || 0)
                    }));
                } else if (orderInfo.products && Array.isArray(orderInfo.products)) {
                    // Fallback to original order products if cart isn't sent
                    misaCart = orderInfo.products.map(item => ({
                        product_code: item.code || '',
                        warehouse: '',
                        unit: item.unit || 'kg',
                        qty: Number(item.qty || 0)
                    }));
                }

                // If no actual_qty in cart, use overall actual_qty if provided
                if (misaCart.length === 1 && actual_qty) {
                    misaCart[0].qty = actual_qty;
                }

                console.log(`📤 MISA Sync [Merged Trip] - Trip: ${id}, PO: ${order_no}, Driver: ${resolvedDriverName}`);

                const syncResult = await updateMisaOrder(order_no, {
                    misa_id: orderInfo.misa_id,
                    delivery_status: 'Đã giao hàng',
                    status: 'Đã thực hiện',
                    driver: resolvedDriverName || orderInfo.custom_field13,
                    plate: resolvedPlate || orderInfo.custom_field14,
                    cart: misaCart.length > 0 ? misaCart : undefined
                });

                if (syncResult.success) {
                    syncStatusMsg = ' (Đã đồng bộ MISA)';
                } else {
                    syncStatusMsg = ` (⚠️ Lỗi MISA: ${syncResult.message})`;
                    console.warn(`⚠️ MISA sync failed for merged checkin: ${syncResult.message}`);
                }
            } catch (misaErr) {
                console.error('MISA Sync Error during trip check-in:', misaErr.message);
                syncStatusMsg = ' (Lỗi kết nối MISA)';
            }
        }

        // AUTO-COMPLETE ALL SISTER ORDERS (completing 1 = completing all in merged group)
        const { data: merged } = await supabase
            .from('merged_orders')
            .select('source_order_nos, merged_no')
            .eq('id', mergedOrderId)
            .single();

        const sourceNos = merged?.source_order_nos || [];
        const sisterNos = sourceNos.filter(no => no !== order_no);

        if (sisterNos.length > 0) {
            console.log(`🔗 Auto-completing ${sisterNos.length} sister orders: ${sisterNos.join(', ')}`);

            for (const sisterNo of sisterNos) {
                try {
                    // 1. Create check-in record for sister
                    await supabase
                        .from('merged_order_checkins')
                        .upsert({
                            merged_order_id: mergedOrderId,
                            order_no: sisterNo,
                            driver_name: resolvedDriverName,
                            note: `Tự động hoàn thành theo đơn ghép ${order_no}`,
                            checked_in_at: new Date().toISOString()
                        }, { onConflict: 'merged_order_id,order_no' });

                    // 2. Update sister order status
                    await supabase
                        .from('orders')
                        .update({
                            status: 'Đã thực hiện',
                            delivery_status: 'Đã giao hàng',
                            custom_field13: resolvedDriverName,
                            custom_field14: resolvedPlate
                        })
                        .eq('sale_order_no', sisterNo);

                    // 3. Sync sister to MISA
                    try {
                        const sisterInfo = await db.getOrder(sisterNo);
                        if (sisterInfo?.misa_id) {
                            const sisterProducts = (sisterInfo.products || []).map(p => ({
                                product_code: p.code || '',
                                warehouse: '',
                                unit: p.unit || 'kg',
                                qty: Number(p.qty || 0)
                            }));

                            await updateMisaOrder(sisterNo, {
                                misa_id: sisterInfo.misa_id,
                                delivery_status: 'Đã giao hàng',
                                status: 'Đã thực hiện',
                                driver: resolvedDriverName,
                                plate: resolvedPlate,
                                cart: sisterProducts.length > 0 ? sisterProducts : undefined
                            });
                            console.log(`✅ MISA synced sister: ${sisterNo}`);
                        }
                    } catch (misaSisterErr) {
                        console.warn(`⚠️ MISA sync failed for sister ${sisterNo}:`, misaSisterErr.message);
                    }

                    console.log(`✅ Auto-completed sister order: ${sisterNo}`);
                } catch (sisterErr) {
                    console.error(`❌ Failed to auto-complete sister ${sisterNo}:`, sisterErr.message);
                }
            }
        }

        // Mark merged order as completed (all orders done)
        await supabase
            .from('merged_orders')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString()
            })
            .eq('id', mergedOrderId);

        const totalStops = sourceNos.length;
        res.json(createResponse(false, `Hoàn thành tất cả ${totalStops} đơn trong chuyến ghép!${syncStatusMsg}`));

    } catch (e) {
        console.error('Check-in error:', e.message);
        res.json(createResponse(true, e.message));
    }
});

// DELETE /api/merged-orders/:id - Unmerge (restore original orders)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const supabase = getSupabase();

        // Get merged order
        const { data: merged } = await supabase
            .from('merged_orders')
            .select('source_order_nos')
            .eq('id', id)
            .single();

        if (!merged) {
            return res.json(createResponse(true, 'Không tìm thấy đơn ghép!'));
        }

        // Restore source orders to pending by sale_order_no
        await supabase
            .from('orders')
            .update({
                status: 'Chưa thực hiện',
                merged_order_no: null
            })
            .in('sale_order_no', merged.source_order_nos || []);

        // Delete check-ins
        await supabase
            .from('merged_order_checkins')
            .delete()
            .eq('merged_order_id', id);

        // Delete merged order
        await supabase
            .from('merged_orders')
            .delete()
            .eq('id', id);

        res.json(createResponse(false, 'Đã hủy đơn ghép và khôi phục các đơn gốc!'));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

export default router;
