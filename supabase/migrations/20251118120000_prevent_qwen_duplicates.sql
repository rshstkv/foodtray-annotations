-- Migration: Prevent duplicate Qwen annotations and tray items
-- Description: Add UNIQUE constraints to prevent duplicates during repeated data loads

-- ============================================================
-- STEP 1: Clean up existing duplicates in raw.qwen_annotations
-- ============================================================

-- Keep only the first occurrence of each duplicate (by id)
DELETE FROM raw.qwen_annotations
WHERE id NOT IN (
  SELECT MIN(id)
  FROM raw.qwen_annotations
  GROUP BY recognition_id, image_path, class_name, bbox, item_type
);

-- ============================================================
-- STEP 2: Add UNIQUE constraint to raw.qwen_annotations
-- ============================================================

-- This prevents duplicate annotations from being inserted
CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_qwen_unique
  ON raw.qwen_annotations(recognition_id, image_path, class_name, bbox);

-- ============================================================
-- STEP 3: Clean up duplicates in initial_tray_items
-- ============================================================

-- Delete duplicate initial_tray_items (keep first occurrence)
-- Must delete annotations first due to FK constraint
WITH duplicate_items AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY recognition_id, item_type, source, 
                   COALESCE(metadata->>'qwen_label', 'no_label'),
                   COALESCE(recipe_line_option_id, -1),
                   COALESCE(menu_item_external_id, 'no_menu')
      ORDER BY id
    ) as rn
  FROM initial_tray_items
)
DELETE FROM initial_annotations
WHERE initial_tray_item_id IN (
  SELECT id FROM duplicate_items WHERE rn > 1
);

-- Now delete duplicate items
WITH duplicate_items AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY recognition_id, item_type, source, 
                   COALESCE(metadata->>'qwen_label', 'no_label'),
                   COALESCE(recipe_line_option_id, -1),
                   COALESCE(menu_item_external_id, 'no_menu')
      ORDER BY id
    ) as rn
  FROM initial_tray_items
)
DELETE FROM initial_tray_items
WHERE id IN (
  SELECT id FROM duplicate_items WHERE rn > 1
);

-- ============================================================
-- STEP 4: Add UNIQUE constraint to initial_tray_items
-- ============================================================

-- For items from recipes (FOOD)
CREATE UNIQUE INDEX IF NOT EXISTS idx_initial_tray_items_recipe_unique
  ON initial_tray_items(recognition_id, recipe_line_option_id, (metadata->>'qwen_label'))
  WHERE source = 'RECIPE_LINE_OPTION' AND recipe_line_option_id IS NOT NULL;

-- For items from models (PLATE, etc)
CREATE UNIQUE INDEX IF NOT EXISTS idx_initial_tray_items_model_unique
  ON initial_tray_items(recognition_id, item_type, (metadata->>'qwen_label'))
  WHERE source = 'MODEL';

-- ============================================================
-- STEP 5: Update database.py to use proper conflict handling
-- ============================================================

-- The Python code should use:
-- INSERT ... ON CONFLICT DO NOTHING
-- which will now work correctly with these UNIQUE constraints

