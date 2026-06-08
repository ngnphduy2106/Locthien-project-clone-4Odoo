import * as odoo from '../server/integration/odoo/odoo-client.js';
import { upsertOrder } from '../server/integration/supabase-hooks.js';
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
  console.log('--- FETCHING ALL ORDERS FROM DATABASE (PAGINATED) ---');
  let dbOrders = [];
  let page = 0;
  const pageSize = 1000;
  
  while (true) {
    console.log(`Fetching page ${page + 1} (${page * pageSize} to ${(page + 1) * pageSize - 1})...`);
    const { data, error } = await supabase
      .from('odoo_orders')
      .select('odoo_id, name')
      .range(page * pageSize, (page + 1) * pageSize - 1);
      
    if (error) {
      console.error('Failed to fetch orders from database:', error.message);
      return;
    }
    if (!data || data.length === 0) break;
    dbOrders = dbOrders.concat(data);
    if (data.length < pageSize) break;
    page++;
  }

  console.log(`Found ${dbOrders.length} orders in database. Initiating detailed Odoo sync...`);

  let count = 0;
  for (const o of dbOrders) {
    count++;
    console.log(`[${count}/${dbOrders.length}] Syncing order ${o.name} (odoo_id: ${o.odoo_id})...`);
    try {
      // 1. Fetch full details from Odoo
      const fullDetail = await odoo.getOrderDetail(o.odoo_id);
      
      if (fullDetail) {
        // 2. Fetch basic fields from search_read to get state, write_date, note, and active driver/plate/assistant
        const odooRows = await odoo.call('sale.order', 'search_read', [[['id', '=', o.odoo_id]]], {
          fields: [
            'id', 'name', 'partner_id', 'partner_shipping_id',
            'amount_untaxed', 'amount_tax', 'amount_total',
            'date_order', 'commitment_date', 'state', 'note',
            'x_lt_status', 'x_lt_is_quotation',
            'x_lt_driver_name', 'x_lt_plate',
            'x_driver_name', 'x_plate', 'x_assistant_name',
            'x_lt_shipping_address',
            'x_phi_phu_thu', 'write_date',
          ]
        });

        if (odooRows && odooRows.length > 0) {
          const basic = odooRows[0];
          // Merge lines into basic object
          basic.lines = fullDetail.lines || [];
          
          // 3. Upsert order (will merge detail and save to DB columns)
          await upsertOrder(basic);
          console.log(`   - Success: driver="${basic.x_driver_name}", plate="${basic.x_plate}", assistant="${basic.x_assistant_name}", lines=${basic.lines.length}`);
        } else {
          console.warn(`   - Warning: Could not find basic order fields for ${o.name} on Odoo`);
        }
      } else {
        console.warn(`   - Warning: Empty detail returned for ${o.name}`);
      }
    } catch (e) {
      console.error(`   - Failed to sync ${o.name}:`, e.message);
    }
    // Small delay to prevent hammering JSON-RPC
    await new Promise(r => setTimeout(r, 50));
  }

  console.log('--- DETAILED ODOO SYNC COMPLETED ---');
}

main().catch(console.error);
