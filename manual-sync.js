import dotenv from 'dotenv';
dotenv.config();

import { syncMisaOrders } from './server/services/misa.js';

console.log('🏁 Manually triggering MISA Sync...');

syncMisaOrders().then(() => {
    console.log('✅ Manual Sync Finished.');
    process.exit(0);
}).catch(err => {
    console.error('❌ Manual Sync Failed:', err);
    process.exit(1);
});
