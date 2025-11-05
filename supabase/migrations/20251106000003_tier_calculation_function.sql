-- Функция для автоматического вычисления tier (уровня сложности) recognition

-- 1. Функция вычисления tier
CREATE OR REPLACE FUNCTION calculate_recognition_tier(rec_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  main_cnt INTEGER;
  qual_cnt INTEGER;
  count_diff INTEGER;
  has_multiple BOOLEAN;
  multiple_count INTEGER;
  tier_val INTEGER;
BEGIN
  -- Получаем количество bbox для Main и Qualifying
  SELECT 
    COALESCE(COUNT(a.id) FILTER (WHERE ri.photo_type = 'Main'), 0),
    COALESCE(COUNT(a.id) FILTER (WHERE ri.photo_type = 'Qualifying'), 0)
  INTO main_cnt, qual_cnt
  FROM recognitions r
  LEFT JOIN recognition_images ri ON r.recognition_id = ri.recognition_id
  LEFT JOIN annotations a ON ri.id = a.image_id
  WHERE r.recognition_id = rec_id
  GROUP BY r.recognition_id;
  
  -- Если не нашли recognition, возвращаем tier 1
  IF main_cnt IS NULL THEN
    main_cnt := 0;
    qual_cnt := 0;
  END IF;
  
  -- Проверяем наличие множественных вариантов в correct_dishes
  WITH dish_data AS (
    SELECT 
      r.recognition_id,
      dish,
      jsonb_array_length(dish->'Dishes') AS dish_count
    FROM recognitions r,
    jsonb_array_elements(r.correct_dishes) AS dish
    WHERE r.recognition_id = rec_id
  )
  SELECT 
    EXISTS(SELECT 1 FROM dish_data WHERE dish_count > 1),
    COALESCE(COUNT(*) FILTER (WHERE dish_count > 1), 0)
  INTO has_multiple, multiple_count
  FROM dish_data;
  
  -- Если нет данных о блюдах, устанавливаем false
  IF has_multiple IS NULL THEN
    has_multiple := false;
    multiple_count := 0;
  END IF;
  
  count_diff := ABS(main_cnt - qual_cnt);
  
  -- Вычисление tier на основе критериев сложности
  -- Tier 1: Идеальный случай - все совпадает
  IF count_diff = 0 AND NOT has_multiple THEN
    tier_val := 1;
  -- Tier 2: Совпадает bbox, но есть выбор блюд (до 2 вариантов)
  ELSIF count_diff = 0 AND has_multiple AND multiple_count <= 2 THEN
    tier_val := 2;
  -- Tier 3: Небольшая разница в bbox (1-2), нет множественного выбора
  ELSIF count_diff BETWEEN 1 AND 2 AND NOT has_multiple THEN
    tier_val := 3;
  -- Tier 4: Средняя сложность
  ELSIF count_diff <= 3 OR (has_multiple AND multiple_count <= 3) THEN
    tier_val := 4;
  -- Tier 5: Сложные случаи
  ELSE
    tier_val := 5;
  END IF;
  
  RETURN tier_val;
END;
$$ LANGUAGE plpgsql;

-- Комментарий к функции
COMMENT ON FUNCTION calculate_recognition_tier(TEXT) IS 'Вычисляет tier (1-5) на основе сложности: разница bbox между Main/Qualifying и множественность вариантов блюд';

-- 2. Функция-триггер для автоматического обновления tier
CREATE OR REPLACE FUNCTION update_recognition_tier()
RETURNS TRIGGER AS $$
BEGIN
  -- Вычисляем tier только если это INSERT или если изменились relevant поля
  IF TG_OP = 'INSERT' OR 
     (TG_OP = 'UPDATE' AND (
       OLD.correct_dishes IS DISTINCT FROM NEW.correct_dishes OR
       OLD.tier IS NULL
     )) THEN
    NEW.tier := calculate_recognition_tier(NEW.recognition_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Триггер на recognitions
DROP TRIGGER IF EXISTS trigger_update_tier ON recognitions;
CREATE TRIGGER trigger_update_tier
BEFORE INSERT OR UPDATE ON recognitions
FOR EACH ROW
EXECUTE FUNCTION update_recognition_tier();

-- 4. Функция-триггер для обновления tier при изменении annotations
CREATE OR REPLACE FUNCTION update_recognition_tier_on_annotation_change()
RETURNS TRIGGER AS $$
DECLARE
  rec_id TEXT;
BEGIN
  -- Получаем recognition_id из image
  IF TG_OP = 'DELETE' THEN
    SELECT ri.recognition_id INTO rec_id
    FROM recognition_images ri
    WHERE ri.id = OLD.image_id;
  ELSE
    SELECT ri.recognition_id INTO rec_id
    FROM recognition_images ri
    WHERE ri.id = NEW.image_id;
  END IF;
  
  -- Обновляем tier для recognition
  IF rec_id IS NOT NULL THEN
    UPDATE recognitions
    SET tier = calculate_recognition_tier(rec_id)
    WHERE recognition_id = rec_id;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 5. Триггер на annotations для автоматического пересчета tier
DROP TRIGGER IF EXISTS trigger_update_tier_on_annotation ON annotations;
CREATE TRIGGER trigger_update_tier_on_annotation
AFTER INSERT OR UPDATE OR DELETE ON annotations
FOR EACH ROW
EXECUTE FUNCTION update_recognition_tier_on_annotation_change();

-- Комментарий
COMMENT ON TRIGGER trigger_update_tier ON recognitions IS 'Автоматически вычисляет tier при создании/изменении recognition';
COMMENT ON TRIGGER trigger_update_tier_on_annotation ON annotations IS 'Автоматически пересчитывает tier recognition при изменении annotations';

