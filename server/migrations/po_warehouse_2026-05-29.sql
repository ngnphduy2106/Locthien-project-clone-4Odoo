-- Bổ sung warehouse info cho PO — ERP cần biết kho đích để dispatcher hướng dẫn tài xế.
-- Chạy idempotent — có thể chạy nhiều lần OK.

ALTER TABLE odoo_purchase_orders ADD COLUMN IF NOT EXISTS warehouse_id   int;
ALTER TABLE odoo_purchase_orders ADD COLUMN IF NOT EXISTS warehouse_name text;

CREATE INDEX IF NOT EXISTS idx_odoo_po_warehouse ON odoo_purchase_orders(warehouse_id);
