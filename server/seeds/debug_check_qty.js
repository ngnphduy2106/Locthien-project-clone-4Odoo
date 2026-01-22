
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function checkQty() {
    try {
        const saPath = join(__dirname, '../../firebase-service-account.json');
        const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
        initializeApp({ credential: cert(sa) });
        const db = getFirestore();

        // Check orders with non-empty products
        const snapshot = await db.collection('orders').limit(50).get();

        let zeroQtyCount = 0;
        let total = 0;

        console.log('--- Inspecting Orders ---');
        snapshot.forEach(doc => {
            const data = doc.data();
            total++;
            const products = data.products || [];

            if (products.length > 0) {
                const hasZero = products.some(p => p.qty === 0);
                if (hasZero) {
                    zeroQtyCount++;
                    console.log(`❌ Order ${data.id}: Has ${products.length} products, but Qty is 0.`);
                    // console.log(JSON.stringify(products, null, 2));
                }
            } else {
                console.log(`⚠️ Order ${data.id}: No products.`);
            }
        });

        console.log(`\n📊 Summary: ${zeroQtyCount}/${total} orders have products but 0 Quantity.`);

        if (zeroQtyCount > 0) {
            console.log('👉 ACTION REQUIRED: Update sync logic to force-refresh orders with Qty=0.');
        }

    } catch (e) {
        console.error(e);
    }
}

checkQty();
