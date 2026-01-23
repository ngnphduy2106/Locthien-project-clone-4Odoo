-- Add import_ticket_id column to support chat for import tickets
-- Run: add column if not exists
ALTER TABLE order_messages ADD COLUMN IF NOT EXISTS import_ticket_id UUID REFERENCES import_tickets(id);

-- Make order_id nullable (either order_id or import_ticket_id must be set)
ALTER TABLE order_messages ALTER COLUMN order_id DROP NOT NULL;

-- Add check constraint to ensure at least one ID is set
ALTER TABLE order_messages ADD CONSTRAINT chk_message_context 
    CHECK (order_id IS NOT NULL OR import_ticket_id IS NOT NULL);

-- Index for import ticket messages
CREATE INDEX IF NOT EXISTS idx_messages_import_ticket ON order_messages(import_ticket_id);
