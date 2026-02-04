-- Add completed_at column to order_driver_assignments if not exists
-- This column is needed for tracking when each driver assignment was completed

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_driver_assignments' 
        AND column_name = 'completed_at'
    ) THEN
        ALTER TABLE order_driver_assignments ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;
END $$;
