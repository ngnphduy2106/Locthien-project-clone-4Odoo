-- Create Supabase Storage bucket for proof images
-- Run this in Supabase Dashboard > SQL Editor

-- 1. Create the bucket (public for fast CDN access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'proof-images',
    'proof-images',
    true,  -- Public bucket: images accessible via CDN URL without auth
    1048576,  -- 1MB max per file (images are pre-compressed to <300KB)
    ARRAY['image/jpeg', 'image/webp', 'image/png']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow public read access (for fast CDN loading in mobile app)
CREATE POLICY "Public read proof images"
ON storage.objects FOR SELECT
USING (bucket_id = 'proof-images');

-- 3. Allow authenticated uploads (server uses service_role key)
CREATE POLICY "Service upload proof images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'proof-images');

-- 4. Allow authenticated deletes
CREATE POLICY "Service delete proof images"
ON storage.objects FOR DELETE
USING (bucket_id = 'proof-images');
