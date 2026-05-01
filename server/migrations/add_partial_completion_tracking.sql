-- Migration: Add partial completion tracking to driver assignments
-- Date: 2026-02-03

-- 1. Add columns to order_driver_assignments for tracking partial completion
ALTER TABLE order_driver_assignments 
ADD COLUMN IF NOT EXISTS actual_qty NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS local_items JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS delivery_note TEXT,
ADD COLUMN IF NOT EXISTS proof_images JSONB DEFAULT '[]';

-- 2. Create import_driver_assignments table for import tickets
CREATE TABLE IF NOT EXISTS import_driver_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id UUID NOT NULL,
    driver_name TEXT NOT NULL,
    driver_type TEXT DEFAULT 'internal' CHECK (driver_type IN ('internal', 'external')),
    plate TEXT,
    assigned_qty NUMERIC NOT NULL DEFAULT 0,
    actual_qty NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivering', 'completed')),
    local_items JSONB DEFAULT '[]',
    delivery_note TEXT,
    proof_images JSONB DEFAULT '[]',
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes for import_driver_assignments
CREATE INDEX IF NOT EXISTS idx_import_driver_assignments_import_id ON import_driver_assignments(import_id);
CREATE INDEX IF NOT EXISTS idx_import_driver_assignments_driver_name ON import_driver_assignments(driver_name);
CREATE INDEX IF NOT EXISTS idx_import_driver_assignments_status ON import_driver_assignments(status);
