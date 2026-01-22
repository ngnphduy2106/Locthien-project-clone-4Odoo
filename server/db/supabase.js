// ===============================================
// SUPABASE DATABASE ADAPTER
// ===============================================

import dotenv from 'dotenv';
dotenv.config();

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
