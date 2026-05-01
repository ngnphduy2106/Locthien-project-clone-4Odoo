-- Add assigned_products column to store custom product allocation per assignment
-- This allows split orders to have different product quantities for each driver

-- Add the column
ALTER TABLE order_driver_assignments 
ADD COLUMN IF NOT EXISTS assigned_products JSONB;

-- Example assigned_products format:
-- [
--   { "code": "HCL32", "name": "HCL 32%", "qty": 500, "unit": "kg" },
--   { "code": "POLY", "name": "POLYMER ANION", "qty": 200, "unit": "kg" }
-- ]

COMMENT ON COLUMN order_driver_assignments.assigned_products IS 'JSON array of products with quantities assigned to this driver';
