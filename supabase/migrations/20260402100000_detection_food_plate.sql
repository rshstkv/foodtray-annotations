-- Food-Plate Detection: new isolated task model for YOLO bbox validation
-- Two tables, no dependency on existing validation system

CREATE TABLE public.detection_tasks (
  id BIGSERIAL PRIMARY KEY,
  bucket_name TEXT NOT NULL,
  images_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.detection_image_tasks (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES public.detection_tasks(id) ON DELETE CASCADE,
  image_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  image_width INTEGER,
  image_height INTEGER,
  original_annotations JSONB NOT NULL DEFAULT '[]'::jsonb,
  edited_annotations JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  is_modified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_detection_image_tasks_task_id ON public.detection_image_tasks(task_id);
CREATE INDEX idx_detection_image_tasks_task_status ON public.detection_image_tasks(task_id, status);

-- Storage bucket for detection images (created via SQL for reproducibility)
INSERT INTO storage.buckets (id, name, public)
VALUES ('detection-images', 'detection-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to detection-images bucket
CREATE POLICY "detection_images_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'detection-images');

-- Allow authenticated users to upload to detection-images bucket
CREATE POLICY "detection_images_auth_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'detection-images');
