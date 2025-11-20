-- Migration: Add recipe_line_id to initial_tray_items
-- Description: Allow items to be linked directly to recipe_lines (for ambiguity cases where no option is selected yet)

-- Add recipe_line_id column to initial_tray_items
ALTER TABLE initial_tray_items 
ADD COLUMN IF NOT EXISTS recipe_line_id BIGINT;

-- Add foreign key constraint
ALTER TABLE initial_tray_items
ADD CONSTRAINT initial_tray_items_recipe_line_id_fkey 
FOREIGN KEY (recipe_line_id) REFERENCES recipe_lines(id) ON DELETE CASCADE;

-- Add index for recipe_line_id
CREATE INDEX IF NOT EXISTS idx_initial_tray_items_recipe_line 
ON initial_tray_items(recipe_line_id);

-- Add comment
COMMENT ON COLUMN initial_tray_items.recipe_line_id IS 
  'Direct link to recipe_line. Used when recipe_line_option_id is NULL (ambiguity not resolved yet)';

-- Note: work_items already has recipe_line_id column, no changes needed there

