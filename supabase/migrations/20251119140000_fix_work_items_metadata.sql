-- Migration: Fix work_items metadata copying
-- Description: Copy metadata.name from initial_tray_items to work_items so dish names are preserved

-- Обновить триггер чтобы копировать metadata
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
    rlo.recipe_line_id,  -- JOIN через recipe_line_options
    COALESCE(rl.quantity, 1),  -- quantity из recipe_lines (чека)!
    iti.bottle_orientation,
    iti.metadata  -- КОПИРОВАТЬ metadata (там есть name для блюд!)
  FROM initial_tray_items iti
  LEFT JOIN recipe_line_options rlo ON iti.recipe_line_option_id = rlo.id
  LEFT JOIN recipe_lines rl ON rlo.recipe_line_id = rl.id
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
    NULL::jsonb  -- occlusion_metadata нет в initial_annotations
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
  'Триггер-функция: копирует все items (включая metadata.name для блюд) и annotations при создании validation_work_log';
