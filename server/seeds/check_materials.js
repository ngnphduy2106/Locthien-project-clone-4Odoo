
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function checkMaterials() {
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
        const snapshot = await db.collection('materials').get();
        console.log(`✅ Total Materials in DB: ${snapshot.size}`);

        if (snapshot.size > 0) {
            console.log('--- Sample Data ---');
            console.log(JSON.stringify(snapshot.docs[0].data(), null, 2));
        }

    } catch (e) {
        console.error('❌ Error:', e);
    }
}

checkMaterials();
