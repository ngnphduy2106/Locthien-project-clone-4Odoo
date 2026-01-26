// ===============================================
// LỘC THIÊN ERP - EXPRESS SERVER
// ===============================================

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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

import { syncMisaOrders, syncMisaProducts } from './services/misa.js';

const app = express();
const PORT = process.env.PORT || 3001;
const IS_NETLIFY = !!process.env.NETLIFY || !!process.env.LAMBDA_TASK_ROOT;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files using Absolute Path (Critical for Render/Local)
const publicPath = resolve(process.cwd(), 'public');
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

// Manual Sync Endpoint (Two-way: Pull New & Push Pending)
apiRouter.post('/sync', async (req, res) => {
    try {
        console.log('⚡ Two-way Sync Triggered...');

        // 1. Pull from MISA (Existing logic)
        await syncMisaOrders();

        // 2. Push from ERP to MISA (Forced sync for active/recent orders)
        // We'll push current assigned/delivering orders just to be sure
        const orders = await db.getOrders();
        const pendingPush = orders.filter(o => o.status === 'Đang thực hiện' || o.status === 'Đang giao hàng');

        let pushCount = 0;
        for (const order of pendingPush) {
            if (order.misa_id) {
                await updateMisaOrder(order.sale_order_no || order.id, {
                    misa_id: order.misa_id,
                    status: order.status,
                    driver: order.taiXe,
                    plate: order.bienSo,
                    cart: order.cart || order.products || []
                });
                pushCount++;
            }
        }

        res.json({ success: true, message: `Đã đồng bộ xong! (Tải về đơn mới + Đẩy lên ${pushCount} đơn đang giao)` });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

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
    const indexPath = resolve(process.cwd(), 'public/index.html');
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

    app.listen(PORT, () => {
        console.log(`🚀 Lộc Thiên ERP running on port ${PORT}`);
        console.log(`📍 Client folder: ${publicPath}`);
    });
}

export { app };
export default app;
