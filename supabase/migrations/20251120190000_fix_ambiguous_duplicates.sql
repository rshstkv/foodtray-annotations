-- Migration: Fix duplicate initial_tray_items for ambiguous dishes
-- Description: Add UNIQUE constraint for items where recipe_line_option_id IS NULL (ambiguous dishes)

-- ============================================================
-- STEP 0: Clean up work_annotations that reference duplicate items
-- ============================================================

-- First, delete work_annotations that reference duplicate initial_annotations
WITH duplicate_items AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY recognition_id, recipe_line_id, (metadata->>'qwen_label')
      ORDER BY id
    ) as rn
  FROM initial_tray_items
  WHERE source = 'RECIPE_LINE_OPTION' AND recipe_line_option_id IS NULL
),
duplicate_annotations AS (
  SELECT ia.id
  FROM initial_annotations ia
  WHERE ia.initial_tray_item_id IN (
    SELECT id FROM duplicate_items WHERE rn > 1
  )
)
DELETE FROM work_annotations
WHERE initial_annotation_id IN (SELECT id FROM duplicate_annotations);

-- ============================================================
-- STEP 1: Clean up existing duplicates in initial_annotations
-- ============================================================

-- Now delete annotations that belong to duplicate items (safe now)
WITH duplicate_items AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY recognition_id, recipe_line_id, (metadata->>'qwen_label')
      ORDER BY id
    ) as rn
  FROM initial_tray_items
  WHERE source = 'RECIPE_LINE_OPTION' AND recipe_line_option_id IS NULL
)
DELETE FROM initial_annotations
WHERE initial_tray_item_id IN (
  SELECT id FROM duplicate_items WHERE rn > 1
);

-- ============================================================
-- STEP 2: Clean up duplicate initial_tray_items
-- ============================================================

-- Delete duplicate items (keep first occurrence)
WITH duplicate_items AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY recognition_id, recipe_line_id, (metadata->>'qwen_label')
      ORDER BY id
    ) as rn
  FROM initial_tray_items
  WHERE source = 'RECIPE_LINE_OPTION' AND recipe_line_option_id IS NULL
)
DELETE FROM initial_tray_items
WHERE id IN (
  SELECT id FROM duplicate_items WHERE rn > 1
);

-- ============================================================
-- STEP 3: Add UNIQUE constraint for ambiguous dishes
-- ============================================================

-- This prevents duplicate items for ambiguous dishes (recipe_line_option_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_initial_tray_items_ambiguous_unique
  ON initial_tray_items(recognition_id, recipe_line_id, (metadata->>'qwen_label'))
  WHERE source = 'RECIPE_LINE_OPTION' AND recipe_line_option_id IS NULL;

COMMENT ON INDEX idx_initial_tray_items_ambiguous_unique IS 
  'Prevents duplicate initial_tray_items for ambiguous dishes where recipe_line_option_id is NULL';

