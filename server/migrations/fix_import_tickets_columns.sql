-- Migration: Add missing columns to import_tickets table for driver assignment
-- Run this in Supabase SQL Editor

-- Add driver assignment columns
ALTER TABLE import_tickets ADD COLUMN IF NOT EXISTS assigned_driver TEXT;
ALTER TABLE import_tickets ADD COLUMN IF NOT EXISTS assigned_plate TEXT;
ALTER TABLE import_tickets ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE import_tickets ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Verify columns were added
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'import_tickets' 
ORDER BY ordinal_position;
