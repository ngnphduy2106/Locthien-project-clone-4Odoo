import * as odoo from '../server/integration/odoo/odoo-client.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

async function main() {
  console.log('Calling odoo.getOrderDetail(1040)...');
  try {
    const detail = await odoo.getOrderDetail(1040);
    console.log('Keys in detail response:', Object.keys(detail));
    console.log('Driver field value in detail response:', detail.x_driver_name);
    console.log('Plate field value in detail response:', detail.x_plate);
    console.log('Assistant field value in detail response:', detail.x_assistant_name);
    console.log('Full detail object:');
    console.dir(detail, { depth: null });
  } catch (e) {
    console.error('Odoo call failed:', e.message);
  }
}

main().catch(console.error);
