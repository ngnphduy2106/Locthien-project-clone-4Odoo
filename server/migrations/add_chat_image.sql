-- Add image column to order_messages for chat images
ALTER TABLE order_messages ADD COLUMN IF NOT EXISTS image TEXT;
