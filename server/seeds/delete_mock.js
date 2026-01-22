
import { db } from '../db/index.js';
import { db as firebaseDb } from '../db/firebase.js';

async function deleteMockData() {
    console.log('🗑️ Starting Mock Data Cleanup...');

    // Get all orders
    const orders = await db.getOrders();
    console.log(`📦 Found total ${orders.length} orders.`);

    let deletedCount = 0;
    const updates = {};

    for (const order of orders) {
        // Check if ID starts with MOCK_ or if it looks like the mock pattern (MOCK_1xxx)
        if (order.id && String(order.id).startsWith('MOCK_')) {
            updates[`orders/${order.id}`] = null;
            deletedCount++;
        }
    }

    if (deletedCount > 0) {
        console.log(`🚀 Deleting ${deletedCount} mock orders...`);
        await firebaseDb.ref().update(updates);
        console.log('✅ Cleanup Complete.');
    } else {
        console.log('✨ No mock data found to delete.');
    }

    process.exit(0);
}

deleteMockData();
