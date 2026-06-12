import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const sup = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);
await sup.from('odoo_orders').update({
  x_lt_driver_name: null, x_lt_plate: null, x_lt_status: 'lt_approved',
}).eq('odoo_id', 1134);
console.log('✓ Supabase test data cleaned');
