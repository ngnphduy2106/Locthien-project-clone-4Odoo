-- Migration: Create/Update materials table for MISA product sync
-- Run this in Supabase SQL Editor

-- Create materials table if not exists
CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    unit TEXT DEFAULT '',
    price NUMERIC DEFAULT 0,
    sale_price NUMERIC DEFAULT 0,
    category TEXT DEFAULT 'MISA CRM',
    type TEXT DEFAULT 'MisaProduct',
    status TEXT DEFAULT 'ACTIVE',
    description TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns if table already exists
DO $$ 
BEGIN
    -- Add code column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'materials' AND column_name = 'code') THEN
        ALTER TABLE materials ADD COLUMN code TEXT;
    END IF;
    
    -- Add unit column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'materials' AND column_name = 'unit') THEN
        ALTER TABLE materials ADD COLUMN unit TEXT DEFAULT '';
    END IF;
    
    -- Add price column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'materials' AND column_name = 'price') THEN
        ALTER TABLE materials ADD COLUMN price NUMERIC DEFAULT 0;
    END IF;
    
    -- Add sale_price column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'materials' AND column_name = 'sale_price') THEN
        ALTER TABLE materials ADD COLUMN sale_price NUMERIC DEFAULT 0;
    END IF;
    
    -- Add category column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'materials' AND column_name = 'category') THEN
        ALTER TABLE materials ADD COLUMN category TEXT DEFAULT 'MISA CRM';
    END IF;
    
    -- Add type column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'materials' AND column_name = 'type') THEN
        ALTER TABLE materials ADD COLUMN type TEXT DEFAULT 'MisaProduct';
    END IF;
    
    -- Add status column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'materials' AND column_name = 'status') THEN
        ALTER TABLE materials ADD COLUMN status TEXT DEFAULT 'ACTIVE';
    END IF;
    
    -- Add description column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'materials' AND column_name = 'description') THEN
        ALTER TABLE materials ADD COLUMN description TEXT DEFAULT '';
    END IF;
END $$;

-- Enable Row Level Security (optional, disable for public access)
-- ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
-- CREATE POLICY "Allow public read" ON materials FOR SELECT USING (true);

-- Create policy for authenticated insert/update
-- CREATE POLICY "Allow authenticated insert" ON materials FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Allow authenticated update" ON materials FOR UPDATE USING (true);

-- Verify table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'materials' 
ORDER BY ordinal_position;
