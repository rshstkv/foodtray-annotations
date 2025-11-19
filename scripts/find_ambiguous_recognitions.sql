-- Найти recognition с неопределенностью (несколько options для recipe_line, но ни один не выбран)

-- 1. Recognition с неразрешенной неопределенностью
SELECT 
  r.id as recognition_id,
  r.created_at,
  COUNT(DISTINCT rl.id) as recipe_lines_with_ambiguity
FROM recognitions r
JOIN recipes rec ON rec.recognition_id = r.id
JOIN recipe_lines rl ON rl.recipe_id = rec.id
WHERE EXISTS (
  -- Есть recipe_line с несколькими options, но ни один не выбран
  SELECT 1 
  FROM recipe_line_options rlo
  WHERE rlo.recipe_line_id = rl.id
  GROUP BY rlo.recipe_line_id
  HAVING COUNT(*) > 1 AND NOT BOOL_OR(rlo.is_selected)
)
-- Исключаем уже завершенные
AND NOT EXISTS (
  SELECT 1 FROM validation_work_log w
  WHERE w.recognition_id = r.id 
    AND w.status = 'completed'
)
GROUP BY r.id, r.created_at
ORDER BY r.created_at DESC
LIMIT 20;

-- 2. Детали неопределенности для конкретного recognition (замени 123 на нужный ID)
-- SELECT 
--   rl.id as recipe_line_id,
--   rl.line_number,
--   rl.raw_name,
--   rl.quantity,
--   ARRAY_AGG(
--     jsonb_build_object(
--       'id', rlo.id,
--       'name', rlo.name,
--       'external_id', rlo.external_id,
--       'is_selected', rlo.is_selected,
--       'model_score', rlo.model_score
--     ) ORDER BY rlo.model_score DESC NULLS LAST
--   ) as options
-- FROM recipe_lines rl
-- JOIN recipe_line_options rlo ON rlo.recipe_line_id = rl.id
-- WHERE rl.recipe_id = (SELECT id FROM recipes WHERE recognition_id = 123)
-- GROUP BY rl.id, rl.line_number, rl.raw_name, rl.quantity
-- HAVING COUNT(rlo.id) > 1;

-- 3. Статистика по всем recognition
SELECT 
  'Total recognitions' as metric,
  COUNT(*) as count
FROM recognitions
UNION ALL
SELECT 
  'With recipe' as metric,
  COUNT(DISTINCT r.id) as count
FROM recognitions r
JOIN recipes rec ON rec.recognition_id = r.id
UNION ALL
SELECT 
  'With ambiguity' as metric,
  COUNT(DISTINCT r.id) as count
FROM recognitions r
JOIN recipes rec ON rec.recognition_id = r.id
JOIN recipe_lines rl ON rl.recipe_id = rec.id
WHERE EXISTS (
  SELECT 1 
  FROM recipe_line_options rlo
  WHERE rlo.recipe_line_id = rl.id
  GROUP BY rlo.recipe_line_id
  HAVING COUNT(*) > 1 AND NOT BOOL_OR(rlo.is_selected)
)
UNION ALL
SELECT 
  'Completed' as metric,
  COUNT(DISTINCT recognition_id) as count
FROM validation_work_log
WHERE status = 'completed';

