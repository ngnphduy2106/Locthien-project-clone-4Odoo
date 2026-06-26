import { config } from '../config.js';

/**
 * Client gọi Odoo qua JSON-RPC.
 *
 * Method nghiệp vụ điều phối:
 *   - listPendingDispatch(limit)
 *   - getOrderDetail(orderId)
 *   - assignDriver(orderId, driverName, plate)
 *   - startDelivery(orderId)
 *   - completeDelivery(orderId)
 *
 * Bulk read (bootstrap / incremental):
 *   - countPartners/Products/Orders
 *   - listPartners/Products/Orders(offset, limit)
 *   - listPartnersSince/ProductsSince/OrdersSince(isoDate, offset, limit)
 *
 * Generic:
 *   - call(model, method, args, kwargs)
 */

export const DEFAULT_BATCH = 100;

const PARTNER_FIELDS = [
  'id', 'display_name', 'name', 'vat', 'phone', 'email',
  'street', 'street2', 'city', 'is_company',
  'customer_rank', 'supplier_rank',
  'x_lt_rank', 'x_is_locked', 'x_locked_reason',
  'write_date',
];

const PRODUCT_FIELDS = [
  'id', 'display_name', 'name', 'default_code', 'barcode',
  'list_price', 'standard_price',
  'uom_id', 'categ_id', 'type', 'is_storable',
  'sale_ok', 'purchase_ok', 'write_date',
];

const ORDER_FIELDS = [
  'id', 'name', 'partner_id', 'partner_shipping_id',
  'amount_untaxed', 'amount_tax', 'amount_total',
  'date_order', 'commitment_date', 'state', 'note',
  'x_lt_status', 'x_lt_is_quotation',
  'x_lt_driver_name', 'x_lt_plate',
  'x_driver_name', 'x_plate', 'x_assistant_name',
  'x_lt_shipping_address',
  'x_phi_phu_thu', 'write_date',
];

const PO_FIELDS = [
  'id', 'name', 'partner_id',
  'amount_untaxed', 'amount_tax', 'amount_total',
  'currency_id', 'date_order', 'date_planned', 'state', 'note',
  'x_lt_po_status', 'x_lt_po_driver_name', 'x_lt_po_plate',
  'x_lt_po_pickup_address', 'picking_type_id', 'write_date',
];

let uid = null;

