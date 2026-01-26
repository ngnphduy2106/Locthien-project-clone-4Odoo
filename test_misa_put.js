// Test MISA PUT for the EXACT order requested
import dotenv from 'dotenv';
dotenv.config();

import { updateMisaOrder } from './server/services/misa.js';

// Exact order requested by user
const testOrderId = 'PO4100136781.25 testing webapp';
const testMisaId = 257;

const testData = {
    misa_id: testMisaId,
    status: 'Đang thực hiện',
    delivery_status: 'Đã giao hàng', // Test "Completed" state
    driver: 'Nguyễn Văn Test',
    plate: '51C-99999',
    cart: [
        {
            product_code: '32HCL',
            unit: 'kg',
            qty: 2000,
            amount: 2000
        }
    ]
};

console.log('🔄 Testing MISA PUT for exact order:', testOrderId);
console.log('📋 misa_id:', testMisaId);
console.log('📋 Data:', JSON.stringify(testData, null, 2));

try {
    const result = await updateMisaOrder(testOrderId, testData);
    console.log('\n' + '='.repeat(50));
    console.log('✅ Final Result:', result ? 'SUCCESS' : 'FAILED');
    console.log('='.repeat(50));
} catch (e) {
    console.error('❌ Error:', e.message);
}
