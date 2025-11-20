-- Migration: Fix transform_initial_items_and_annotations to handle ambiguity
-- Description: Create initial_tray_items for ALL recipe_lines, including those with unresolved ambiguity

CREATE OR REPLACE FUNCTION transform_initial_items_and_annotations()
RETURNS TABLE(items_created INTEGER, annotations_created INTEGER) AS $$
DECLARE
  item_count INTEGER := 0;
  ann_count INTEGER := 0;
BEGIN
  -- STEP 1: Create initial_tray_items from recipe (FOOD only)
  -- For recipe_lines WITHOUT ambiguity (has is_selected=true option):
  --   Create items with recipe_line_option_id
  -- For recipe_lines WITH ambiguity (all options is_selected=false):
  --   Create items with recipe_line_id only, recipe_line_option_id = NULL
  
  WITH recipe_line_status AS (
    -- Determine which recipe_lines have selected options
    SELECT 
      rl.id as recipe_line_id,
      rl.line_number,
      rl.quantity,
      r.recognition_id,
      BOOL_OR(rlo.is_selected) as has_selected_option
    FROM recipe_lines rl
    JOIN recipes r ON r.id = rl.recipe_id
    LEFT JOIN recipe_line_options rlo ON rlo.recipe_line_id = rl.id
    GROUP BY rl.id, rl.line_number, rl.quantity, r.recognition_id
  ),
  -- Get first selected option (for lines without ambiguity)
  selected_options AS (
    SELECT DISTINCT ON (recipe_line_id)
      recipe_line_id,
      id as recipe_line_option_id,
      external_id,
      name
    FROM recipe_line_options
    WHERE is_selected = true
    ORDER BY recipe_line_id, id
  ),
  -- Expand quantity: if quantity=2, create 2 separate items
  recipe_items_expanded AS (
    SELECT 
      rls.recognition_id,
      rls.recipe_line_id,
      rls.line_number,
      rls.quantity,
      rls.has_selected_option,
      so.recipe_line_option_id,
      so.external_id,
      so.name,
      generate_series(1, rls.quantity) as item_number
    FROM recipe_line_status rls
    LEFT JOIN selected_options so ON so.recipe_line_id = rls.recipe_line_id
  ),
  inserted_recipe_items AS (
    INSERT INTO initial_tray_items (
      recognition_id, 
      item_type, 
      source, 
      recipe_line_id,
      recipe_line_option_id,
      menu_item_external_id,
      metadata
    )
    SELECT 
      recognition_id,
      'FOOD'::public.item_type,
      'RECIPE_LINE_OPTION'::public.tray_item_source,
      recipe_line_id,
      recipe_line_option_id,  -- NULL for ambiguous items
      external_id,            -- NULL for ambiguous items
      jsonb_build_object(
        'name', name,         -- NULL for ambiguous items
        'item_number', item_number,
        'qwen_label', 'dish_' || (line_number - 1)::text
      )
    FROM recipe_items_expanded
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO item_count FROM inserted_recipe_items;
  
  -- STEP 2: Create initial_tray_items for PLATES from Qwen (MODEL source)
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
      'MODEL'::public.tray_item_source,
      jsonb_build_object('qwen_label', qp.class_name)
    FROM qwen_plates qp
    WHERE EXISTS (SELECT 1 FROM recognitions r WHERE r.id = qp.recognition_id)
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT item_count + COUNT(*) INTO item_count FROM inserted_plate_items;
  
  -- STEP 3: Create initial_annotations for each Qwen bbox (both FOOD and PLATE)
  -- Match by qwen_label in metadata
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

COMMENT ON FUNCTION transform_initial_items_and_annotations IS 
  'Transform raw annotations into initial_tray_items and initial_annotations. Creates items for ALL recipe_lines including those with unresolved ambiguity (recipe_line_option_id = NULL).';

