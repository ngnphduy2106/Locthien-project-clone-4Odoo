// ===============================================
// SUPABASE DATABASE ADAPTER
// ===============================================

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load .env from project root (one level up from server/db/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../../.env') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;
let supabaseInitialized = false;

if (supabaseUrl && supabaseKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
        supabaseInitialized = true;
        console.log('🟢 Supabase Database initialized:', supabaseUrl);
    } catch (e) {
        console.error('❌ Supabase initialization failed:', e.message);
    }
} else {
    console.log('⚠️ Supabase credentials not found in .env');
}

export { supabase, supabaseInitialized };
export default supabase;
