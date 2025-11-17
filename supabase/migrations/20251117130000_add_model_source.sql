-- Migration: Add MODEL source to tray_item_source enum
-- Description: Items annotated by QWEN/ML model should have source = 'MODEL', not 'MANUAL'

-- Add MODEL to tray_item_source enum
ALTER TYPE public.tray_item_source ADD VALUE IF NOT EXISTS 'MODEL';

-- Update transform function to use MODEL for PLATES
CREATE OR REPLACE FUNCTION transform_initial_items_and_annotations()
RETURNS TABLE(items_created INTEGER, annotations_created INTEGER) AS $$
DECLARE
  item_count INTEGER := 0;
  ann_count INTEGER := 0;
BEGIN
  -- STEP 1: Create initial_tray_items from recipe (FOOD only)
  -- dish_X from Qwen corresponds to line_number from recipe (dish_0 = line 1)
  -- Expand quantity: if quantity=2, create 2 separate tray_items
  -- Take ONLY first option per recipe_line to avoid duplicates
  WITH first_options AS (
    SELECT DISTINCT ON (recipe_line_id)
      recipe_line_id,
      id as recipe_line_option_id,
      external_id,
      name
    FROM recipe_line_options
    WHERE is_selected = true
    ORDER BY recipe_line_id, id
  ),
  recipe_items_expanded AS (
    SELECT 
      r.recognition_id,
      rl.line_number,
      fo.recipe_line_option_id,
      fo.external_id,
      fo.name,
      generate_series(1, rl.quantity) as item_number
    FROM recipes r
    JOIN recipe_lines rl ON rl.recipe_id = r.id
    JOIN first_options fo ON fo.recipe_line_id = rl.id
  ),
  inserted_recipe_items AS (
    INSERT INTO initial_tray_items (
      recognition_id, 
      item_type, 
      source, 
      recipe_line_option_id,
      menu_item_external_id,
      metadata
    )
    SELECT 
      recognition_id,
      'FOOD'::public.item_type,
      'RECIPE_LINE_OPTION'::public.tray_item_source,
      recipe_line_option_id,
      external_id,
      jsonb_build_object(
        'name', name, 
        'item_number', item_number,
        'qwen_label', 'dish_' || (line_number - 1)::text  -- Map to Qwen label
      )
    FROM recipe_items_expanded
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO item_count FROM inserted_recipe_items;
  
  -- STEP 2: Create initial_tray_items for PLATES from Qwen (MODEL source, not MANUAL)
  WITH qwen_plates AS (
    SELECT DISTINCT
      recognition_id,
      class_name
    FROM raw.qwen_annotations
    WHERE item_type = 'PLATE'
  ),
  inserted_plate_items AS (
    INSERT INTO initial_tray_items (recognition_id, item_type, source, metadata)
    SELECT 
      qp.recognition_id,
      'PLATE'::public.item_type,
      'MODEL'::public.tray_item_source,  -- Changed from MANUAL to MODEL
      jsonb_build_object('qwen_label', qp.class_name)
    FROM qwen_plates qp
    WHERE EXISTS (SELECT 1 FROM recognitions r WHERE r.id = qp.recognition_id)
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT item_count + COUNT(*) INTO item_count FROM inserted_plate_items;
  
  -- STEP 3: Create initial_annotations for each Qwen bbox (both FOOD and PLATE)
  WITH qwen_with_items AS (
    SELECT 
      qa.recognition_id,
      qa.class_name,
      qa.image_path,
      qa.bbox,
      iti.id as item_id,
      img.id as image_id
    FROM raw.qwen_annotations qa
    JOIN initial_tray_items iti ON iti.recognition_id = qa.recognition_id 
      AND iti.metadata->>'qwen_label' = qa.class_name
    JOIN images img ON img.recognition_id = qa.recognition_id
      AND (
        (qa.image_path LIKE '%camera1%' AND img.camera_number = 1) OR
        (qa.image_path LIKE '%camera2%' AND img.camera_number = 2)
      )
  ),
  inserted_annotations AS (
    INSERT INTO initial_annotations (image_id, initial_tray_item_id, bbox, source)
    SELECT image_id, item_id, bbox, 'MODEL'
    FROM qwen_with_items
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO ann_count FROM inserted_annotations;
  
  RETURN QUERY SELECT item_count, ann_count;
END;
$$ LANGUAGE plpgsql;

