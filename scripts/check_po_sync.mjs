import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

// Check odoo_purchase_orders table
const { data: pos, error } = await supabase
  .from('odoo_purchase_orders')
  .select('odoo_id, name, x_lt_po_status, write_date')
  .order('odoo_id', { ascending: false })
  .limit(20);

if (error) {
  console.error('ERROR:', error.message);
} else {
  console.log(`Total recent PO rows: ${pos.length}`);
  pos.forEach(r => console.log(`  ${r.odoo_id}: ${r.name} | ${r.x_lt_po_status} | ${r.write_date}`));
}
