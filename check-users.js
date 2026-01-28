import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const checkUsers = async () => {
    try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        console.log('🔍 Checking users in Supabase...');
        const { data: users, error } = await supabase.from('users').select('*');

        if (error) {
            console.error('❌ Error:', error);
            return;
        }

        console.log(`\n✅ Found ${users.length} users:\n`);
        users.forEach(user => {
            console.log(`ID: ${user.id}`);
            console.log(`Username: ${user.username}`);
            console.log(`Password: ${user.password}`);
            console.log(`Full Name: ${user.fullname || user.fullName}`);
            console.log(`Role: ${user.role}`);
            console.log(`Status: ${user.status}\n`);
        });

    } catch (error) {
        console.error('❌ Script Error:', error.message);
    }
};

checkUsers();
