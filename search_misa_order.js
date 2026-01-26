// Search for specific order from MISA directly
import dotenv from 'dotenv';
dotenv.config();

import fetch from 'node-fetch';

const MISA_AUTH_URL = 'https://crmconnect.misa.vn/api/v2/Account';
const MISA_ORDERS_URL = 'https://crmconnect.misa.vn/api/v2/SaleOrders';

async function loginMisa() {
    const response = await fetch(MISA_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: process.env.MISA_CLIENT_ID,
            client_secret: process.env.MISA_CLIENT_SECRET
        })
    });
    const json = await response.json();
    return json.Data || json.data;
}

const token = await loginMisa();
console.log('Token obtained:', !!token);

// Search for order containing "1367"
const searchUrl = `${MISA_ORDERS_URL}?PageSize=500`;
const response = await fetch(searchUrl, {
    method: 'GET',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Clientid': process.env.MISA_CLIENT_ID
    }
});

const json = await response.json();
const data = json.Data || json.data || [];

console.log(`\nTotal orders from MISA: ${data.length}`);

// Find orders with "1367" or "test" in name
const matches = data.filter(o =>
    (o.sale_order_no && o.sale_order_no.includes('1367')) ||
    (o.sale_order_name && o.sale_order_name.toLowerCase().includes('test'))
);

console.log(`\nMatching orders (1367 or test):`);
matches.forEach(o => {
    console.log(`  - ${o.sale_order_no}: ${o.sale_order_name} (id: ${o.id}, revenue_status: ${o.revenue_status})`);
});
