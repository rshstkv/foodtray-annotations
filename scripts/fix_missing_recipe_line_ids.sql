-- Скрипт для исправления missing recipe_line_id в work_items
-- Проблема: work_items могли быть созданы с recipe_line_id = NULL
-- Решение: обновить recipe_line_id на основе initial_tray_items.recipe_line_option_id

-- 1. Проверка: сколько work_items имеют NULL recipe_line_id, но могут иметь его
SELECT 
  COUNT(*) as items_to_fix,
  COUNT(DISTINCT wi.work_log_id) as affected_work_logs
FROM work_items wi
JOIN initial_tray_items iti ON wi.initial_item_id = iti.id
JOIN recipe_line_options rlo ON iti.recipe_line_option_id = rlo.id
WHERE wi.recipe_line_id IS NULL
  AND iti.recipe_line_option_id IS NOT NULL;

-- 2. Посмотреть детали
SELECT 
  wi.id as work_item_id,
  wi.work_log_id,
  wi.type,
  iti.id as initial_item_id,
  iti.recipe_line_option_id,
  rlo.recipe_line_id,
  rlo.name as dish_name
FROM work_items wi
JOIN initial_tray_items iti ON wi.initial_item_id = iti.id
JOIN recipe_line_options rlo ON iti.recipe_line_option_id = rlo.id
WHERE wi.recipe_line_id IS NULL
  AND iti.recipe_line_option_id IS NOT NULL
ORDER BY wi.work_log_id, wi.id
LIMIT 20;

-- 3. ИСПРАВЛЕНИЕ: обновить recipe_line_id
UPDATE work_items wi
SET recipe_line_id = rlo.recipe_line_id
FROM initial_tray_items iti
JOIN recipe_line_options rlo ON iti.recipe_line_option_id = rlo.id
WHERE wi.initial_item_id = iti.id
  AND wi.recipe_line_id IS NULL
  AND iti.recipe_line_option_id IS NOT NULL;

-- 4. Проверка после исправления
SELECT 
  COUNT(*) as remaining_null_recipe_line_ids
FROM work_items wi
JOIN initial_tray_items iti ON wi.initial_item_id = iti.id
WHERE wi.recipe_line_id IS NULL
  AND iti.recipe_line_option_id IS NOT NULL;

