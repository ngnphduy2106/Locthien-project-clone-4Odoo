// ============================================================
// Odoo bootstrap — chạy 1 lần để kéo TOÀN BỘ partners + products + orders
// từ Odoo về Supabase. Sau lần này, incremental sync trong index.js sẽ
// chỉ pull những bản ghi có write_date >= last_sync.
//
// Cách chạy:
//   node scripts/odoo-bootstrap.js
// ============================================================

import { createSyncService } from '../server/integration/sync/sync-service.js';
import { supabaseHooks } from '../server/integration/supabase-hooks.js';

const sync = createSyncService(supabaseHooks);

console.log('🚀 Bắt đầu bootstrap Odoo → Supabase…');
sync.bootstrap()
  .then(() => {
    console.log('✅ Bootstrap xong.');
    process.exit(0);
  })
  .catch((e) => {
    console.error('❌ Bootstrap fail:', e);
    process.exit(1);
  });
