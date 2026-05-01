
import { getMisaOrders } from '../services/misa.js';

async function countMisa() {
    console.log('📡 Fetching ALL MISA Orders to count...');
    try {
        const orders = await getMisaOrders();
        console.log(`✅ Total MISA Orders Fetched: ${orders.length}`);

        // Count by Status
        const statusCounts = {};
        orders.forEach(o => {
            const s = o.delivery_status || 'NULL';
            statusCounts[s] = (statusCounts[s] || 0) + 1;
        });
        console.log('📊 MISA Delivery Statuses:', statusCounts);

    } catch (e) {
        console.error('❌ Error:', e.message);
    }
}

countMisa();
