// ===============================================
// IMPORT TICKETS ROUTES (Phiáº¿u nháº­p)
// ===============================================

import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { createResponse, getTimestamp, generateOrderCode } from '../config.js';
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
            return res.json(createResponse(true, 'Lá»—i táº£i phiáº¿u nháº­p: ' + error.message));
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
            // Non-critical â€” just skip the flag
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

        console.log(`ðŸ“‹ Found ${(data || []).length} assignments for import ${id}`);

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

        console.log('ðŸ“¥ Create Import - Received body:', JSON.stringify({ supplier_name, description, note }, null, 2));

        if (!supplier_name || !products || !products.length) {
            return res.json(createResponse(true, 'Thiáº¿u thÃ´ng tin nhÃ  cung cáº¥p hoáº·c sáº£n pháº©m'));
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
                description: description || '',  // MÃ´ táº£ tá»« form táº¡o Ä‘Æ¡n
                note: note || '',  // Ghi chÃº cá»§a tÃ i xáº¿ (khi giao hÃ ng)
                status: 'pending',
                created_by: created_by || 'Admin'
            })
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lá»—i táº¡o phiáº¿u: ' + error.message));
        }

        // Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const productsList = (products || [])
                .map(p => `- ${p.name || p.code}: ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`)
                .join('\n');

            let msg = `ðŸŸ¥ <b>NHáº¬P HÃ€NG</b>\n`;
            msg += `ðŸ“¦ <b>#${ticketNo}</b>\n`;
            if (expected_date) {
                const fmtDate = new Date(expected_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                msg += `ðŸ“… ${fmtDate}\n`;
            }
            msg += `ðŸ­ <b>${supplier_name}</b>\n`;
            if (productsList) msg += `ðŸ“¦\n${productsList}\n`;
            if (supplier_address) msg += `ðŸ“ ${supplier_address}\n`;
            if (description || note) msg += `ðŸ“ ${description || note}\n`;

            await sendTelegramMessage(msg, 'NOTIFY_NHAP');
        } catch (tgErr) {
            console.error('Telegram Error:', tgErr.message);
        }

        res.json({
            error: false,
            msg: 'Táº¡o phiáº¿u nháº­p thÃ nh cÃ´ng! MÃ£: ' + ticketNo,
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

        // 2. Compare old -> new and send formatted notification (same style as export)
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
                    let msg = `🔄 <b>CẬP NH\u1eacT PHIẾU NHẬP</b>\n`;
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
            return res.json(createResponse(true, 'Lá»—i ghim phiáº¿u: ' + error.message));
        }

        console.log(`ðŸ“Œ Import ${id} pinned: ${is_pinned}`);
        res.json(createResponse(false, is_pinned ? 'ÄÃ£ ghim phiáº¿u nháº­p!' : 'ÄÃ£ bá» ghim phiáº¿u nháº­p!'));
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
            return res.json(createResponse(true, 'Lá»—i gÃ¡n tÃ i xáº¿: ' + error.message));
        }

        // In-app + FCM push notification to driver
        try {
            const { createNotification } = await import('./notifications.js');
            const ticketNo = data?.ticket_no || id;
            const supplier = data?.supplier_name || '';
            await createNotification(
                driver_name,
                'order_assigned',
                `ðŸš› ÄÆ¡n nháº­p má»›i`,
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

            let msg = `ðŸš› <b>PHÃ‚N CÃ”NG NHáº¬P HÃ€NG</b>\n`;
            msg += `ðŸ“¦ <b>#${data?.ticket_no || id}</b>\n`;
            if (data?.expected_date) {
                const fmtDate = new Date(data.expected_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                msg += `ðŸ“… ${fmtDate}\n`;
            }
            msg += `ðŸ­ <b>${data?.supplier_name || ''}</b>\n`;
            if (productsList) msg += `ðŸ“¦\n${productsList}\n`;
            if (data?.supplier_address) msg += `ðŸ“ ${data.supplier_address}\n`;
            if (data?.merged_order_no) msg += `ðŸ”— GhÃ©p chuyáº¿n: ${data.merged_order_no}\n`;
            msg += `â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n`;
            msg += `ðŸš— TÃ i xáº¿: <b>${driver_name}</b>\n`;
            if (assistant_name) {
                const assistantObj = users.find(u => u.fullName === assistant_name || u.username === assistant_name);
                const assistantMention = getTelegramTag(assistantObj?.telegramUsername, assistantObj?.telegramUserId, assistant_name);
                if (assistantMention) mentionTags.push(assistantMention.trim());
                msg += `ðŸ§‘â€ðŸ”§ Phá»¥ xe: ${assistant_name}\n`;
            }
            msg += `ðŸ”¢ Biá»ƒn sá»‘: ${plate || 'ChÆ°a cÃ³'}\n`;

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
            msg: 'ÄÃ£ gÃ¡n tÃ i xáº¿!',
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
            return res.json(createResponse(true, 'ChÆ°a cÃ³ phÃ¢n cÃ´ng nÃ o!'));
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
            return res.json(createResponse(true, 'Lá»—i lÆ°u phÃ¢n cÃ´ng: ' + error.message));
        }

        // Update import with first driver info (main driver)
        const mainDriver = assignments[0];
        await supabase
            .from('import_tickets')
            .update({
                status: 'assigned',
                assigned_driver: mainDriver.driver_name,
                assigned_plate: mainDriver.plate || '',
                note: assignments.length > 1 ? `Chia ${assignments.length} tÃ i xáº¿` : (mainDriver.note || '')
            })
            .eq('id', id);

        // Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const { data: impData } = await supabase.from('import_tickets').select('*').eq('id', id).single();

            let msg = `ðŸš› <b>PHÃ‚N CÃ”NG NHáº¬P HÃ€NG</b>\n`;
            msg += `ðŸ“¦ <b>#${impData?.ticket_no || id}</b>\n`;
            if (impData?.expected_date) {
                const fmtDate = new Date(impData.expected_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                msg += `ðŸ“… ${fmtDate}\n`;
            }
            msg += `ðŸ­ <b>${impData?.supplier_name || ''}</b>\n`;
            if (impData?.merged_order_no) msg += `ðŸ”— GhÃ©p chuyáº¿n: ${impData.merged_order_no}\n`;
            if (assignments.length > 1) msg += `âœ‚ï¸ Chia ${assignments.length} tÃ i xáº¿\n`;
            msg += `\n<b>Danh sÃ¡ch tÃ i xáº¿:</b>\n`;

            // Lookup users for Telegram tags
            const { data: users } = await supabase.from('users').select('fullname, username, telegram_username, telegram_user_id');
            const userList = (users || []).map(u => ({ fullName: u.fullname, username: u.username, telegramUsername: u.telegram_username, telegramUserId: u.telegram_user_id }));
            const mentionTags = [];

            assignments.forEach((a, i) => {
                const typeLabel = a.type === 'external' ? '(NgoÃ i)' : '(NB)';
                const driverObj = userList.find(u => u.fullName === a.driver_name || u.username === a.driver_name);
                const driverMention = getTelegramTag(driverObj?.telegramUsername, driverObj?.telegramUserId, a.driver_name);
                if (driverMention) mentionTags.push(driverMention.trim());

                let assistantLine = '';
                if (a.assistant_name) {
                    const assistantObj = userList.find(u => u.fullName === a.assistant_name || u.username === a.assistant_name);
                    const assistantMention = getTelegramTag(assistantObj?.telegramUsername, assistantObj?.telegramUserId, a.assistant_name);
                    if (assistantMention) mentionTags.push(assistantMention.trim());
                    assistantLine = `\n    ðŸ§‘â€ðŸ”§ PX: ${a.assistant_name}`;
                }

                msg += `${i + 1}. <b>${a.driver_name}</b> ${typeLabel} - ${Number(a.qty).toLocaleString('vi-VN')}kg${assistantLine}\n`;
                if (a.plate) msg += `    ðŸ”¢ Xe: ${a.plate}\n`;
                if (a.delivery_time) msg += `    â° Giao: ${a.delivery_time}\n`;
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
            console.log(`ðŸ”— [Import] Processing merge with: ${req.body.mergeWithOrderNo}`);
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
                            status: 'Äang thá»±c hiá»‡n',
                            custom_field13: mainDriverName,
                            custom_field14: mainPlate
                        }).eq('id', partnerOrder.id);
                        console.log(`âœ… Export partner ${partnerNo} synced: status=Äang thá»±c hiá»‡n, driver=${mainDriverName}`);
                    } else {
                        await supabase.from('import_tickets').update({
                            merged_order_no: finalMergedOrderNo,
                            status: 'assigned',
                            assigned_driver: mainDriverName,
                            assigned_plate: mainPlate
                        }).eq('ticket_no', mergePartnerNo);
                        console.log(`âœ… Import partner ${mergePartnerNo} synced: status=assigned, driver=${mainDriverName}`);
                    }
                }

                // Update current import with merged_order_no
                await supabase.from('import_tickets').update({
                    merged_order_no: finalMergedOrderNo
                }).eq('id', id);

                console.log(`ðŸ”— Merge complete: ${currentTicketNo} + ${partnerNo} = ${finalMergedOrderNo}`);
            }
        }

        res.json(createResponse(false, `ÄÃ£ phÃ¢n cÃ´ng ${assignments.length} tÃ i xáº¿!`));

    } catch (e) {
        console.error('Multi-assign import error:', e);
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/imports/:id/unassign - Cancel dispatch for import (há»§y Ä‘iá»u phá»‘i nháº­p)
router.put('/:id/unassign', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        console.log(`\nâš ï¸ UNASSIGN IMPORT - ID: ${id}, reason: ${reason || 'KhÃ´ng cÃ³ lÃ½ do'}`);

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
            return res.json(createResponse(true, 'KhÃ´ng tÃ¬m tháº¥y phiáº¿u nháº­p!'));
        }

        // Check if already completed
        if (ticket.status === 'completed') {
            return res.json(createResponse(true, 'KhÃ´ng thá»ƒ há»§y Ä‘iá»u phá»‘i phiáº¿u nháº­p Ä‘Ã£ hoÃ n thÃ nh!'));
        }

        const previousDriver = ticket.assigned_driver || '';
        const previousPlate = ticket.assigned_plate || '';

        // 1. Delete import driver assignments
        const { data: deletedAssigns } = await supabase
            .from('import_driver_assignments')
            .delete()
            .eq('import_id', ticket.id)
            .select();
        console.log(`ðŸ—‘ï¸ Deleted ${deletedAssigns?.length || 0} import driver assignments`);

        // 2. Reset import ticket to pending
        const { error: updateErr } = await supabase
            .from('import_tickets')
            .update({
                status: 'pending',
                assigned_driver: null,
                assigned_plate: null,
                assistant_name: null,
                note: reason ? `[Há»¦Y ÄIá»€U PHá»I] ${reason}` : '[Há»¦Y ÄIá»€U PHá»I]'
            })
            .eq('id', ticket.id);

        if (updateErr) {
            return res.json(createResponse(true, 'Lá»—i cáº­p nháº­t: ' + updateErr.message));
        }
        console.log(`âœ… Import ${ticket.ticket_no} reset to pending`);

        // 3. Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            let msg = `âš ï¸ <b>ÄÃƒ Há»¦Y ÄIá»€U PHá»I NHáº¬P</b>\n`;
            msg += `ðŸ“¦ <b>#${ticket.ticket_no}</b>\n`;
            msg += `ðŸ­ ${ticket.supplier_name || 'N/A'}\n`;
            if (previousDriver) msg += `ðŸš— TX cÅ©: ${previousDriver}${previousPlate ? ` (${previousPlate})` : ''}\n`;
            if (reason) msg += `ðŸ“ LÃ½ do: ${reason}\n`;
            msg += `ðŸ”„ Phiáº¿u nháº­p Ä‘Ã£ vá» tráº¡ng thÃ¡i <b>Chá» xá»­ lÃ½</b>`;
            await sendTelegramMessage(msg, 'DRIVER');
        } catch (tgErr) {
            console.error('Telegram import unassign error:', tgErr.message);
        }

        res.json(createResponse(false, `ÄÃ£ há»§y Ä‘iá»u phá»‘i phiáº¿u nháº­p #${ticket.ticket_no}!`));

    } catch (e) {
        console.error('Unassign import error:', e);
        res.json(createResponse(true, 'Lá»—i: ' + e.message));
    }
});

