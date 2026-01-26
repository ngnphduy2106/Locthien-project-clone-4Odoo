// Test Price Logic on OLD Test Order (Retry with Fixes)
import dotenv from 'dotenv';
dotenv.config();

import { updateMisaOrder } from './server/services/misa.js';

// PO41001367.2 test (misa_id=257) 
// - Has price 0 currently in MISA (damaged)
// - Has tax_percent null or 0 in MISA (damaged)
const testOrderId = 'PO41001367.2 test';
const testMisaId = 257;

const testData = {
    misa_id: testMisaId,
    status: 'Đang thực hiện',
    delivery_status: 'Đang giao hàng',
    driver: 'Nguyễn Văn Test',
    plate: '51C-99999',
    cart: [
        {
            product_code: '32HCL',
            unit: 'kg',
            qty: 4000,
            amount: 4000
        }
    ]
};

console.log('🔄 Testing Price Logic on OLD Test Order (Retry):', testOrderId);
console.log('📋 Data:', JSON.stringify(testData, null, 2));

try {
    const result = await updateMisaOrder(testOrderId, testData);
    console.log('\n' + '='.repeat(50));
    console.log('✅ Final Result:', result ? 'SUCCESS' : 'FAILED');
    console.log('='.repeat(50));
} catch (e) {
    console.error('❌ Error:', e.message);
}
