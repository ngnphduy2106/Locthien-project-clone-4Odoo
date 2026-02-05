// ===============================================
// HR ROUTES
// ===============================================

import { Router } from 'express';
import { createResponse, getTimestamp } from '../config.js';
import db from '../db/index.js';

const router = Router();

// GET /api/hr/employees - Load from users table (unified with login accounts)
router.get('/employees', async (req, res) => {
    try {
        // Use getUsers instead of getEmployees to show accounts from users table
        const users = await db.getUsers();
        // Map to expected HR format
        const employees = users.map(u => ({
            id: u.id,
            fullName: u.fullName || u.fullname || u.username,
            phone: u.phone || u.username,
            role: u.role,
            plate: u.plate || '',
            status: u.status || 'ACTIVE',
            baseSalary: u.baseSalary || u.basesalary || 0
        }));
        res.json(createResponse(false, 'OK', employees));
    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// POST /api/hr/employees
router.post('/employees', async (req, res) => {
    try {
        const { fullName, phone, email, role, plate, baseSalary } = req.body;

        if (!fullName || !phone) {
            return res.json(createResponse(true, 'Vui lòng nhập họ tên và SĐT!'));
        }

        const employee = await db.addEmployee({
            fullName,
            phone,
            email: email || '',
            role: role || 'DRIVER',
            plate: plate ? plate.toUpperCase() : '',
            baseSalary: baseSalary || 0
        });

        res.json(createResponse(false, 'Đã thêm nhân viên!', employee));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// PUT /api/hr/employees/:id
router.put('/employees/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const employee = await db.updateEmployee(id, req.body);

        if (!employee) {
            return res.json(createResponse(true, 'Không tìm thấy nhân viên!'));
        }

        res.json(createResponse(false, 'Đã cập nhật thông tin!', employee));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// GET /api/hr/attendance?month=1&year=2026
router.get('/attendance', async (req, res) => {
    try {
        // Mock attendance data
        const { month, year } = req.query;

        res.json(createResponse(false, 'OK', []));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// POST /api/hr/checkin
router.post('/checkin', async (req, res) => {
    try {
        const { employeeId } = req.body;
        const ts = getTimestamp();

        res.json(createResponse(false, 'Check-in thành công!', { time: ts.time }));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// POST /api/hr/checkout
router.post('/checkout', async (req, res) => {
    try {
        const { employeeId } = req.body;
        const ts = getTimestamp();

        res.json(createResponse(false, 'Check-out thành công!', {
            time: ts.time,
            workHours: 8
        }));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// GET /api/hr/salary?month=1&year=2026
router.get('/salary', async (req, res) => {
    try {
        const employees = await db.getEmployees();

        const salaryList = employees.map(emp => ({
            employeeId: emp.id,
            employeeName: emp.fullName,
            role: emp.role,
            baseSalary: emp.baseSalary || 0,
            workDays: 26,
            overtimeHours: 0,
            actualSalary: emp.baseSalary || 0,
            overtimePay: 0,
            totalSalary: emp.baseSalary || 0
        }));

        res.json(createResponse(false, 'OK', salaryList));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

export default router;
