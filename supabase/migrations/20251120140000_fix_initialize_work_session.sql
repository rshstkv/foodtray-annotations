-- Migration: Fix initialize_work_session to handle recipe_line_id
-- Description: Copy recipe_line_id from initial_tray_items, handle ambiguity cases

CREATE OR REPLACE FUNCTION initialize_work_session()
RETURNS TRIGGER AS $$
BEGIN
  -- Copy initial_tray_items to work_items
  INSERT INTO work_items (
    work_log_id,
    initial_item_id,
    recognition_id,
    type,
    source,
    recipe_line_id,
    quantity,
    bottle_orientation,
    metadata
  )
  SELECT 
    NEW.id,
    iti.id,
    iti.recognition_id,
    iti.item_type,
    iti.source,
    -- Use recipe_line_id from initial_tray_items if available
    -- Otherwise get it from recipe_line_options (for backward compatibility)
    COALESCE(iti.recipe_line_id, rlo.recipe_line_id),
    COALESCE(rl.quantity, 1),
    iti.bottle_orientation,
    iti.metadata
  FROM initial_tray_items iti
  LEFT JOIN recipe_line_options rlo ON iti.recipe_line_option_id = rlo.id
  LEFT JOIN recipe_lines rl ON COALESCE(iti.recipe_line_id, rlo.recipe_line_id) = rl.id
  WHERE iti.recognition_id = NEW.recognition_id;

  -- Copy initial_annotations to work_annotations
  INSERT INTO work_annotations (
    work_log_id,
    initial_annotation_id,
    image_id,
    work_item_id,
    bbox,
    is_occluded,
    occlusion_metadata
  )
  SELECT 
    NEW.id,
    ia.id,
    ia.image_id,
    wi.id,
    ia.bbox,
    ia.is_occluded,
    NULL::jsonb
  FROM initial_annotations ia
  JOIN work_items wi ON wi.initial_item_id = ia.initial_tray_item_id 
    AND wi.work_log_id = NEW.id
  WHERE ia.image_id IN (
    SELECT id FROM images WHERE recognition_id = NEW.recognition_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION initialize_work_session IS 
  'Trigger function: copies items (including recipe_line_id for ambiguity cases) and annotations when validation_work_log is created';

