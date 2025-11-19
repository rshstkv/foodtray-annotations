-- Проверка неопределенности в recipe_line_options
-- Цель: найти recipe_lines, для которых есть несколько options (неопределенность)

-- 1. Найти recipe_lines с несколькими опциями (потенциальная неопределенность)
SELECT 
  rl.id as recipe_line_id,
  rl.recognition_id,
  rl.line_number,
  rl.quantity,
  COUNT(rlo.id) as options_count,
  ARRAY_AGG(rlo.name) as option_names,
  ARRAY_AGG(rlo.is_selected) as option_selected_flags
FROM recipe_lines rl
JOIN recipe_line_options rlo ON rlo.recipe_line_id = rl.id
GROUP BY rl.id, rl.recognition_id, rl.line_number, rl.quantity
HAVING COUNT(rlo.id) > 1
ORDER BY rl.recognition_id DESC, rl.line_number
LIMIT 20;

-- 2. Найти initial_tray_items которые связаны с recipe_line_options
SELECT 
  iti.id as item_id,
  iti.recognition_id,
  iti.item_type,
  iti.recipe_line_option_id,
  rlo.recipe_line_id,
  rlo.name as option_name,
  rlo.is_selected,
  iti.metadata->>'name' as metadata_name
FROM initial_tray_items iti
LEFT JOIN recipe_line_options rlo ON iti.recipe_line_option_id = rlo.id
WHERE iti.item_type = 'FOOD'
  AND iti.recognition_id IN (
    SELECT DISTINCT recognition_id 
    FROM recipe_lines 
    LIMIT 10
  )
ORDER BY iti.recognition_id DESC, iti.id
LIMIT 50;

-- 3. Проверка: есть ли recipe_lines где НИ ОДНА опция не выбрана (is_selected = false для всех)
SELECT 
  rl.id as recipe_line_id,
  rl.recognition_id,
  COUNT(rlo.id) as total_options,
  SUM(CASE WHEN rlo.is_selected THEN 1 ELSE 0 END) as selected_count
FROM recipe_lines rl
JOIN recipe_line_options rlo ON rlo.recipe_line_id = rl.id
GROUP BY rl.id, rl.recognition_id
HAVING SUM(CASE WHEN rlo.is_selected THEN 1 ELSE 0 END) = 0
  AND COUNT(rlo.id) > 1
ORDER BY rl.recognition_id DESC
LIMIT 20;

-- 4. Проверка: есть ли initial_tray_items с recipe_line_option_id = NULL но type = FOOD
SELECT 
  iti.id,
  iti.recognition_id,
  iti.item_type,
  iti.recipe_line_option_id,
  iti.metadata->>'name' as metadata_name,
  iti.source
FROM initial_tray_items iti
WHERE iti.item_type = 'FOOD'
  AND iti.recipe_line_option_id IS NULL
  AND iti.source != 'manual' -- исключаем вручную добавленные
ORDER BY iti.recognition_id DESC
LIMIT 20;

