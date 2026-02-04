-- Add actual_products column to order_driver_assignments table
-- This stores the actual delivered products & quantities when driver completes order

ALTER TABLE order_driver_assignments 
ADD COLUMN IF NOT EXISTS actual_products JSONB DEFAULT '[]'::jsonb;

-- Add comment
COMMENT ON COLUMN order_driver_assignments.actual_products IS 'Actual delivered products with real quantities from driver completion form';
