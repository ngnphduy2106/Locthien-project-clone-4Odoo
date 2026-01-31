-- Migration: Add images column to import_tickets table
-- Same structure as export_tickets for consistency

ALTER TABLE import_tickets ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';

-- Comment for documentation
COMMENT ON COLUMN import_tickets.images IS 'Array of base64-encoded proof images for import ticket';
