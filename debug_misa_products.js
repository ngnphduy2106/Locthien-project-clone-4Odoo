// Debug an UNMODIFIED MISA Order Product Details
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

// Fetch detail for an UNMODIFIED order (one that hasn't been updated by our system)
const orderId = 'PO4100136785.25';  // A new order that we haven't touched
const url = `${MISA_ORDERS_URL}/code?code=${encodeURIComponent(orderId)}`;

const response = await fetch(url, {
    method: 'GET',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Clientid': process.env.MISA_CLIENT_ID
    }
});

const json = await response.json();
const data = json.Data || json.data || [];
const order = data[0];

console.log('Order:', orderId);
console.log('Order Amount:', order?.sale_order_amount);
console.log('\nProduct Mappings:');
if (order?.sale_order_product_mappings) {
    order.sale_order_product_mappings.forEach(p => {
        console.log(`- ${p.product_code}: price=${p.price}, amount=${p.amount}, to_currency=${p.to_currency}, total=${p.total}`);
        console.log('  Full:', JSON.stringify(p, null, 2));
    });
} else {
    console.log('No sale_order_product_mappings found');
}
