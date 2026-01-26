
import fetch from 'node-fetch';

async function checkPdp() {
    const driver = "Phan Đình Phi";
    const url = `http://localhost:3001/api/orders/my/${encodeURIComponent(driver)}?role=DRIVER`;

    console.log(`📡 Fetching PDP orders: ${url}`);

    try {
        const res = await fetch(url);
        const data = await res.json();

        if (data.data) {
            console.log(`✅ Found ${data.data.length} orders.`);
            data.data.forEach(o => {
                console.log(`- SO: ${o.sale_order_no} | ID: "${o.id}" | Status: ${o.status}`);
            });
        } else {
            console.log(`❌ No data:`, data);
        }
    } catch (e) {
        console.error(`❌ Error:`, e.message);
    }
}

checkPdp();
