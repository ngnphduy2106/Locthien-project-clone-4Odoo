-- Order Status Audit Log
-- Tracks ALL status changes for debugging unexpected status modifications
CREATE TABLE IF NOT EXISTS order_status_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id text NOT NULL,
    old_status text,
    new_status text,
    changed_by text DEFAULT 'SYSTEM',
    reason text,
    created_at timestamptz DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_status_log_order ON order_status_log(order_id);
CREATE INDEX IF NOT EXISTS idx_status_log_time ON order_status_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_log_changed_by ON order_status_log(changed_by);
