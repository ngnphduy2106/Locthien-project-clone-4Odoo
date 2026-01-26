
import fetch from 'node-fetch';

async function testDriverOrders() {
    const driverName = "Phan Đình Phi"; // URL encoded in fetch usually
    const port = 3000; // Assuming server runs on 3000

    // We need to bypass auth or login first? 
    // The route /api/orders/my/:driverName doesn't have middleware checks in the file I viewed (orders.js line 12-end), 
    // but app.js calls it. Let's assume it's public or we check the file again.
    // server/routes/orders.js: router.get('/my/:driverName', ...) - No middleware seen in snippet.

    // Actually, normally 'index.js' mounts routes. 
    // Let's rely on the DB helper to 'getOrders' and filter manually to see what the SERVER sees first.
    // But testing the API endpoint is better to verify the 'filter' removal.

    // I will use a direct DB check script that MIMICS the route logic exactly
    // because running 'fetch' against localhost might fail if server isn't running in this environment context.

    const { default: db } = await import('../server/db/index.js');

    console.log(`Checking orders for: ${driverName}`);

    const orders = await db.getOrders();
    // Logic from server/routes/orders.js

    const myName = driverName.toUpperCase();
    const myOrders = orders.filter(o => {
        // REMOVED CONFIG.STATUS.COMPLETED check
        if (!o.taiXe) return false;

        const tName = String(o.taiXe).trim().toUpperCase();
        return tName === myName;
    });

    console.log(`Total Orders Found: ${myOrders.length}`);
    myOrders.forEach(o => {
        console.log(`- ${o.soDon}: ${o.status} (Driver: ${o.taiXe})`);
    });
}

testDriverOrders();
