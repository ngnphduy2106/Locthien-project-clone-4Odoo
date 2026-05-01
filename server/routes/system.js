// ===============================================
// SYSTEM ROUTES
// Announcements & system config (no redeploy needed)
// ===============================================

import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { createResponse } from '../config.js';
import { sendMulticastNotification } from '../services/firebase.js';

const router = Router();

// GET /api/system/announcement - Get active announcements for current user
// Frontend polls this every 5 minutes (lightweight query, ~1ms)
router.get('/announcement', async (req, res) => {
    try {
        const role = (req.query.role || '').toUpperCase();
        const now = new Date().toISOString();

        const { data, error } = await supabase
            .from('system_announcements')
            .select('id, message, type, target_roles, starts_at, expires_at, created_at')
            .eq('is_active', true)
            .lte('starts_at', now)
            .order('created_at', { ascending: false });

        if (error) {
            return res.json({ error: false, announcements: [] });
        }

        // Filter: not expired + role match
        const active = (data || []).filter(a => {
            // Check expiry
            if (a.expires_at && new Date(a.expires_at) < new Date()) return false;
            // Check role targeting (empty array = all roles)
            if (a.target_roles && a.target_roles.length > 0 && role) {
                return a.target_roles.includes(role);
            }
            return true;
        });

        // Cache for 60 seconds to reduce Supabase load
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.json({ error: false, announcements: active });

    } catch (e) {
        res.json({ error: false, announcements: [] });
    }
});

// POST /api/system/announcement - Create new announcement (Admin only)
// Also sends FCM push to all users with tokens
router.post('/announcement', async (req, res) => {
    try {
        const { message, type = 'info', target_roles = [], expires_at, created_by, send_push = true } = req.body;

        if (!message || !message.trim()) {
            return res.json(createResponse(true, 'Vui lòng nhập nội dung thông báo!'));
        }

        // Insert announcement
        const insertData = {
            message: message.trim(),
            type,
            target_roles: target_roles || [],
            created_by: created_by || 'ADMIN',
            starts_at: new Date().toISOString()
        };

        if (expires_at) {
            insertData.expires_at = new Date(expires_at).toISOString();
        }

        const { data, error } = await supabase
            .from('system_announcements')
            .insert(insertData)
            .select()
            .single();

        if (error) {
            return res.json(createResponse(true, 'Lỗi tạo thông báo: ' + error.message));
        }

        console.log(`📢 System announcement created: "${message.substring(0, 50)}..." by ${created_by}`);

        // Send FCM push notification to all users (fire-and-forget)
        if (send_push) {
            setImmediate(async () => {
                try {
                    // Get all users with FCM tokens
                    let tokenQuery = supabase
                        .from('users')
                        .select('fcm_token, role')
                        .not('fcm_token', 'is', null)
                        .neq('fcm_token', '');

                    const { data: users } = await tokenQuery;

                    if (users && users.length > 0) {
                        // Filter by target roles if specified
                        let targetUsers = users;
                        if (target_roles && target_roles.length > 0) {
                            targetUsers = users.filter(u =>
                                target_roles.includes((u.role || '').toUpperCase())
                            );
                        }

                        const tokens = targetUsers
                            .map(u => u.fcm_token)
                            .filter(t => t && !t.startsWith('mock_'));

                        if (tokens.length > 0) {
                            const typeEmoji = { info: 'ℹ️', warning: '⚠️', danger: '🚨', success: '✅' };
                            const emoji = typeEmoji[type] || '📢';

                            await sendMulticastNotification(
                                tokens,
                                `${emoji} Thông báo hệ thống`,
                                message.substring(0, 200),
                                { type: 'system_announcement', announcementId: data.id }
                            );
                            console.log(`📬 FCM push sent to ${tokens.length} devices`);
                        }
                    }
                } catch (pushErr) {
                    console.error('FCM announcement push error:', pushErr.message);
                }
            });
        }

        res.json(createResponse(false, 'Đã tạo thông báo hệ thống!', data));

    } catch (e) {
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// PUT /api/system/announcement/:id - Update announcement
router.put('/announcement/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { message, type, is_active, target_roles, expires_at } = req.body;

        const updateData = { updated_at: new Date().toISOString() };
        if (message !== undefined) updateData.message = message.trim();
        if (type !== undefined) updateData.type = type;
        if (is_active !== undefined) updateData.is_active = is_active;
        if (target_roles !== undefined) updateData.target_roles = target_roles;
        if (expires_at !== undefined) updateData.expires_at = expires_at ? new Date(expires_at).toISOString() : null;

        const { error } = await supabase
            .from('system_announcements')
            .update(updateData)
            .eq('id', id);

        if (error) {
            return res.json(createResponse(true, 'Lỗi cập nhật: ' + error.message));
        }

        console.log(`📢 Announcement ${id} updated`);
        res.json(createResponse(false, 'Đã cập nhật thông báo!'));

    } catch (e) {
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// DELETE /api/system/announcement/:id - Delete announcement
router.delete('/announcement/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('system_announcements')
            .delete()
            .eq('id', id);

        if (error) {
            return res.json(createResponse(true, 'Lỗi xóa: ' + error.message));
        }

        console.log(`🗑️ Announcement ${id} deleted`);
        res.json(createResponse(false, 'Đã xóa thông báo!'));

    } catch (e) {
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// GET /api/system/announcements/all - List ALL announcements (admin panel)
router.get('/announcements/all', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('system_announcements')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            return res.json(createResponse(true, error.message));
        }

        res.json(createResponse(false, 'OK', data || []));

    } catch (e) {
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

export default router;
