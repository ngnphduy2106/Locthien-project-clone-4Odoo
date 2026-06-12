import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);
const { data, error } = await supabase.from('odoo_orders').select('odoo_id, name, write_date, synced_at').or('name.eq.PO2606001,odoo_id.eq.1134');
console.log(JSON.stringify(data, null, 2));
if (error) console.error(error);