// PUT /api/imports/:id/edit-assignment - Edit driver name & plate for import assignments
router.put('/:id/edit-assignment', async (req, res) => {
    try {
        const { id } = req.params;
        const { assignment_id, driver_name, plate } = req.body;

        if (!assignment_id) {
            return res.json(createResponse(true, 'Thiáº¿u assignment_id!'));
        }
        if (!driver_name) {
            return res.json(createResponse(true, 'Vui lÃ²ng nháº­p tÃªn tÃ i xáº¿!'));
        }

        console.log(`\nâœï¸ EDIT IMPORT ASSIGNMENT - Import: ${id}, Assignment: ${assignment_id}`);

        const supabase = getSupabase();

        // Verify assignment exists
        const { data: assignment, error: lookupErr } = await supabase
            .from('import_driver_assignments')
            .select('id, import_id, driver_name, plate, status')
            .eq('id', assignment_id)
            .single();

        if (lookupErr || !assignment) {
            return res.json(createResponse(true, 'KhÃ´ng tÃ¬m tháº¥y phÃ¢n cÃ´ng!'));
        }

        if (assignment.status === 'completed') {
            return res.json(createResponse(true, 'KhÃ´ng thá»ƒ chá»‰nh sá»­a phÃ¢n cÃ´ng Ä‘Ã£ hoÃ n thÃ nh!'));
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
            return res.json(createResponse(true, 'Lá»—i cáº­p nháº­t: ' + updateErr.message));
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

        console.log(`âœ… Import assignment ${assignment_id} updated: ${oldDriverName} â†’ ${driver_name}`);
        res.json(createResponse(false, `ÄÃ£ cáº­p nháº­t tÃ i xáº¿: ${driver_name}!`));

    } catch (e) {
        console.error('Edit import assignment error:', e);
        res.json(createResponse(true, 'Lá»—i: ' + e.message));
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
                console.log(`âœ… Import assignment ${assignment_id} status -> delivering`);
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
            return res.json(createResponse(true, 'Lá»—i báº¯t Ä‘áº§u: ' + error.message));
        }

        res.json({
            error: false,
            msg: 'ÄÃ£ báº¯t Ä‘áº§u váº­n chuyá»ƒn!',
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

        console.log(`\nðŸ IMPORT COMPLETE - ID: ${id}`);
        console.log(`ðŸ“¦ Body keys:`, Object.keys(req.body));
        console.log(`ðŸ”‘ assignment_id: ${assignment_id || 'NONE'}, driver: ${driver || driver_name || 'N/A'}`);

        const supabase = getSupabase();

        // ============================================================
        // MULTI-DRIVER COMPLETION: Check if this is a split import
        // ============================================================
        if (assignment_id) {
            console.log(`ðŸ”€ Multi-driver import completion - Assignment: ${assignment_id}`);

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
                console.log(`âœ… Import assignment ${assignment_id} completed with ${myActualQty}kg`);
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

                console.log(`ðŸ“Š Multi-driver import status: ${completedCount}/${assignments.length} completed`);

                if (!allCompleted) {
                    // Partial completion - return early
                    await supabase
                        .from('import_tickets')
                        .update({ note: `${completedCount}/${assignments.length} hoÃ n thÃ nh` })
                        .eq('id', id);

                    return res.json(createResponse(false,
                        `Báº¡n Ä‘Ã£ hoÃ n thÃ nh pháº§n cá»§a mÃ¬nh! (${completedCount}/${assignments.length} tÃ i xáº¿)`,
                        {
                            partial: true,
                            progress: `${completedCount}/${assignments.length}`,
                            yourQty: myActualQty
                        }
                    ));
                }

                // All completed - proceed with full completion below
                console.log(`ðŸŽ‰ All import drivers completed!`);
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
                console.log(`âš ï¸ Import found by ticket_no instead of UUID: ${id} â†’ ${byNo.id}`);
            }
        }
        if (!original) {
            console.error(`âŒ Import NOT FOUND - id: ${id}`);
            return res.json(createResponse(true, 'KhÃ´ng tÃ¬m tháº¥y phiáº¿u nháº­p'));
        }
        console.log(`âœ… Import found: ${original.ticket_no} (status: ${original.status})`);

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
            return res.json(createResponse(true, 'Lá»—i hoÃ n thÃ nh: ' + error.message));
        }

        // PERF: Send response to driver IMMEDIATELY â€” don't wait for Telegram/auto-complete
        res.json({
            error: false,
            msg: 'HoÃ n thÃ nh phiáº¿u nháº­p!',
            data
        });

        // BACKGROUND: Telegram notifications + auto-complete (fire-and-forget)
        setImmediate(async () => {
            try {
                // Send Telegram notification with proof images
                try {
                    const { sendTelegramMessage, sendTelegramPhotos } = await import('../services/telegram.js');
                    let msg = `âœ… <b>PHIáº¾U NHáº¬P ÄÃƒ HOÃ€N THÃ€NH</b>\n`;
                    msg += `ðŸ“¦ <b>#${data.ticket_no}</b>\n`;
                    msg += `ðŸ­ ${data.supplier_name}\n`;
                    if (data.assigned_driver) {
                        const isDriverReporter = !req.body.admin_completed;
                        msg += `ðŸš— TX: ${isDriverReporter ? '<b>' + data.assigned_driver + '</b>' : data.assigned_driver}${data.assigned_plate ? ` (${data.assigned_plate})` : ''}\n`;
                    }
                    if (data.assistant_name) msg += `ðŸ§‘â€ðŸ”§ PX: ${data.assistant_name}\n`;
                    msg += `ðŸ“¦ ${mergedProducts.map(p => `${p.name} â€” ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`).join(', ')}\n`;
                    if (note) msg += `ðŸ“ ${note}\n`;

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
                    console.log(`ðŸ“¨ Telegram sent for import ${data.ticket_no}`);
                } catch (tgErr) {
                    console.error('Telegram Error:', tgErr.message);
                }

                // AUTO-COMPLETE SISTER ORDERS IN MERGED TRIP
                if (data.merged_order_no && !req.body.prevent_loop) {
                    console.log(`ðŸ”— [Import Complete] Auto-completing sisters for merged trip: ${data.merged_order_no}`);
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
                                console.log(`ðŸ¤– Triggering auto-completion for sister: ${sister}`);
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
                                        console.log(`âœ… Auto-completed import sister: ${sister}`);

                                        // Send Telegram for sister
                                        try {
                                            const { sendTelegramMessage, sendTelegramPhotos } = await import('../services/telegram.js');
                                            const { data: sisterData } = await supabase
                                                .from('import_tickets').select('*').eq('ticket_no', sister).single();
                                            if (sisterData) {
                                                const sisterProducts = (sisterData.products || [])
                                                    .map(p => `${p.name} â€” ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`)
                                                    .join(', ');
                                                let sisterMsg = `âœ… <b>PHIáº¾U NHáº¬P ÄÃƒ HOÃ€N THÃ€NH</b> (tá»± Ä‘á»™ng)\n`;
                                                sisterMsg += `ðŸ“¦ <b>#${sister}</b>\n`;
                                                sisterMsg += `ðŸ­ ${sisterData.supplier_name || 'N/A'}\n`;
                                                if (sisterData.assigned_driver) sisterMsg += `ðŸš— TX: <b>${sisterData.assigned_driver}</b>${sisterData.assigned_plate ? ` (${sisterData.assigned_plate})` : ''}\n`;
                                                sisterMsg += `ðŸ“¦ ${sisterProducts || 'KhÃ´ng cÃ³ SP'}\n`;
                                                sisterMsg += `ðŸ”— HoÃ n thÃ nh theo phiáº¿u ghÃ©p ${data.ticket_no}\n`;
                                                const imgs = sisterData.images && Array.isArray(sisterData.images) ? sisterData.images : [];
                                                if (imgs.length > 0) await sendTelegramPhotos(imgs, sisterMsg, 'NHAP');
                                                else await sendTelegramMessage(sisterMsg, 'NHAP');
                                            }
                                        } catch (tgSisterErr) {
                                            console.error(`âš ï¸ Telegram error for sister ${sister}:`, tgSisterErr.message);
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
                                                delivery_note: `Tá»± Ä‘á»™ng hoÃ n thÃ nh theo phiáº¿u nháº­p ghÃ©p ${currentNo}`,
                                                admin_completed: true,
                                                images: currentImages
                                            })
                                        });
                                        const resData = await resFetch.json();
                                        if (!resData.error) console.log(`âœ… Auto-completed export sister: ${sister}`);
                                        else console.error(`âŒ Auto-complete failed for ${sister}:`, resData.message);
                                    }
                                } catch (loopErr) {
                                    console.error(`âŒ Auto-complete error for ${sister}:`, loopErr.message);
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
                return res.json(createResponse(true, 'ÄÆ¡n Ä‘Ã£ hoÃ n thÃ nh hoáº·c Ä‘Ã£ há»§y, khÃ´ng thá»ƒ há»§y'));
            }
        }

        const { error } = await getSupabase()
            .from('import_tickets')
            .update({ status: 'cancelled' })
            .eq('id', id);

        if (error) {
            return res.json(createResponse(true, 'Lá»—i há»§y phiáº¿u: ' + error.message));
        }

        // Send Telegram notification
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            let msg = `âŒ <b>ÄÆ N NHáº¬P ÄÃƒ Há»¦Y</b>\n`;
            msg += `ðŸ“¦ <b>#${ticket?.ticket_no || id}</b>\n`;
            msg += `ðŸ­ ${ticket?.supplier_name || 'N/A'}`;
            await sendTelegramMessage(msg, 'NOTIFY_NHAP');
        } catch (tgErr) {
            console.error('Telegram cancel import error:', tgErr.message);
        }

        res.json({
            error: false,
            msg: 'ÄÃ£ há»§y phiáº¿u nháº­p'
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
        console.log(`ðŸ“¸ IMPORT PROOF-IMAGES - ID: ${id}, images count: ${images?.length || 0}, body size: ${JSON.stringify(req.body).length} bytes`);

        if (!images || !Array.isArray(images) || images.length === 0) {
            return res.json(createResponse(true, 'Vui lÃ²ng chá»n Ã­t nháº¥t 1 áº£nh!'));
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
                console.log(`âš ï¸ Proof-images: found by ticket_no: ${id} â†’ ${byNo.id}`);
            }
        }

        if (!ticket) {
            console.error(`âŒ Proof-images: Import NOT FOUND - id: ${id}`);
            return res.json(createResponse(true, 'KhÃ´ng tÃ¬m tháº¥y phiáº¿u nháº­p!'));
        }

        const existingImages = ticket?.images || [];
        const totalAllowed = 10 - existingImages.length;

        if (totalAllowed <= 0) {
            return res.json(createResponse(true, 'ÄÃ£ Ä‘áº¡t giá»›i háº¡n 10 áº£nh!'));
        }

        const newImages = images.slice(0, totalAllowed);
        const updatedImages = [...existingImages, ...newImages];

        const { error: updateError } = await getSupabase()
            .from('import_tickets')
            .update({ images: updatedImages })
            .eq('id', resolvedId);

        if (updateError) {
            return res.json(createResponse(true, 'Lá»—i lÆ°u áº£nh: ' + updateError.message));
        }

        res.json(createResponse(false, `ÄÃ£ thÃªm ${newImages.length} áº£nh (${updatedImages.length}/10)!`));

    } catch (e) {
        console.error('Add import proof images error:', e.message);
        res.json(createResponse(true, 'Lá»—i: ' + e.message));
    }
});

