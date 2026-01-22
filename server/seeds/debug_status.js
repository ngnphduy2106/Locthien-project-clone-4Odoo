
import { db } from '../db/index.js';

async function checkStatus() {
    console.log('Checking Order Statuses...');
    const orders = await db.getOrders();

    // Group by status
    const statusCounts = {};
    orders.forEach(o => {
        const s = o.status || 'UNDEFINED';
        statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    console.log('📊 Status Distribution:', statusCounts);

    // List first 5 "Delivered" looking items
    const delivered = orders.filter(o =>
        String(o.status).toUpperCase().includes('GIAO') ||
        String(o.status).toUpperCase().includes('DELIVER')
    );

    console.log('Example Delivered Items:', delivered.slice(0, 3).map(o => `${o.id}: ${o.status}`));

    process.exit(0);
}

checkStatus();
