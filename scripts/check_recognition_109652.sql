-- Проверка данных для Recognition #109652

-- 1. Есть ли recipe для этого recognition?
SELECT 
  r.id as recognition_id,
  r.created_at,
  rec.id as recipe_id,
  rec.created_at as recipe_created
FROM recognitions r
LEFT JOIN recipes rec ON rec.recognition_id = r.id
WHERE r.id = 109652;

-- 2. Есть ли recipe_lines?
SELECT 
  rl.id,
  rl.line_number,
  rl.quantity,
  rl.created_at
FROM recipe_lines rl
WHERE rl.recipe_id IN (
  SELECT id FROM recipes WHERE recognition_id = 109652
)
ORDER BY rl.line_number;

-- 3. Есть ли recipe_line_options?
SELECT 
  rlo.id,
  rlo.recipe_line_id,
  rlo.name,
  rlo.external_id,
  rlo.is_selected,
  rlo.created_at
FROM recipe_line_options rlo
WHERE rlo.recipe_id IN (
  SELECT id FROM recipes WHERE recognition_id = 109652
)
ORDER BY rlo.recipe_line_id, rlo.id;

-- 4. Какие work_items есть для этого recognition?
SELECT 
  wi.id,
  wi.work_log_id,
  wi.type,
  wi.recipe_line_id,
  wi.metadata->>'name' as metadata_name,
  wi.source
FROM work_items wi
WHERE wi.recognition_id = 109652
  AND wi.is_deleted = false
ORDER BY wi.id;

-- 5. Какие initial_tray_items были для этого recognition?
SELECT 
  iti.id,
  iti.item_type,
  iti.recipe_line_option_id,
  iti.metadata->>'name' as metadata_name,
  iti.source
FROM initial_tray_items iti
WHERE iti.recognition_id = 109652
ORDER BY iti.id;

