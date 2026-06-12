import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

// Check id=1134
const { data: r1134 } = await supabase.from('odoo_orders').select('odoo_id, name, write_date').eq('odoo_id', 1134).maybeSingle();
console.log('id=1134:', r1134);

// Verify no stale E/S/P prefix remains
const { data: stale } = await supabase
  .from('odoo_orders')
  .select('odoo_id, name')
  .or('name.like.E0%,name.like.S0%,name.like.P0%')
  .limit(20);
console.log(`Remaining stale names: ${stale?.length || 0}`);
if (stale?.length) stale.forEach(r => console.log(`  ${r.odoo_id}: ${r.name}`));