async function rpc(service, method, args) {
  // AbortController = "tử huyệt" trên serverless: fetch mặc định KHÔNG có timeout,
  // nên một Odoo chậm/treo sẽ giữ hàm /pull mở tới khi Vercel kill (cursor đứng im,
  // pha purchase orders bị bỏ đói). Cắt ở rpcTimeoutMs để fail-fast.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.odoo.rpcTimeoutMs);
  let res;
  try {
    res = await fetch(`${config.odoo.url}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: { service, method, args },
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`Odoo RPC timeout (${config.odoo.rpcTimeoutMs}ms) @ ${service}.${method}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Odoo HTTP ${res.status}`);
  return res.json();
}

async function auth() {
  if (uid && uid > 0) return uid;
  const r = await rpc('common', 'authenticate',
    [config.odoo.db, config.odoo.login, config.odoo.apiKey, {}]);
  const result = r?.result;
  if (typeof result !== 'number' || result === 0) {
    throw new Error(`Odoo auth failed: ${JSON.stringify(r.error)}`);
  }
  uid = result;
  return uid;
}

/**
 * Generic execute_kw — retry 1 lần nếu auth hết hạn.
 * @param {string} model     vd 'sale.order'
 * @param {string} method    vd 'search_read'
 * @param {any[]}  args      positional args
 * @param {object} [kwargs]  keyword args
 */
export async function call(model, method, args, kwargs = {}) {
  const send = async () => rpc('object', 'execute_kw',
    [config.odoo.db, await auth(), config.odoo.apiKey, model, method, args, kwargs]);

  let r = await send();
  if (r.error) {
    // session có thể đã hết hạn — reset uid và thử lại 1 lần
    uid = null;
    r = await send();
    if (r.error) throw new Error(`Odoo call failed: ${JSON.stringify(r.error)}`);
  }
  return r.result;
}

// ------------------------------------------------------------------
// Method nghiệp vụ điều phối
// ------------------------------------------------------------------

/** Đơn ĐÃ DUYỆT + CHƯA có tài xế (sẵn sàng điều phối). */
export function listPendingDispatch(limit = 50) {
  return call('sale.order', 'search_read', [[
    ['x_lt_is_quotation', '=', false],
    ['x_lt_status', '=', 'lt_approved'],
    '|',
    ['x_driver_name', '=', false],
    ['x_driver_name', '=', ''],
  ]], {
    fields: ['id', 'name', 'partner_id', 'partner_shipping_id',
             'amount_total', 'date_order'],
    limit,
  });
}

/** Lấy payload chi tiết đơn — cùng schema với webhook. */
export function getOrderDetail(orderId) {
  return call('sale.order', 'get_lt_dispatch_detail', [[orderId]], {});
}

/**
 * Lấy ghi chú dòng (line_note) trên các order lines.
 * Odoo cho phép chèn ghi chú giữa các sản phẩm (display_type = 'line_note').
 * @param {number[]} orderIds - danh sách order IDs
 * @returns {Promise<Object>} - map { orderId: "note1\nnote2" }
 */
export async function getOrderLineNotes(orderIds) {
  if (!orderIds || orderIds.length === 0) return {};
  const lines = await call('sale.order.line', 'search_read', [[
    ['order_id', 'in', orderIds],
    ['display_type', '=', 'line_note'],
  ]], { fields: ['order_id', 'name'] });

  const noteMap = {};
  for (const line of (lines || [])) {
    const oid = Array.isArray(line.order_id) ? line.order_id[0] : line.order_id;
    if (!noteMap[oid]) noteMap[oid] = [];
    if (line.name) noteMap[oid].push(line.name);
  }
  // Join multiple notes with newline
  for (const oid of Object.keys(noteMap)) {
    noteMap[oid] = noteMap[oid].join('\n');
  }
  return noteMap;
}

export function assignDriver(orderId, driverName, plate) {
  return call('sale.order', 'write',
    [[orderId], {
      x_driver_name: driverName,
      x_plate: plate,
      x_lt_driver_name: driverName,
      x_lt_plate: plate
    }], {});
}


export function startDelivery(orderId) {
  return call('sale.order', 'action_lt_start_delivery', [[orderId]], {});
}

export function completeDelivery(orderId) {
  return call('sale.order', 'action_lt_complete_delivery', [[orderId]], {});
}

// ---- Purchase Orders ----
/** Ghi tài xế + biển số đi lấy hàng từ NCC. */
export function assignPickupDriver(poId, driver, plate) {
  return call('purchase.order', 'write',
    [[poId], { x_lt_po_driver_name: driver, x_lt_po_plate: plate }], {});
}

/** Đánh dấu đã nhận đủ hàng từ NCC — Odoo sẽ fire `po.received` ngược lại. */
export function markPurchaseReceived(poId) {
  return call('purchase.order', 'action_lt_po_mark_received', [[poId]], {});
}

/** Pull chi tiết 1 PO (cùng schema với webhook). */
export function getPurchaseOrderDetail(poId) {
  return call('purchase.order', 'get_lt_po_dispatch_detail', [[poId]], {});
}

// ------------------------------------------------------------------
// Bulk read — bootstrap & incremental sync
// ------------------------------------------------------------------

// --- Partners ---
export async function countPartners() {
  return call('res.partner', 'search_count', [[]], {});
}

export function listPartners(offset, limit) {
  return call('res.partner', 'search_read', [[]], {
    fields: PARTNER_FIELDS, offset, limit, order: 'id ASC',
  });
}

export function listPartnersSince(isoDateUtc, offset, limit) {
  return call('res.partner', 'search_read',
    [[['write_date', '>=', isoDateUtc]]], {
      fields: PARTNER_FIELDS, offset, limit, order: 'write_date ASC',
    });
}

// --- Products ---
export async function countProducts() {
  return call('product.product', 'search_count', [[]], {});
}

export function listProducts(offset, limit) {
  return call('product.product', 'search_read', [[]], {
    fields: PRODUCT_FIELDS, offset, limit, order: 'id ASC',
  });
}

export function listProductsSince(isoDateUtc, offset, limit) {
  return call('product.product', 'search_read',
    [[['write_date', '>=', isoDateUtc]]], {
      fields: PRODUCT_FIELDS, offset, limit, order: 'write_date ASC',
    });
}

// --- Sale Orders (chỉ Đơn hàng, bỏ Báo giá) ---
export async function countOrders() {
  return call('sale.order', 'search_count',
    [[['x_lt_is_quotation', '=', false]]], {});
}

export function listOrders(offset, limit) {
  return call('sale.order', 'search_read',
    [[['x_lt_is_quotation', '=', false]]], {
      fields: ORDER_FIELDS, offset, limit, order: 'id ASC',
    });
}

export function listOrdersSince(isoDateUtc, offset, limit) {
  return call('sale.order', 'search_read', [[
    ['x_lt_is_quotation', '=', false],
    ['write_date', '>=', isoDateUtc],
  ]], {
    fields: ORDER_FIELDS, offset, limit, order: 'write_date ASC',
  });
}

// --- Purchase Orders (chỉ confirmed: state='purchase' hoặc 'done') ---
const PO_DOMAIN = [['state', 'in', ['purchase', 'done']]];

export async function countPurchaseOrders() {
  return call('purchase.order', 'search_count', [PO_DOMAIN], {});
}

export function listPurchaseOrders(offset, limit) {
  return call('purchase.order', 'search_read', [PO_DOMAIN], {
    fields: PO_FIELDS, offset, limit, order: 'id ASC',
  });
}

export function listPurchaseOrdersSince(isoDateUtc, offset, limit) {
  return call('purchase.order', 'search_read', [[
    ['state', 'in', ['purchase', 'done']],
    ['write_date', '>=', isoDateUtc],
  ]], {
    fields: PO_FIELDS, offset, limit, order: 'write_date ASC',
  });
}
