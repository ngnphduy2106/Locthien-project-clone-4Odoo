import * as odoo from '../server/integration/odoo/odoo-client.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

async function main() {
  console.log('Fetching sale.order fields from Odoo...');
  try {
    const fields = await odoo.call('sale.order', 'fields_get', [], {
      attributes: ['string', 'type']
    });
    console.log('List of sale.order custom fields:');
    for (const [name, def] of Object.entries(fields)) {
      if (name.startsWith('x_')) {
        console.log(`- ${name}: ${def.string} (${def.type})`);
      }
    }
  } catch (e) {
    console.error('Odoo call failed:', e.message);
  }
}

main().catch(console.error);
