import * as odoo from '../server/integration/odoo/odoo-client.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

async function main() {
  console.log('--- Fetching order 1124 from Supabase odoo_orders ---');
  const { data: dbRow, error: dbErr } = await supabase
    .from('odoo_orders')
    .select('*')
    .eq('odoo_id', 1124)
    .single();

  if (dbErr) {
    console.error('DB error:', dbErr);
  } else {
    console.log('Database Row:');
    console.log('- odoo_id:', dbRow.odoo_id);
    console.log('- name:', dbRow.name);
    console.log('- x_lt_driver_name:', dbRow.x_lt_driver_name);
    console.log('- x_lt_plate:', dbRow.x_lt_plate);
    console.log('- detail keys:', dbRow.detail ? Object.keys(dbRow.detail) : null);
    if (dbRow.detail) {
      console.log('- detail.x_driver_name:', dbRow.detail.x_driver_name);
      console.log('- detail.x_plate:', dbRow.detail.x_plate);
      console.log('- detail.x_assistant_name:', dbRow.detail.x_assistant_name);
      console.log('- detail.x_lt_driver_name:', dbRow.detail.x_lt_driver_name);
      console.log('- detail.x_lt_plate:', dbRow.detail.x_lt_plate);
    }
  }

  console.log('\n--- Fetching order 1124 directly from Odoo via search_read ---');
  try {
    const odooRows = await odoo.call('sale.order', 'search_read', [[['id', '=', 1124]]], {
      fields: [
        'name', 'x_lt_driver_name', 'x_lt_plate', 
        'x_driver_name', 'x_plate', 'x_assistant_name'
      ]
    });
    console.log('Odoo search_read result:', odooRows);
  } catch (e) {
    console.error('Odoo search_read failed:', e.message);
  }
}

main().catch(console.error);
