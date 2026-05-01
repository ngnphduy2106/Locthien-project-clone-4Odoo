-- ============================================
-- SEED COUNTERS: Count existing orders to set starting sequence
-- Run AFTER creating the table
-- ============================================

-- Count existing local exports (start with 'X') created in March 2026
-- These will now use E2603xxx format going forward
DO $$
DECLARE
    export_count INTEGER;
    import_count INTEGER;
BEGIN
    -- Count export orders starting with 'X' 
    SELECT COUNT(*) INTO export_count
    FROM orders
    WHERE sale_order_no LIKE 'X%' 
      AND created_date >= '2026-03-01';
    
    -- Count import tickets starting with 'N'
    SELECT COUNT(*) INTO import_count
    FROM import_tickets
    WHERE ticket_no LIKE 'N%'
      AND created_at >= '2026-03-01';

    -- Update counters to start AFTER existing orders
    UPDATE order_counters SET current_seq = export_count WHERE counter_key = 'E2603';
    UPDATE order_counters SET current_seq = import_count WHERE counter_key = 'N2603';
    
    RAISE NOTICE 'Seeded: E2603 = %, N2603 = %', export_count, import_count;
END $$;
