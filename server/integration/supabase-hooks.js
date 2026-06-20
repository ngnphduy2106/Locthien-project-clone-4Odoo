// ============================================================
// Supabase adapter — chuyển row Odoo (search_read) thành upsert
// vào 3 bảng odoo_partners / odoo_products / odoo_orders.
// Cũng cung cấp getLastSyncDate / saveLastSyncDate qua odoo_sync_state.
// ============================================================

import { createClient } from '@supabase/supabase-js';

// Dùng service_role key để bypass RLS cho các bảng odoo_*
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

/**
 * Odoo trả relational field dưới dạng `[id, "display_name"]` hoặc `false`.
 * Helper tách 2 phần.
 */
function rel(v) {
  if (Array.isArray(v) && v.length >= 2) return { id: v[0], name: v[1] };
  return { id: null, name: null };
}

function bool(v)   { return v === true || v === 1 || v === '1'; }
function num(v)    { return v === false || v == null ? null : Number(v); }
function str(v)    { return v === false || v == null ? null : String(v); }
function ts(v)     { return v === false || v == null || v === '' ? null : v; }

/**
 * @param {object} p — row partner từ Odoo search_read
 */
export async function upsertPartner(p) {
  const row = {
    odoo_id:         p.id,
    display_name:    str(p.display_name),
    name:            str(p.name),
    vat:             str(p.vat),
    phone:           str(p.phone),
    email:           str(p.email),
    street:          str(p.street),
    street2:         str(p.street2),
    city:            str(p.city),
    is_company:      bool(p.is_company),
    customer_rank:   num(p.customer_rank),
    supplier_rank:   num(p.supplier_rank),
    x_lt_rank:       str(p.x_lt_rank),
    x_is_locked:     bool(p.x_is_locked),
    x_locked_reason: str(p.x_locked_reason),

    write_date:      ts(p.write_date),
    synced_at:       new Date().toISOString(),
  };
  const { error } = await supabase
    .from('odoo_partners')
    .upsert(row, { onConflict: 'odoo_id' });
  if (error) throw new Error(`upsertPartner(${p.id}): ${error.message}`);
}

export async function upsertProduct(p) {
  const uom   = rel(p.uom_id);
  const categ = rel(p.categ_id);
  const row = {
    odoo_id:        p.id,
    display_name:   str(p.display_name),
    name:           str(p.name),
    default_code:   str(p.default_code),
    barcode:        str(p.barcode),
    list_price:     num(p.list_price),
    standard_price: num(p.standard_price),
    uom_id:         uom.id,
    uom_name:       uom.name,
    categ_id:       categ.id,
    categ_name:     categ.name,
    type:           str(p.type),
    is_storable:    bool(p.is_storable),
    sale_ok:        bool(p.sale_ok),
    purchase_ok:    bool(p.purchase_ok),
    write_date:     ts(p.write_date),
    synced_at:      new Date().toISOString(),
  };
  const { error } = await supabase
    .from('odoo_products')
    .upsert(row, { onConflict: 'odoo_id' });
  if (error) throw new Error(`upsertProduct(${p.id}): ${error.message}`);
}

export async function upsertOrder(o) {
  const partner  = rel(o.partner_id);
  const shipping = rel(o.partner_shipping_id);

  // 1. Lấy detail cũ từ DB để merge (tránh ghi đè làm mất lines sản phẩm đã lưu)
  let existingDetail = null;
  try {
    const { data } = await supabase
      .from('odoo_orders')
      .select('detail')
      .eq('odoo_id', o.id)
      .maybeSingle();
    if (data) existingDetail = data.detail;
  } catch (err) {
    console.warn(`[sync] Lấy detail cũ cho đơn ${o.id} thất bại:`, err.message);
  }

  // 2. Tạo detail mới bằng cách merge thông tin tài xế/phụ xe từ Odoo
  const mergedDetail = {
    ...(existingDetail || {}),
    x_driver_name: o.x_driver_name !== undefined ? o.x_driver_name : (existingDetail?.x_driver_name || null),
    x_plate: o.x_plate !== undefined ? o.x_plate : (existingDetail?.x_plate || null),
    x_assistant_name: o.x_assistant_name !== undefined ? o.x_assistant_name : (existingDetail?.x_assistant_name || null),
    x_lt_driver_name: o.x_lt_driver_name !== undefined ? o.x_lt_driver_name : (existingDetail?.x_lt_driver_name || null),
    x_lt_plate: o.x_lt_plate !== undefined ? o.x_lt_plate : (existingDetail?.x_lt_plate || null),
  };

  if (o.lines) {
    mergedDetail.lines = o.lines;
  }

  const row = {
    odoo_id:               o.id,
    name:                  str(o.name),
    partner_id:            partner.id,
    partner_name:          partner.name,
    partner_shipping_id:   shipping.id,
    partner_shipping_name: shipping.name,
    amount_untaxed:        num(o.amount_untaxed),
    amount_tax:            num(o.amount_tax),
    amount_total:          num(o.amount_total),
    date_order:            ts(o.date_order),
    commitment_date:       ts(o.commitment_date),
    state:                 str(o.state),
    x_lt_status:           str(o.x_lt_status),
    x_lt_is_quotation:     bool(o.x_lt_is_quotation),
    // Ghi đè thông tin tài xế/biển số xe từ Odoo (x_driver_name, x_plate) vào cột database tương ứng
    x_lt_driver_name:      str(o.x_driver_name || o.x_lt_driver_name),
    x_lt_plate:            str(o.x_plate || o.x_lt_plate),
    x_phi_phu_thu:         num(o.x_phi_phu_thu),
    x_lt_shipping_address: str(o.x_lt_shipping_address),
    note:                  str(o.note),
    detail:                mergedDetail,
    write_date:            ts(o.write_date),
    synced_at:             new Date().toISOString(),
  };

  const { error } = await supabase
    .from('odoo_orders')
    .upsert(row, { onConflict: 'odoo_id' });
  if (error) throw new Error(`upsertOrder(${o.id}): ${error.message}`);
}

