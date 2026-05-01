
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function seedMaterials() {
    try {
        const saPath = join(__dirname, '../../firebase-service-account.json');
        if (!fs.existsSync(saPath)) {
            console.error('❌ Service account not found at', saPath);
            return;
        }

        const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
        initializeApp({
            credential: cert(sa),
            projectId: sa.project_id
        });

        const db = getFirestore();
        const materialsRef = db.collection('materials');

        const newMaterials = [
            { code: 'HH00001', name: 'Hàng hoá 01', unit: 'Cái', price: 100000, type: 'Finished' },
            { code: 'NH4CL', name: 'Ammonium Chloride', unit: 'kg', price: 7300, type: 'Chemical' },
            { code: 'JAVEL', name: 'Javen 10%', unit: 'kg', price: 2000, type: 'Chemical' },
            { code: 'HCL', name: 'Axit HCL 32%', unit: 'kg', price: 3000, type: 'Chemical' }
        ];

        for (const mat of newMaterials) {
            await materialsRef.doc(mat.code).set(mat, { merge: true });
            console.log(`✅ Upserted Material: ${mat.code}`);
        }

        console.log('✨ Seed Complete.');

    } catch (e) {
        console.error('❌ Error:', e);
    }
}

seedMaterials();
