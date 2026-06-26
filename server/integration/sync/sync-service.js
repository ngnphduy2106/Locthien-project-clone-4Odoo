import * as odoo from '../odoo/odoo-client.js';
import { config } from '../config.js';

/**
 * Đồng bộ dữ liệu Odoo → ERP nội bộ.
 *
 * 2 chế độ:
 *  - bootstrap()        chạy 1 lần khi cài, kéo TOÀN BỘ partners/products/orders.
 *  - startIncremental() setInterval mặc định 5 phút, chỉ kéo bản ghi có
 *                       write_date >= lastSyncDate (catch event nếu webhook miss).
 *
 * Cách dùng — truyền 5 hook khi gọi createSyncService():
 *
 *   const sync = createSyncService({
 *     onPartner: (p) => db.partners.upsert(p),
 *     onProduct: (p) => db.products.upsert(p),
 *     onOrder:   (o) => db.orders.upsert(o),
 *     getLastSyncDate: () => db.state.get('odoo_last_sync'),
 *     saveLastSyncDate: (iso) => db.state.set('odoo_last_sync', iso),
 *   });
 *   await sync.bootstrap();
 *   sync.startIncremental();
 */

const EPOCH = '1970-01-01 00:00:00';
const DEFAULT_BATCH = 100;

/** "yyyy-MM-dd HH:mm:ss" UTC — khớp format Odoo. */
function nowUtc() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * @typedef {Object} SyncHooks
 * @property {(row: object) => void|Promise<void>} [onPartner]
 * @property {(row: object) => void|Promise<void>} [onProduct]
 * @property {(row: object) => void|Promise<void>} [onOrder]
 * @property {(row: object) => void|Promise<void>} [onPurchaseOrder]
 * @property {() => string|Promise<string>}        [getLastSyncDate]
 * @property {(iso: string) => void|Promise<void>} [saveLastSyncDate]
 */

/**
 * @param {SyncHooks} [hooks]
 */
