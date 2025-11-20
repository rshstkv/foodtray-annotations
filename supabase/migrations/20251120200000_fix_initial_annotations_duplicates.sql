-- Migration: Fix duplicate initial_annotations
-- Description: Add UNIQUE constraint to prevent duplicate annotations

-- ============================================================
-- STEP 0: Clean up work_annotations that reference duplicates
-- ============================================================

-- First, delete work_annotations that reference duplicate initial_annotations
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY image_id, initial_tray_item_id, bbox
      ORDER BY id
    ) as rn
  FROM initial_annotations
)
DELETE FROM work_annotations
WHERE initial_annotation_id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- ============================================================
-- STEP 1: Clean up existing duplicates
-- ============================================================

-- Now delete duplicate annotations (safe now)
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY image_id, initial_tray_item_id, bbox
      ORDER BY id
    ) as rn
  FROM initial_annotations
)
DELETE FROM initial_annotations
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- ============================================================
-- STEP 2: Add UNIQUE constraint
-- ============================================================

-- This prevents duplicate annotations for the same item/image/bbox combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_initial_annotations_unique
  ON initial_annotations(image_id, initial_tray_item_id, bbox);

COMMENT ON INDEX idx_initial_annotations_unique IS 
  'Prevents duplicate initial_annotations for the same image_id, initial_tray_item_id, and bbox combination';

