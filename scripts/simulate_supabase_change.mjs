import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const sup = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);
const { error } = await sup.from('odoo_orders').update({
  x_lt_driver_name: 'Test Driver SLA',
  x_lt_plate: '99X-12345',
  x_lt_status: 'lt_delivering',
  synced_at: new Date().toISOString(),
}).eq('odoo_id', 1134);
if (error) console.error(error);
else console.log('✓ Supabase updated odoo_id=1134');
