// ===============================================
// AUTH ROUTES
// ===============================================

import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { CONFIG, createResponse } from '../config.js';
import db from '../db/index.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log(`🔑 Login Attempt: [${username}]`);

        if (!username || !password) {
            return res.json(createResponse(true, 'Vui lòng nhập đủ thông tin!'));
        }

        const users = await db.getUsers();
        console.log(`👥 DB Fetch: Got ${users?.length || 0} users`);

        const uInput = String(username).trim().toLowerCase().replace(/^0+/, '');
        const pInput = String(password).trim();
        console.log(`🔍 Normalized: uInput=[${uInput}] pInput=[${pInput}]`);

        // Find matching user
        let userFound = null;
        const allStaff = [];

        for (const user of users) {
            if (user.status === 'ACTIVE') {
                allStaff.push({
                    id: user.id,
                    name: user.fullName,
                    role: user.role,
                    plate: user.plate || ''
                });
            }

            const dbUser = String(user.username).trim().toLowerCase().replace(/^0+/, '');

            if (dbUser === uInput && user.password === pInput) {
                if (user.status !== 'ACTIVE') {
                    return res.json(createResponse(true, 'Tài khoản đã bị KHÓA!'));
                }
                userFound = {
                    id: user.id,
                    name: user.fullName,
                    role: user.role,
                    plate: user.plate || ''
                };
            }
        }

        if (!userFound) {
            return res.json(createResponse(true, 'Sai tên đăng nhập hoặc mật khẩu!'));
        }

        // Get master data
        const [trucks, customers, suppliers] = await Promise.all([
            db.getTrucks(),
            db.getCustomers(),
            db.getSuppliers()
        ]);

        const responsePayload = {
            error: false,
            user: userFound,
            staffList: allStaff,
            truckList: trucks,
            customerList: customers,
            supplierList: suppliers,
            drivers: allStaff.filter(s => s.role === CONFIG.ROLES.DRIVER)
        };

        console.log(`✅ Login Success for: ${userFound.name}. Payload contains user: ${!!responsePayload.user}`);
        res.json(responsePayload);

    } catch (e) {
        console.error('❌ Login Error Trace:', e);
        res.json(createResponse(true, 'Lỗi Login: ' + e.message));
    }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { fullname, username, password, role, plate, telegramUsername } = req.body;

        if (!fullname || !username) {
            return res.json(createResponse(true, 'Vui lòng nhập đủ thông tin!'));
        }

        const cleanUser = String(username).trim().toLowerCase().replace(/^0+/, '');

        // Check duplicate
        const users = await db.getUsers();
        const exists = users.find(u =>
            String(u.username).trim().toLowerCase().replace(/^0+/, '') === cleanUser
        );

        if (exists) {
            return res.json(createResponse(true, 'SĐT này đã được đăng ký!'));
        }

        // Create user
        const newUser = await db.addUser({
            username: cleanUser,
            password: password || cleanUser.slice(-6),
            fullName: fullname,
            role: role || CONFIG.ROLES.DRIVER,
            plate: plate ? plate.toUpperCase() : '',
            status: 'ACTIVE',
            telegramUsername: telegramUsername || ''
        });

        res.json(createResponse(false, 'Đã tạo tài khoản thành công!', { id: newUser.id }));

    } catch (e) {
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// ===============================================
// USER MANAGEMENT (ADMIN ONLY)
// ===============================================

// GET /api/auth/users - List all users
router.get('/users', async (req, res) => {
    try {
        const users = await db.getUsers();

        // Return users without passwords for security
        const safeUsers = users.map(u => ({
            id: u.id,
            username: u.username,
            fullName: u.fullName,
            role: u.role,
            plate: u.plate || '',
            status: u.status || 'ACTIVE',
            createdAt: u.createdAt || u.created_at,
            telegramUsername: u.telegramUsername || u.telegram_username || ''
        }));

        res.json({ error: false, users: safeUsers });
    } catch (e) {
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// PUT /api/auth/users/:id - Update user
router.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { fullName, role, plate, status, password, telegramUsername } = req.body;

        const updateData = {};
        if (fullName !== undefined) updateData.fullName = fullName;
        if (role !== undefined) updateData.role = role;
        if (plate !== undefined) updateData.plate = plate.toUpperCase();
        if (status !== undefined) updateData.status = status;
        if (password !== undefined && password.trim()) updateData.password = password;
        if (telegramUsername !== undefined) updateData.telegramUsername = telegramUsername.trim();

        const updated = await db.updateUser(id, updateData);
        res.json(createResponse(false, 'Đã cập nhật tài khoản!', { user: updated }));
    } catch (e) {
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// DELETE /api/auth/users/:id - Deactivate user (soft delete)
router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.updateUser(id, { status: 'INACTIVE' });
        res.json(createResponse(false, 'Đã vô hiệu hóa tài khoản!'));
    } catch (e) {
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// POST /api/auth/register-fcm-token - Register FCM token for push notifications
router.post('/register-fcm-token', async (req, res) => {
    try {
        const { userId, fcmToken } = req.body;

        if (!userId || !fcmToken) {
            return res.json(createResponse(true, 'userId và fcmToken là bắt buộc'));
        }

        // Save FCM token directly to Supabase users table (match by fullname)
        // Use ilike for case-insensitive matching (consistent with notifications.js lookup)
        const { data, error } = await supabase
            .from('users')
            .update({ fcm_token: fcmToken })
            .ilike('fullname', userId)
            .select('fullname, role');

        if (error) {
            console.error('FCM token save error:', error);
            return res.json(createResponse(true, 'Lỗi lưu token: ' + error.message));
        }

        if (!data || data.length === 0) {
            console.warn(`⚠️ FCM token registration: No user found matching "${userId}"`);
            return res.json(createResponse(true, `Không tìm thấy user "${userId}"`));
        }

        console.log(`📱 FCM token registered for "${data[0].fullname}" [${data[0].role}]: ${fcmToken.substring(0, 20)}...`);
        res.json(createResponse(false, 'Đã đăng ký token thông báo!'));
    } catch (e) {
        console.error('FCM token registration error:', e);
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// POST /api/auth/force-reload/:id - Admin triggers remote cache reset for a user
router.post('/force-reload/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.updateUser(id, { force_reload: true });
        console.log(`🔄 Force reload set for user ${id}`);
        res.json(createResponse(false, 'Đã yêu cầu reset cache cho người dùng!'));
    } catch (e) {
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// POST /api/auth/force-reload-all - Reset cache for ALL users (or by role)
router.post('/force-reload-all', async (req, res) => {
    try {
        const { role } = req.body; // Optional: only reset specific role

        let query = supabase
            .from('users')
            .update({ force_reload: true })
            .eq('status', 'ACTIVE');

        if (role) {
            query = query.ilike('role', role);
        }

        const { data, error } = await query.select('fullname, role');

        if (error) {
            return res.json(createResponse(true, 'Lỗi: ' + error.message));
        }

        const count = data?.length || 0;
        const names = (data || []).map(u => u.fullname).join(', ');
        console.log(`🔄 Force reload set for ${count} users: ${names}`);
        res.json(createResponse(false, `Đã yêu cầu reset cache cho ${count} người dùng!`));
    } catch (e) {
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

// GET /api/auth/check-reload/:id - Frontend checks if force reload is needed
router.get('/check-reload/:id', async (req, res) => {
    try {
        const { id } = req.params;


        const { data } = await supabase.from('users').select('force_reload').eq('id', id).single();
        if (data?.force_reload) {
            // Reset the flag
            await supabase.from('users').update({ force_reload: false }).eq('id', id);
            return res.json({ reload: true });
        }
        res.json({ reload: false });
    } catch (e) {
        res.json({ reload: false });
    }
});

export default router;
