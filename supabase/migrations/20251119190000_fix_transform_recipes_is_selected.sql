-- Fix transform_recipes to auto-select options without ambiguity
-- Problem: transform_recipes sets is_selected=false for ALL options
-- But transform_initial_items_and_annotations expects is_selected=true
-- Solution: Auto-select first option when there's only 1 option (no ambiguity)

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
  -- Auto-select first option if no ambiguity (only 1 option exists)
  WITH option_data AS (
    SELECT 
      rl.id as recipe_line_id,
      (dish->>'ExternalId')::TEXT as external_id,
      (dish->>'Name')::TEXT as name,
      -- Auto-select if this is the FIRST option AND there's no ambiguity
      (ordinality = 1 AND NOT rl.has_ambiguity) as is_selected,
      ordinality
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

