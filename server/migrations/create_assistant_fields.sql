-- Migration: Add Assistant and Delivery Time Features
-- Adds `assistant_name` and `delivery_time` to existing tables

-- 1. Orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS assistant_name TEXT,
ADD COLUMN IF NOT EXISTS delivery_time TEXT;

-- 2. Merged Orders tracking table
ALTER TABLE merged_orders 
ADD COLUMN IF NOT EXISTS assistant_name TEXT,
ADD COLUMN IF NOT EXISTS delivery_time TEXT;

-- 3. Detailed Driver Assignments tracking
ALTER TABLE order_driver_assignments
ADD COLUMN IF NOT EXISTS assistant_name TEXT,
ADD COLUMN IF NOT EXISTS delivery_time TEXT;

-- For Misa Sync fields: Custom field 15 could be used for delivery time or assistant.
-- We stick to dedicated columns for cleaner frontend mapping, but they exist.
