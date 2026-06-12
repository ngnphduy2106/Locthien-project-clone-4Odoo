import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const sup = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);
const { data } = await sup.from('odoo_orders').select('odoo_id, name, x_lt_driver_name, x_lt_plate, x_lt_status').or('name.eq.PO2606011,odoo_id.eq.1166');
console.log(JSON.stringify(data, null, 2));
