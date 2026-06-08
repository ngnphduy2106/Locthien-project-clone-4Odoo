import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const url = process.env.ODOO_URL;

async function rpc(service, method, args) {
  const res = await fetch(`${url}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { service, method, args },
    }),
  });
  return res.json();
}

async function main() {
  try {
    const r = await rpc('db', 'list', []);
    console.log('Database List Response:', JSON.stringify(r, null, 2));
  } catch (e) {
    console.error('Failed to list databases:', e.message);
  }
}

main().catch(console.error);
