-- ===============================================
-- COMPREHENSIVE SCHEMA FIX FOR ORDER DISPLAY
-- Run in Supabase SQL Editor to fix clone database
-- ===============================================

-- 1. Add missing columns to import_tickets
ALTER TABLE import_tickets ADD COLUMN IF NOT EXISTS merged_order_no TEXT;
ALTER TABLE import_tickets ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_import_tickets_merged_order_no ON import_tickets(merged_order_no);

-- 3. Verify import_tickets now has all required columns
DO $$
BEGIN
    RAISE NOTICE 'Checking import_tickets columns...';
END $$;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'import_tickets'
ORDER BY ordinal_position;

-- 4. Force PostgREST schema cache reload (prevents "column not found in schema cache" errors)
-- NOTE: This must be run AFTER all ALTER TABLE commands
NOTIFY pgrst, 'reload schema';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Schema fixes completed. merged_order_no and description columns added to import_tickets.';
END $$;
