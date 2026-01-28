// ===============================================
// SUPPLIERS ROUTES (Nhà cung cấp)
// ===============================================

import { Router } from 'express';
import { createResponse } from '../config.js';

const router = Router();

// Published Google Sheet URL for CSV
const SUPPLIERS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQHE8bULpw50dV6pdQwGgLyeVU1YA9ZB9XMZWgqNcZvdBtN-VQBy0rsgdzkUtE7HspeYdVpVCRkxw4L/pub?output=csv';

// Cache for suppliers
let suppliersCache = null;
let cacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// GET /api/suppliers - Get list of suppliers
router.get('/', async (req, res) => {
    try {
        const now = Date.now();

        // Return cached data if valid
        if (suppliersCache && (now - cacheTime) < CACHE_DURATION) {
            return res.json({
                error: false,
                data: suppliersCache,
                cached: true
            });
        }

        // Fetch from Google Sheet
        const suppliers = await fetchSuppliersFromSheet();

        // Update cache
        suppliersCache = suppliers;
        cacheTime = now;

        res.json({
            error: false,
            data: suppliers,
            cached: false
        });

    } catch (e) {
        console.error('Suppliers fetch error:', e.message);

        // Return cached data if available even if expired
        if (suppliersCache) {
            return res.json({
                error: false,
                data: suppliersCache,
                cached: true,
                stale: true
            });
        }

        // Return hardcoded fallback if no cache
        res.json({
            error: false,
            data: getHardcodedSuppliers(),
            fallback: true
        });
    }
});

// Fetch suppliers from Google Sheet
async function fetchSuppliersFromSheet() {
    const response = await fetch(SUPPLIERS_SHEET_URL);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const csvText = await response.text();
    // Handle both \r\n and \n
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());

    if (lines.length === 0) return [];

    // Header debugging
    const headers = parseCSVLine(lines[0]);
    console.log('📊 Supplier Sheet Headers:', JSON.stringify(headers));

    // Skip header row
    const dataLines = lines.slice(1);

    // Extract unique supplier names from column 6 (index 5) = "Đối Tượng"
    const supplierSet = new Set();

    for (const line of dataLines) {
        const columns = parseCSVLine(line);
        const supplierName = columns[5]?.trim(); // Column F = Đối Tượng

        if (supplierName &&
            supplierName !== '' &&
            !supplierName.toUpperCase().includes('NỘI BỘ') &&
            supplierName.length > 1) {
            supplierSet.add(supplierName);
        }
    }

    // Convert to array of objects
    const suppliers = Array.from(supplierSet).map(name => ({
        name: name,
        address: ''
    }));

    // Sort alphabetically
    suppliers.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    console.log(`📦 Loaded ${suppliers.length} unique suppliers from ${lines.length} rows`);

    return suppliers;
}

// Robust CSV line parser (handles quotes and escaped commas)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Escaped quote "" -> "
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
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

// Hardcoded fallback suppliers
function getHardcodedSuppliers() {
    return [
        { name: 'AN PHÚ', address: '' },
        { name: 'ANH ĐOÀN', address: '' },
        { name: 'Cty CP XNK SX Hoá Chất Thuận Duyên', address: '' },
        { name: 'Cty HD', address: '' },
        { name: 'Cty Hd long an', address: '' },
        { name: 'Cty trinh tuong', address: '' },
        { name: 'Công Ty TNHH TM PT Hiền Phát', address: '' },
        { name: 'CÔNG TY 28', address: '' },
        { name: 'Dũng lộc', address: '' },
        { name: 'Dvl', address: '' },
        { name: 'GIA NGẠN', address: '' },
        { name: 'Gia Ngạn', address: '' },
        { name: 'Hoá Chất Trương Lộc', address: '' },
        { name: 'Hyoshung', address: '' },
        { name: 'LỘC THIÊN', address: '' },
        { name: 'NGU KIM MINH VIỆT', address: '' },
        { name: 'Nhà Máy Phát Thiên Phú', address: '' },
        { name: 'Nhà máy vicaco', address: '' },
        { name: 'Thep trang bang', address: '' },
        { name: 'Trinh tường', address: '' },
        { name: 'Trương Lộc', address: '' },
        { name: 'Ve', address: '' },
        { name: 'Vedan', address: '' },
        { name: 'Vicaco biên hòa', address: '' },
        { name: 'Wang Sheng', address: '' },
        { name: 'Ý Cường Thịnh', address: '' },
        { name: 'Ý CƯỜNG THỊNH', address: '' }
    ];
}

export default router;
