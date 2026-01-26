
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkUsers() {
    console.log('🔍 Checking Supabase Users...');
    const { data, error } = await supabase
        .from('users')
        .select('*');

    if (error) {
        console.error('❌ Error:', error.message);
        return;
    }

    console.log(`✅ Found ${data.length} users total.`);

    data.forEach(u => {
        console.log(`- ID: ${u.id} | Name: "${u.fullname}" | Role: ${u.role} | Status: ${u.status}`);
    });

    const target = "Phan Đình Phi".toUpperCase();
    const matches = data.filter(u => String(u.fullname || '').toUpperCase().trim() === target);
    console.log(`\n🎯 Matches for "${target}": ${matches.length}`);
}

checkUsers();
