
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkChatDb() {
    console.log('🔍 Checking Supabase Chat DB...');

    // Check order_messages table
    const { data: messages, error: msgError } = await supabase
        .from('order_messages')
        .select('*')
        .limit(5);

    if (msgError) {
        console.error('❌ Error order_messages:', msgError.message);
    } else {
        console.log('✅ order_messages sample:', messages);
    }

    // Check orders table for ID format
    const { data: orders, error: orderError } = await supabase
        .from('orders')
        .select('id, sale_order_no')
        .limit(5);

    if (orderError) {
        console.error('❌ Error orders:', orderError.message);
    } else {
        console.log('✅ orders sample:', orders);
    }
}

checkChatDb();
