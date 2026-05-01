-- Add force_reload flag for remote cache reset
ALTER TABLE users ADD COLUMN IF NOT EXISTS force_reload boolean DEFAULT false;
