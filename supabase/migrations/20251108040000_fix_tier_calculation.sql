-- ============================================================================
-- Fix tier calculation: check per-dish matching, not just totals
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_tier_correct(p_recognition_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_expected_counts INTEGER[];
  v_main_counts INTEGER[];
  v_qual_counts INTEGER[];
  v_has_multiple_variants BOOLEAN;
  v_all_dishes_aligned BOOLEAN;
  v_main_qual_aligned BOOLEAN;
  v_tier INTEGER;
  v_dish_count INTEGER;
  i INTEGER;
BEGIN
  -- Получаем количество блюд из correct_dishes
  SELECT jsonb_array_length(correct_dishes) 
  INTO v_dish_count
  FROM recognitions
  WHERE recognition_id = p_recognition_id;

  -- Заполняем массив expected counts
  v_expected_counts := ARRAY(
    SELECT (value->>'Count')::INTEGER
    FROM recognitions r, jsonb_array_elements(r.correct_dishes) WITH ORDINALITY arr(value, idx)
    WHERE r.recognition_id = p_recognition_id
    ORDER BY arr.idx
  );

  -- Проверяем наличие multiple variants
  SELECT EXISTS(
    SELECT 1 
    FROM recognitions r, jsonb_array_elements(r.correct_dishes) d
    WHERE r.recognition_id = p_recognition_id
      AND jsonb_array_length(d->'Dishes') > 1
  ) INTO v_has_multiple_variants;

  -- Заполняем массивы actual counts для каждого dish_index
  v_main_counts := ARRAY[]::INTEGER[];
  v_qual_counts := ARRAY[]::INTEGER[];
  
  FOR i IN 0..(v_dish_count - 1) LOOP
    -- Main count для dish_index i
    v_main_counts := v_main_counts || (
      SELECT COALESCE(COUNT(*), 0)::INTEGER
      FROM recognition_images ri
      JOIN annotations a ON ri.id = a.image_id
      WHERE ri.recognition_id = p_recognition_id
        AND ri.photo_type = 'Main'
        AND a.dish_index = i
    );
    
    -- Qualifying count для dish_index i
    v_qual_counts := v_qual_counts || (
      SELECT COALESCE(COUNT(*), 0)::INTEGER
      FROM recognition_images ri
      JOIN annotations a ON ri.id = a.image_id
      WHERE ri.recognition_id = p_recognition_id
        AND ri.photo_type = 'Qualifying'
        AND a.dish_index = i
    );
  END LOOP;

  -- Проверяем: все ли блюда aligned (M=Q=Expected для каждого блюда)
  v_all_dishes_aligned := TRUE;
  FOR i IN 1..v_dish_count LOOP
    IF v_main_counts[i] != v_qual_counts[i] OR 
       v_main_counts[i] != v_expected_counts[i] THEN
      v_all_dishes_aligned := FALSE;
      EXIT;
    END IF;
  END LOOP;

  -- Проверяем: совпадают ли M и Q для каждого блюда (даже если не равны Expected)
  v_main_qual_aligned := TRUE;
  FOR i IN 1..v_dish_count LOOP
    IF v_main_counts[i] != v_qual_counts[i] THEN
      v_main_qual_aligned := FALSE;
      EXIT;
    END IF;
  END LOOP;

  -- Определяем tier
  IF v_all_dishes_aligned THEN
    -- Все блюда идеально совпадают
    IF v_has_multiple_variants THEN
      v_tier := 2; -- Есть варианты блюд (нужна верификация названий)
    ELSE
      v_tier := 1; -- Идеальный случай
    END IF;
  ELSIF v_main_qual_aligned THEN
    -- M=Q для каждого блюда, но не равны Expected
    -- Нужно перераспределить bbox между блюдами
    v_tier := 3;
  ELSE
    -- M≠Q для некоторых блюд - нужно добавлять/удалять bbox
    DECLARE
      v_total_diff INTEGER;
    BEGIN
      v_total_diff := 0;
      FOR i IN 1..v_dish_count LOOP
        v_total_diff := v_total_diff + ABS(v_main_counts[i] - v_expected_counts[i]);
        v_total_diff := v_total_diff + ABS(v_qual_counts[i] - v_expected_counts[i]);
      END LOOP;
      
      IF v_total_diff <= 4 THEN
        v_tier := 4;
      ELSE
        v_tier := 5;
      END IF;
    END;
  END IF;

  RETURN v_tier;
END;
$$ LANGUAGE plpgsql;

-- Пересчитываем tier для всех pending recognitions
UPDATE recognitions
SET tier = calculate_tier_correct(recognition_id)
WHERE workflow_state IN ('pending', 'in_progress')
  AND tier IS NOT NULL;

-- Статистика после пересчёта
SELECT 
  tier,
  COUNT(*) as count
FROM recognitions
WHERE workflow_state = 'pending'
GROUP BY tier
ORDER BY tier;

-- Проверяем recognition 118458
SELECT 
  recognition_id,
  tier,
  (SELECT SUM((d->>'Count')::INTEGER) FROM jsonb_array_elements(correct_dishes) d) as expected_total
FROM recognitions
WHERE recognition_id = '118458';

