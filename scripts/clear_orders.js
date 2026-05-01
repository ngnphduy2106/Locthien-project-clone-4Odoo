// Script to clear orders table and trigger resync
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function clearOrders() {
    console.log('🗑️ Clearing orders table in Supabase...');
    console.log('   (MISA CRM data will NOT be touched)');

    const { data, error, count } = await supabase
        .from('orders')
        .delete()
        .neq('id', '')
        .select('id');

    if (error) {
        console.error('❌ Error:', error.message);
    } else {
        console.log(`✅ Deleted ${data?.length || 0} orders from Supabase`);
        console.log('📡 Restart server to trigger MISA sync...');
    }
}

clearOrders();
