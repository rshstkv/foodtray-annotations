-- Migration: Transform Functions
-- Description: Idempotent functions to transform raw data into domain model

-- 1. Transform recognitions and images
CREATE OR REPLACE FUNCTION transform_recognitions_and_images()
RETURNS TABLE(recognitions_created INTEGER, images_created INTEGER, menu_items_created INTEGER) AS $$
DECLARE
  rec_count INTEGER := 0;
  img_count INTEGER := 0;
  menu_count INTEGER := 0;
BEGIN
  -- Insert recognitions (idempotent)
  WITH inserted AS (
    INSERT INTO recognitions (id, batch_id, created_at)
    SELECT recognition_id, batch_id, created_at
    FROM raw.recognition_files
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO rec_count FROM inserted;
  
  -- Insert active menu items (idempotent)
  -- Extract menu items from raw.recognition_files.active_menu JSONB
  WITH menu_items_extracted AS (
    SELECT 
      rf.recognition_id,
      item->>'ExternalId' as external_id,
      item->>'Name' as name,
      item->>'Category' as category,
      (item->>'Price')::NUMERIC as price,
      item - 'ExternalId' - 'Name' - 'Category' - 'Price' as metadata
    FROM raw.recognition_files rf,
    jsonb_array_elements(rf.active_menu) as item
    WHERE rf.active_menu IS NOT NULL
  ),
  inserted_menu AS (
    INSERT INTO recognition_active_menu_items (
      recognition_id, 
      external_id, 
      name, 
      category, 
      price, 
      metadata
    )
    SELECT 
      recognition_id,
      external_id,
      name,
      category,
      price,
      metadata
    FROM menu_items_extracted
    WHERE external_id IS NOT NULL AND name IS NOT NULL
    ON CONFLICT (recognition_id, external_id) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO menu_count FROM inserted_menu;
  
  -- Insert camera 1 images (idempotent)
  WITH inserted AS (
    INSERT INTO images (recognition_id, camera_number, storage_path, created_at)
    SELECT 
      recognition_id,
      1,
      'recognitions/' || recognition_id || '/' || image1_path,
      created_at
    FROM raw.recognition_files
    WHERE image1_path IS NOT NULL
    ON CONFLICT (recognition_id, camera_number) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO img_count FROM inserted;
  
  -- Insert camera 2 images (idempotent)
  WITH inserted AS (
    INSERT INTO images (recognition_id, camera_number, storage_path, created_at)
    SELECT 
      recognition_id,
      2,
      'recognitions/' || recognition_id || '/' || image2_path,
      created_at
    FROM raw.recognition_files
    WHERE image2_path IS NOT NULL
    ON CONFLICT (recognition_id, camera_number) DO NOTHING
    RETURNING id
  )
  SELECT img_count + COUNT(*) INTO img_count FROM inserted;
  
  RETURN QUERY SELECT rec_count, img_count, menu_count;
END;
$$ LANGUAGE plpgsql;

-- 2. Transform recipes with ambiguity handling
CREATE OR REPLACE FUNCTION transform_recipes()
RETURNS TABLE(recipes_created INTEGER, lines_created INTEGER, options_created INTEGER) AS $$
DECLARE
  rec_count INTEGER := 0;
  line_count INTEGER := 0;
  opt_count INTEGER := 0;
BEGIN
  -- Insert recipes
  WITH inserted AS (
    INSERT INTO recipes (recognition_id, raw_payload, created_at)
    SELECT recognition_id, payload, created_at
    FROM raw.recipes
    ON CONFLICT (recognition_id) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO rec_count FROM inserted;
  
  -- Insert recipe lines
  -- Structure: payload is array of {Count: N, Dishes: [{Name, ExternalId}, ...]}
  WITH line_data AS (
    SELECT 
      r.id as recipe_id,
      (ROW_NUMBER() OVER (PARTITION BY r.id ORDER BY ordinality))::INTEGER as line_number,
      (item->>'Count')::INTEGER as quantity,
      jsonb_array_length(item->'Dishes') > 1 as has_ambiguity,
      item->'Dishes'->0->>'Name' as raw_name,
      item->'Dishes' as dishes_array
    FROM raw.recipes rr
    JOIN recipes r ON r.recognition_id = rr.recognition_id
    CROSS JOIN LATERAL jsonb_array_elements(rr.payload) WITH ORDINALITY AS t(item, ordinality)
  ),
  inserted_lines AS (
    INSERT INTO recipe_lines (recipe_id, line_number, quantity, has_ambiguity, raw_name)
    SELECT recipe_id, line_number, quantity, has_ambiguity, raw_name
    FROM line_data
    ON CONFLICT (recipe_id, line_number) DO NOTHING
    RETURNING id, recipe_id, line_number
  )
  SELECT COUNT(*) INTO line_count FROM inserted_lines;
  
  -- Insert recipe line options (all dishes in array)
  WITH option_data AS (
    SELECT 
      rl.id as recipe_line_id,
      (dish->>'ExternalId')::TEXT as external_id,
      (dish->>'Name')::TEXT as name,
      (ordinality = 1) as is_selected -- First option selected by default
    FROM raw.recipes rr
    JOIN recipes r ON r.recognition_id = rr.recognition_id
    CROSS JOIN LATERAL jsonb_array_elements(rr.payload) WITH ORDINALITY AS t(item, item_ord)
    JOIN recipe_lines rl ON rl.recipe_id = r.id AND rl.line_number = item_ord
    CROSS JOIN LATERAL jsonb_array_elements(item->'Dishes') WITH ORDINALITY AS d(dish, ordinality)
    WHERE dish->>'ExternalId' IS NOT NULL
  ),
  inserted_options AS (
    INSERT INTO recipe_line_options (recipe_line_id, external_id, name, is_selected)
    SELECT recipe_line_id, external_id, name, is_selected
    FROM option_data
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO opt_count FROM inserted_options;
  
  RETURN QUERY SELECT rec_count, line_count, opt_count;
END;
$$ LANGUAGE plpgsql;

-- 3. Transform initial tray items and annotations
CREATE OR REPLACE FUNCTION transform_initial_items_and_annotations()
RETURNS TABLE(items_created INTEGER, annotations_created INTEGER) AS $$
DECLARE
  item_count INTEGER := 0;
  ann_count INTEGER := 0;
BEGIN
  -- STEP 1: Create initial_tray_items from recipe (FOOD only)
  -- dish_X from Qwen corresponds to line_number from recipe (dish_0 = line 1)
  -- Expand quantity: if quantity=2, create 2 separate tray_items
  WITH recipe_items_expanded AS (
    SELECT 
      r.recognition_id,
      rl.line_number,
      rlo.id as recipe_line_option_id,
      rlo.external_id,
      rlo.name,
      generate_series(1, rl.quantity) as item_number
    FROM recipes r
    JOIN recipe_lines rl ON rl.recipe_id = r.id
    JOIN recipe_line_options rlo ON rlo.recipe_line_id = rl.id
    WHERE rlo.is_selected = true
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
  
  -- STEP 2: Create initial_tray_items for PLATES from Qwen (no recipe info)
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
      'MANUAL'::public.tray_item_source,
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

