-- Migration: Additional Indexes
-- Description: Performance optimization indexes

-- Composite indexes for common queries

-- Find available recognitions for validation
CREATE INDEX idx_validation_available ON validation_work_log(recognition_id, validation_type, status)
  WHERE status IN ('in_progress', 'completed');

-- Get all items for recognition (initial or current)
CREATE INDEX idx_initial_items_lookup ON initial_tray_items(recognition_id, item_type);
CREATE INDEX idx_current_items_lookup ON current_tray_items(recognition_id, item_type) WHERE is_deleted = FALSE;

-- Get all annotations for images
CREATE INDEX idx_initial_annotations_lookup ON initial_annotations(image_id, initial_tray_item_id);
CREATE INDEX idx_annotations_lookup ON annotations(image_id) WHERE is_deleted = FALSE;

-- Recipe lookups
CREATE INDEX idx_recipe_lines_lookup ON recipe_lines(recipe_id, line_number);
CREATE INDEX idx_recipe_options_selected ON recipe_line_options(recipe_line_id, is_selected);













