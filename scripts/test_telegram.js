// Inspect order 43.25 for Ghi Chú field
import dotenv from 'dotenv';
dotenv.config();
import { getMisaOrders } from '../server/services/misa.js';

const orders = await getMisaOrders(0, false);
const order = orders.find(o => (o.sale_order_no || '').includes('37043'));

if (order) {
    console.log(`\n📦 Order: ${order.sale_order_no}`);
    const products = order.sale_order_product_mappings || [];
    products.forEach((p, i) => {
        console.log(`\n--- Product ${i + 1}: ${p.product_code} ---`);
        // Show only potentially relevant fields
        const keys = ['description', 'description_product', 'sale_order_product',
            'custom_field1', 'custom_field2', 'custom_field3', 'custom_field4',
            'custom_field5', 'custom_field6', 'custom_field7', 'batch_number',
            'serial_number', 'promotion', 'product_name'];
        keys.forEach(k => {
            if (p[k] !== null && p[k] !== undefined && p[k] !== 0 && p[k] !== '0' && p[k] !== '') {
                console.log(`  ✅ ${k}: ${JSON.stringify(p[k])}`);
            }
        });
        // Also show ALL non-empty string/non-zero fields we haven't seen
        Object.entries(p).forEach(([k, v]) => {
            if (!keys.includes(k) && v !== null && v !== undefined && v !== 0 && v !== '' && v !== '0' && v !== false) {
                console.log(`     ${k}: ${JSON.stringify(v)}`);
            }
        });
    });
} else {
    console.log('❌ Order 43.25 not found');
}

setTimeout(() => process.exit(0), 2000);
