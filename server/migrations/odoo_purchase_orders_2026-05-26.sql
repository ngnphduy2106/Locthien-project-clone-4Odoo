-- ============================================================
-- Odoo Purchase Orders cache — đẩy từ webhook po.ready_for_pickup / po.received
-- ============================================================

CREATE TABLE IF NOT EXISTS odoo_purchase_orders (
    odoo_id              int           PRIMARY KEY,
    name                 text          UNIQUE,        -- mã PO vd P00123
    supplier_id          int,
    supplier_name        text,
    supplier_phone       text,
    amount_untaxed       numeric,
    amount_tax           numeric,
    amount_total         numeric,
    currency             text,
    date_order           timestamptz,
    date_planned         timestamptz,
    x_lt_po_status       text,          -- lt_approved / lt_receiving / lt_received / lt_billed / lt_closed / lt_cancelled
    x_lt_po_driver_name  text,
    x_lt_po_plate        text,
    note                 text,
    -- payload đầy đủ (lines + supplier) đẩy nguyên từ webhook
    detail               jsonb,
    write_date           timestamptz,
    synced_at            timestamptz   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_odoo_po_status   ON odoo_purchase_orders(x_lt_po_status);
CREATE INDEX IF NOT EXISTS idx_odoo_po_driver   ON odoo_purchase_orders(x_lt_po_driver_name);
CREATE INDEX IF NOT EXISTS idx_odoo_po_supplier ON odoo_purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_odoo_po_write    ON odoo_purchase_orders(write_date);