/**
 * Webhook gửi payload đầy đủ (có lines/shipping/partner) — upsert kèm detail.
 * Schema khớp OdooWebhookPayload.
 */
export async function upsertOrderFromWebhook(p) {
  // Lấy detail cũ để merge nếu cần bảo lưu thông tin cũ
  let existingDetail = null;
  try {
    const { data } = await supabase
      .from('odoo_orders')
      .select('detail')
      .eq('odoo_id', p.order_id)
      .maybeSingle();
    if (data) existingDetail = data.detail;
  } catch (err) {}

  const mergedDetail = {
    ...(existingDetail || {}),
    ...p,
    x_driver_name: p.x_driver_name !== undefined ? p.x_driver_name : (existingDetail?.x_driver_name || p.x_lt_driver_name),
    x_plate: p.x_plate !== undefined ? p.x_plate : (existingDetail?.x_plate || p.x_lt_plate),
    x_assistant_name: p.x_assistant_name !== undefined ? p.x_assistant_name : (existingDetail?.x_assistant_name || null),
  };

  const row = {
    odoo_id:               p.order_id,
    name:                  p.order_name,
    partner_id:            p.partner?.id ?? null,
    partner_name:          p.partner?.name ?? null,
    partner_shipping_id:   p.shipping?.id ?? null,
    partner_shipping_name: p.shipping?.name ?? null,
    amount_untaxed:        num(p.amount_untaxed),
    amount_tax:            num(p.amount_tax),
    amount_total:          num(p.amount_total),
    date_order:            ts(p.date_order),
    commitment_date:       ts(p.commitment_date),
    state:                 null,           // webhook không trả state Odoo native
    x_lt_status:           str(p.x_lt_status),
    x_lt_is_quotation:     bool(p.is_quotation),
    x_lt_driver_name:      str(p.x_driver_name || p.x_lt_driver_name),
    x_lt_plate:            str(p.x_plate || p.x_lt_plate),
    x_phi_phu_thu:         num(p.x_phi_phu_thu),
    x_lt_shipping_address: str(p.x_lt_shipping_address || p.shipping?.address),
    note:                  str(p.note),
    detail:                mergedDetail,
    write_date:            ts(p.timestamp),
    synced_at:             new Date().toISOString(),
  };
  const { error } = await supabase
    .from('odoo_orders')
    .upsert(row, { onConflict: 'odoo_id' });
  if (error) throw new Error(`upsertOrderFromWebhook(${p.order_id}): ${error.message}`);
}

/**
 * Cron incremental sync: PO từ search_read (flat — không có lines/supplier nested).
 * Upsert vào odoo_purchase_orders. KHÔNG ghi đè `detail` JSONB (webhook đã ghi
 * detail đầy đủ; cron chỉ refresh các field flat khi webhook bị miss).
 */
