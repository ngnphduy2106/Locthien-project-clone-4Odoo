// ===============================================
// LỘC THIÊN ERP - EXPRESS SERVER
// ===============================================

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import dotenv from 'dotenv';

// Load environment variables from project root
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

// Import routes
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import hrRoutes from './routes/hr.js';
import materialRoutes from './routes/materials.js';
import warehouseRoutes from './routes/warehouse.js';
import reportRoutes from './routes/reports.js';
import webhookRoutes from './routes/webhooks.js';
import chatRoutes from './routes/chat.js';
import importRoutes from './routes/imports.js';
import supplierRoutes from './routes/suppliers.js';
import notificationRoutes from './routes/notifications.js';

import { syncMisaOrders, syncMisaProducts, getSyncStatus, updateMisaOrder } from './services/misa.js';
import db from './db/index.js';

const app = express();
const PORT = process.env.PORT || 3001;
const IS_NETLIFY = !!process.env.NETLIFY || !!process.env.LAMBDA_TASK_ROOT;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files using Absolute Path (Critical for Render/Local)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicPath = resolve(__dirname, '../public');
console.log('📁 Static files path:', publicPath);
if (!IS_NETLIFY) {
    app.use(express.static(publicPath));
}

// Create an API Router
const apiRouter = express.Router();
apiRouter.use('/auth', authRoutes);
apiRouter.use('/orders', orderRoutes);
apiRouter.use('/chat', chatRoutes);
apiRouter.use('/hr', hrRoutes);
apiRouter.use('/materials', materialRoutes);
apiRouter.use('/warehouse', warehouseRoutes);
apiRouter.use('/reports', reportRoutes);
apiRouter.use('/webhooks', webhookRoutes);
apiRouter.use('/imports', importRoutes);
apiRouter.use('/suppliers', supplierRoutes);
apiRouter.use('/notifications', notificationRoutes);

// Manual Sync Endpoint (Two-way: Pull New & Push Pending)
apiRouter.post('/sync', async (req, res) => {
    if (getSyncStatus()) { // Check mismatching logic: using the helper
        return res.json({ success: false, error: 'Tiến trình đồng bộ đang chạy, vui lòng thử lại sau.' });
    }

    try {
        console.log('⚡ Two-way Sync Triggered...');

        // 1. Pull from MISA (Sync wrapper handles locking)
        await syncMisaOrders();

        // 2. Extra Push for failed ones
        await retryFailedSyncs();

        res.json({ success: true, message: `Đồng bộ hoàn tất! Đã kiểm tra và đẩy lại các đơn kẹt.` });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Periodic Task: Retry FAILED syncs
async function retryFailedSyncs() {
    try {
        const orders = await db.getOrders();
        const failedOrders = orders.filter(o => o.crm_sync_status === 'FAILED');

        if (failedOrders.length === 0) return;

        console.log(`♻️ Retrying ${failedOrders.length} failed syncs...`);

        for (const order of failedOrders) {
            console.log(`   - Retrying Order: ${order.sale_order_no || order.id}`);
            const res = await updateMisaOrder(order.sale_order_no || order.id, {
                misa_id: order.misa_id,
                status: order.status,
                delivery_status: order.delivery_status,
                driver: order.taiXe,
                plate: order.bienSo,
                cart: order.cart || order.products || []
            });

            if (res.success) {
                await db.updateOrder(order.id, { crm_sync_status: 'SYNCED', sync_error: null });
            } else {
                await db.updateOrder(order.id, { sync_error: res.message });
            }
        }
    } catch (e) {
        console.error('❌ Retry Sync Logic Failed:', e.message);
    }
}

app.use('/api', apiRouter);
app.use('/', apiRouter);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        version: '2.0.0',
        timestamp: new Date().toISOString()
    });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
    if (IS_NETLIFY) {
        return res.status(404).json({ error: true, msg: 'API Endpoint not found' });
    }
    const indexPath = resolve(publicPath, 'index.html');
    res.sendFile(indexPath);
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({
        error: true,
        msg: err.message || 'Internal Server Error'
    });
});

// Start server (Render/Local)
const IS_SERVERLESS = !!process.env.LAMBDA_TASK_ROOT || !!process.env.NETLIFY;

if (!IS_SERVERLESS) {
    // Basic startup sync
    syncMisaOrders()
        .then(() => syncMisaProducts())
        .catch(err => console.error('Startup Sync Failed:', err));

    // Background interval for long-running environments
    setInterval(() => {
        syncMisaOrders().catch(err => console.error('Sync Job Failed:', err));
    }, 15 * 1000);

    // Retry failed syncs every 5 minutes
    setInterval(() => {
        retryFailedSyncs().catch(err => console.error('Retry Job Failed:', err));
    }, 5 * 60 * 1000);

    app.listen(PORT, () => {
        console.log(`🚀 Lộc Thiên ERP running on port ${PORT}`);
        console.log(`📍 Client folder: ${publicPath}`);
    });
}

export { app };
export default app;
