-- Add unique constraint to prevent duplicate recognitions in raw layer
-- This prevents --force flag from creating duplicates

-- First, remove any existing duplicates (keep the earliest created_at for each recognition_id)
DELETE FROM raw.recognition_files
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (PARTITION BY recognition_id ORDER BY created_at ASC) as rn
    FROM raw.recognition_files
  ) t
  WHERE rn > 1
);

-- Add unique constraint
ALTER TABLE raw.recognition_files
ADD CONSTRAINT raw_recognition_files_recognition_id_unique 
UNIQUE (recognition_id);

-- Also add to recipes and qwen_annotations for consistency
-- Remove duplicates from raw.recipes
DELETE FROM raw.recipes
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (PARTITION BY recognition_id ORDER BY created_at ASC) as rn
    FROM raw.recipes
  ) t
  WHERE rn > 1
);

ALTER TABLE raw.recipes
ADD CONSTRAINT raw_recipes_recognition_id_unique 
UNIQUE (recognition_id);

-- qwen_annotations already has unique constraint on (recognition_id, image_path, class_name, bbox)
-- so it's protected

-- Add comment
COMMENT ON CONSTRAINT raw_recognition_files_recognition_id_unique ON raw.recognition_files 
IS 'Prevents duplicate recognitions when using --force flag';

