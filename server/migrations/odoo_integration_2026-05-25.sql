-- ============================================================
-- Odoo integration — bảng cache đổ từ Odoo qua webhook + sync
-- Chạy 1 lần trong Supabase SQL editor.
-- Tách riêng khỏi tables MISA cũ (customers/materials/orders).
-- ============================================================

-- 1. PARTNERS (khách + nhà cung cấp) -------------------------------
CREATE TABLE IF NOT EXISTS odoo_partners (
    odoo_id          int          PRIMARY KEY,
    display_name     text,
    name             text,
    vat              text,
    phone            text,
    email            text,
    street           text,
    street2          text,
    city             text,
    is_company       boolean,
    customer_rank    int,
    supplier_rank    int,
    -- LT custom
    x_lt_rank        text,
    x_is_locked      boolean,
    x_locked_reason  text,
    credit_limit     numeric,
    -- meta
    write_date       timestamptz,
    synced_at        timestamptz  DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_odoo_partners_write_date ON odoo_partners(write_date);

-- 2. PRODUCTS -----------------------------------------------------
CREATE TABLE IF NOT EXISTS odoo_products (
    odoo_id          int          PRIMARY KEY,
    display_name     text,
    name             text,
    default_code     text,
    barcode          text,
    list_price       numeric,
    standard_price   numeric,
    uom_id           int,         -- chỉ giữ id, tên đã có trong display_name
    uom_name         text,
    categ_id         int,
    categ_name       text,
    type             text,
    is_storable      boolean,
    sale_ok          boolean,
    purchase_ok      boolean,
    write_date       timestamptz,
    synced_at        timestamptz  DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_odoo_products_write_date ON odoo_products(write_date);
CREATE INDEX IF NOT EXISTS idx_odoo_products_default_code ON odoo_products(default_code);

-- 3. ORDERS (Đơn hàng — bỏ Báo giá) -------------------------------
CREATE TABLE IF NOT EXISTS odoo_orders (
    odoo_id              int           PRIMARY KEY,
    name                 text          UNIQUE,        -- mã đơn vd SO0123
    partner_id           int,
    partner_name         text,
    partner_shipping_id  int,
    partner_shipping_name text,
    amount_untaxed       numeric,
    amount_tax           numeric,
    amount_total         numeric,
    date_order           timestamptz,
    commitment_date      timestamptz,
    state                text,          -- draft/sent/sale/done/cancel
    x_lt_status          text,          -- 9 trạng thái LT
    x_lt_is_quotation    boolean,
    x_lt_driver_name     text,
    x_lt_plate           text,
    x_phi_phu_thu        numeric,
    -- payload chi tiết (lines, shipping, partner) đẩy nguyên từ webhook
    detail               jsonb,
    write_date           timestamptz,
    synced_at            timestamptz   DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_odoo_orders_state   ON odoo_orders(x_lt_status);
CREATE INDEX IF NOT EXISTS idx_odoo_orders_driver  ON odoo_orders(x_lt_driver_name);
CREATE INDEX IF NOT EXISTS idx_odoo_orders_write   ON odoo_orders(write_date);
CREATE INDEX IF NOT EXISTS idx_odoo_orders_partner ON odoo_orders(partner_id);

-- 4. SYNC STATE — lưu lastSyncDate ---------------------------------
CREATE TABLE IF NOT EXISTS odoo_sync_state (
    key         text         PRIMARY KEY,
    value       text         NOT NULL,
    updated_at  timestamptz  DEFAULT now()
);

INSERT INTO odoo_sync_state(key, value)
VALUES ('last_sync', '1970-01-01 00:00:00')
ON CONFLICT (key) DO NOTHING;
