
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function listAllOrders() {
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
        const snapshot = await db.collection('orders').get();

        console.log(`✅ Total Orders in DB: ${snapshot.size}`);
        console.log('--- Listing Orders ---');

        snapshot.forEach(doc => {
            const data = doc.data();
            const products = data.products || [];
            const pNames = products.map(p => p.name).join(', ');
            console.log(`[${data.status}] ${data.soDon || data.id} | ${pNames || 'No Products'}`);
        });

    } catch (e) {
        console.error('❌ Error:', e);
    }
}

listAllOrders();
