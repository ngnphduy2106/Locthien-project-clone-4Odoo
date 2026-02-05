-- Add missing columns to order_messages table
-- Required for: import ticket chat, image support, read tracking

-- Add import_ticket_id for import ticket messages
ALTER TABLE order_messages ADD COLUMN IF NOT EXISTS import_ticket_id TEXT;

-- Add image column for image messages
ALTER TABLE order_messages ADD COLUMN IF NOT EXISTS image TEXT;

-- Add read_by array for tracking who has read the message
ALTER TABLE order_messages ADD COLUMN IF NOT EXISTS read_by TEXT[] DEFAULT '{}';

-- Make message column nullable (can be empty if there's an image)
ALTER TABLE order_messages ALTER COLUMN message DROP NOT NULL;

-- Add index for import_ticket_id lookups
CREATE INDEX IF NOT EXISTS idx_order_messages_import_ticket_id ON order_messages(import_ticket_id);
