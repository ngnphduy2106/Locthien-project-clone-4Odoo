-- Create import_tickets table for manual import orders
CREATE TABLE IF NOT EXISTS import_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_no TEXT NOT NULL UNIQUE,
    supplier_name TEXT NOT NULL,
    supplier_address TEXT,
    products JSONB NOT NULL DEFAULT '[]',
    total_qty NUMERIC DEFAULT 0,
    expected_date DATE,
    warehouse TEXT DEFAULT 'LT1',
    note TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'completed', 'cancelled')),
    assigned_driver TEXT,
    assigned_plate TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_import_tickets_status ON import_tickets(status);
CREATE INDEX IF NOT EXISTS idx_import_tickets_created_at ON import_tickets(created_at);
