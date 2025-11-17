-- Migration: Storage Bucket
-- Description: Create and configure Supabase Storage bucket for images

-- Create rrs-photos bucket (public access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('rrs-photos', 'rrs-photos', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to images
CREATE POLICY "Public images are viewable by everyone."
  ON storage.objects FOR SELECT
  USING (bucket_id = 'rrs-photos');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload images."
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'rrs-photos' AND auth.role() = 'authenticated');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update images."
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'rrs-photos' AND auth.role() = 'authenticated');




