
import { db } from '../db/index.js';

async function checkOrder() {
    const targetId = 'PO00132.25';
    console.log(`🔍 Checking Order: ${targetId}`);

    const orders = await db.getOrders();
    const order = orders.find(o => o.id === targetId || o.soDon === targetId);

    if (!order) {
        console.log('❌ Order NOT FOUND in Database!');
    } else {
        console.log('✅ Order FOUND:');
        console.log(`   - ID: ${order.id}`);
        console.log(`   - Status: "${order.status}"`);
        console.log(`   - Customer: ${order.khach}`);
        console.log(`   - Driver: ${order.taiXe || 'NULL'}`);
        console.log(`   - Raw Data:`, JSON.stringify(order, null, 2));
    }

    process.exit(0);
}

checkOrder();
