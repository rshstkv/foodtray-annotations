-- ============================================================================
-- Recalculate tiers based on actual annotation counts
-- ============================================================================

-- Функция для правильного расчёта tier
CREATE OR REPLACE FUNCTION recalculate_recognition_tier(p_recognition_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_expected_count INTEGER;
  v_main_count INTEGER;
  v_qual_count INTEGER;
  v_has_multiple_variants BOOLEAN;
  v_tier INTEGER;
BEGIN
  -- Получаем ожидаемое количество из correct_dishes
  SELECT 
    COALESCE(SUM((dish->>'Count')::INTEGER), 0),
    EXISTS(
      SELECT 1 
      FROM jsonb_array_elements(r.correct_dishes) d
      WHERE jsonb_array_length(d->'Dishes') > 1
    )
  INTO v_expected_count, v_has_multiple_variants
  FROM recognitions r
  WHERE r.recognition_id = p_recognition_id;

  -- Получаем фактические counts из annotations
  SELECT 
    COALESCE(COUNT(*) FILTER (WHERE ri.photo_type = 'Main' AND a.dish_index IS NOT NULL), 0),
    COALESCE(COUNT(*) FILTER (WHERE ri.photo_type = 'Qualifying' AND a.dish_index IS NOT NULL), 0)
  INTO v_main_count, v_qual_count
  FROM recognition_images ri
  LEFT JOIN annotations a ON ri.id = a.image_id
  WHERE ri.recognition_id = p_recognition_id;

  -- Логика расчёта tier:
  -- Tier 1: Всё совпадает (M=Q=expected) и нет множественных вариантов блюд
  -- Tier 2: Есть множественные варианты блюд, но counts совпадают
  -- Tier 3: M и Q совпадают, но не равны expected
  -- Tier 4: M или Q не совпадают, но близко к expected
  -- Tier 5: Большие расхождения

  IF v_main_count = v_qual_count AND v_main_count = v_expected_count THEN
    IF v_has_multiple_variants THEN
      v_tier := 2;
    ELSE
      v_tier := 1;
    END IF;
  ELSIF v_main_count = v_qual_count THEN
    v_tier := 3;
  ELSIF ABS(v_main_count - v_expected_count) <= 2 OR ABS(v_qual_count - v_expected_count) <= 2 THEN
    v_tier := 4;
  ELSE
    v_tier := 5;
  END IF;

  RETURN v_tier;
END;
$$ LANGUAGE plpgsql;

-- Пересчитываем tier для всех pending recognitions
UPDATE recognitions
SET tier = recalculate_recognition_tier(recognition_id)
WHERE workflow_state IN ('pending', 'in_progress')
  AND tier IS NOT NULL;

-- Выводим статистику по новым tier
SELECT 
  tier,
  COUNT(*) as count,
  workflow_state
FROM recognitions
WHERE workflow_state = 'pending'
GROUP BY tier, workflow_state
ORDER BY tier;

-- Проверяем несколько примеров
SELECT 
  recognition_id,
  tier,
  correct_dishes,
  (SELECT COUNT(*) FROM recognition_images ri JOIN annotations a ON ri.id = a.image_id 
   WHERE ri.recognition_id = r.recognition_id AND ri.photo_type = 'Main' AND a.dish_index IS NOT NULL) as main_count,
  (SELECT COUNT(*) FROM recognition_images ri JOIN annotations a ON ri.id = a.image_id 
   WHERE ri.recognition_id = r.recognition_id AND ri.photo_type = 'Qualifying' AND a.dish_index IS NOT NULL) as qual_count
FROM recognitions r
WHERE workflow_state = 'pending' AND tier = 1
LIMIT 5;

