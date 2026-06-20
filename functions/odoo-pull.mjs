// ============================================================
// Netlify Scheduled Function — Layer 3 inbound (Odoo → ERP)
// ============================================================
// Chạy incrementalSync() định kỳ để KÉO đơn mới/đổi từ Odoo về Supabase.
// Đây là lưới an toàn TỰ CHỮA: kể cả khi webhook (Layer 1) chết, đơn mới vẫn
// tự xuất hiện trong ERP trong ≤ chu kỳ cron.
//
// Vì sao cần: trên serverless, setInterval trong server/index.js KHÔNG chạy
// (process không sống giữa các request). Scheduled Function là cách duy nhất
// để có "cron" trên Netlify.
//
// incrementalSync đọc cursor odoo_sync_state.last_sync → listOrdersSince(write_date>=)
// → upsert (idempotent theo odoo_id). Env vars (ODOO_URL, SUPABASE_*, ...) lấy từ
// site environment của Netlify.
//
// Lịch chạy được khai báo trong netlify.toml ([functions."odoo-pull"] schedule).
// Format classic handler (giống functions/api.js) — không cần @netlify/functions.

import { createSyncService } from '../server/integration/sync/sync-service.js';
import { supabaseHooks } from '../server/integration/supabase-hooks.js';

const sync = createSyncService(supabaseHooks);

export const handler = async () => {
  const t0 = Date.now();
  try {
    const r = await sync.incrementalSync();
    console.log(`[odoo-pull-cron] done in ${Date.now() - t0}ms`, r);
    return { statusCode: 200, body: JSON.stringify({ ok: true, ms: Date.now() - t0, ...r }) };
  } catch (e) {
    console.error('[odoo-pull-cron] fail:', e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
