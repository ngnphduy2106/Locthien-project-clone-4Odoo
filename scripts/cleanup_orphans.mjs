import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

// Get ALL rows (pagination)
let all = [];
let from = 0;
const pageSize = 1000;
while (true) {
  const { data, error } = await supabase
    .from('odoo_orders')
    .select('odoo_id, name')
    .order('odoo_id')
    .range(from, from + pageSize - 1);
  if (error) { console.error(error); break; }
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < pageSize) break;
  from += pageSize;
}
console.log(`Total Supabase rows: ${all.length}`);
const maxId = Math.max(...all.map(r => r.odoo_id));
console.log(`Max id: ${maxId}`);

// Check id 1152 (suspect orphan)
const r1152 = all.find(r => r.odoo_id === 1152);
console.log(`id=1152:`, r1152);

// IDs > 1140 (post-migration era)
const recent = all.filter(r => r.odoo_id >= 1140);
console.log(`Recent (id≥1140):`);
recent.forEach(r => console.log(`  ${r.odoo_id}: ${r.name}`));
