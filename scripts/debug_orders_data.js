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
  console.log('--- Fetching odoo_orders with driver/plate info from Supabase ---');
  const { data, error } = await supabase
    .from('odoo_orders')
    .select('odoo_id, name, x_lt_driver_name, x_lt_plate, note, detail')
    .not('x_lt_driver_name', 'is', null);

  if (error) {
    console.error('DB error:', error.message);
    return;
  }

  console.log(`Found ${data.length} orders with x_lt_driver_name non-null.`);
  for (const row of data) {
    console.log(`\nOrder ${row.name} (odoo_id: ${row.odoo_id}):`);
    console.log(`- x_lt_driver_name: "${row.x_lt_driver_name}"`);
    console.log(`- x_lt_plate: "${row.x_lt_plate}"`);
    console.log(`- detail.x_lt_driver_name: "${row.detail?.x_lt_driver_name}"`);
    console.log(`- detail.x_lt_plate: "${row.detail?.x_lt_plate}"`);
    console.log(`- detail.x_driver_name: "${row.detail?.x_driver_name}"`);
    console.log(`- detail.x_plate: "${row.detail?.x_plate}"`);
    console.log(`- detail.x_assistant_name: "${row.detail?.x_assistant_name}"`);
  }
}

main().catch(console.error);
