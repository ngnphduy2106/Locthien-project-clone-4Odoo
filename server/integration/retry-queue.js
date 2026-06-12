/**
 * Retry queue cho Odoo XML-RPC calls — đảm bảo SLA ≤ 1 phút ERP → Odoo sync.
 *
 * Pattern: 3-stage backoff retry. Sau 3 lần fail → persist vào Supabase
 * `sync_failed_events` table cho dead-letter handling.
 *
 * Usage:
 *   import { retryOdooCall } from './retry-queue.js';
 *   await retryOdooCall('assignDriver:1156', () => odoo.assignDriver(1156, 'A', 'B'));
 */
import { createClient } from '@supabase/supabase-js';

const BACKOFF_MS = [1000, 5000, 30000];  // 1s → 5s → 30s
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Gọi fn với 3 retry + backoff. Throw lại nếu fail hết.
 * @param {string} label - định danh cho log/audit (vd "assignDriver:1156")
 * @param {() => Promise<any>} fn - async function thực hiện call
 */
export async function retryOdooCall(label, fn) {
  let lastErr;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const result = await fn();
      if (attempt > 0) {
        console.log(`[retry-queue] OK ${label} sau ${attempt} retry`);
      }
      return result;
    } catch (e) {
      lastErr = e;
      const msg = (e && e.message) || String(e);
      console.warn(`[retry-queue] ${label} attempt ${attempt + 1} fail: ${msg}`);
      if (attempt < BACKOFF_MS.length) {
        await sleep(BACKOFF_MS[attempt]);
      }
    }
  }
  // Hết retry → persist dead-letter
  await persistFailed(label, lastErr);
  throw lastErr;
}

async function persistFailed(label, err) {
  try {
    await supabase.from('sync_failed_events').insert({
      label,
      error_message: (err && err.message) || String(err),
      created_at: new Date().toISOString(),
      resolved: false,
    });
    console.error(`[retry-queue] DEAD-LETTER ${label} — persisted to sync_failed_events`);
  } catch (persistErr) {
    console.error(`[retry-queue] Cannot persist dead-letter ${label}: ${persistErr.message}`);
  }
}

/**
 * Wrapper convenience: tự generate label từ method + arg.
 */
export function wrapOdoo(method, ...args) {
  const label = `${method.name || 'odoo'}:${JSON.stringify(args).slice(0, 50)}`;
  return retryOdooCall(label, () => method(...args));
}