export async function upsertPurchaseOrder(po) {
  const partner = rel(po.partner_id);
  // picking_type_id của Odoo trả về [id, "Kho LT1: Phiếu nhập kho"] dạng tuple.
  // Tách warehouse_id qua relation picking_type_id.warehouse_id — không có trong
  // search_read flat. Plan B: parse string "Kho LT1" từ display_name.
  const pt = rel(po.picking_type_id);
  const warehouseName = pt.name ? pt.name.split(':')[0].trim() : '';
  const row = {
    odoo_id:              po.id,
    name:                 str(po.name),
    supplier_id:          partner.id,
    supplier_name:        partner.name,
    amount_untaxed:       num(po.amount_untaxed),
    amount_tax:           num(po.amount_tax),
    amount_total:         num(po.amount_total),
    currency:             rel(po.currency_id).name,
    date_order:           ts(po.date_order),
    date_planned:         ts(po.date_planned),
    x_lt_po_status:       str(po.x_lt_po_status),
    x_lt_po_driver_name:  str(po.x_lt_po_driver_name),
    x_lt_po_plate:        str(po.x_lt_po_plate),
    warehouse_name:       warehouseName || null,
    // warehouse_id chỉ lấy được qua webhook (cron không có) — null nếu chỉ sync
    note:                 str(po.note),
    write_date:           ts(po.write_date),
    synced_at:            new Date().toISOString(),
    // KHÔNG set `detail` — giữ JSONB cũ từ webhook (nếu có)
  };
  const { error } = await supabase
    .from('odoo_purchase_orders')
    .upsert(row, { onConflict: 'odoo_id' });
  if (error) throw new Error(`upsertPurchaseOrder(${po.id}): ${error.message}`);
}

/**
 * Webhook PO gửi payload từ Odoo locthien_purchase_workflow.
 * Schema khớp _lt_po_build_dispatch_payload trong purchase_order.py.
 */
export async function upsertPurchaseOrderFromWebhook(p) {
  const s = p.supplier || {};
  const row = {
    odoo_id:              p.po_id,
    name:                 p.po_name,
    supplier_id:          s.id ?? null,
    supplier_name:        s.name ?? null,
    supplier_phone:       s.phone || s.mobile || null,
    amount_untaxed:       num(p.amount_untaxed),
    amount_tax:           num(p.amount_tax),
    amount_total:         num(p.amount_total),
    currency:             str(p.currency),
    date_order:           ts(p.date_order),
    date_planned:         ts(p.date_planned),
    x_lt_po_status:       str(p.x_lt_po_status),
    x_lt_po_driver_name:  str(p.x_lt_po_driver_name),
    x_lt_po_plate:        str(p.x_lt_po_plate),
    warehouse_id:         p.warehouse_id ?? null,
    warehouse_name:       str(p.warehouse_name),
    note:                 str(p.note),
    detail:               p,
    write_date:           ts(p.timestamp),
    synced_at:            new Date().toISOString(),
  };
  const { error } = await supabase
    .from('odoo_purchase_orders')
    .upsert(row, { onConflict: 'odoo_id' });
  if (error) throw new Error(`upsertPurchaseOrderFromWebhook(${p.po_id}): ${error.message}`);
}

// ---- Sync state ----------------------------------------------------

export async function getLastSyncDate() {
  const { data, error } = await supabase
    .from('odoo_sync_state')
    .select('value')
    .eq('key', 'last_sync')
    .maybeSingle();
  if (error) {
    console.error('[odoo] getLastSyncDate fail, dùng epoch:', error.message);
    return '1970-01-01 00:00:00';
  }
  return data?.value ?? '1970-01-01 00:00:00';
}

export async function saveLastSyncDate(iso) {
  // Monotonic: chỉ ghi nếu mốc mới TIẾN TỚI. Trên serverless 2 lần pull có thể
  // chạy chồng; nếu lần bắt đầu sớm kết thúc muộn, nó sẽ ghi đè cursor LÙI về
  // quá khứ → lần sau pull thừa (vô hại vì upsert idempotent, nhưng tốn công).
  // Format cursor "yyyy-MM-dd HH:mm:ss" cố định nên so sánh chuỗi = so sánh thời gian.
  const current = await getLastSyncDate();
  if (current && String(iso) <= String(current)) {
    return; // không lùi cursor
  }
  const { error } = await supabase
    .from('odoo_sync_state')
    .upsert({ key: 'last_sync', value: iso, updated_at: new Date().toISOString() },
            { onConflict: 'key' });
  if (error) console.error('[odoo] saveLastSyncDate fail:', error.message);
}

/** Tập hợp hook truyền vào createSyncService(). */
export const supabaseHooks = {
  onPartner:       upsertPartner,
  onProduct:       upsertProduct,
  onOrder:         upsertOrder,
  onPurchaseOrder: upsertPurchaseOrder,
  getLastSyncDate,
  saveLastSyncDate,
};
