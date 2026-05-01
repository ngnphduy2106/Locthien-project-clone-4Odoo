-- Fix export_tickets schema: ensure created_by column exists
-- This handles the schema cache issue

DO $$
BEGIN
    -- Add created_by column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'export_tickets' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE export_tickets ADD COLUMN created_by TEXT;
    END IF;
    
    -- Add ticket_no column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'export_tickets' AND column_name = 'ticket_no'
    ) THEN
        ALTER TABLE export_tickets ADD COLUMN ticket_no TEXT;
    END IF;
    
    -- Add images column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'export_tickets' AND column_name = 'images'
    ) THEN
        ALTER TABLE export_tickets ADD COLUMN images TEXT[];
    END IF;
END $$;

-- Force schema cache refresh
NOTIFY pgrst, 'reload schema';
