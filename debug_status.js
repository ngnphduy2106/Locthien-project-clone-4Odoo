
import db from './server/db/index.js';

async function check() {
    try {
        const orders = await db.getOrders();
        const statuses = {};
        orders.forEach(o => {
            statuses[o.status] = (statuses[o.status] || 0) + 1;
        });
        console.log('Current Order Statuses:', statuses);
    } catch (e) {
        console.error(e);
    }
}

check();
