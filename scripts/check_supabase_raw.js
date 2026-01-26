
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkSpecific() {
    const target = "Phan Đình Phi";
    console.log(`🔍 Searching Supabase for orders assigned to: "${target}"`);

    // Get ALL orders to see if we can find any string match in custom_field13
    const { data, error } = await supabase
        .from('orders')
        .select('id, sale_order_no, status, custom_field13');

    if (error) {
        console.error('❌ Error:', error.message);
        return;
    }

    console.log(`📊 Scanned ${data.length} total orders in Supabase.`);

    const matches = data.filter(o =>
        String(o.custom_field13 || '').toUpperCase().trim() === target.toUpperCase()
    );

    console.log(`✅ Matches found: ${matches.length}`);

    matches.forEach(o => {
        console.log(`- [MATCH] ID: ${o.id} | OrderNo: ${o.sale_order_no} | Status: ${o.status} | Driver: "${o.custom_field13}"`);
    });

    if (matches.length === 0) {
        console.log(`\n❌ No exact matches. Listing distinct values of custom_field13 to find discrepancies:`);
        const values = [...new Set(data.map(o => String(o.custom_field13)))];
        console.log(values.slice(0, 20).join(', '));
    }
}

checkSpecific();
