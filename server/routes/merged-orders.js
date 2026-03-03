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

        const { data: merged, error } = await supabase
            .from('merged_orders')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !merged) {
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

        // Always query by sale_order_no
        const { data: orders, error: fetchError } = await supabase
            .from('orders')
            .select('id, sale_order_no, sale_order_amount, status')
            .in('sale_order_no', order_ids);

        if (fetchError || !orders || orders.length < 2) {
            console.error('Fetch orders error:', fetchError?.message, 'Orders found:', orders?.length);
            return res.json(createResponse(true, 'Không tìm thấy đơn hàng hoặc đơn đã được xử lý!'));
        }

        // Extract sale_order_no for storage
        const orderNos = orders.map(o => o.sale_order_no);

        // Calculate totals
        const totalAmount = orders.reduce((sum, o) => sum + Number(o.sale_order_amount || 0), 0);
        const ts = getTimestamp();
        const mergedNo = 'M' + ts.short;

        // Create merged order with sale_order_no list
        const { data: merged, error: createError } = await supabase
            .from('merged_orders')
            .insert({
                merged_no: mergedNo,
                source_order_nos: orderNos,  // TEXT[] instead of UUID[]
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

        // Update source orders to "merged" status
        await supabase
            .from('orders')
            .update({
                status: 'Đã ghép',
                merged_order_no: mergedNo
            })
            .in('sale_order_no', orderNos);

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
        const { driver_name, plate } = req.body;

        const supabase = getSupabase();

        const { data, error } = await supabase
            .from('merged_orders')
            .update({
                status: 'assigned',
                driver_name,
                plate,
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
                custom_field14: plate
            })
            .in('sale_order_no', data.source_order_nos || []);

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
        const { order_no, note, driver_name, plate, lat, lng, actual_qty, proof_image_urls, cart } = req.body;

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

        // Record check-in using sale_order_no
        const { error: checkInError } = await supabase
            .from('merged_order_checkins')
            .upsert({
                merged_order_id: mergedOrderId,
                order_no: order_no,
                driver_name: driver_name || '',
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

        // Update individual order status by sale_order_no
        await supabase
            .from('orders')
            .update({
                status: 'Đã thực hiện',
                delivery_status: 'Đã giao hàng',
                custom_field13: driver_name || orderInfo?.custom_field13,
                custom_field14: plate || orderInfo?.custom_field14
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

                console.log(`📤 MISA Sync [Merged Trip] - Trip: ${id}, PO: ${order_no}, Driver: ${driver_name}`);

                const syncResult = await updateMisaOrder(order_no, {
                    misa_id: orderInfo.misa_id,
                    delivery_status: 'Đã giao hàng',
                    status: 'Đã thực hiện',
                    driver: driver_name || orderInfo.custom_field13,
                    plate: plate || orderInfo.custom_field14,
                    cart: misaCart.length > 0 ? misaCart : undefined
                });

                if (syncResult.success) {
                    syncStatusMsg = ' (Đã đồng bộ MISA)';
                } else {
                    syncStatusMsg = ` (⚠️ Lỗi MISA: ${syncResult.message})`;
                    // Update DB with MISA error
                    await db.updateOrder(order_no, {
                        crm_sync_status: 'FAILED',
                        sync_error: syncResult.message
                    });
                }
            } catch (misaErr) {
                console.error('MISA Sync Error during trip check-in:', misaErr.message);
                syncStatusMsg = ' (Lỗi kết nối MISA)';
            }
        }

        // Check if all stops completed
        const { data: merged } = await supabase
            .from('merged_orders')
            .select('source_order_nos')
            .eq('id', id)
            .single();

        const { data: checkIns } = await supabase
            .from('merged_order_checkins')
            .select('order_no')
            .eq('merged_order_id', id);

        const totalStops = (merged?.source_order_nos || []).length;
        const completedStops = (checkIns || []).length;

        if (completedStops >= totalStops) {
            // All stops completed - mark merged order as completed
            await supabase
                .from('merged_orders')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString()
                })
                .eq('id', id);

            return res.json(createResponse(false, `Hoàn thành tất cả ${totalStops} điểm giao!`));
        }

        res.json(createResponse(false, `Check-in thành công! (${completedStops}/${totalStops} điểm)`));

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
