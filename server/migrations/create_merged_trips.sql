-- Migration: Create tables for Merged PO Orders (Delivery Trips)

-- 1. Create merged_orders table to group multiple POs into a trip
CREATE TABLE IF NOT EXISTS merged_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merged_no TEXT UNIQUE NOT NULL,           -- e.g., "M240206001"
    source_order_nos TEXT[] NOT NULL,         -- Array of original sale_order_nos
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'delivering', 'completed')),
    driver_name TEXT,
    plate TEXT,
    total_amount NUMERIC DEFAULT 0,
    total_stops INT DEFAULT 0,
    note TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_merged_orders_no ON merged_orders(merged_no);
CREATE INDEX IF NOT EXISTS idx_merged_orders_status ON merged_orders(status);

-- 2. Create merged_order_checkins table to track status at each sub-order stop
CREATE TABLE IF NOT EXISTS merged_order_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merged_order_id UUID REFERENCES merged_orders(id) ON DELETE CASCADE,
    order_no TEXT NOT NULL,                   -- The sale_order_no of the specific stop
    checked_in_at TIMESTAMPTZ DEFAULT NOW(),
    latitude NUMERIC,
    longitude NUMERIC,
    proof_image_urls TEXT[],                  -- Array of image URLs
    actual_qty NUMERIC,
    note TEXT,
    created_by TEXT                           -- The driver's name
);

-- Ensure a checkin is unique per trip per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_merged_checkins_trip_order ON merged_order_checkins(merged_order_id, order_no);
CREATE INDEX IF NOT EXISTS idx_merged_checkins_order_no ON merged_order_checkins(order_no);

-- 3. Update orders table to link back to merged_orders
-- (Assuming merged_order_no column might not exist yet)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='orders' AND column_name='merged_order_no'
    ) THEN
        ALTER TABLE orders ADD COLUMN merged_order_no TEXT;
    END IF;
END $$;
