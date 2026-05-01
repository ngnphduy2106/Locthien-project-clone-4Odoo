-- Create notifications table for in-app notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,       -- target user (driver fullName or 'ADMIN' for all admins)
    type TEXT NOT NULL,          -- 'message', 'order_assigned', 'misa_new_order', 'order_completed'
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    order_id TEXT,               -- related order ID
    order_no TEXT,               -- e.g. PO4100136838.25
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
