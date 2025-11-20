-- Migration: Create initial_tray_items for existing recognitions with ambiguity
-- Description: Backfill data for recipe_lines that have ambiguity (no initial_tray_items created)

DO $$
DECLARE
  rec RECORD;
  item_count INTEGER := 0;
  ann_count INTEGER := 0;
BEGIN
  -- Find recipe_lines with ambiguity that don't have initial_tray_items
  FOR rec IN
    SELECT 
      rl.id as recipe_line_id,
      rl.line_number,
      rl.quantity,
      r.recognition_id
    FROM recipe_lines rl
    JOIN recipes r ON r.id = rl.recipe_id
    LEFT JOIN recipe_line_options rlo ON rlo.recipe_line_id = rl.id AND rlo.is_selected = true
    WHERE rlo.id IS NULL  -- No selected option
      AND NOT EXISTS (
        -- No initial_tray_items for this recipe_line
        SELECT 1 FROM initial_tray_items iti
        LEFT JOIN recipe_line_options rlo2 ON iti.recipe_line_option_id = rlo2.id
        WHERE (iti.recipe_line_id = rl.id OR rlo2.recipe_line_id = rl.id)
      )
  LOOP
    -- Create initial_tray_items for each quantity
    FOR i IN 1..rec.quantity LOOP
      INSERT INTO initial_tray_items (
        recognition_id,
        item_type,
        source,
        recipe_line_id,
        recipe_line_option_id,
        metadata
      )
      VALUES (
        rec.recognition_id,
        'FOOD',
        'RECIPE_LINE_OPTION',
        rec.recipe_line_id,
        NULL,  -- No option selected yet
        jsonb_build_object(
          'item_number', i,
          'qwen_label', 'dish_' || (rec.line_number - 1)::text
        )
      )
      ON CONFLICT DO NOTHING;
      
      item_count := item_count + 1;
    END LOOP;
  END LOOP;
  
  -- Link existing qwen annotations to newly created items
  WITH qwen_with_items AS (
    SELECT 
      qa.id as qwen_id,
      iti.id as item_id,
      img.id as image_id,
      qa.bbox
    FROM raw.qwen_annotations qa
    JOIN initial_tray_items iti ON iti.recognition_id = qa.recognition_id 
      AND iti.metadata->>'qwen_label' = qa.class_name
      AND iti.recipe_line_option_id IS NULL  -- Only newly created items
    JOIN images img ON img.recognition_id = qa.recognition_id
      AND (
        (qa.image_path LIKE '%camera1%' AND img.camera_number = 1) OR
        (qa.image_path LIKE '%camera2%' AND img.camera_number = 2)
      )
    WHERE NOT EXISTS (
      -- Don't create duplicates
      SELECT 1 FROM initial_annotations ia 
      WHERE ia.initial_tray_item_id = iti.id 
        AND ia.image_id = img.id
    )
  )
  INSERT INTO initial_annotations (image_id, initial_tray_item_id, bbox, source)
  SELECT image_id, item_id, bbox, 'MODEL'
  FROM qwen_with_items
  ON CONFLICT DO NOTHING;
  
  GET DIAGNOSTICS ann_count = ROW_COUNT;
  
  RAISE NOTICE 'Migrated % items and % annotations for ambiguous recipe_lines', item_count, ann_count;
END $$;

