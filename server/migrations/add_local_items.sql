-- Migration: Add local_items column to orders table
-- Purpose: Store extra items (vỏ can, phuy, tank) that only save to DB, not sync to MISA CRM

-- Add to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS local_items JSONB DEFAULT '[]';

-- Add to import_tickets table (for import orders)
ALTER TABLE import_tickets ADD COLUMN IF NOT EXISTS local_items JSONB DEFAULT '[]';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_orders_local_items ON orders USING GIN (local_items);
CREATE INDEX IF NOT EXISTS idx_import_tickets_local_items ON import_tickets USING GIN (local_items);

-- Comment for documentation
COMMENT ON COLUMN orders.local_items IS 'Extra items (vỏ can, phuy, tank) stored locally only, NOT synced to MISA CRM';
COMMENT ON COLUMN import_tickets.local_items IS 'Extra items for import tickets stored locally only';
