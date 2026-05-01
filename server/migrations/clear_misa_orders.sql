-- ===============================================
-- CLEAR MISA ORDERS AND ASSIGNMENTS
-- Run this in Supabase SQL Editor
-- ===============================================

-- 1. Clear driver assignments first (foreign key constraint)
DELETE FROM order_driver_assignments;

-- 2. Clear all orders from MISA
DELETE FROM orders;

-- Verify
SELECT 'Orders cleared' as status, 
       (SELECT COUNT(*) FROM orders) as order_count,
       (SELECT COUNT(*) FROM order_driver_assignments) as assignment_count;
