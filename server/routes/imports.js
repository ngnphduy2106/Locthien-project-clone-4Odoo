// ===============================================
// IMPORT TICKETS ROUTES (Phiếu nhập)
// ===============================================

import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { createResponse, getTimestamp, generateOrderCode } from '../config.js';
import { uploadImages } from '../services/storage.js';
import { createNotification } from './notifications.js';

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
function getSupabase() {
    if (!supabase) {
        if (url && key) {
        }
    }
    return supabase;
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
        // Batch-fetch import assignments to detect external drivers
        const imports = data || [];
        try {
            const { data: allAssigns } = await getSupabase()
                .from('import_driver_assignments')
                .select('import_id, driver_type')
                .in('status', ['pending', 'delivering', 'completed']);

            if (allAssigns && allAssigns.length > 0) {
                const externalByImport = {};
                for (const a of allAssigns) {
                    if (a.driver_type === 'external') externalByImport[a.import_id] = true;
                }
                for (const imp of imports) {
                    if (externalByImport[imp.id]) imp.has_external_driver = true;
                }
            }
        } catch (assignErr) {
            // Non-critical — just skip the flag
        }

        res.json({
            error: false,
            data: imports
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

        const ticketNo = await generateOrderCode('N'); // N2603001 format

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
            if (productsList) msg += `📦\n${productsList}\n`;
            if (supplier_address) msg += `📍 ${supplier_address}\n`;
            if (description || note) msg += `📝 ${description || note}\n`;

            console.log(`📨 Sending import notification for ${ticketNo} to NOTIFY_NHAP (chatId: ${process.env.TELEGRAM_CHAT_NOTIFY_NHAP})`);
            const result = await sendTelegramMessage(msg, 'NOTIFY_NHAP');
            console.log(`📨 Import notification result for ${ticketNo}:`, result ? 'OK (msgId: ' + result + ')' : 'FAILED/SKIPPED');
        } catch (tgErr) {
            console.error(`❌ Telegram Error for ${ticketNo}:`, tgErr.message, tgErr.stack);
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

// POST /api/imports/resend-notification/:ticketNo - Resend Telegram notification for a completed import
router.post('/resend-notification/:ticketNo', async (req, res) => {
    try {
        const { ticketNo } = req.params;
        const { data: ticket } = await getSupabase()
            .from('import_tickets')
            .select('*')
            .eq('ticket_no', ticketNo)
            .single();

        if (!ticket) {
            return res.json(createResponse(true, 'Không tìm thấy phiếu nhập: ' + ticketNo));
        }

        const { sendTelegramMessage, sendTelegramPhotos } = await import('../services/telegram.js');
        const products = ticket.products || [];
        const productsList = products
            .map(p => `- ${p.name || p.code}: ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`)
            .join('\n');

        const isPending = ['pending', 'assigned'].includes(ticket.status);

        let msg, targetGroup;

        if (isPending) {
            // Đơn mới / chờ xử lý → gửi vào NOTIFY_NHAP (giống lúc tạo đơn)
            msg = `🟥 <b>NHẬP HÀNG</b>\n`;
            msg += `📦 <b>#${ticket.ticket_no}</b>\n`;
            if (ticket.expected_date) {
                const fmtDate = new Date(ticket.expected_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                msg += `📅 ${fmtDate}\n`;
            }
            msg += `🏭 <b>${ticket.supplier_name}</b>\n`;
            if (productsList) msg += `📦\n${productsList}\n`;
            if (ticket.supplier_address) msg += `📍 ${ticket.supplier_address}\n`;
            if (ticket.description || ticket.note) msg += `📝 ${ticket.description || ticket.note}\n`;
            if (ticket.assigned_driver) {
                msg += `🚗 TX: <b>${ticket.assigned_driver}</b>${ticket.assigned_plate ? ` (${ticket.assigned_plate})` : ''}\n`;
            }
            targetGroup = 'NOTIFY_NHAP';
        } else {
            // Đơn hoàn thành → gửi vào NHAP
            msg = `✅ <b>PHIẾU NHẬP ĐÃ HOÀN THÀNH</b>\n`;
            msg += `📦 <b>#${ticket.ticket_no}</b>\n`;
            msg += `🏭 ${ticket.supplier_name}\n`;
            if (ticket.assigned_driver) {
                msg += `🚗 TX: <b>${ticket.assigned_driver}</b>${ticket.assigned_plate ? ` (${ticket.assigned_plate})` : ''}\n`;
            }
            msg += `📦 ${products.map(p => `${p.name} — ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`).join(', ')}\n`;
            if (ticket.note) msg += `📝 ${ticket.note}\n`;
            targetGroup = 'NHAP';
        }

        // Try to send with proof images (for completed orders)
        let proofImages = ticket.images || [];
        if (!isPending && proofImages.length === 0) {
            const supabase = getSupabase();
            const { data: assigns } = await supabase
                .from('import_driver_assignments')
                .select('proof_images')
                .eq('import_id', ticket.id);
            if (assigns) {
                for (const a of assigns) {
                    if (a.proof_images?.length > 0) proofImages = [...proofImages, ...a.proof_images];
                }
            }
        }

        if (proofImages.length > 0) {
            await sendTelegramPhotos(proofImages, msg, targetGroup);
        } else {
            await sendTelegramMessage(msg, targetGroup);
        }

        console.log(`📨 Resent Telegram (${targetGroup}) for import ${ticketNo}`);
        res.json(createResponse(false, `Đã gửi lại thông báo cho ${ticketNo} vào group ${isPending ? 'Thông báo nhập' : 'Nhập hàng'}`));
    } catch (e) {
        console.error('Resend import notification error:', e.message);
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/imports/:id - Update import ticket basic info
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { supplier_name, supplier_address, expected_date, note, products } = req.body;

        // 1. Fetch OLD data BEFORE update (for change comparison)
        const { data: oldData } = await getSupabase()
            .from('import_tickets')
            .select('*')
            .eq('id', id)
            .single();

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

        // 2. Compare old → new and send formatted notification (same style as export)
        if (oldData) {
            try {
                const changes = [];
                const ticketNo = data?.ticket_no || oldData?.ticket_no || id;
                const oldSup = oldData.supplier_name || '';
                const newSup = data.supplier_name || supplier_name || '';
                const oldAddr = oldData.supplier_address || '';
                const newAddr = data.supplier_address || supplier_address || '';
                const oldDate = oldData.expected_date || '';
                const newDate = data.expected_date || '';
                const oldNote = oldData.note || '';
                const newNote = data.note || '';

                if (newSup && newSup !== oldSup) {
                    changes.push(`🏭 NCC: ${oldSup || '(trống)'} → ${newSup}`);
                }
                if (newAddr && newAddr !== oldAddr) {
                    changes.push(`📍 Địa chỉ: ${oldAddr || '(trống)'} → ${newAddr}`);
                }
                if (newDate && newDate !== oldDate) {
                    const fmtOld = oldDate ? new Date(oldDate).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '(trống)';
                    const fmtNew = new Date(newDate).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                    changes.push(`📅 Ngày: ${fmtOld} → ${fmtNew}`);
                }
                if (newNote && newNote !== oldNote) {
                    changes.push(`📝 Ghi chú: ${newNote}`);
                }

                // Product comparison: detect qty changes, additions, removals
                const newProducts = data?.products || products || [];
                const oldProducts = oldData?.products || [];
                for (const np of newProducts) {
                    const npName = np.name || np.product || np.code || '';
                    const npQty = Number(np.qty || 0);
                    const npUnit = np.unit || 'Kg';
                    const op = oldProducts.find(p =>
                        (p.name || p.product || p.code) === npName ||
                        (p.code && p.code === np.code)
                    );
                    if (op) {
                        const opQty = Number(op.qty || 0);
                        if (Math.abs(npQty - opQty) > 0.01) {
                            changes.push(`📦 ${npName}: ${opQty.toLocaleString('vi-VN')} → ${npQty.toLocaleString('vi-VN')} ${npUnit}`);
                        }
                    } else {
                        changes.push(`📦 + ${npName}: ${npQty.toLocaleString('vi-VN')} ${npUnit}`);
                    }
                }
                for (const op of oldProducts) {
                    const opName = op.name || op.product || op.code || '';
                    const found = newProducts.find(p =>
                        (p.name || p.product || p.code) === opName ||
                        (p.code && p.code === op.code)
                    );
                    if (!found) {
                        changes.push(`📦 - ${opName}: ${Number(op.qty || 0).toLocaleString('vi-VN')} ${op.unit || 'Kg'} (đã xóa)`);
                    }
                }

                // 3. Send Telegram if there are actual changes
                if (changes.length > 0) {
                    const { sendTelegramMessage } = await import('../services/telegram.js');
                    let msg = `🔄 <b>CẬP NHẬT PHIẾU NHẬP</b>\n`;
                    msg += `📋 Mã: <b>#${ticketNo}</b>\n`;
                    msg += `🏭 NCC: <b>${newSup || oldSup || 'N/A'}</b>\n`;
                    msg += `<blockquote>${changes.join('\n')}</blockquote>`;
                    await sendTelegramMessage(msg, 'NOTIFY_NHAP');
                    console.log(`📢 Import edit notification for ${ticketNo}: ${changes.length} changes`);
                }

                // 4. In-app + FCM push to assigned driver (if any)
                const driverName = data?.assigned_driver || oldData?.assigned_driver;
                if (driverName) {
                    try {
                        const { createNotification } = await import('./notifications.js');
                        await createNotification(
                            driverName,
                            'order_edited',
                            `⚠️ Phiếu nhập chỉnh sửa`,
                            `#${ticketNo} - ${newSup || oldSup || 'NCC'}`,
                            id,
                            ticketNo
                        );
                    } catch (notifErr) {
                        console.error('Import edit in-app notification error:', notifErr.message);
                    }
                }

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

        // In-app + FCM push notification to driver
        try {
            const { createNotification } = await import('./notifications.js');
            const ticketNo = data?.ticket_no || id;
            const supplier = data?.supplier_name || '';
            await createNotification(
                driver_name,
                'order_assigned',
                `🚛 Đơn nhập mới`,
                `#${ticketNo} - ${supplier}`,
                id,
                ticketNo
            );
        } catch (notifyErr) {
            console.error('Import assign notification error:', notifyErr.message);
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
            if (productsList) msg += `📦\n${productsList}\n`;
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

        // In-app + FCM push notification to each assigned driver
        try {
            const { data: ticketInfo } = await supabase.from('import_tickets').select('ticket_no, supplier_name').eq('id', id).single();
            const ticketNo = ticketInfo?.ticket_no || id;
            const supplier = ticketInfo?.supplier_name || '';

            const notifiedDrivers = new Set();
            for (const a of assignments) {
                if (a.driver_name && !notifiedDrivers.has(a.driver_name)) {
                    notifiedDrivers.add(a.driver_name);
                    await createNotification(
                        a.driver_name,
                        'order_assigned',
                        '🚛 Phiếu nhập mới',
                        `#${ticketNo} - ${supplier}`,
                        id,
                        ticketNo
                    );
                    console.log(`📬 Import dispatch FCM sent to driver: ${a.driver_name}`);
                }
            }
        } catch (notifyErr) {
            console.error('Import dispatch FCM notification error:', notifyErr.message);
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

// PUT /api/imports/:id/edit-assignment - Edit driver name & plate for import assignments
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

        console.log(`\n✏️ EDIT IMPORT ASSIGNMENT - Import: ${id}, Assignment: ${assignment_id}`);

        const supabase = getSupabase();

        // Verify assignment exists
        const { data: assignment, error: lookupErr } = await supabase
            .from('import_driver_assignments')
            .select('id, import_id, driver_name, plate, status')
            .eq('id', assignment_id)
            .single();

        if (lookupErr || !assignment) {
            return res.json(createResponse(true, 'Không tìm thấy phân công!'));
        }

        if (assignment.status === 'completed') {
            return res.json(createResponse(true, 'Không thể chỉnh sửa phân công đã hoàn thành!'));
        }

        const oldDriverName = assignment.driver_name;
        const oldPlate = assignment.plate;

        // Update assignment
        const { error: updateErr } = await supabase
            .from('import_driver_assignments')
            .update({
                driver_name: driver_name.trim(),
                plate: (plate || '').trim()
            })
            .eq('id', assignment_id);

        if (updateErr) {
            return res.json(createResponse(true, 'Lỗi cập nhật: ' + updateErr.message));
        }

        // Update import ticket main driver if this is the primary
        const { data: allAssignments } = await supabase
            .from('import_driver_assignments')
            .select('id, driver_name, plate')
            .eq('import_id', assignment.import_id)
            .order('created_at', { ascending: true });

        if (allAssignments && allAssignments.length > 0 && allAssignments[0].id === assignment_id) {
            await supabase.from('import_tickets').update({
                assigned_driver: driver_name.trim(),
                assigned_plate: (plate || '').trim()
            }).eq('id', assignment.import_id);
        }

        console.log(`✅ Import assignment ${assignment_id} updated: ${oldDriverName} → ${driver_name}`);
        res.json(createResponse(false, `Đã cập nhật tài xế: ${driver_name}!`));

    } catch (e) {
        console.error('Edit import assignment error:', e);
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
                    if (data.assigned_driver) {
                        const isDriverReporter = !req.body.admin_completed;
                        msg += `🚗 TX: ${isDriverReporter ? '<b>' + data.assigned_driver + '</b>' : data.assigned_driver}${data.assigned_plate ? ` (${data.assigned_plate})` : ''}\n`;
                    }
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

                // Merged auto-complete DISABLED — drivers must complete each order in the merged trip manually
                // (Previously auto-completed sister orders when one import was completed)
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
            await sendTelegramMessage(msg, 'NOTIFY_NHAP');
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

        // Upload to Supabase Storage: convert base64 → CDN URLs
        const imageUrls = await uploadImages(images.slice(0, totalAllowed), id);
        console.log(`📸 Import storage: ${imageUrls.filter(u => u.startsWith('http')).length}/${images.length} uploaded`);
        const updatedImages = [...existingImages, ...imageUrls];

        const { error: updateError } = await getSupabase()
            .from('import_tickets')
            .update({ images: updatedImages })
            .eq('id', resolvedId);

        if (updateError) {
            return res.json(createResponse(true, 'Lỗi lưu ảnh: ' + updateError.message));
        }

        res.json(createResponse(false, `Đã thêm ${imageUrls.length} ảnh (${updatedImages.length}/10)!`));

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

        // Enrich with source_order_nos for merged orders
        let source_order_nos = null;
        if (ticket.merged_order_no) {
            try {
                const { data: mergedLog } = await supabase
                    .from('merged_orders')
                    .select('source_order_nos')
                    .eq('merged_no', ticket.merged_order_no)
                    .single();
                source_order_nos = mergedLog?.source_order_nos || null;
            } catch (e) { }
        }

        // Fetch driver assignments to get actual quantities entered by driver
        let assignments = [];
        try {
            const { data: assigns } = await supabase
                .from('import_driver_assignments')
                .select('driver_name, plate, assigned_qty, actual_qty, status, proof_images')
                .eq('import_id', ticket.id)
                .order('created_at', { ascending: true });
            assignments = assigns || [];
        } catch (e) { }

        // Overlay actual_qty onto products if driver has entered them
        let reviewProducts = ticket.products || [];
        const totalActualQty = assignments.reduce((sum, a) => sum + Number(a.actual_qty || 0), 0);
        if (totalActualQty > 0 && reviewProducts.length > 0) {
            // If only 1 product, use total actual_qty directly
            if (reviewProducts.length === 1) {
                reviewProducts = [{ ...reviewProducts[0], qty: totalActualQty }];
            } else {
                // Multiple products: scale proportionally based on actual vs assigned total
                const totalAssigned = assignments.reduce((sum, a) => sum + Number(a.assigned_qty || 0), 0);
                if (totalAssigned > 0) {
                    const ratio = totalActualQty / totalAssigned;
                    reviewProducts = reviewProducts.map(p => ({
                        ...p,
                        qty: Math.round(Number(p.qty || 0) * ratio)
                    }));
                }
            }
        }

        // Collect proof images from assignments too
        let allImages = ticket.images || [];
        for (const a of assignments) {
            if (a.proof_images && Array.isArray(a.proof_images)) {
                allImages = [...allImages, ...a.proof_images];
            }
        }

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
                products: reviewProducts,
                note: ticket.note || '',
                images: allImages,
                admin_approved: ticket.admin_approved || false,
                merged_order_no: ticket.merged_order_no || null,
                source_order_nos: source_order_nos,
                assignments: assignments
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
        const { confirmed_by, products: editedProducts } = req.body;
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
        const updatePayload = {
            status: 'completed',
            note: `[XÁC NHẬN] bởi ${confirmed_by || 'Admin'} lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
        };
        // Save edited products if reviewer modified quantities
        if (editedProducts && Array.isArray(editedProducts) && editedProducts.length > 0) {
            updatePayload.products = editedProducts;
            updatePayload.total_qty = editedProducts.reduce((sum, p) => sum + Number(p.qty || 0), 0);
            console.log(`📝 Admin confirm: saving ${editedProducts.length} edited products`);
        }
        const { data, error } = await supabase
            .from('import_tickets')
            .update(updatePayload)
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

        // In-app + FCM push notification to the assigned driver
        try {
            const driverName = data.assigned_driver || '';
            if (driverName) {
                await createNotification(
                    driverName,
                    'order_completed',
                    '✅ Phiếu nhập đã được xác nhận',
                    `#${data.ticket_no} — Xác nhận bởi ${confirmed_by || 'Admin'}`,
                    ticket.id,
                    data.ticket_no
                );
                console.log(`📬 Import confirm notification sent to driver: ${driverName}`);
            }
        } catch (notifyErr) {
            console.error('In-app import confirm notification error:', notifyErr.message);
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

        // Reset status to assigned so driver still sees the order and can re-deliver
        const { data, error } = await supabase
            .from('import_tickets')
            .update({
                status: 'assigned',
                note: rejectNote
            })
            .eq('id', ticket.id)
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lỗi từ chối: ' + error.message));
        }

        // Reset driver assignments to delivering so driver sees the order again
        try {
            await supabase
                .from('import_driver_assignments')
                .update({ status: 'delivering' })
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

                // In-app notification for the assigned driver
        try {
            const driverName = ticket.assigned_driver || '';
            if (driverName) {
                await createNotification(
                    driverName,
                    'order_rejected',
                    '❌ Phiếu nhập bị từ chối',
                    `#${ticket.ticket_no} — ${reason || 'Vui lòng kiểm tra lại'}`,
                    ticket.id,
                    ticket.ticket_no
                );
            }
        } catch (notifyErr) {
            console.error('In-app import reject notification error:', notifyErr.message);
        }

        console.log(`❌ Import ${ticket.ticket_no} rejected by ${rejected_by}`);
        res.json(createResponse(false, `Đã từ chối phiếu nhập #${ticket.ticket_no}!`));
    } catch (e) {
        console.error('Import reject error:', e.message);
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

export default router;
