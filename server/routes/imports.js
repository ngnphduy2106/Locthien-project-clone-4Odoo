// ===============================================
// IMPORT TICKETS ROUTES (Phiếu nhập)
// ===============================================

import { Router } from 'express';
import { createResponse, getTimestamp } from '../config.js';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// Helper: Create Telegram mention tag (same as orders.js)
function getTelegramTag(telegramUsername, telegramUserId, displayName) {
    if (telegramUserId) {
        const name = displayName || 'user';
        return ` (<a href="tg://user?id=${telegramUserId}">${name}</a>)`;
    }
    if (telegramUsername) {
        const cleaned = telegramUsername.trim().replace(/^@/, '');
        if (/^[a-zA-Z0-9_]{5,32}$/.test(cleaned)) {
            return ` (@${cleaned})`;
        }
    }
    return '';
}

// Lazy Supabase client initialization (env vars may not exist at import time)
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

// GET /api/imports - List all import tickets
router.get('/', async (req, res) => {
    try {
        const { status } = req.query;

        let query = getSupabase()
            .from('import_tickets')
            .select('*')
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) {
            return res.json(createResponse(true, 'Lỗi tải phiếu nhập: ' + error.message));
        }

        res.json({
            error: false,
            data: data || []
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// GET /api/imports/:id/assignments - Get all driver assignments for an import
router.get('/:id/assignments', async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await getSupabase()
            .from('import_driver_assignments')
            .select('id, driver_name, plate, driver_type, assigned_qty, actual_qty, status, note')
            .eq('import_id', id)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Get import assignments error:', error.message);
            return res.json({ error: false, data: [] });
        }

        console.log(`📋 Found ${(data || []).length} assignments for import ${id}`);

        res.json({
            error: false,
            data: data || []
        });

    } catch (e) {
        console.error('Get import assignments error:', e.message);
        res.json({ error: false, data: [] });
    }
});

// POST /api/imports - Create new import ticket
router.post('/', async (req, res) => {
    try {
        const { supplier_name, supplier_address, products, expected_date, warehouse, note, description, created_by } = req.body;

        console.log('📥 Create Import - Received body:', JSON.stringify({ supplier_name, description, note }, null, 2));

        if (!supplier_name || !products || !products.length) {
            return res.json(createResponse(true, 'Thiếu thông tin nhà cung cấp hoặc sản phẩm'));
        }

        const ts = getTimestamp();
        const ticketNo = 'N' + ts.short;

        const totalQty = products.reduce((sum, p) => sum + Number(p.qty || 0), 0);

        const { data, error } = await getSupabase()
            .from('import_tickets')
            .insert({
                ticket_no: ticketNo,
                supplier_name,
                supplier_address: supplier_address || '',
                products,
                total_qty: totalQty,
                expected_date: expected_date || null,
                warehouse: warehouse || 'LT1',
                description: description || '',  // Mô tả từ form tạo đơn
                note: note || '',  // Ghi chú của tài xế (khi giao hàng)
                status: 'pending',
                created_by: created_by || 'Admin'
            })
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lỗi tạo phiếu: ' + error.message));
        }

        // Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const productsList = (products || [])
                .map(p => `- ${p.name || p.code}: ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`)
                .join('\n');

            let msg = `🟥 <b>NHẬP HÀNG</b>\n`;
            msg += `📦 <b>#${ticketNo}</b>\n`;
            if (expected_date) {
                const fmtDate = new Date(expected_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                msg += `📅 ${fmtDate}\n`;
            }
            msg += `🏭 <b>${supplier_name}</b>\n`;
            msg += `📦 ${(products || []).map(p => `${p.name || p.code} — ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`).join(', ')}\n`;
            if (supplier_address) msg += `📍 ${supplier_address}\n`;
            if (description || note) msg += `📝 ${description || note}\n`;

            await sendTelegramMessage(msg, 'NOTIFY');
        } catch (tgErr) {
            console.error('Telegram Error:', tgErr.message);
        }

        res.json({
            error: false,
            msg: 'Tạo phiếu nhập thành công! Mã: ' + ticketNo,
            data
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/imports/:id - Update import ticket basic info
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { supplier_name, supplier_address, expected_date, note, products } = req.body;

        const updateData = {};
        if (supplier_name) updateData.supplier_name = supplier_name;
        if (supplier_address !== undefined) updateData.supplier_address = supplier_address;
        if (expected_date !== undefined) updateData.expected_date = expected_date || null;
        if (note !== undefined) updateData.note = note;

        // Update products and recalculate total qty
        if (products && Array.isArray(products)) {
            updateData.products = products;
            updateData.total_qty = products.reduce((sum, p) => sum + Number(p.qty || 0), 0);
        }

        const { data, error } = await getSupabase()
            .from('import_tickets')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lỗi cập nhật: ' + error.message));
        }

        // Send Telegram notification — ONLY for pending tickets (not yet dispatched/completed)
        // Once dispatched (assigned/in_transit) or completed, edits are qty adjustments → no notification
        if (data.status === 'pending') {
            try {
                const { sendTelegramMessage } = await import('../services/telegram.js');
                const ticketNo = data?.ticket_no || id;
                const supName = data?.supplier_name || supplier_name || '';
                const supAddr = data?.supplier_address || supplier_address || '';

                let msg = `✏️ <b>PHIẾU NHẬP ĐÃ CHỈNH SỬA</b>\n`;
                msg += `#${ticketNo}\n`;
                msg += `🏭 NCC: ${supName}\n`;
                if (supAddr) msg += `📍 ${supAddr}\n`;

                const updatedProducts = data?.products || products || [];
                if (updatedProducts.length > 0) {
                    msg += `\n📦 <b>Sản phẩm (cập nhật):</b>\n`;
                    updatedProducts.forEach(p => {
                        const qty = Number(p.qty || 0);
                        msg += `- ${p.name || p.product || p.code}: ${qty.toLocaleString('vi-VN')} ${p.unit || 'Kg'}\n`;
                    });
                }

                if (note) msg += `\n📝 Ghi chú: ${note}`;

                await sendTelegramMessage(msg, 'NOTIFY');
            } catch (tgErr) {
                console.error('Telegram Import Edit Notification Error:', tgErr.message);
            }
        }

        res.json({
            error: false,
            msg: 'Đã cập nhật phiếu nhập!',
            data
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/imports/:id/pin - Toggle pin status for import ticket
router.put('/:id/pin', async (req, res) => {
    try {
        const { id } = req.params;
        const { is_pinned } = req.body;

        const { error } = await getSupabase()
            .from('import_tickets')
            .update({ is_pinned: is_pinned === true })
            .eq('id', id);

        if (error) {
            return res.json(createResponse(true, 'Lỗi ghim phiếu: ' + error.message));
        }

        console.log(`📌 Import ${id} pinned: ${is_pinned}`);
        res.json(createResponse(false, is_pinned ? 'Đã ghim phiếu nhập!' : 'Đã bỏ ghim phiếu nhập!'));
    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/imports/:id/assign - Assign driver to import ticket
router.put('/:id/assign', async (req, res) => {
    try {
        const { id } = req.params;
        const { driver_name, plate, assistant_name } = req.body;

        const { data, error } = await getSupabase()
            .from('import_tickets')
            .update({
                status: 'assigned',
                assigned_driver: driver_name,
                assigned_plate: plate,
                assistant_name: assistant_name || null
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lỗi gán tài xế: ' + error.message));
        }

        // Send push notification to driver (async, don't block response)
        try {
            const { notifyDriverOrderAssigned } = await import('../services/firebase.js');
            const db = await import('../db/index.js');
            const users = await db.default.getUsers();
            const driver = users.find(u =>
                u.fullName?.toLowerCase() === driver_name?.toLowerCase() ||
                u.username?.toLowerCase() === driver_name?.toLowerCase()
            );

            if (driver?.fcm_token) {
                notifyDriverOrderAssigned(driver.fcm_token, {
                    orderId: id,
                    orderNo: data?.ticket_no || id,
                    customerName: data?.supplier_name,
                    address: data?.supplier_address,
                    type: 'import'
                });
                console.log(`📬 Push notification sent to driver ${driver_name} for import`);
            }
        } catch (notifyErr) {
            console.error('Push notification error:', notifyErr.message);
        }

        // Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const db = await import('../db/index.js');
            const users = await db.default.getUsers();
            const driverObj = users.find(u => u.fullName === driver_name || u.username === driver_name);

            // Collect mention tags for bottom (same as MISA dispatch)
            const mentionTags = [];
            const driverMention = getTelegramTag(driverObj?.telegramUsername, driverObj?.telegramUserId, driver_name);
            if (driverMention) mentionTags.push(driverMention.trim());

            // Products list
            let products = data?.products || [];
            if (typeof products === 'string') try { products = JSON.parse(products); } catch (e) { products = []; }
            const productsList = (products || [])
                .map(p => `- ${p.name || p.code || 'SP'}: ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'kg'}`)
                .join('\n');

            let msg = `🚛 <b>PHÂN CÔNG NHẬP HÀNG</b>\n`;
            msg += `📦 <b>#${data?.ticket_no || id}</b>\n`;
            if (data?.expected_date) {
                const fmtDate = new Date(data.expected_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                msg += `📅 ${fmtDate}\n`;
            }
            msg += `🏭 <b>${data?.supplier_name || ''}</b>\n`;
            if (productsList) msg += `📦 ${(products || []).map(p => `${p.name || p.code || 'SP'} — ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'kg'}`).join(', ')}\n`;
            if (data?.supplier_address) msg += `📍 ${data.supplier_address}\n`;
            if (data?.merged_order_no) msg += `🔗 Ghép chuyến: ${data.merged_order_no}\n`;
            msg += `──────────────\n`;
            msg += `🚗 Tài xế: <b>${driver_name}</b>\n`;
            if (assistant_name) {
                const assistantObj = users.find(u => u.fullName === assistant_name || u.username === assistant_name);
                const assistantMention = getTelegramTag(assistantObj?.telegramUsername, assistantObj?.telegramUserId, assistant_name);
                if (assistantMention) mentionTags.push(assistantMention.trim());
                msg += `🧑‍🔧 Phụ xe: ${assistant_name}\n`;
            }
            msg += `🔢 Biển số: ${plate || 'Chưa có'}\n`;

            // Add mention tags at the bottom (clickable tags for driver/assistant)
            if (mentionTags.length > 0) {
                msg += `\n${mentionTags.join(' ')}`;
            }

            await sendTelegramMessage(msg, 'DRIVER');
        } catch (tgErr) {
            console.error('Telegram Error in import assign:', tgErr.message);
        }

        res.json({
            error: false,
            msg: 'Đã gán tài xế!',
            data
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// POST /api/imports/:id/assign-multi - Multi-driver assignment for imports
router.post('/:id/assign-multi', async (req, res) => {
    try {
        const { id } = req.params;
        const { assignments } = req.body;

        if (!assignments || !assignments.length) {
            return res.json(createResponse(true, 'Chưa có phân công nào!'));
        }

        const supabase = getSupabase();

        // Delete existing assignments for this import
        await supabase.from('import_driver_assignments').delete().eq('import_id', id);

        // Insert new assignments
        const insertData = assignments.map(a => ({
            import_id: id,
            driver_name: a.driver_name,
            driver_type: a.type || 'internal',
            plate: a.plate || '',
            assigned_qty: Number(a.qty) || 0,
            status: 'pending',
            note: a.note || ''
        }));

        const { error } = await supabase.from('import_driver_assignments').insert(insertData);

        if (error) {
            return res.json(createResponse(true, 'Lỗi lưu phân công: ' + error.message));
        }

        // Update import with first driver info (main driver)
        const mainDriver = assignments[0];
        await supabase
            .from('import_tickets')
            .update({
                status: 'assigned',
                assigned_driver: mainDriver.driver_name,
                assigned_plate: mainDriver.plate || '',
                note: assignments.length > 1 ? `Chia ${assignments.length} tài xế` : (mainDriver.note || '')
            })
            .eq('id', id);

        // Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const { data: impData } = await supabase.from('import_tickets').select('*').eq('id', id).single();

            let msg = `🚛 <b>PHÂN CÔNG NHẬP HÀNG</b>\n`;
            msg += `📦 <b>#${impData?.ticket_no || id}</b>\n`;
            if (impData?.expected_date) {
                const fmtDate = new Date(impData.expected_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                msg += `📅 ${fmtDate}\n`;
            }
            msg += `🏭 <b>${impData?.supplier_name || ''}</b>\n`;
            if (impData?.merged_order_no) msg += `🔗 Ghép chuyến: ${impData.merged_order_no}\n`;
            if (assignments.length > 1) msg += `✂️ Chia ${assignments.length} tài xế\n`;
            msg += `\n<b>Danh sách tài xế:</b>\n`;

            // Lookup users for Telegram tags
            const { data: users } = await supabase.from('users').select('fullname, username, telegram_username, telegram_user_id');
            const userList = (users || []).map(u => ({ fullName: u.fullname, username: u.username, telegramUsername: u.telegram_username, telegramUserId: u.telegram_user_id }));
            const mentionTags = [];

            assignments.forEach((a, i) => {
                const typeLabel = a.type === 'external' ? '(Ngoài)' : '(NB)';
                const driverObj = userList.find(u => u.fullName === a.driver_name || u.username === a.driver_name);
                const driverMention = getTelegramTag(driverObj?.telegramUsername, driverObj?.telegramUserId, a.driver_name);
                if (driverMention) mentionTags.push(driverMention.trim());

                let assistantLine = '';
                if (a.assistant_name) {
                    const assistantObj = userList.find(u => u.fullName === a.assistant_name || u.username === a.assistant_name);
                    const assistantMention = getTelegramTag(assistantObj?.telegramUsername, assistantObj?.telegramUserId, a.assistant_name);
                    if (assistantMention) mentionTags.push(assistantMention.trim());
                    assistantLine = `\n    🧑‍🔧 PX: ${a.assistant_name}`;
                }

                msg += `${i + 1}. <b>${a.driver_name}</b> ${typeLabel} - ${Number(a.qty).toLocaleString('vi-VN')}kg${assistantLine}\n`;
                if (a.plate) msg += `    🔢 Xe: ${a.plate}\n`;
                if (a.delivery_time) msg += `    ⏰ Giao: ${a.delivery_time}\n`;
            });

            // Add mention tags at the bottom
            if (mentionTags.length > 0) {
                msg += `\n${mentionTags.join(' ')}`;
            }

            await sendTelegramMessage(msg, 'DRIVER');
        } catch (teleErr) {
            console.error('Telegram notification error:', teleErr.message);
        }

        // ============================================================
        // MERGE HANDLING: Sync partner order if merged
        // ============================================================
        let finalMergedOrderNo = null;
        if (req.body.mergeWithOrderNo) {
            console.log(`🔗 [Import] Processing merge with: ${req.body.mergeWithOrderNo}`);
            const mergePartnerNo = req.body.mergeWithOrderNo;
            const { data: impTicket } = await supabase.from('import_tickets').select('*').eq('id', id).single();
            const currentTicketNo = impTicket?.ticket_no || id;

            // Find partner order (could be export or another import)
            let partnerOrder = null;
            let isExportPartner = false;

            // Try export orders first
            const { data: expOrder } = await supabase
                .from('orders')
                .select('*')
                .or(`sale_order_no.eq.${mergePartnerNo},id.eq.${mergePartnerNo}`)
                .limit(1)
                .single();
            if (expOrder) {
                partnerOrder = expOrder;
                isExportPartner = true;
            } else {
                // Try import tickets
                const { data: impPartner } = await supabase
                    .from('import_tickets')
                    .select('*')
                    .eq('ticket_no', mergePartnerNo)
                    .single();
                if (impPartner) partnerOrder = impPartner;
            }

            if (partnerOrder) {
                const partnerNo = isExportPartner ? (partnerOrder.sale_order_no || partnerOrder.id) : partnerOrder.ticket_no;
                const mainDriverName = assignments[0]?.driver_name || '';
                const mainPlate = assignments[0]?.plate || '';

                // Check if partner already has a merged_order_no
                if (partnerOrder.merged_order_no) {
                    finalMergedOrderNo = partnerOrder.merged_order_no;
                    const { data: existingMerged } = await supabase
                        .from('merged_orders')
                        .select('source_order_nos, total_amount')
                        .eq('merged_no', finalMergedOrderNo)
                        .single();
                    if (existingMerged) {
                        const newSourceNos = [...new Set([...(existingMerged.source_order_nos || []), currentTicketNo])];
                        await supabase.from('merged_orders').update({
                            source_order_nos: newSourceNos,
                            total_stops: newSourceNos.length
                        }).eq('merged_no', finalMergedOrderNo);
                    }
                } else {
                    // Create new merged order
                    const { getTimestamp } = await import('../config.js');
                    const ts = getTimestamp();
                    finalMergedOrderNo = 'M' + ts.short;

                    await supabase.from('merged_orders').insert({
                        merged_no: finalMergedOrderNo,
                        source_order_nos: [partnerNo, currentTicketNo],
                        total_stops: 2,
                        total_amount: 0,
                        status: 'assigned',
                        driver_name: mainDriverName,
                        plate: mainPlate
                    });

                    // Update partner order with merged_order_no + status + driver
                    if (isExportPartner) {
                        await supabase.from('orders').update({
                            merged_order_no: finalMergedOrderNo,
                            status: 'Đang thực hiện',
                            custom_field13: mainDriverName,
                            custom_field14: mainPlate
                        }).eq('id', partnerOrder.id);
                        console.log(`✅ Export partner ${partnerNo} synced: status=Đang thực hiện, driver=${mainDriverName}`);
                    } else {
                        await supabase.from('import_tickets').update({
                            merged_order_no: finalMergedOrderNo,
                            status: 'assigned',
                            assigned_driver: mainDriverName,
                            assigned_plate: mainPlate
                        }).eq('ticket_no', mergePartnerNo);
                        console.log(`✅ Import partner ${mergePartnerNo} synced: status=assigned, driver=${mainDriverName}`);
                    }
                }

                // Update current import with merged_order_no
                await supabase.from('import_tickets').update({
                    merged_order_no: finalMergedOrderNo
                }).eq('id', id);

                console.log(`🔗 Merge complete: ${currentTicketNo} + ${partnerNo} = ${finalMergedOrderNo}`);
            }
        }

        res.json(createResponse(false, `Đã phân công ${assignments.length} tài xế!`));

    } catch (e) {
        console.error('Multi-assign import error:', e);
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/imports/:id/unassign - Cancel dispatch for import (hủy điều phối nhập)
router.put('/:id/unassign', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        console.log(`\n⚠️ UNASSIGN IMPORT - ID: ${id}, reason: ${reason || 'Không có lý do'}`);

        const supabase = getSupabase();

        // Find ticket by UUID or ticket_no
        let ticket = null;
        const { data: byNo } = await supabase.from('import_tickets').select('*').eq('ticket_no', id).single();
        if (byNo) {
            ticket = byNo;
        } else {
            const { data: byId } = await supabase.from('import_tickets').select('*').eq('id', id).single();
            if (byId) ticket = byId;
        }

        if (!ticket) {
            return res.json(createResponse(true, 'Không tìm thấy phiếu nhập!'));
        }

        // Check if already completed
        if (ticket.status === 'completed') {
            return res.json(createResponse(true, 'Không thể hủy điều phối phiếu nhập đã hoàn thành!'));
        }

        const previousDriver = ticket.assigned_driver || '';
        const previousPlate = ticket.assigned_plate || '';

        // 1. Delete import driver assignments
        const { data: deletedAssigns } = await supabase
            .from('import_driver_assignments')
            .delete()
            .eq('import_id', ticket.id)
            .select();
        console.log(`🗑️ Deleted ${deletedAssigns?.length || 0} import driver assignments`);

        // 2. Reset import ticket to pending
        const { error: updateErr } = await supabase
            .from('import_tickets')
            .update({
                status: 'pending',
                assigned_driver: null,
                assigned_plate: null,
                assistant_name: null,
                note: reason ? `[HỦY ĐIỀU PHỐI] ${reason}` : '[HỦY ĐIỀU PHỐI]'
            })
            .eq('id', ticket.id);

        if (updateErr) {
            return res.json(createResponse(true, 'Lỗi cập nhật: ' + updateErr.message));
        }
        console.log(`✅ Import ${ticket.ticket_no} reset to pending`);

        // 3. Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            let msg = `⚠️ <b>ĐÃ HỦY ĐIỀU PHỐI NHẬP</b>\n`;
            msg += `📦 <b>#${ticket.ticket_no}</b>\n`;
            msg += `🏭 ${ticket.supplier_name || 'N/A'}\n`;
            if (previousDriver) msg += `🚗 TX cũ: ${previousDriver}${previousPlate ? ` (${previousPlate})` : ''}\n`;
            if (reason) msg += `📝 Lý do: ${reason}\n`;
            msg += `🔄 Phiếu nhập đã về trạng thái <b>Chờ xử lý</b>`;
            await sendTelegramMessage(msg, 'DRIVER');
        } catch (tgErr) {
            console.error('Telegram import unassign error:', tgErr.message);
        }

        res.json(createResponse(false, `Đã hủy điều phối phiếu nhập #${ticket.ticket_no}!`));

    } catch (e) {
        console.error('Unassign import error:', e);
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// PUT /api/imports/:id/start - Start import delivery (supports multi-driver)
router.put('/:id/start', async (req, res) => {
    try {
        const { id } = req.params;
        const { assignment_id } = req.body; // Optional: for multi-driver imports

        const supabase = getSupabase();

        // If multi-driver import, update assignment status
        if (assignment_id) {
            const { error } = await supabase
                .from('import_driver_assignments')
                .update({ status: 'delivering' })
                .eq('id', assignment_id);

            if (error) {
                console.error('Assignment status update error:', error.message);
            } else {
                console.log(`✅ Import assignment ${assignment_id} status -> delivering`);
            }
        }

        const { data, error } = await supabase
            .from('import_tickets')
            .update({
                status: 'in_transit',
                started_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lỗi bắt đầu: ' + error.message));
        }

        res.json({
            error: false,
            msg: 'Đã bắt đầu vận chuyển!',
            data
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/imports/:id/complete - Complete import ticket (supports multi-driver)
router.put('/:id/complete', async (req, res) => {
    try {
        const { id } = req.params;
        const { actual_products, note, local_items, driver, driver_name, plate, assignment_id, warehouse } = req.body;

        console.log(`\n🏁 IMPORT COMPLETE - ID: ${id}`);
        console.log(`📦 Body keys:`, Object.keys(req.body));
        console.log(`🔑 assignment_id: ${assignment_id || 'NONE'}, driver: ${driver || driver_name || 'N/A'}`);

        const supabase = getSupabase();

        // ============================================================
        // MULTI-DRIVER COMPLETION: Check if this is a split import
        // ============================================================
        if (assignment_id) {
            console.log(`🔀 Multi-driver import completion - Assignment: ${assignment_id}`);

            // Calculate total qty from actual_products
            const myActualQty = actual_products?.reduce((sum, p) => sum + Number(p.qty || 0), 0) || 0;

            // Update this assignment as completed
            const { error: updateErr } = await supabase
                .from('import_driver_assignments')
                .update({
                    status: 'completed',
                    actual_qty: myActualQty,
                    local_items: local_items || [],
                    delivery_note: note || '',
                    completed_at: new Date().toISOString()
                })
                .eq('id', assignment_id);

            if (updateErr) {
                console.error('Import assignment update error:', updateErr.message);
            } else {
                console.log(`✅ Import assignment ${assignment_id} completed with ${myActualQty}kg`);
            }

            // Check all assignments for this import
            const { data: assignments } = await supabase
                .from('import_driver_assignments')
                .select('*')
                .eq('import_id', id);

            if (assignments && assignments.length > 1) {
                // Check if ALL drivers completed
                const allCompleted = assignments.every(a => a.status === 'completed');
                const completedCount = assignments.filter(a => a.status === 'completed').length;

                console.log(`📊 Multi-driver import status: ${completedCount}/${assignments.length} completed`);

                if (!allCompleted) {
                    // Partial completion - return early
                    await supabase
                        .from('import_tickets')
                        .update({ note: `${completedCount}/${assignments.length} hoàn thành` })
                        .eq('id', id);

                    return res.json(createResponse(false,
                        `Bạn đã hoàn thành phần của mình! (${completedCount}/${assignments.length} tài xế)`,
                        {
                            partial: true,
                            progress: `${completedCount}/${assignments.length}`,
                            yourQty: myActualQty
                        }
                    ));
                }

                // All completed - proceed with full completion below
                console.log(`🎉 All import drivers completed!`);
            }
        }

        // Fetch original to merge (No-Delete logic) - try UUID first, then ticket_no
        let original = null;
        const { data: byId } = await getSupabase().from('import_tickets').select('*').eq('id', id).single();
        if (byId) {
            original = byId;
        } else {
            // Fallback: try by ticket_no
            const { data: byNo } = await getSupabase().from('import_tickets').select('*').eq('ticket_no', id).single();
            if (byNo) {
                original = byNo;
                console.log(`⚠️ Import found by ticket_no instead of UUID: ${id} → ${byNo.id}`);
            }
        }
        if (!original) {
            console.error(`❌ Import NOT FOUND - id: ${id}`);
            return res.json(createResponse(true, 'Không tìm thấy phiếu nhập'));
        }
        console.log(`✅ Import found: ${original.ticket_no} (status: ${original.status})`);

        const originalProducts = original.products || [];
        const originalMap = {};
        originalProducts.forEach(p => {
            originalMap[p.name || p.code || ''] = { ...p, qty_planned: p.qty, actual_qty: 0 };
        });

        // Actual items delivered/restocked
        if (actual_products && Array.isArray(actual_products)) {
            actual_products.forEach(p => {
                const key = p.name || p.code || '';
                if (originalMap[key]) {
                    originalMap[key].actual_qty = Number(p.qty || 0);
                } else {
                    originalMap[key] = { ...p, qty_planned: 0, actual_qty: Number(p.qty || 0) };
                }
            });
        }

        // Final merged list
        const mergedProducts = Object.values(originalMap).map(m => ({
            ...m,
            qty: m.actual_qty || m.qty // Use actual if provided, else keep original
        }));

        const updateData = {
            status: 'completed',
            products: mergedProducts,
            completed_at: new Date().toISOString()
        };

        // Add optional fields
        if (note) updateData.note = note;
        if (local_items) updateData.local_items = local_items;
        // Note: completed_by and completed_plate columns don't exist in import_tickets
        // Driver info is already stored in driver_name and plate fields

        const { data, error } = await getSupabase()
            .from('import_tickets')
            .update(updateData)
            .eq('id', original.id)
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lỗi hoàn thành: ' + error.message));
        }

        // PERF: Send response to driver IMMEDIATELY — don't wait for Telegram/auto-complete
        res.json({
            error: false,
            msg: 'Hoàn thành phiếu nhập!',
            data
        });

        // BACKGROUND: Telegram notifications + auto-complete (fire-and-forget)
        setImmediate(async () => {
            try {
                // Send Telegram notification with proof images
                try {
                    const { sendTelegramMessage, sendTelegramPhotos } = await import('../services/telegram.js');
                    let msg = `✅ <b>PHIẾU NHẬP ĐÃ HOÀN THÀNH</b>\n`;
                    msg += `📦 <b>#${data.ticket_no}</b>\n`;
                    msg += `🏭 ${data.supplier_name}\n`;
                    if (data.assigned_driver) msg += `🚗 TX: <b>${data.assigned_driver}</b>${data.assigned_plate ? ` (${data.assigned_plate})` : ''}\n`;
                    if (data.assistant_name) msg += `🧑‍🔧 PX: ${data.assistant_name}\n`;
                    msg += `📦 ${mergedProducts.map(p => `${p.name} — ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`).join(', ')}\n`;
                    if (note) msg += `📝 ${note}\n`;

                    // Find proof images from multiple sources
                    let proofImages = [];

                    // 1. Check data.images from the update result
                    if (data.images && Array.isArray(data.images) && data.images.length > 0) {
                        proofImages = data.images;
                    }

                    // 2. Fallback: re-fetch ticket
                    if (proofImages.length === 0) {
                        try {
                            const { data: freshTicket } = await getSupabase()
                                .from('import_tickets')
                                .select('images')
                                .eq('id', original.id)
                                .single();
                            if (freshTicket?.images?.length > 0) proofImages = freshTicket.images;
                        } catch (e) { /* ignore */ }
                    }

                    // 3. Fallback: check import_driver_assignments
                    if (proofImages.length === 0) {
                        try {
                            const { data: assigns } = await supabase
                                .from('import_driver_assignments')
                                .select('proof_images')
                                .eq('import_id', original.id);
                            if (assigns) {
                                for (const a of assigns) {
                                    if (a.proof_images?.length > 0) proofImages = [...proofImages, ...a.proof_images];
                                }
                            }
                        } catch (e) { /* ignore */ }
                    }

                    if (proofImages.length > 0) {
                        await sendTelegramPhotos(proofImages, msg, 'NHAP');
                    } else {
                        await sendTelegramMessage(msg, 'NHAP');
                    }
                    console.log(`📨 Telegram sent for import ${data.ticket_no}`);
                } catch (tgErr) {
                    console.error('Telegram Error:', tgErr.message);
                }

                // AUTO-COMPLETE SISTER ORDERS IN MERGED TRIP
                if (data.merged_order_no && !req.body.prevent_loop) {
                    console.log(`🔗 [Import Complete] Auto-completing sisters for merged trip: ${data.merged_order_no}`);
                    try {
                        const { data: mergedLog } = await supabase
                            .from('merged_orders')
                            .select('source_order_nos')
                            .eq('merged_no', data.merged_order_no)
                            .single();

                        if (mergedLog && mergedLog.source_order_nos) {
                            const currentNo = data.ticket_no;
                            const sisters = mergedLog.source_order_nos.filter(no => no !== currentNo);

                            const currentImages = data.images && Array.isArray(data.images) && data.images.length > 0
                                ? data.images : [];

                            for (const sister of sisters) {
                                console.log(`🤖 Triggering auto-completion for sister: ${sister}`);
                                try {
                                    if (sister.startsWith('N')) {
                                        const updatePayload = {
                                            status: 'completed',
                                            completed_at: new Date().toISOString()
                                        };
                                        if (currentImages.length > 0) {
                                            const { data: sisterTicket } = await supabase
                                                .from('import_tickets')
                                                .select('images')
                                                .eq('ticket_no', sister)
                                                .single();
                                            const sisterImgs = sisterTicket?.images;
                                            if (!sisterImgs || !Array.isArray(sisterImgs) || sisterImgs.length === 0) {
                                                updatePayload.images = currentImages;
                                            }
                                        }
                                        await supabase.from('import_tickets').update(updatePayload).eq('ticket_no', sister);
                                        console.log(`✅ Auto-completed import sister: ${sister}`);

                                        // Send Telegram for sister
                                        try {
                                            const { sendTelegramMessage, sendTelegramPhotos } = await import('../services/telegram.js');
                                            const { data: sisterData } = await supabase
                                                .from('import_tickets').select('*').eq('ticket_no', sister).single();
                                            if (sisterData) {
                                                const sisterProducts = (sisterData.products || [])
                                                    .map(p => `${p.name} — ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`)
                                                    .join(', ');
                                                let sisterMsg = `✅ <b>PHIẾU NHẬP ĐÃ HOÀN THÀNH</b> (tự động)\n`;
                                                sisterMsg += `📦 <b>#${sister}</b>\n`;
                                                sisterMsg += `🏭 ${sisterData.supplier_name || 'N/A'}\n`;
                                                if (sisterData.assigned_driver) sisterMsg += `🚗 TX: <b>${sisterData.assigned_driver}</b>${sisterData.assigned_plate ? ` (${sisterData.assigned_plate})` : ''}\n`;
                                                sisterMsg += `📦 ${sisterProducts || 'Không có SP'}\n`;
                                                sisterMsg += `🔗 Hoàn thành theo phiếu ghép ${data.ticket_no}\n`;
                                                const imgs = sisterData.images && Array.isArray(sisterData.images) ? sisterData.images : [];
                                                if (imgs.length > 0) await sendTelegramPhotos(imgs, sisterMsg, 'NHAP');
                                                else await sendTelegramMessage(sisterMsg, 'NHAP');
                                            }
                                        } catch (tgSisterErr) {
                                            console.error(`⚠️ Telegram error for sister ${sister}:`, tgSisterErr.message);
                                        }
                                    } else {
                                        // Sister is an export order
                                        const fetch = (await import('node-fetch')).default;
                                        const protocol = req.protocol || 'http';
                                        const host = req.get('host') || 'localhost:3000';
                                        const resFetch = await fetch(`${protocol}://${host}/api/orders/${sister}/complete`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                prevent_loop: true,
                                                delivery_note: `Tự động hoàn thành theo phiếu nhập ghép ${currentNo}`,
                                                admin_completed: true,
                                                images: currentImages
                                            })
                                        });
                                        const resData = await resFetch.json();
                                        if (!resData.error) console.log(`✅ Auto-completed export sister: ${sister}`);
                                        else console.error(`❌ Auto-complete failed for ${sister}:`, resData.message);
                                    }
                                } catch (loopErr) {
                                    console.error(`❌ Auto-complete error for ${sister}:`, loopErr.message);
                                }
                            }

                            // Mark merged order as completed
                            await supabase.from('merged_orders').update({
                                status: 'completed',
                                completed_at: new Date().toISOString()
                            }).eq('merged_no', data.merged_order_no);
                        }
                    } catch (err) {
                        console.error('Auto-complete merged orders error:', err.message);
                    }
                }
            } catch (bgErr) {
                console.error('Background task error:', bgErr.message);
            }
        }); // end setImmediate

        return; // Response already sent

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// DELETE /api/imports/:id - Cancel import ticket
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch ticket info before cancelling
        const { data: ticket } = await getSupabase()
            .from('import_tickets')
            .select('ticket_no, supplier_name, status')
            .eq('id', id)
            .single();

        if (ticket) {
            const status = String(ticket.status || '').toLowerCase();
            if (status === 'completed' || status === 'cancelled') {
                return res.json(createResponse(true, 'Đơn đã hoàn thành hoặc đã hủy, không thể hủy'));
            }
        }

        const { error } = await getSupabase()
            .from('import_tickets')
            .update({ status: 'cancelled' })
            .eq('id', id);

        if (error) {
            return res.json(createResponse(true, 'Lỗi hủy phiếu: ' + error.message));
        }

        // Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            let msg = `❌ <b>ĐƠN NHẬP ĐÃ HỦY</b>\n`;
            msg += `📦 <b>#${ticket?.ticket_no || id}</b>\n`;
            msg += `🏭 ${ticket?.supplier_name || 'N/A'}`;
            await sendTelegramMessage(msg, 'SALES');
        } catch (tgErr) {
            console.error('Telegram cancel import error:', tgErr.message);
        }

        res.json({
            error: false,
            msg: 'Đã hủy phiếu nhập'
        });

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// ===============================================
// PROOF IMAGES FOR IMPORT TICKETS
// ===============================================

// GET /api/imports/:id/proof-images - Get proof images
router.get('/:id/proof-images', async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await getSupabase()
            .from('import_tickets')
            .select('images, driver_name:assigned_driver, created_at')
            .eq('id', id)
            .single();

        if (error) {
            return res.json({ error: false, images: [] });
        }

        res.json({
            error: false,
            images: data?.images || [],
            driver_name: data?.driver_name || null,
            created_at: data?.created_at || null
        });

    } catch (e) {
        console.error('Get import proof images error:', e.message);
        res.json({ error: false, images: [] });
    }
});

// POST /api/imports/:id/proof-images - Add proof images to import ticket
router.post('/:id/proof-images', async (req, res) => {
    try {
        const { id } = req.params;
        const { images } = req.body;
        console.log(`📸 IMPORT PROOF-IMAGES - ID: ${id}, images count: ${images?.length || 0}, body size: ${JSON.stringify(req.body).length} bytes`);

        if (!images || !Array.isArray(images) || images.length === 0) {
            return res.json(createResponse(true, 'Vui lòng chọn ít nhất 1 ảnh!'));
        }

        // Get existing images - try UUID first, then ticket_no
        let ticket = null;
        let resolvedId = id;
        const { data: byId, error: fetchError } = await getSupabase()
            .from('import_tickets')
            .select('id, images')
            .eq('id', id)
            .single();

        if (byId) {
            ticket = byId;
            resolvedId = byId.id;
        } else {
            // Fallback: try by ticket_no
            const { data: byNo } = await getSupabase()
                .from('import_tickets')
                .select('id, images')
                .eq('ticket_no', id)
                .single();
            if (byNo) {
                ticket = byNo;
                resolvedId = byNo.id;
                console.log(`⚠️ Proof-images: found by ticket_no: ${id} → ${byNo.id}`);
            }
        }

        if (!ticket) {
            console.error(`❌ Proof-images: Import NOT FOUND - id: ${id}`);
            return res.json(createResponse(true, 'Không tìm thấy phiếu nhập!'));
        }

        const existingImages = ticket?.images || [];
        const totalAllowed = 10 - existingImages.length;

        if (totalAllowed <= 0) {
            return res.json(createResponse(true, 'Đã đạt giới hạn 10 ảnh!'));
        }

        const newImages = images.slice(0, totalAllowed);
        const updatedImages = [...existingImages, ...newImages];

        const { error: updateError } = await getSupabase()
            .from('import_tickets')
            .update({ images: updatedImages })
            .eq('id', resolvedId);

        if (updateError) {
            return res.json(createResponse(true, 'Lỗi lưu ảnh: ' + updateError.message));
        }

        res.json(createResponse(false, `Đã thêm ${newImages.length} ảnh (${updatedImages.length}/10)!`));

    } catch (e) {
        console.error('Add import proof images error:', e.message);
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// DELETE /api/imports/:id/proof-images/:imageIndex - Remove specific proof image
router.delete('/:id/proof-images/:imageIndex', async (req, res) => {
    try {
        const { id, imageIndex } = req.params;
        const idx = parseInt(imageIndex);

        if (isNaN(idx) || idx < 0) {
            return res.json(createResponse(true, 'Chỉ số ảnh không hợp lệ!'));
        }

        const { data: ticket, error: fetchError } = await getSupabase()
            .from('import_tickets')
            .select('images')
            .eq('id', id)
            .single();

        if (fetchError || !ticket) {
            return res.json(createResponse(true, 'Không tìm thấy phiếu nhập!'));
        }

        const images = ticket.images || [];
        if (idx >= images.length) {
            return res.json(createResponse(true, 'Ảnh không tồn tại!'));
        }

        // Remove image at index
        images.splice(idx, 1);

        const { error: updateError } = await getSupabase()
            .from('import_tickets')
            .update({ images })
            .eq('id', id);

        if (updateError) {
            return res.json(createResponse(true, 'Lỗi xóa ảnh: ' + updateError.message));
        }

        res.json(createResponse(false, `Đã xóa ảnh (còn ${images.length}/10)!`));

    } catch (e) {
        console.error('Delete import proof image error:', e.message);
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});
// ===============================================
// REVIEW & ADMIN CONFIRM FOR IMPORT TICKETS
// ===============================================

// GET /api/imports/:id/review - Get import ticket data for review panel
router.get('/:id/review', async (req, res) => {
    try {
        const { id } = req.params;
        const supabase = getSupabase();

        // Try by ticket_no first, then by id
        let ticket = null;
        const { data: byNo } = await supabase
            .from('import_tickets')
            .select('*')
            .eq('ticket_no', id)
            .single();

        if (byNo) {
            ticket = byNo;
        } else {
            const { data: byId } = await supabase
                .from('import_tickets')
                .select('*')
                .eq('id', id)
                .single();
            ticket = byId;
        }

        if (!ticket) {
            return res.json(createResponse(true, 'Không tìm thấy phiếu nhập'));
        }

        // Get proof images from ticket itself
        const proofImages = ticket.images || [];

        res.json({
            error: false,
            data: {
                id: ticket.id,
                orderNo: ticket.ticket_no,
                orderType: 'import',
                customerName: ticket.supplier_name,
                address: ticket.supplier_address || '',
                orderDate: ticket.expected_date || ticket.created_at,
                status: ticket.status,
                driverName: ticket.assigned_driver || '',
                plate: ticket.assigned_plate || '',
                products: ticket.products || [],
                note: ticket.note || '',
                images: proofImages,
                admin_approved: ticket.admin_approved || false
            }
        });

    } catch (e) {
        console.error('Import review error:', e.message);
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// POST /api/imports/:id/admin-confirm - Admin confirms import ticket (no MISA)
router.post('/:id/admin-confirm', async (req, res) => {
    try {
        const { id } = req.params;
        const { confirmed_by } = req.body;
        const supabase = getSupabase();

        // Find ticket by ticket_no first, then by id
        let ticket = null;
        const { data: byNo } = await supabase
            .from('import_tickets')
            .select('id, ticket_no, supplier_name, products, assigned_driver, status')
            .eq('ticket_no', id)
            .single();

        if (byNo) {
            ticket = byNo;
        } else {
            // Try by UUID id
            const { data: byId } = await supabase
                .from('import_tickets')
                .select('id, ticket_no, supplier_name, products, assigned_driver, status')
                .eq('id', id)
                .single();
            if (byId) ticket = byId;
        }

        if (!ticket) {
            return res.json({ error: true, msg: `Không tìm thấy phiếu nhập #${id}` });
        }

        // Update: mark as completed with confirmation note
        // Note: 'confirmed' is not a valid status in import_tickets check constraint
        // Valid statuses: pending, completed, assigned, in_transit
        const { data, error } = await supabase
            .from('import_tickets')
            .update({
                status: 'completed',
                note: `[XÁC NHẬN] bởi ${confirmed_by || 'Admin'} lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
            })
            .eq('id', ticket.id)
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lỗi xác nhận: ' + error.message));
        }

        console.log(`✅ Import ${data.ticket_no} admin-confirmed by ${confirmed_by}`);

        // Send Telegram notification
        try {
            const { sendTelegramMessage, sendTelegramPhotos } = await import('../services/telegram.js');
            const products = data.products || [];
            const productList = products.map(p =>
                `${p.name || p.code} — ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`
            ).join(', ');

            // Chỉ gửi thông báo xác nhận vào nhóm SALES (-1003246064846)
            let confirmMsg = `✅ <b>PHIẾU NHẬP ĐÃ XÁC NHẬN</b>\n`;
            confirmMsg += `📦 <b>#${data.ticket_no}</b>\n`;
            confirmMsg += `🏭 ${data.supplier_name || 'N/A'}\n`;
            if (data.assigned_driver) confirmMsg += `🚗 TX: <b>${data.assigned_driver}</b>${data.assigned_plate ? ` (${data.assigned_plate})` : ''}\n`;
            if (data.assistant_name) confirmMsg += `🧑‍🔧 PX: ${data.assistant_name}\n`;
            if (productList) confirmMsg += `📦 ${productList}\n`;
            confirmMsg += `👤 XN bởi: ${confirmed_by || 'Admin'}`;

            await sendTelegramMessage(confirmMsg, 'SALES');
        } catch (tgErr) {
            console.error('Telegram import confirm error:', tgErr.message);
        }

        res.json({
            error: false,
            msg: `Đã xác nhận phiếu nhập #${data.ticket_no}!`,
            data
        });

    } catch (e) {
        console.error('Admin confirm import error:', e.message);
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// POST /api/imports/:id/reject - Admin từ chối phiếu nhập
router.post('/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const { rejected_by, reason } = req.body;
        const supabase = getSupabase();

        // Find ticket by ticket_no first, then by id
        let ticket = null;
        const { data: byNo } = await supabase
            .from('import_tickets')
            .select('*')
            .eq('ticket_no', id)
            .single();

        if (byNo) {
            ticket = byNo;
        } else {
            const { data: byId } = await supabase
                .from('import_tickets')
                .select('*')
                .eq('id', id)
                .single();
            if (byId) ticket = byId;
        }

        if (!ticket) {
            return res.json({ error: true, msg: `Không tìm thấy phiếu nhập #${id}` });
        }

        const rejectNote = `[TỪ CHỐI] Bởi ${rejected_by || 'admin'} lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}${reason ? ' - Lý do: ' + reason : ''}`;

        // Reset status to pending and store rejection note
        const { data, error } = await supabase
            .from('import_tickets')
            .update({
                status: 'pending',
                note: rejectNote
            })
            .eq('id', ticket.id)
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lỗi từ chối: ' + error.message));
        }

        // Reset driver assignments
        try {
            await supabase
                .from('import_driver_assignments')
                .update({ status: 'pending' })
                .eq('import_id', ticket.id)
                .eq('status', 'completed');
            console.log(`🔄 Reset import driver assignments for ${ticket.ticket_no}`);
        } catch (assignErr) {
            console.error('Reset import assignments error:', assignErr.message);
        }

        // Telegram notification → SALES group only (-1003246064846)
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const products = (ticket.products || []).map(p =>
                `  • ${p.name || p.code}: ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`
            ).join('\n');
            let msg = `❌ <b>TỪ CHỐI PHIẾU NHẬP</b>\n`;
            msg += `📦 <b>#${ticket.ticket_no}</b>\n`;
            msg += `🏭 ${ticket.supplier_name || 'N/A'}\n`;
            if (products) msg += `📋 Sản phẩm:\n${products}\n`;
            msg += `👔 Từ chối bởi: ${rejected_by || 'admin'}\n`;
            if (reason) msg += `📝 Lý do: ${reason}`;
            await sendTelegramMessage(msg, 'SALES');
        } catch (tgErr) {
            console.error('Telegram import reject error:', tgErr.message);
        }

        console.log(`❌ Import ${ticket.ticket_no} rejected by ${rejected_by}`);
        res.json(createResponse(false, `Đã từ chối phiếu nhập #${ticket.ticket_no}!`));
    } catch (e) {
        console.error('Import reject error:', e.message);
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

export default router;
