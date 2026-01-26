// ===============================================
// FIREBASE DATABASE CONFIGURATION
// ===============================================
// This module provides optional Firebase Firestore support.
// If Firebase is not configured, the app will use mock data.

import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;
let firebaseInitialized = false;

// Try to initialize Firebase (optional)
async function initFirebase() {
    try {
        // Dynamic import to avoid errors when firebase-admin is not installed
        const { initializeApp, cert } = await import('firebase-admin/app');
        // const { getFirestore } = await import('firebase-admin/firestore'); // Not using Firestore anymore
        const { getDatabase } = await import('firebase-admin/database');

        const DATABASE_URL = 'https://locthien-scm-default-rtdb.asia-southeast1.firebasedatabase.app/';

        // 1. Try Service Account File first
        const saPath = join(__dirname, '../../firebase-service-account.json');
        if (fs.existsSync(saPath)) {
            const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
            initializeApp({
                credential: cert(sa),
                databaseURL: DATABASE_URL,
                projectId: sa.project_id
            });
            db = getDatabase();
            firebaseInitialized = true;
            console.log('🔥 Firebase Realtime Database initialized:', DATABASE_URL);
            return db;
        }

        // 2. Fallback to Environment Variables
        if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
            initializeApp({
                credential: cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
                }),
                databaseURL: DATABASE_URL,
                projectId: process.env.FIREBASE_PROJECT_ID
            });
            db = getDatabase();
            firebaseInitialized = true;
            console.log('🔥 Firebase Realtime Database initialized (Env Var)');
            return db;
        }

        console.log('⚠️ Firebase credentials not found. Using mock database.');
        return null;

    } catch (error) {
        console.log('⚠️ Firebase initialization failed or SDK not installed:', error.message);
        return null;
    }
}

// Initialize on module load
initFirebase().catch(e => console.error('Firebase late init error:', e));

export { db, firebaseInitialized };
export default db;
