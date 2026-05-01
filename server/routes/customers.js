// ===============================================
// CUSTOMERS ROUTES (Khách hàng)
// ===============================================

import { Router } from 'express';
import { createResponse } from '../config.js';
import db from '../db/index.js';

const router = Router();

// GET /api/customers - Get list of customers
router.get('/', async (req, res) => {
    try {
        let customers = await db.getCustomers();

        res.json({
            error: false,
            data: customers.map(c => ({
                id: c.id || c.name,
                name: c.name,
                address: c.address || '',
                phone: c.phone || '',
                email: c.email || '',
                note: c.note || '',
                active: c.active !== false
            }))
        });
    } catch (e) {
        console.error('Customers fetch error:', e.message);
        res.json({
            error: false,
            data: []
        });
    }
});

// POST /api/customers - Add new customer
router.post('/', async (req, res) => {
    try {
        const { name, address, phone, email, note } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json(createResponse(true, 'Tên khách hàng là bắt buộc'));
        }

        const customer = {
            id: `CUS-${Date.now()}`,
            name: name.trim(),
            address: address?.trim() || '',
            phone: phone?.trim() || '',
            email: email?.trim() || '',
            note: note?.trim() || '',
            active: true
        };

        const result = await db.addCustomer(customer);

        if (result) {
            res.json(createResponse(false, 'Thêm khách hàng thành công', result));
        } else {
            res.status(500).json(createResponse(true, 'Không thể thêm khách hàng'));
        }
    } catch (e) {
        console.error('Add customer error:', e.message);
        res.status(500).json(createResponse(true, e.message));
    }
});

// PUT /api/customers/:id - Update customer
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, address, phone, email, note, active } = req.body;

        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (address !== undefined) updates.address = address.trim();
        if (phone !== undefined) updates.phone = phone.trim();
        if (email !== undefined) updates.email = email.trim();
        if (note !== undefined) updates.note = note.trim();
        if (active !== undefined) updates.active = active;

        const result = await db.updateCustomer(id, updates);

        if (result) {
            res.json(createResponse(false, 'Cập nhật khách hàng thành công', result));
        } else {
            res.status(404).json(createResponse(true, 'Không tìm thấy khách hàng'));
        }
    } catch (e) {
        console.error('Update customer error:', e.message);
        res.status(500).json(createResponse(true, e.message));
    }
});

// DELETE /api/customers/:id - Delete customer
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.deleteCustomer(id);

        if (result) {
            res.json(createResponse(false, 'Xóa khách hàng thành công'));
        } else {
            res.status(404).json(createResponse(true, 'Không tìm thấy khách hàng'));
        }
    } catch (e) {
        console.error('Delete customer error:', e.message);
        res.status(500).json(createResponse(true, e.message));
    }
});

// Published Google Sheet URL - Sheet "CONG_TY" (gid=1397754967) containing customer list
const CUSTOMERS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQHE8bULpw50dV6pdQwGgLyeVU1YA9ZB9XMZWgqNcZvdBtN-VQBy0rsgdzkUtE7HspeYdVpVCRkxw4L/pub?gid=1397754967&single=true&output=csv';

// POST /api/customers/import-sheet - Import customers from Google Sheet to DB
router.post('/import-sheet', async (req, res) => {
    try {
        const sheetCustomers = await fetchCustomersFromSheet();
        let imported = 0;

        for (const c of sheetCustomers) {
            const customer = {
                id: `SHEET-${c.name.replace(/\s+/g, '-').substring(0, 20)}-${Date.now()}`,
                name: c.name,
                address: c.address || '',
                phone: c.phone || '',
                note: c.taxCode || '', // Store tax code in note field
                active: true
            };
            const result = await db.addCustomer(customer);
            if (result) imported++;
        }

        res.json(createResponse(false, `Import thành công ${imported}/${sheetCustomers.length} khách hàng`));
    } catch (e) {
        console.error('Import customers sheet error:', e.message);
        res.status(500).json(createResponse(true, e.message));
    }
});

// ===============================================
// HELPER FUNCTIONS
// ===============================================

async function fetchCustomersFromSheet() {
    const response = await fetch(CUSTOMERS_SHEET_URL);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const csvText = await response.text();
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return [];

    const dataLines = lines.slice(1); // Skip header row
    const customers = [];

    for (const line of dataLines) {
        const columns = parseCSVLine(line);
        // Column B (index 1) = Tên khách hàng
        // Column C (index 2) = Mã số thuế
        const customerName = columns[1]?.trim();
        const taxCode = columns[2]?.trim();

        if (customerName && customerName !== '' && customerName.length > 1) {
            customers.push({
                name: customerName,
                taxCode: taxCode || '',
                address: ''
            });
        }
    }

    return customers.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else { inQuotes = !inQuotes; }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

export default router;

