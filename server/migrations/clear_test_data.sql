-- ==============================================
-- CLEAR ALL TEST DATA FOR PRODUCTION DEPLOYMENT
-- Run Date: 2026-02-05
-- WARNING: This will DELETE all order and import data!
-- ==============================================

-- 1. Clear order messages (chat)
DELETE FROM order_messages;

-- 2. Clear order driver assignments
DELETE FROM order_driver_assignments;

-- 3. Clear export tickets (proof images)
DELETE FROM export_tickets;

-- 4. Clear import driver assignments
DELETE FROM import_driver_assignments;

-- 5. Clear import tickets
DELETE FROM import_tickets;

-- 6. Clear notifications
DELETE FROM notifications;

-- 7. Clear orders (main table - last because of foreign keys)
DELETE FROM orders;

-- Reset sequences if needed (optional)
-- ALTER SEQUENCE orders_id_seq RESTART WITH 1;
-- ALTER SEQUENCE import_tickets_id_seq RESTART WITH 1;

-- Verify counts
SELECT 'orders' as table_name, COUNT(*) as count FROM orders
UNION ALL
SELECT 'import_tickets', COUNT(*) FROM import_tickets
UNION ALL
SELECT 'order_driver_assignments', COUNT(*) FROM order_driver_assignments
UNION ALL
SELECT 'import_driver_assignments', COUNT(*) FROM import_driver_assignments
UNION ALL
SELECT 'order_messages', COUNT(*) FROM order_messages
UNION ALL
SELECT 'export_tickets', COUNT(*) FROM export_tickets
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications;
