// ===============================================
// AUTH ROUTES
// ===============================================

import { Router } from 'express';
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
        const { fullname, username, password, role, plate } = req.body;

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
            status: 'ACTIVE'
        });

        res.json(createResponse(false, 'Đã tạo tài khoản thành công!', { id: newUser.id }));

    } catch (e) {
        res.json(createResponse(true, 'Lỗi: ' + e.message));
    }
});

export default router;
