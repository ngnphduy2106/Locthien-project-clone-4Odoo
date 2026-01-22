// ===============================================
// REPORT ROUTES
// ===============================================

import { Router } from 'express';
import { createResponse, standardizeData } from '../config.js';
import db from '../db/index.js';

const router = Router();

// GET /api/reports/inventory - Real-time inventory
router.get('/inventory', async (req, res) => {
    try {
        const inventory = await db.getInventory();

        const result = inventory
            .filter(item => Math.abs(item.qty) > 0.001)
            .sort((a, b) => a.name.localeCompare(b.name));

        res.json(createResponse(false, 'OK', result));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// GET /api/reports/summary?from=2026-01-01&to=2026-01-31
router.get('/summary', async (req, res) => {
    try {
        const { from, to, partner, product } = req.query;

        const dataNhap = await db.getDataNhap();
        const dataXuat = await db.getDataXuat();

        const sPartner = partner ? standardizeData(partner, 'PARTNER') : '';
        const sProduct = product ? standardizeData(product, 'PRODUCT') : '';

        const reportMap = {};

        // Process nhap
        for (const row of dataNhap) {
            const company = standardizeData(row.partner, 'PARTNER');
            const prodName = standardizeData(row.product, 'PRODUCT');

            if (sPartner && !company.includes(sPartner)) continue;
            if (sProduct && !prodName.includes(sProduct)) continue;
            if (!company) continue;

            if (!reportMap[company]) reportMap[company] = { name: company, products: {} };
            if (!reportMap[company].products[prodName]) {
                reportMap[company].products[prodName] = { in: 0, out: 0 };
            }

            reportMap[company].products[prodName].in += Number(row.qty) || 0;
        }

        // Process xuat
        for (const row of dataXuat) {
            const company = standardizeData(row.partner, 'PARTNER');
            const prodName = standardizeData(row.product, 'PRODUCT');

            if (sPartner && !company.includes(sPartner)) continue;
            if (sProduct && !prodName.includes(sProduct)) continue;
            if (!company) continue;

            if (!reportMap[company]) reportMap[company] = { name: company, products: {} };
            if (!reportMap[company].products[prodName]) {
                reportMap[company].products[prodName] = { in: 0, out: 0 };
            }

            reportMap[company].products[prodName].out += Number(row.qty) || 0;
        }

        // Convert to array
        const result = [];
        for (const key in reportMap) {
            const pList = [];
            for (const pKey in reportMap[key].products) {
                pList.push({ name: pKey, ...reportMap[key].products[pKey] });
            }
            if (pList.length > 0) {
                result.push({ name: key, products: pList });
            }
        }

        res.json(createResponse(false, 'OK', result.sort((a, b) => a.name.localeCompare(b.name))));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// GET /api/reports/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const orders = await db.getOrders();
        const inventory = await db.getInventory();

        let pendingOrders = 0;
        let deliveringOrders = 0;
        let completedToday = 0;

        const completedStatuses = ['Đã thực hiện', 'Đã hủy bỏ'].map(s => s.toLowerCase());

        for (const order of orders) {
            const s = String(order.status || '').trim().toLowerCase();

            if (completedStatuses.includes(s)) {
                if (order.createdAt && new Date(order.createdAt).toDateString() === new Date().toDateString()) {
                    completedToday++;
                }
                continue;
            }

            // Not completed
            if (order.taiXe) {
                deliveringOrders++; // Assigned / Delivering
            } else {
                pendingOrders++; // Pending assignment
            }
        }

        let totalStock = 0;
        let lowStockAlerts = 0;

        for (const item of inventory) {
            if (item.qty > 0) {
                totalStock += item.qty;
                if (item.qty < 100) lowStockAlerts++;
            }
        }

        res.json(createResponse(false, 'OK', {
            pendingOrders,
            deliveringOrders,
            completedToday,
            totalStock: Math.round(totalStock),
            lowStockAlerts
        }));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

export default router;
