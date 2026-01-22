// ===============================================
// IMPORT DATA FROM SHEETS TO FIREBASE (REAL DATA)
// ===============================================

import { getSheetData, mapRowsToObjects } from '../db/google-sheets.js';
import { db as firebaseDb } from '../db/firebase.js';

async function migrateUsers() {
    console.log('👥 Migrating Users...');
    try {
        const rows = await getSheetData('USERS!A1:Z500');
        const users = mapRowsToObjects(rows);
        for (const user of users) {
            const username = user.username;
            if (!username) continue;
            await firebaseDb.collection('users').doc(username).set({
                id: username,
                username: username,
                password: user.password || '123456',
                fullName: user.full_name || 'User',
                role: (user.role || 'DRIVER').toUpperCase(),
                plate: '', // Will update from separate logic if needed
                status: 'ACTIVE',
                migratedAt: new Date().toISOString()
            });
        }
        console.log('✅ Users migration complete.');
    } catch (e) {
        console.error('❌ Users migration failed:', e.message);
    }
}

async function migrateOrders() {
    console.log('🛒 Migrating Orders...');
    try {
        const rows = await getSheetData('\'DS đơn hàng\'!A1:Z2000');
        const orders = mapRowsToObjects(rows);
        for (const order of orders) {
            const id = order.sale_order_no;
            if (!id) continue;
            await firebaseDb.collection('orders').doc(id).set({
                id: id,
                soDon: id,
                ngay: order.sale_order_date || order.book_date || '',
                khach: order.account_name || 'Unknown',
                diaChi: order.description || '',
                status: order.status || 'Mới',
                amount: Number(order.sale_order_amount || 0),
                type: 'EXPORT', // Default
                products: [], // Details not in this sheet
                createdAt: new Date().toISOString(),
                migratedAt: new Date().toISOString()
            });
        }
        console.log('✅ Orders migration complete.');
    } catch (e) {
        console.error('❌ Orders migration failed:', e.message);
    }
}

async function migrateMaterials() {
    console.log('📦 Extracting Materials from MoveData...');
    try {
        const nhapRows = await getSheetData('DATA_NHAP!A1:Z2000');
        const xuatRows = await getSheetData('DATA_XUAT!A1:Z2000');

        const products = new Set();
        mapRowsToObjects(nhapRows).forEach(r => { if (r['Mã Hàng']) products.add(r['Mã Hàng']) });
        mapRowsToObjects(xuatRows).forEach(r => { if (r['Mã Hàng']) products.add(r['Mã Hàng']) });

        console.log(`   Found ${products.size} unique products.`);

        for (const prod of products) {
            const code = prod.replace(/\s+/g, '_').toUpperCase();
            await firebaseDb.collection('materials').doc(code).set({
                id: code,
                code: code,
                name: prod,
                category: 'General',
                unitPrimary: 'Kg',
                isActive: true,
                migratedAt: new Date().toISOString()
            });
        }
        console.log('✅ Materials migration complete.');
    } catch (e) {
        console.error('❌ Materials extraction failed:', e.message);
    }
}

async function migrateCustomers() {
    console.log('🏢 Migrating Customers...');
    try {
        const rows = await getSheetData('CONG_TY!A1:Z1000');
        const customers = mapRowsToObjects(rows);
        for (const c of customers) {
            const name = c['Tên khách hàng'];
            if (!name) continue;
            await firebaseDb.collection('customers').add({
                name: name,
                taxId: c['Mã số thuế'] || '',
                lastOrderDate: c['Ngày HĐ gần nhất'] || '',
                migratedAt: new Date().toISOString()
            });
        }
        console.log('✅ Customers migration complete.');
    } catch (e) {
        console.error('❌ Customers migration failed:', e.message);
    }
}

async function runMigration() {
    console.log('🚀 Starting Data Migration...');

    await migrateUsers();
    await migrateOrders();
    await migrateMaterials();
    await migrateCustomers();

    console.log('\n✨ Migration finished!');
    process.exit(0);
}

runMigration();
