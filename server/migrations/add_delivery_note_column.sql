-- Add delivery_note column to orders table for driver notes on completion
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_note TEXT;

-- Index for filtering by delivery note
CREATE INDEX IF NOT EXISTS idx_orders_delivery_note ON orders(delivery_note) WHERE delivery_note IS NOT NULL;
