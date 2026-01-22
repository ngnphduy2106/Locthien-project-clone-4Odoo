
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function debugOrders() {
    try {
        const saPath = join(__dirname, '../../firebase-service-account.json');
        if (!fs.existsSync(saPath)) {
            console.error('❌ Service account not found');
            return;
        }

        const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
        initializeApp({
            credential: cert(sa),
            projectId: sa.project_id
        });

        const db = getFirestore();
        // Get last 5 orders
        const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').limit(5).get();

        console.log(`✅ Found ${snapshot.size} orders.`);
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`\n📦 Order: ${data.soDon || data.id}`);
            console.log(`   Products: ${JSON.stringify(data.products, null, 2)}`);
            console.log(`   MISA ID: ${data.crm_id}`);
        });

    } catch (e) {
        console.error('❌ Error:', e);
    }
}

debugOrders();
