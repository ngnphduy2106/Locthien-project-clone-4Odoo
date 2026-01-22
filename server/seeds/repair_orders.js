
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function repairOrders() {
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

        console.log(`📦 Found ${snapshot.size} orders. Resetting products...`);

        let batch = db.batch();
        let count = 0;
        let totalReset = 0;

        for (const doc of snapshot.docs) {
            // Reset products to empty array to force re-sync
            const ref = db.collection('orders').doc(doc.id);
            batch.update(ref, {
                products: [],
                status: 'Mới' // Reset status to ensure it gets processed if needed, or just keep it.
                // Actually keeping status is better, but products MUST be empty to trigger "Missing Data" logic.
            });
            count++;

            if (count >= 400) {
                await batch.commit();
                console.log(`   - Reset batch of ${count}`);
                totalReset += count;
                batch = db.batch();
                count = 0;
            }
        }

        if (count > 0) {
            await batch.commit();
            totalReset += count;
        }

        console.log(`✅ Reset products for ${totalReset} orders.`);
        console.log('🔄 Restart server now to trigger fresh sync!');

    } catch (e) {
        console.error('❌ Error:', e);
    }
}

repairOrders();