export function createSyncService(hooks = {}) {
  const onPartner = hooks.onPartner ?? ((p) => console.warn('[sync] override onPartner để persist partner id=', p.id));
  const onProduct = hooks.onProduct ?? ((p) => console.warn('[sync] override onProduct để persist product id=', p.id));
  const onOrder   = hooks.onOrder   ?? ((o) => console.warn('[sync] override onOrder để persist order id=', o.id));
  const onPurchaseOrder = hooks.onPurchaseOrder ?? ((po) => console.warn('[sync] override onPurchaseOrder id=', po.id));
  const getLastSyncDate  = hooks.getLastSyncDate  ?? (() => EPOCH);
  const saveLastSyncDate = hooks.saveLastSyncDate ?? ((iso) => console.warn('[sync] override saveLastSyncDate (now=', iso, ')'));

  let timer = null;
  let running = false;

  /**
   * Batch-fetch note-type order lines từ Odoo và inject vào mỗi order row.
   * Odoo cho phép chèn ghi chú giữa các sản phẩm (display_type = 'line_note'),
   * ví dụ: "Giao hàng trước 12h trưa của ngày giao hàng".
   */
  async function injectLineNotes(rows) {
    try {
      const orderIds = rows.map(r => r.id).filter(Boolean);
      const noteMap = await odoo.getOrderLineNotes(orderIds);
      for (const r of rows) {
        const lineNote = noteMap[r.id] || '';
        // Ghép: sale.order.note + line notes
        const existingNote = (r.note && r.note !== false) ? r.note : '';
        r.note = [existingNote, lineNote].filter(Boolean).join('\n') || '';
      }
    } catch (e) {
      console.error('[sync] injectLineNotes fail:', e.message);
    }
  }

  /**
   * Paginate qua một fetcher (offset, limit).
   * @param {(offset:number, limit:number) => Promise<object[]>} fetcher
   * @param {string} label
   * @param {(row:object) => void|Promise<void>} handler
   */
  async function paginate(fetcher, label, handler) {
    let offset = 0, done = 0;
    const batch = DEFAULT_BATCH;
    while (true) {
      const rows = await fetcher(offset, batch);
      if (!rows || rows.length === 0) break;

      // Nếu sync orders, batch-fetch line notes rồi inject vào mỗi row
      if (label === 'orders') {
        await injectLineNotes(rows);
      }

      for (const r of rows) {
        try { await handler(r); done++; }
        catch (e) { console.error(`[sync ${label}] fail id=${r.id}:`, e.message); }
      }
      console.log(`[sync ${label}] ${done} synced`);
      if (rows.length < batch) break;
      offset += batch;
    }
    return done;
  }

  /**
   * Paginate có filter "since".
   * @param {(since:string, offset:number, limit:number) => Promise<object[]>} fetcher
   */
  async function paginateSince(fetcher, since, label, handler) {
    let offset = 0, done = 0;
    const batch = DEFAULT_BATCH;
    while (true) {
      const rows = await fetcher(since, offset, batch);
      if (!rows || rows.length === 0) break;

      // Nếu sync orders, batch-fetch line notes rồi inject vào mỗi row
      if (label === 'orders') {
        await injectLineNotes(rows);
      }

      for (const r of rows) {
        try { await handler(r); done++; }
        catch (e) { console.error(`[sync ${label}] fail id=${r.id}:`, e.message); }
      }
      if (done > 0) console.log(`[sync ${label}] ${done} updated since ${since}`);
      if (rows.length < batch) break;
      offset += batch;
    }
    return done;
  }

  // ----- API public -----

  /** Kéo TOÀN BỘ Partners + Products + Orders. Gọi 1 lần khi setup. */
  async function bootstrap() {
    console.log('=== ODOO BOOTSTRAP START ===');
    const [tp, tpr, to, tpo] = await Promise.all([
      odoo.countPartners(), odoo.countProducts(), odoo.countOrders(),
      odoo.countPurchaseOrders(),
    ]);
    console.log(`Tổng: ${tp} partners, ${tpr} products, ${to} sale orders, ${tpo} purchase orders`);

    await paginate(odoo.listPartners,        'partners',        onPartner);
    await paginate(odoo.listProducts,        'products',        onProduct);
    await paginate(odoo.listOrders,          'sale orders',     onOrder);
    await paginate(odoo.listPurchaseOrders,  'purchase orders', onPurchaseOrder);

    await saveLastSyncDate(nowUtc());
    console.log('=== ODOO BOOTSTRAP DONE ===');
  }

  /**
   * Chỉ pull thay đổi mới — chống chồng lần chạy bằng cờ `running`.
   * Trả về `{ skipped, since, partners, products, orders, purchaseOrders }` để
   * caller (endpoint /pull, scheduled function) báo summary.
   */
  async function incrementalSync() {
    if (running) {
      console.warn('[sync] lần trước chưa xong, skip');
      return { skipped: true };
    }
    running = true;
    try {
      let since = await getLastSyncDate();
      if (!since || !String(since).trim()) since = EPOCH;
      console.log(`[sync] since=${since}`);
      const now = nowUtc();

      // THỨ TỰ QUAN TRỌNG: kéo dữ liệu NGHIỆP VỤ (đơn mua + đơn bán) TRƯỚC dữ liệu
      // tham chiếu (partners/products). Upsert chạy ngay trong paginateSince, nên
      // nếu hàm bị Vercel kill giữa chừng thì đơn vẫn đã được ghi — chỉ partners/
      // products (ít quan trọng, lại có webhook riêng) là có thể trễ. Trước đây POs
      // ở pha CUỐI nên hễ pha orders chậm là đơn mua bị bỏ đói hoàn toàn.
      const purchaseOrders  = await paginateSince(odoo.listPurchaseOrdersSince, since, 'purchase orders', onPurchaseOrder);
      const orders          = await paginateSince(odoo.listOrdersSince,         since, 'sale orders',     onOrder);
      const partners        = await paginateSince(odoo.listPartnersSince,       since, 'partners',        onPartner);
      const products        = await paginateSince(odoo.listProductsSince,       since, 'products',        onProduct);

      await saveLastSyncDate(now);
      return { skipped: false, since, partners, products, orders, purchaseOrders };
    } finally {
      running = false;
    }
  }

  /** Khởi động setInterval. Trả về hàm stop. */
  function startIncremental() {
    if (timer) return () => stopIncremental();
    const ms = config.sync.intervalMs;
    console.log(`[sync] incremental every ${ms}ms`);
    // chạy 1 lần ngay để không phải đợi cả interval đầu tiên
    incrementalSync().catch((e) => console.error('[sync] first run fail:', e));
    timer = setInterval(() => {
      incrementalSync().catch((e) => console.error('[sync] tick fail:', e));
    }, ms);
    // unref() để timer không giữ event loop khi shutdown
    timer.unref?.();
    return stopIncremental;
  }

  function stopIncremental() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  return { bootstrap, incrementalSync, startIncremental, stopIncremental };
}
