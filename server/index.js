// ===============================================
// LỘC THIÊN ERP - EXPRESS SERVER
// ===============================================

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
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
import { autoSeedMockData } from './seeds/auto_seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Schedule MISA Sync every 15 seconds for low latency
setInterval(() => {
    syncMisaOrders().catch(err => console.error('Sync Job Failed:', err));
}, 15 * 1000); // 15 seconds for realtime feel

// Run once on startup
syncMisaOrders()
    .then(() => syncMisaProducts())
    .catch(err => console.error('Startup Sync Failed:', err));

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use(express.static(join(__dirname, '../public')));

// Create an API Router to handle both prefixed and non-prefixed calls (for Netlify compatibility)
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

// Manual Sync Endpoint on Router
apiRouter.post('/sync', async (req, res) => {
    console.log('⚡ Manual Sync Triggered...');
    try {
        await syncMisaOrders();
        res.json({ success: true, message: 'Sync started' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Mount the router
app.use('/api', apiRouter); // For local dev and standard calls
app.use('/', apiRouter);   // Fallback for Netlify if prefix is stripped

// Health check
app.get('/api/health', async (req, res) => {
    const { firebaseInitialized } = await import('./db/firebase.js');
    res.json({
        status: 'OK',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        dbMode: firebaseInitialized ? 'Firebase' : 'Mock (In-Memory)'
    });
});

// System Clear (Wipe local data and resync)
app.get('/api/system/clear', async (req, res) => {
    try {
        const { db } = await import('./db/index.js');
        console.log('🧹 Wiping local orders for fresh sync...');
        // We'll just delete the 'orders' node in RTDB if possible, or simple clear.
        await db.clearOrders(); // I will need to implement this in db/index.js
        await syncMisaOrders();
        res.json({ error: false, message: 'Local data wiped and sync triggered.' });
    } catch (e) {
        res.json({ error: true, message: 'Clear failed: ' + e.message });
    }
});

// System Seed (One-time migration to Firebase)
app.get('/api/system/seed', async (req, res) => {
    try {
        const { db } = await import('./db/index.js');
        await db.seedData();
        res.json({ error: false, message: 'Seeding completed! Check your Firebase Console.' });
    } catch (e) {
        res.json({ error: true, message: 'Seeding failed: ' + e.message });
    }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../public/index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({
        error: true,
        msg: err.message || 'Internal Server Error'
    });
});

// Start server ONLY if run directly (local dev)
if (import.meta.url === `file://${fileURLToPath(import.meta.url)}`) {
    // Run once on startup
    syncMisaOrders()
        .then(() => syncMisaProducts())
        .catch(err => console.error('Startup Sync Failed:', err));

    // Schedule MISA Sync every 15 seconds (ONLY in long-running process)
    setInterval(() => {
        syncMisaOrders().catch(err => console.error('Sync Job Failed:', err));
    }, 15 * 1000);

    app.listen(PORT, () => {
        console.log('\n  ╔════════════════════════════════════════╗');
        console.log('  ║     LỘC THIÊN ERP - Server v2.0.0      ║');
        console.log('  ╠════════════════════════════════════════╣');
        console.log('  ║  🚀 Server running on port ' + PORT.toString().padEnd(14) + '║');
        console.log('  ║  📍 http://localhost:' + PORT.toString().padEnd(18) + '║');
        console.log('  ╚════════════════════════════════════════╝\n');
    });
}

export { app };
export default app;
