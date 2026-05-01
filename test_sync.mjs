// Test MISA sync with cleanup logic
import dotenv from 'dotenv';
dotenv.config();

import { syncMisaOrders } from './server/services/misa.js';

console.log('🚀 Starting MISA sync (with cleanup)...');
console.log('==========================================');

try {
    await syncMisaOrders();
    console.log('==========================================');
    console.log('✨ Sync complete!');
} catch (err) {
    console.error('❌ Sync failed:', err.message);
}

process.exit(0);
