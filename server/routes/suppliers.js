// ===============================================
// SUPPLIERS ROUTES (Nhà cung cấp)
// ===============================================

import { Router } from 'express';
import { createResponse } from '../config.js';
import db from '../db/index.js';

const router = Router();

// Published Google Sheet URL for CSV (fallback)
const SUPPLIERS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQHE8bULpw50dV6pdQwGgLyeVU1YA9ZB9XMZWgqNcZvdBtN-VQBy0rsgdzkUtE7HspeYdVpVCRkxw4L/pub?output=csv';

// GET /api/suppliers - Get list of suppliers
router.get('/', async (req, res) => {
    try {
        // First try database
        let suppliers = await db.getSuppliers();

        // If no suppliers in DB, fetch from Google Sheet
        if (!suppliers || suppliers.length === 0) {
            console.log('📊 No suppliers in DB, fetching from Google Sheet...');
            suppliers = await fetchSuppliersFromSheet();
        }

        res.json({
            error: false,
            data: suppliers.map(s => ({
                id: s.id || s.name,
                name: s.name,
                address: s.address || '',
                phone: s.phone || '',
                email: s.email || '',
                note: s.note || '',
                active: s.active !== false
            }))
        });
    } catch (e) {
        console.error('Suppliers fetch error:', e.message);
        res.json({
            error: false,
            data: getHardcodedSuppliers()
        });
    }
});

// POST /api/suppliers - Add new supplier
router.post('/', async (req, res) => {
    try {
        const { name, address, phone, email, note } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json(createResponse(true, 'Tên nhà cung cấp là bắt buộc'));
        }

        const supplier = {
            id: `SUP-${Date.now()}`,
            name: name.trim(),
            address: address?.trim() || '',
            phone: phone?.trim() || '',
            email: email?.trim() || '',
            note: note?.trim() || '',
            active: true
        };

        const result = await db.addSupplier(supplier);

        if (result) {
            res.json(createResponse(false, 'Thêm nhà cung cấp thành công', result));
        } else {
            res.status(500).json(createResponse(true, 'Không thể thêm nhà cung cấp'));
        }
    } catch (e) {
        console.error('Add supplier error:', e.message);
        res.status(500).json(createResponse(true, e.message));
    }
});

// PUT /api/suppliers/:id - Update supplier
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

        const result = await db.updateSupplier(id, updates);

        if (result) {
            res.json(createResponse(false, 'Cập nhật nhà cung cấp thành công', result));
        } else {
            res.status(404).json(createResponse(true, 'Không tìm thấy nhà cung cấp'));
        }
    } catch (e) {
        console.error('Update supplier error:', e.message);
        res.status(500).json(createResponse(true, e.message));
    }
});

// DELETE /api/suppliers/:id - Delete supplier
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.deleteSupplier(id);

        if (result) {
            res.json(createResponse(false, 'Xóa nhà cung cấp thành công'));
        } else {
            res.status(404).json(createResponse(true, 'Không tìm thấy nhà cung cấp'));
        }
    } catch (e) {
        console.error('Delete supplier error:', e.message);
        res.status(500).json(createResponse(true, e.message));
    }
});

// POST /api/suppliers/import-sheet - Import suppliers from Google Sheet to DB
router.post('/import-sheet', async (req, res) => {
    try {
        const sheetSuppliers = await fetchSuppliersFromSheet();
        let imported = 0;

        for (const s of sheetSuppliers) {
            const supplier = {
                id: `SHEET-${s.name.replace(/\s+/g, '-').substring(0, 20)}-${Date.now()}`,
                name: s.name,
                address: s.address || '',
                active: true
            };
            const result = await db.addSupplier(supplier);
            if (result) imported++;
        }

        res.json(createResponse(false, `Import thành công ${imported}/${sheetSuppliers.length} nhà cung cấp`));
    } catch (e) {
        console.error('Import sheet error:', e.message);
        res.status(500).json(createResponse(true, e.message));
    }
});

// ===============================================
// HELPER FUNCTIONS
// ===============================================

async function fetchSuppliersFromSheet() {
    const response = await fetch(SUPPLIERS_SHEET_URL);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const csvText = await response.text();
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return [];

    const dataLines = lines.slice(1);
    const supplierSet = new Set();

    for (const line of dataLines) {
        const columns = parseCSVLine(line);
        const supplierName = columns[5]?.trim();
        if (supplierName && supplierName !== '' && !supplierName.toUpperCase().includes('NỘI BỘ') && supplierName.length > 1) {
            supplierSet.add(supplierName);
        }
    }

    return Array.from(supplierSet).map(name => ({ name, address: '' })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
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

function getHardcodedSuppliers() {
    return [
        { id: 'HF-1', name: 'AN PHÚ', address: '' },
        { id: 'HF-2', name: 'Công ty TNHH TM PT Hiền Phát', address: '' },
        { id: 'HF-3', name: 'Cty CP XNK SX Hoá Chất Thuận Duyên', address: '' },
        { id: 'HF-4', name: 'GIA NGẠN', address: '' },
        { id: 'HF-5', name: 'Hoá Chất Trương Lộc', address: '' },
        { id: 'HF-6', name: 'LỘC THIÊN', address: '' },
        { id: 'HF-7', name: 'Nhà Máy Phát Thiên Phú', address: '' },
        { id: 'HF-8', name: 'Vedan', address: '' },
        { id: 'HF-9', name: 'Vicaco biên hòa', address: '' }
    ];
}

export default router;

