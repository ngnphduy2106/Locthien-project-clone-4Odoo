import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);
const { data: bg } = await supabase.from('odoo_orders').select('odoo_id, name').like('name', 'BG%');
const { data: pg } = await supabase.from('odoo_orders').select('odoo_id, name').like('name', 'PG%');
console.log(`Supabase BG records: ${bg?.length || 0}`);
console.log(`Supabase PG records (stale): ${pg?.length || 0}`);
if (pg?.length) pg.forEach(r => console.log(`  STALE: ${r.odoo_id}: ${r.name}`));
