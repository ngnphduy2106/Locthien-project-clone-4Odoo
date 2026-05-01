-- Create export_tickets table for recording completed deliveries
CREATE TABLE IF NOT EXISTS export_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_no TEXT NOT NULL UNIQUE,
    order_id TEXT NOT NULL,
    order_no TEXT,
    customer_name TEXT,
    customer_address TEXT,
    driver_name TEXT NOT NULL,
    plate TEXT,
    warehouse TEXT DEFAULT 'LT1',
    products JSONB,
    total_qty NUMERIC DEFAULT 0,
    note TEXT,
    images TEXT[],
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_export_tickets_order_id ON export_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_export_tickets_created_at ON export_tickets(created_at);
