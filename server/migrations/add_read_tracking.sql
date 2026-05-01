-- Add read tracking to order_messages for unread badge counts
-- This tracks which user has read each message

-- Add read_by column (array of user IDs/names who have read the message)
ALTER TABLE order_messages ADD COLUMN IF NOT EXISTS read_by TEXT[] DEFAULT '{}';

-- Add index for efficient unread queries
CREATE INDEX IF NOT EXISTS idx_order_messages_read_by ON order_messages USING GIN(read_by);
