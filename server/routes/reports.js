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
        let completedTotal = 0;
        let cancelledTotal = 0;

        const completedStatuses = ['Đã thực hiện', 'Đã hủy bỏ', 'completed', 'hoàn thành', 'đã giao hàng', 'cancelled'];

        let totalOrders = orders.length;

        for (const order of orders) {
            const s = String(order.status || '').trim().toLowerCase();

            if (completedStatuses.includes(s)) {
                if (s === 'đã hủy bỏ' || s === 'cancelled') {
                    cancelledTotal++;
                } else {
                    completedTotal++;
                }

                if (order.createdAt && new Date(order.createdAt).toDateString() === new Date().toDateString()) {
                    completedToday++;
                }
                continue;
            }

            // Not completed
            if (order.taiXe || order.driver) {
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
            totalOrders,
            pendingOrders,
            deliveringOrders,
            completedTotal,
            cancelledTotal,
            completedToday,
            totalStock: Math.round(totalStock),
            lowStockAlerts
        }));

    } catch (e) {
        res.json(createResponse(true, e.message));
    }
});

// GET /api/reports/order-history - Get order history for reporting (completed/cancelled)
router.get('/order-history', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const driverFilter = req.query.driver || ''; // Driver name filter
        const offset = (page - 1) * limit;

        const orders = await db.getOrders();

        // Filter completed/cancelled orders
        const historyStatuses = ['Đã thực hiện', 'Đã hủy bỏ', 'completed', 'Hoàn thành', 'Đã giao hàng', 'cancelled'];
        let historyOrders = orders.filter(o => {
            const s = String(o.status || '').trim().toLowerCase();
            return historyStatuses.some(hs => hs.toLowerCase() === s);
        });

        // Apply driver filter if specified
        if (driverFilter) {
            const driverLower = driverFilter.toLowerCase();
            historyOrders = historyOrders.filter(o => {
                const orderDriver = String(o.taiXe || o.driver || '').toLowerCase();
                return orderDriver.includes(driverLower);
            });
            console.log(`📋 Filtered order history for driver "${driverFilter}": ${historyOrders.length} orders`);
        }

        // Map export orders
        const mappedExportOrders = historyOrders.map(o => ({
            id: o.soDon || o.sale_order_no || o.id,
            orderCode: o.soDon || o.sale_order_no || o.id,
            customerName: o.khach || o.account_name || '',
            orderDate: o.ngay || o.sale_order_date,
            totalAmount: o.amount || o.sale_order_amount || 0,
            status: o.status,
            driverName: o.taiXe || o.driver || '',
            completedAt: o.completed_at || o.updated_at,
            address: o.diaChi || o.shipping_address || '',
            products: o.cart || o.products || [],
            orderType: 'export',
            creatorName: o.creator_name || o.nhanVienTao || o.created_by || ''
        }));

        // === FETCH IMPORT TICKETS ===
        let importOrders = [];
        try {
            const importTickets = await db.getImportTickets();
            const completedImports = importTickets.filter(t => {
                const s = String(t.status || '').trim().toLowerCase();
                return historyStatuses.some(hs => hs.toLowerCase() === s);
            });

            // Apply driver filter for imports
            let filteredImports = completedImports;
            if (driverFilter) {
                const driverLower = driverFilter.toLowerCase();
                filteredImports = completedImports.filter(t => {
                    const importDriver = String(t.assigned_driver || t.driver_name || '').toLowerCase();
                    return importDriver.includes(driverLower);
                });
            }

            importOrders = filteredImports.map(t => ({
                id: t.ticket_no || t.id,
                orderCode: t.ticket_no || t.id,
                customerName: t.supplier_name || 'Nhà cung cấp',
                orderDate: t.expected_date || t.created_at,
                totalAmount: t.total_amount || 0,
                status: t.status,
                driverName: t.assigned_driver || t.driver_name || '',
                completedAt: t.completed_at || t.updated_at,
                address: t.supplier_address || 'Sunco',
                products: t.items || [],
                orderType: 'import',
                creatorName: t.creator_name || t.created_by || ''
            }));
            console.log(`📦 Found ${importOrders.length} completed import tickets`);
        } catch (importErr) {
            console.warn('⚠️ Could not fetch import tickets:', importErr.message);
        }

        // Combine export and import orders
        const allOrders = [...mappedExportOrders, ...importOrders];

        // Sort by date descending (newest first)
        allOrders.sort((a, b) => {
            const dateA = new Date(a.orderDate || 0);
            const dateB = new Date(b.orderDate || 0);
            return dateB - dateA;
        });

        const total = allOrders.length;
        const totalPages = Math.ceil(total / limit);
        const paginatedOrders = allOrders.slice(offset, offset + limit);

        res.json({
            error: false,
            data: paginatedOrders,
            total,
            totalPages,
            currentPage: page
        });

    } catch (e) {
        console.error('Order history error:', e.message);
        res.json(createResponse(true, 'Lỗi server: ' + e.message));
    }
});

export default router;