// DELETE /api/imports/:id/proof-images/:imageIndex - Remove specific proof image
router.delete('/:id/proof-images/:imageIndex', async (req, res) => {
    try {
        const { id, imageIndex } = req.params;
        const idx = parseInt(imageIndex);

        if (isNaN(idx) || idx < 0) {
            return res.json(createResponse(true, 'Chá»‰ sá»‘ áº£nh khÃ´ng há»£p lá»‡!'));
        }

        const { data: ticket, error: fetchError } = await getSupabase()
            .from('import_tickets')
            .select('images')
            .eq('id', id)
            .single();

        if (fetchError || !ticket) {
            return res.json(createResponse(true, 'KhÃ´ng tÃ¬m tháº¥y phiáº¿u nháº­p!'));
        }

        const images = ticket.images || [];
        if (idx >= images.length) {
            return res.json(createResponse(true, 'áº¢nh khÃ´ng tá»“n táº¡i!'));
        }

        // Remove image at index
        images.splice(idx, 1);

        const { error: updateError } = await getSupabase()
            .from('import_tickets')
            .update({ images })
            .eq('id', id);

        if (updateError) {
            return res.json(createResponse(true, 'Lá»—i xÃ³a áº£nh: ' + updateError.message));
        }

        res.json(createResponse(false, `ÄÃ£ xÃ³a áº£nh (cÃ²n ${images.length}/10)!`));

    } catch (e) {
        console.error('Delete import proof image error:', e.message);
        res.json(createResponse(true, 'Lá»—i: ' + e.message));
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
            return res.json(createResponse(true, 'KhÃ´ng tÃ¬m tháº¥y phiáº¿u nháº­p'));
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
                admin_approved: ticket.admin_approved || false,
                merged_order_no: ticket.merged_order_no || null,
                source_order_nos: source_order_nos
            }
        });

    } catch (e) {
        console.error('Import review error:', e.message);
        res.json(createResponse(true, 'Lá»—i: ' + e.message));
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
            return res.json({ error: true, msg: `KhÃ´ng tÃ¬m tháº¥y phiáº¿u nháº­p #${id}` });
        }

        // Update: mark as completed with confirmation note
        // Note: 'confirmed' is not a valid status in import_tickets check constraint
        // Valid statuses: pending, completed, assigned, in_transit
        const { data, error } = await supabase
            .from('import_tickets')
            .update({
                status: 'completed',
                note: `[XÃC NHáº¬N] bá»Ÿi ${confirmed_by || 'Admin'} lÃºc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
            })
            .eq('id', ticket.id)
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lá»—i xÃ¡c nháº­n: ' + error.message));
        }

        console.log(`âœ… Import ${data.ticket_no} admin-confirmed by ${confirmed_by}`);

        // Send Telegram notification
        try {
            const { sendTelegramMessage, sendTelegramPhotos } = await import('../services/telegram.js');
            const products = data.products || [];
            const productList = products.map(p =>
                `${p.name || p.code} â€” ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`
            ).join(', ');

            // Chá»‰ gá»­i thÃ´ng bÃ¡o xÃ¡c nháº­n vÃ o nhÃ³m SALES (-1003246064846)
            let confirmMsg = `âœ… <b>PHIáº¾U NHáº¬P ÄÃƒ XÃC NHáº¬N</b>\n`;
            confirmMsg += `ðŸ“¦ <b>#${data.ticket_no}</b>\n`;
            confirmMsg += `ðŸ­ ${data.supplier_name || 'N/A'}\n`;
            if (data.assigned_driver) confirmMsg += `ðŸš— TX: <b>${data.assigned_driver}</b>${data.assigned_plate ? ` (${data.assigned_plate})` : ''}\n`;
            if (data.assistant_name) confirmMsg += `ðŸ§‘â€ðŸ”§ PX: ${data.assistant_name}\n`;
            if (productList) confirmMsg += `ðŸ“¦ ${productList}\n`;
            confirmMsg += `ðŸ‘¤ XN bá»Ÿi: ${confirmed_by || 'Admin'}`;

            await sendTelegramMessage(confirmMsg, 'SALES');
        } catch (tgErr) {
            console.error('Telegram import confirm error:', tgErr.message);
        }

        res.json({
            error: false,
            msg: `ÄÃ£ xÃ¡c nháº­n phiáº¿u nháº­p #${data.ticket_no}!`,
            data
        });

    } catch (e) {
        console.error('Admin confirm import error:', e.message);
        res.json(createResponse(true, 'Lá»—i: ' + e.message));
    }
});

