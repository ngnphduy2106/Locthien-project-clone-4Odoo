-- Create order_messages table for per-order chat
CREATE TABLE IF NOT EXISTS order_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('ADMIN', 'DRIVER', 'SALES', 'TESTER')),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by order
CREATE INDEX IF NOT EXISTS idx_order_messages_order_id ON order_messages(order_id);

-- Index for sorting by time
CREATE INDEX IF NOT EXISTS idx_order_messages_created_at ON order_messages(created_at);

-- Enable RLS
ALTER TABLE order_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated operations (we handle auth at API level)
CREATE POLICY "Allow all operations" ON order_messages FOR ALL USING (true);
