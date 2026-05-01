// ===============================================
// WAREHOUSE ROUTES
// ===============================================

import { Router } from 'express';
import { createResponse, getTimestamp, standardizeData } from '../config.js';
import db from '../db/index.js';

const router = Router();

// GET /api/warehouse
router.get('/', async (req, res) => {
    try {
        // Return list of warehouses
        const warehouses = [
            { id: 'LT1', name: 'Kho Lộc Thiên 1', isActive: true },
            { id: 'LT2', name: 'Kho Lộc Thiên 2', isActive: true }
        ];
        res.json(createResponse(false, 'OK', warehouses));
    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// GET /api/warehouse/inventory?warehouseId=LT1
router.get('/inventory', async (req, res) => {
    try {
        const { warehouseId } = req.query;
        const inventory = await db.getInventory(warehouseId);

        // Add status to each item
        const result = inventory.map(item => {
            let status = 'OK';
            let statusText = 'Còn hàng';

            if (item.qty <= 0) {
                status = 'OUT_OF_STOCK';
                statusText = 'Hết hàng';
            } else if (item.qty < 100) {
                status = 'LOW';
                statusText = 'Sắp hết';
            }

            return { ...item, status, statusText };
        });

        res.json(createResponse(false, 'OK', result));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// GET /api/warehouse/alerts
router.get('/alerts', async (req, res) => {
    try {
        const inventory = await db.getInventory();

        const alerts = inventory
            .filter(item => item.qty > 0 && item.qty < 100)
            .map(item => ({
                ...item,
                alertLevel: item.qty < 50 ? 'CRITICAL' : 'WARNING'
            }))
            .sort((a, b) => a.qty - b.qty);

        res.json(createResponse(false, 'OK', alerts));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// POST /api/warehouse/adjust
router.post('/adjust', async (req, res) => {
    try {
        const { warehouseId, materialCode, adjustQty, reason, user } = req.body;

        const ts = getTimestamp();
        const qty = Number(adjustQty);

        const data = {
            id: 'DC' + ts.short,
            date: ts.date,
            warehouse: warehouseId || 'LT1',
            partner: 'NỘI BỘ (ĐIỀU CHỈNH)',
            driver: user || 'SYSTEM',
            product: standardizeData(materialCode, 'PRODUCT'),
            qty: Math.abs(qty),
            note: `Điều chỉnh: ${reason || 'Không có lý do'}`
        };

        if (qty >= 0) {
            await db.addDataNhap(data);
        } else {
            await db.addDataXuat(data);
        }

        res.json(createResponse(false, 'Đã điều chỉnh tồn kho!', { id: data.id }));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// POST /api/warehouse/transfer
router.post('/transfer', async (req, res) => {
    try {
        const { fromWarehouse, toWarehouse, items, user } = req.body;

        if (!fromWarehouse || !toWarehouse) {
            return res.json(createResponse(true, 'Vui lòng chọn kho xuất và kho nhập!'));
        }

        if (fromWarehouse === toWarehouse) {
            return res.json(createResponse(true, 'Kho xuất và kho nhập phải khác nhau!'));
        }

        if (!items || items.length === 0) {
            return res.json(createResponse(true, 'Vui lòng chọn hàng hóa cần chuyển!'));
        }

        const ts = getTimestamp();
        const transferId = 'CK' + ts.short;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const prodName = standardizeData(item.name, 'PRODUCT');
            const qty = Number(item.qty);

            if (qty <= 0) continue;

            // Xuất từ kho nguồn
            await db.addDataXuat({
                id: `${transferId}-X${i + 1}`,
                date: ts.date,
                warehouse: fromWarehouse,
                partner: `CHUYỂN KHO → ${toWarehouse}`,
                driver: user || 'SYSTEM',
                product: prodName,
                qty: qty,
                note: `Chuyển kho: ${transferId}`
            });

            // Nhập vào kho đích
            await db.addDataNhap({
                id: `${transferId}-N${i + 1}`,
                date: ts.date,
                warehouse: toWarehouse,
                partner: `CHUYỂN KHO ← ${fromWarehouse}`,
                driver: user || 'SYSTEM',
                product: prodName,
                qty: qty,
                note: `Chuyển kho: ${transferId}`
            });
        }

        res.json(createResponse(false, 'Đã chuyển kho thành công!', { transferId }));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// GET /api/warehouse/history/:productName
router.get('/history/:productName', async (req, res) => {
    try {
        const { productName } = req.params;
        const { fromDate, toDate } = req.query;

        const dataNhap = await db.getDataNhap();
        const dataXuat = await db.getDataXuat();
        const prodClean = standardizeData(productName, 'PRODUCT');

        const history = [];

        // Add nhap records
        dataNhap.filter(r => standardizeData(r.product, 'PRODUCT') === prodClean)
            .forEach(r => history.push({ ...r, type: 'NHAP' }));

        // Add xuat records
        dataXuat.filter(r => standardizeData(r.product, 'PRODUCT') === prodClean)
            .forEach(r => history.push({ ...r, type: 'XUAT' }));

        res.json(createResponse(false, 'OK', history));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// POST /api/warehouse/mixing
router.post('/mixing', async (req, res) => {
    try {
        const { date, warehouse, ingredients, product, sender } = req.body;
        const ts = getTimestamp();
        const mixingId = 'PC' + ts.short;
        const reportDate = date || ts.date;

        for (let i = 0; i < ingredients.length; i++) {
            const ing = ingredients[i];
            await db.addDataXuat({
                id: `${mixingId}-I${i + 1}`,
                date: reportDate,
                warehouse,
                partner: 'NỘI BỘ (PHA CHẾ)',
                driver: sender || 'SYSTEM',
                product: standardizeData(ing.product, 'PRODUCT'),
                density: ing.density,
                qty: Number(ing.qty),
                note: `Pha chế: ${mixingId}`
            });
        }

        if (product && product.product) {
            await db.addDataNhap({
                id: `${mixingId}-P`,
                date: reportDate,
                warehouse,
                partner: 'NỘI BỘ (PHA CHẾ)',
                driver: sender || 'SYSTEM',
                product: standardizeData(product.product, 'PRODUCT'),
                density: product.density,
                qty: Number(product.qty),
                note: `Pha chế: ${mixingId}`
            });
        }

        res.json(createResponse(false, 'Đã lưu phiếu pha chế!', { mixingId }));
    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

export default router;
