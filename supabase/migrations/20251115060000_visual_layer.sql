-- Migration: Visual Layer
-- Description: Images and annotations (как объекты выглядят на фото)

-- Images (фотографии recognition)
CREATE TABLE public.images (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL REFERENCES recognitions(id) ON DELETE CASCADE,
  camera_number INTEGER NOT NULL CHECK (camera_number IN (1, 2)),
  storage_path TEXT NOT NULL, -- Path in Supabase Storage
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recognition_id, camera_number)
);

CREATE INDEX idx_images_recognition ON images(recognition_id);

-- Initial annotations (неизменяемые bbox от Qwen)
-- Always linked to initial_tray_items
CREATE TABLE public.initial_annotations (
  id BIGSERIAL PRIMARY KEY,
  image_id BIGINT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  initial_tray_item_id BIGINT NOT NULL REFERENCES initial_tray_items(id) ON DELETE CASCADE,
  bbox JSONB NOT NULL, -- {x, y, w, h}
  source TEXT DEFAULT 'MODEL', -- MODEL or HUMAN
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_initial_annotations_image ON initial_annotations(image_id);
CREATE INDEX idx_initial_annotations_item ON initial_annotations(initial_tray_item_id);

-- Current annotations (правленные bbox)
-- Linked to current_tray_items if they exist, otherwise to initial_tray_items
-- Only exists if user made changes
CREATE TABLE public.annotations (
  id BIGSERIAL PRIMARY KEY,
  image_id BIGINT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  
  -- Link to tray item (either current or initial)
  current_tray_item_id BIGINT REFERENCES current_tray_items(id) ON DELETE CASCADE,
  initial_tray_item_id BIGINT REFERENCES initial_tray_items(id) ON DELETE CASCADE,
  
  bbox JSONB NOT NULL, -- {x, y, w, h}
  is_deleted BOOLEAN DEFAULT FALSE, -- Soft delete
  
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: must link to either current OR initial tray item
  CONSTRAINT annotations_tray_item_check CHECK (
    (current_tray_item_id IS NOT NULL AND initial_tray_item_id IS NULL) OR
    (current_tray_item_id IS NULL AND initial_tray_item_id IS NOT NULL)
  )
);

CREATE INDEX idx_annotations_image ON annotations(image_id);
CREATE INDEX idx_annotations_current_item ON annotations(current_tray_item_id);
CREATE INDEX idx_annotations_initial_item ON annotations(initial_tray_item_id);


