import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

async function main() {
  console.log('--- FETCHING USERS ---');
  const { data: users, error: userErr } = await supabase.from('users').select('*');
  if (userErr) {
    console.error('Users error:', userErr);
  } else {
    console.log(`Found ${users.length} users:`);
    users.forEach(u => {
      console.log(`- ID: ${u.id}, Username: ${u.username}, Fullname: ${u.fullname}, Role: ${u.role}, Plate: ${u.plate}`);
    });
  }

  console.log('\n--- FETCHING EMPLOYEES ---');
  const { data: emps, error: empErr } = await supabase.from('employees').select('*');
  if (empErr) {
    console.error('Employees error:', empErr);
  } else {
    console.log(`Found ${emps.length} employees:`);
    emps.forEach(e => {
      console.log(`- ID: ${e.id}, FullName: ${e.fullname || e.fullName || e.name}, Role: ${e.role}, Plate: ${e.plate}`);
    });
  }
}

main().catch(console.error);
