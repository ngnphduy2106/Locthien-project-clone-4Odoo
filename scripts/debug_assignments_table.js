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
  console.log('--- Fetching order_driver_assignments from Supabase ---');
  const { data, error } = await supabase
    .from('order_driver_assignments')
    .select('*')
    .limit(20);

  if (error) {
    console.error('DB error:', error.message);
    return;
  }

  console.log(`Found ${data.length} records in order_driver_assignments:`);
  for (const row of data) {
    console.log(`- ID: ${row.id}, order_id: ${row.order_id}, sale_order_no: ${row.sale_order_no}`);
    console.log(`  Driver: ${row.driver_name}, Plate: ${row.plate}, Assistant: ${row.assistant_name}`);
    console.log(`  Status: ${row.status}, Created at: ${row.created_at}`);
  }
}

main().catch(console.error);
