import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

const orphans = [1146, 1152, 99999];
for (const id of orphans) {
  const { data, error } = await supabase.from('odoo_orders').delete().eq('odoo_id', id).select();
  if (error) console.error(`Failed delete ${id}:`, error.message);
  else console.log(`✓ Deleted id=${id}, name was: ${data?.[0]?.name || '(empty)'}`);
}
