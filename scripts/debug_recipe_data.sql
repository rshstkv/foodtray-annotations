-- Debug script: Проверка данных recipe для конкретного recognition

-- Замени 109652 на нужный recognition_id
\set recognition_id 109652

-- 1. Базовая информация
SELECT 
  r.id as recognition_id,
  rec.id as recipe_id,
  COUNT(DISTINCT rl.id) as recipe_lines_count,
  COUNT(DISTINCT rlo.id) as recipe_line_options_count
FROM recognitions r
LEFT JOIN recipes rec ON rec.recognition_id = r.id
LEFT JOIN recipe_lines rl ON rl.recipe_id = rec.id
LEFT JOIN recipe_line_options rlo ON rlo.recipe_id = rec.id
WHERE r.id = :recognition_id
GROUP BY r.id, rec.id;

-- 2. Детали recipe_lines
SELECT 
  rl.id,
  rl.line_number,
  rl.quantity,
  rl.raw_name,
  rl.has_ambiguity,
  COUNT(rlo.id) as options_count
FROM recipe_lines rl
LEFT JOIN recipe_line_options rlo ON rlo.recipe_line_id = rl.id
WHERE rl.recipe_id = (SELECT id FROM recipes WHERE recognition_id = :recognition_id LIMIT 1)
GROUP BY rl.id, rl.line_number, rl.quantity, rl.raw_name, rl.has_ambiguity
ORDER BY rl.line_number;

-- 3. Детали options для каждого recipe_line
SELECT 
  rl.id as recipe_line_id,
  rl.line_number,
  rl.quantity,
  rl.raw_name,
  rlo.id as option_id,
  rlo.name as option_name,
  rlo.external_id,
  rlo.is_selected,
  rlo.model_score
FROM recipe_lines rl
LEFT JOIN recipe_line_options rlo ON rlo.recipe_line_id = rl.id
WHERE rl.recipe_id = (SELECT id FROM recipes WHERE recognition_id = :recognition_id LIMIT 1)
ORDER BY rl.line_number, rlo.model_score DESC NULLS LAST;

-- 4. Какие work_items ссылаются на эти recipe_lines
SELECT 
  wi.id as work_item_id,
  wi.work_log_id,
  wi.type,
  wi.recipe_line_id,
  rl.raw_name,
  wi.metadata->>'name' as metadata_name,
  wi.quantity
FROM work_items wi
LEFT JOIN recipe_lines rl ON rl.id = wi.recipe_line_id
WHERE wi.recognition_id = :recognition_id
  AND wi.is_deleted = false
ORDER BY wi.id;

-- 5. Проверка неопределенности (recipe_lines с несколькими options, но без выбранного)
SELECT 
  rl.id as recipe_line_id,
  rl.line_number,
  rl.raw_name,
  COUNT(rlo.id) as options_count,
  BOOL_OR(rlo.is_selected) as has_selected,
  STRING_AGG(rlo.name, ' | ' ORDER BY rlo.model_score DESC NULLS LAST) as all_options
FROM recipe_lines rl
JOIN recipe_line_options rlo ON rlo.recipe_line_id = rl.id
WHERE rl.recipe_id = (SELECT id FROM recipes WHERE recognition_id = :recognition_id LIMIT 1)
GROUP BY rl.id, rl.line_number, rl.raw_name
HAVING COUNT(rlo.id) > 1 AND NOT BOOL_OR(rlo.is_selected);

