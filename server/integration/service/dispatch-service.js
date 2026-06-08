import * as odoo from '../odoo/odoo-client.js';
import { upsertOrderFromWebhook, upsertPurchaseOrderFromWebhook } from '../supabase-hooks.js';

/**
 * Logic điều phối — nhận payload từ webhook, upsert vào Supabase `odoo_orders`
 * kèm `detail` JSONB (chứa lines + shipping + partner đầy đủ). Frontend đọc
 * trực tiếp từ đó.
 *
 * Mở rộng sau khi nghiệp vụ cần:
 *   - gửi Telegram cho tài xế (services/telegram.js đã có)
 *   - tự động assign tài xế theo rule, rồi gọi `odoo.assignDriver(...)`
 */
export const dispatchService = {
  /**
   * @param {import('../webhook/payload-types.js').OdooWebhookPayload} p
   */
  async onReadyForDispatch(p) {
    await upsertOrderFromWebhook(p);
    console.log(`[dispatch] sẵn sàng: ${p.order_name} (id=${p.order_id}) — `
      + `${p.lines?.length ?? 0} dòng, tổng ${p.amount_total} ${p.currency}`);

    // TODO sau: gửi Telegram + auto-assign nếu có rule, ví dụ:
    // await sendTelegramMessage(`🆕 Đơn mới ${p.order_name}…`, 'NHAP');
    // await odoo.assignDriver(p.order_id, 'Nguyễn Văn A', '51C-12345');
  },

  async onDeliveryStarted(p) {
    await upsertOrderFromWebhook(p);
    console.log(`[dispatch] xuất kho: ${p.order_name} — tài xế ${p.x_lt_driver_name} / ${p.x_lt_plate}`);
  },

  async onDelivered(p) {
    await upsertOrderFromWebhook(p);
    console.log(`[dispatch] giao xong: ${p.order_name} @ ${p.timestamp}`);
  },

  async onPushedMisa(p) {
    await upsertOrderFromWebhook(p);
    console.log(`[dispatch] kế toán đẩy MISA: ${p.order_name} — quy trình kết thúc`);
    // TODO: gọi services/misa.js push thực sự nếu cần đồng bộ sang MISA
    // const { updateMisaOrder } = await import('../../services/misa.js');
    // await updateMisaOrder(p.order_name, { ... mapping fields ... });
  },

  // ---- Đơn mua (purchase order) ----

  async onPoReadyForPickup(p) {
    await upsertPurchaseOrderFromWebhook(p);
    console.log(`[dispatch] PO mới cần đi lấy: ${p.po_name} (id=${p.po_id}) — `
      + `NCC ${p.supplier?.name} • ${p.lines?.length ?? 0} dòng • tổng ${p.amount_total} ${p.currency}`);
  },

  async onPoReceived(p) {
    await upsertPurchaseOrderFromWebhook(p);
    console.log(`[dispatch] PO đã nhận đủ: ${p.po_name} (driver ${p.x_lt_po_driver_name})`);
  },

  // ---- Re-sync events (idempotent upsert, không trigger downstream) ----

  async onOrderSynced(p) {
    await upsertOrderFromWebhook(p);
    console.log(`[dispatch] sync: ${p.order_name} (id=${p.order_id})`);
  },

  async onPoSynced(p) {
    await upsertPurchaseOrderFromWebhook(p);
    console.log(`[dispatch] PO sync: ${p.po_name} (id=${p.po_id})`);
  },

  /**
   * Pull đơn pending từ Odoo (fallback khi webhook bị miss).
   * Trả về list rỗng nếu Odoo lỗi — caller tự handle.
   */
  async pullPending(limit = 50) {
    const orders = await odoo.listPendingDispatch(limit);
    console.log(`[dispatch] có ${orders.length} đơn pending từ Odoo`);
    return orders;
  },
};
