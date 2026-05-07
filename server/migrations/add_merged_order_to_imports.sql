-- Migration: Add merged_order_no and description columns to import_tickets
-- Required for enriching import tickets with merged order data in pending-confirm endpoint

-- Add columns if they don't exist
ALTER TABLE import_tickets ADD COLUMN IF NOT EXISTS merged_order_no TEXT;
ALTER TABLE import_tickets ADD COLUMN IF NOT EXISTS description TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_import_tickets_merged_order_no ON import_tickets(merged_order_no);

-- Verify columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'import_tickets'
ORDER BY ordinal_position;