// POST /api/imports/:id/reject - Admin tá»« chá»‘i phiáº¿u nháº­p
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
            return res.json({ error: true, msg: `KhÃ´ng tÃ¬m tháº¥y phiáº¿u nháº­p #${id}` });
        }

        const rejectNote = `[Tá»ª CHá»I] Bá»Ÿi ${rejected_by || 'admin'} lÃºc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}${reason ? ' - LÃ½ do: ' + reason : ''}`;

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
            return res.json(createResponse(true, 'Lá»—i tá»« chá»‘i: ' + error.message));
        }

        // Reset driver assignments
        try {
            await supabase
                .from('import_driver_assignments')
                .update({ status: 'pending' })
                .eq('import_id', ticket.id)
                .eq('status', 'completed');
            console.log(`ðŸ”„ Reset import driver assignments for ${ticket.ticket_no}`);
        } catch (assignErr) {
            console.error('Reset import assignments error:', assignErr.message);
        }

        // Telegram notification â†’ SALES group only (-1003246064846)
        try {
            const { sendTelegramMessage } = await import('../services/telegram.js');
            const products = (ticket.products || []).map(p =>
                `  â€¢ ${p.name || p.code}: ${Number(p.qty || 0).toLocaleString('vi-VN')} ${p.unit || 'Kg'}`
            ).join('\n');
            let msg = `âŒ <b>Tá»ª CHá»I PHIáº¾U NHáº¬P</b>\n`;
            msg += `ðŸ“¦ <b>#${ticket.ticket_no}</b>\n`;
            msg += `ðŸ­ ${ticket.supplier_name || 'N/A'}\n`;
            if (products) msg += `ðŸ“‹ Sáº£n pháº©m:\n${products}\n`;
            msg += `ðŸ‘” Tá»« chá»‘i bá»Ÿi: ${rejected_by || 'admin'}\n`;
            if (reason) msg += `ðŸ“ LÃ½ do: ${reason}`;
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
                    'âŒ Phiáº¿u nháº­p bá»‹ tá»« chá»‘i',
                    `#${ticket.ticket_no} â€” ${reason || 'Vui lÃ²ng kiá»ƒm tra láº¡i'}`,
                    ticket.id,
                    ticket.ticket_no
                );
            }
        } catch (notifyErr) {
            console.error('In-app import reject notification error:', notifyErr.message);
        }

        console.log(`âŒ Import ${ticket.ticket_no} rejected by ${rejected_by}`);
        res.json(createResponse(false, `ÄÃ£ tá»« chá»‘i phiáº¿u nháº­p #${ticket.ticket_no}!`));
    } catch (e) {
        console.error('Import reject error:', e.message);
        res.json(createResponse(true, 'Lá»—i: ' + e.message));
    }
});

export default router;
