
import db from '../db/index.js';

export async function autoSeedMockData() {
    // For RTDB, clear everything first to ensure clean state
    await db.clearOrders ? db.clearOrders() : (console.log('No clear function'));

    console.log('🌱 Auto-seeding 160+ Mock Orders into Realtime Database...');

    const statuses = ['Chưa thực hiện', 'Đang thực hiện', 'Đã thực hiện'];
    const customers = ['Công ty ABC', 'Hóa Chất Đại Nam', 'KCN Vsip 1', 'Nhà máy A', 'Xưởng B'];
    const products = [
        { name: 'NaOH 32%', code: 'NAOH32', unit: 'Kg' },
        { name: 'HCl 32%', code: 'HCL32', unit: 'Kg' },
        { name: 'Javel 10%', code: 'JAVEL10', unit: 'Kg' },
        { name: 'FeCl3 38%', code: 'FECL38', unit: 'Kg' }
    ];

    const generateOrder = (i) => {
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(i / 10)); // Spread over days
        return {
            id: `MOCK_${1000 + i}`,
            soDon: `DH-${1000 + i}`,
            ngay: date.toISOString().split('T')[0],
            khach: customers[i % customers.length],
            diaChi: `Khu công nghiệp số ${i % 5 + 1}, Bình Dương`,
            taiXe: i % 3 === 0 ? 'Tài Xế A' : '', // Mix assigned/unassigned
            bienSo: i % 3 === 0 ? '51C-12345' : '',
            status: statuses[i % statuses.length],
            note: 'Auto generated mock order',
            products: [
                { ...products[i % products.length], qty: (i * 100) + 500 }
            ]
        };
    };

    for (let i = 0; i < 160; i++) {
        await db.addOrder(generateOrder(i));
    }

    console.log('✅ Auto-seed complete. 160 orders added.');
}
