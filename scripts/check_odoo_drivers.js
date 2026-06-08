import * as odoo from '../server/integration/odoo/odoo-client.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

async function main() {
  console.log('Fetching recent orders from Odoo with driver fields...');
  try {
    const orders = await odoo.call('sale.order', 'search_read', [[]], {
      fields: [
        'name', 'state', 'x_lt_status',
        'x_lt_driver_name', 'x_lt_plate', 
        'x_driver_name', 'x_plate', 'x_assistant_name'
      ],
      limit: 100,
      order: 'write_date DESC'
    });

    console.log(`Retrieved ${orders.length} orders. Let's inspect those with non-empty driver fields:`);
    let found = 0;
    for (const o of orders) {
      const hasLt = o.x_lt_driver_name || o.x_lt_plate;
      const hasNew = o.x_driver_name || o.x_plate || o.x_assistant_name;
      if (hasLt || hasNew) {
        found++;
        console.log(`\nOrder: ${o.name} (id: ${o.id}, state: ${o.state}, status: ${o.x_lt_status})`);
        console.log(`  - x_lt_driver_name: "${o.x_lt_driver_name}"`);
        console.log(`  - x_lt_plate: "${o.x_lt_plate}"`);
        console.log(`  - x_driver_name: "${o.x_driver_name}"`);
        console.log(`  - x_plate: "${o.x_plate}"`);
        console.log(`  - x_assistant_name: "${o.x_assistant_name}"`);
      }
    }
    console.log(`\nTotal orders with driver data: ${found}/${orders.length}`);
  } catch (e) {
    console.error('Odoo call failed:', e.message);
  }
}

main().catch(console.error);
