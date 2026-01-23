-- Create order_driver_assignments table for multi-driver support
CREATE TABLE IF NOT EXISTS order_driver_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    driver_name TEXT NOT NULL,
    driver_type TEXT DEFAULT 'internal' CHECK (driver_type IN ('internal', 'external')),
    plate TEXT,
    assigned_qty NUMERIC NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivering', 'completed')),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_order_driver_assignments_order_id ON order_driver_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_driver_assignments_driver_name ON order_driver_assignments(driver_name);
