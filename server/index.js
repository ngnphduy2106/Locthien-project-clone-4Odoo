// ===============================================
// LỘC THIÊN ERP - EXPRESS SERVER
// ===============================================

import express from 'express';
import { supabase } from './db/supabase.js';
import cors from 'cors';
import compression from 'compression';
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
import customerRoutes from './routes/customers.js';
import notificationRoutes from './routes/notifications.js';
import mergedOrderRoutes from './routes/merged-orders.js';
import systemRoutes from './routes/system.js';

import { syncMisaOrders, syncMisaProducts, getSyncStatus, updateMisaOrder } from './services/misa.js';
import db from './db/index.js';

const app = express();
const PORT = process.env.PORT || 3001;
const IS_NETLIFY = !!process.env.NETLIFY || !!process.env.LAMBDA_TASK_ROOT;

// Middleware
app.use(compression()); // Gzip — reduces 511KB app.js to ~120KB
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files using Absolute Path (Critical for Render/Local)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicPath = resolve(__dirname, '../public');
console.log('📁 Static files path:', publicPath);
if (!IS_NETLIFY) {
    app.use(express.static(publicPath, {
        maxAge: '1h',        // Cache static files for 1 hour
        etag: true,          // Enable ETag for revalidation
        lastModified: true
    }));
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
apiRouter.use('/customers', customerRoutes);
apiRouter.use('/notifications', notificationRoutes);
apiRouter.use('/merged-orders', mergedOrderRoutes);
apiRouter.use('/system', systemRoutes);

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

// Periodic Task: Retry FAILED syncs (skip PENDING_APPROVAL — those await Admin approve)
async function retryFailedSyncs() {
    try {
        const orders = await db.getOrders();
        const failedOrders = orders.filter(o => o.crm_sync_status === 'FAILED');
        // Don't retry PENDING_APPROVAL orders — they need Admin approval first
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

// One-time: Sync driver data from MISA CRM back into DB
app.get('/api/admin/sync-drivers', async (req, res) => {
    try {
        const fetchImport = (await import('node-fetch')).default;

        // Login to MISA
        const authRes = await fetchImport('https://crmconnect.misa.vn/api/v2/Account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: process.env.MISA_CLIENT_ID,
                client_secret: process.env.MISA_CLIENT_SECRET
            })
        });
        const authJson = await authRes.json();
        const token = authJson.Data || authJson.data;
        if (!token) return res.json({ error: true, msg: 'MISA login failed' });

        // Fetch all orders from MISA (multiple pages)
        let allOrders = [];
        let page = 0;
        let hasMore = true;
        while (hasMore) {
            const orderRes = await fetchImport(`https://crmconnect.misa.vn/api/v2/SaleOrders?pageSize=100&page=${page}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Clientid': process.env.MISA_CLIENT_ID }
            });
            const orderJson = await orderRes.json();
            const data = orderJson.data || [];
            allOrders = allOrders.concat(data);
            hasMore = data.length === 100;
            page++;
        }

        // Update DB: only orders missing driver data
        let updated = 0, skipped = 0;



        for (const item of allOrders) {
            const orderNo = item.sale_order_no;
            const driver = item.custom_field13 || '';
            const plate = item.custom_field14 || '';
            if (!orderNo || (!driver && !plate)) { skipped++; continue; }

            const { data: existing } = await supabase.from('orders')
                .select('id, custom_field13, custom_field14')
                .eq('sale_order_no', orderNo).single();

            if (!existing || (existing.custom_field13 && existing.custom_field13.trim())) {
                skipped++;
                continue;
            }

            const updateData = {};
            if (driver) updateData.custom_field13 = driver;
            if (plate) updateData.custom_field14 = plate;

            await supabase.from('orders').update(updateData).eq('id', existing.id);
            console.log(`✅ Synced driver: ${orderNo} → ${driver} / ${plate}`);
            updated++;
        }

        res.json({ error: false, msg: `Synced ${updated} orders, skipped ${skipped}`, updated, skipped, totalMisa: allOrders.length });
    } catch (e) {
        console.error('sync-drivers error:', e);
        res.json({ error: true, msg: e.message });
    }
});

// Error reporting endpoint — sends frontend errors to Telegram
apiRouter.post('/report-error', async (req, res) => {
    try {
        const { message, source, line, col, stack, user, page, userAgent } = req.body;
        if (!message) return res.json({ ok: true });

        const { sendTelegramMessage } = await import('./services/telegram.js');
        const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const shortUA = (userAgent || '').slice(0, 80);

        const text = [
            `🚨 <b>LỖI APP — ${now}</b>`,
            ``,
            `👤 <b>User:</b> ${user || 'unknown'}`,
            `📄 <b>Trang:</b> ${page || '/'}`,
            ``,
            `❌ <b>Lỗi:</b> <code>${(message || '').slice(0, 300)}</code>`,
            source ? `📍 <b>File:</b> ${source}:${line || '?'}:${col || '?'}` : '',
            stack ? `\n<pre>${stack.slice(0, 500)}</pre>` : '',
            ``,
            `📱 <code>${shortUA}</code>`
        ].filter(Boolean).join('\n');

        // Fire-and-forget — don't slow down the client
        sendTelegramMessage(text, 'ERROR').catch(e =>
            console.error('Error report TG failed:', e.message)
        );

        res.json({ ok: true });
    } catch (e) {
        console.error('Report-error endpoint:', e.message);
        res.json({ ok: true }); // Never fail the client
    }
});

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

    // Background sync: 30s for near-real-time CRM updates (with lock to prevent overlap)
    let isSyncing = false;
    setInterval(async () => {
        if (isSyncing) return;
        isSyncing = true;
        try { await syncMisaOrders(); }
        catch (err) { console.error('Sync Job Failed:', err); }
        finally { isSyncing = false; }
    }, 30 * 1000);

    // Retry failed syncs every 30 minutes (low priority background task)
    setInterval(() => {
        retryFailedSyncs().catch(err => console.error('Retry Job Failed:', err));
    }, 30 * 60 * 1000);

    app.listen(PORT, () => {
        console.log('?? L?c Thi�n ERP running on port ' + PORT);
        console.log('?? Client folder: ' + publicPath);
    });
}

export { app };
export default app;
