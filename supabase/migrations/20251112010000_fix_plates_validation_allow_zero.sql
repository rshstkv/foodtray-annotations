-- ============================================================================
-- Исправление: разрешить quick mode когда plates 0:0 (совпадают)
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_validation_mode(p_recognition_id TEXT)
RETURNS TEXT AS $$
DECLARE
  -- блюда
  expected_count INTEGER;
  main_count INTEGER;
  qual_count INTEGER;
  dish_aligned BOOLEAN;
  
  -- plates
  main_plates_count INTEGER;
  qual_plates_count INTEGER;
  
  main_image_id INTEGER;
  qual_image_id INTEGER;
BEGIN
  -- Получить image IDs
  SELECT id INTO main_image_id FROM recognition_images 
  WHERE recognition_id = p_recognition_id AND photo_type = 'Main' LIMIT 1;
  
  SELECT id INTO qual_image_id FROM recognition_images 
  WHERE recognition_id = p_recognition_id AND photo_type = 'Qualifying' LIMIT 1;
  
  -- Если нет изображений - edit mode
  IF main_image_id IS NULL OR qual_image_id IS NULL THEN
    RETURN 'edit';
  END IF;
  
  -- Блюда: получить expected count
  SELECT SUM((cd->>'Count')::INTEGER) INTO expected_count
  FROM recognitions r, jsonb_array_elements(r.correct_dishes) cd
  WHERE r.recognition_id = p_recognition_id;
  
  -- Блюда: посчитать bbox
  SELECT COUNT(*) INTO main_count FROM annotations 
  WHERE image_id = main_image_id AND dish_index IS NOT NULL;
  
  SELECT COUNT(*) INTO qual_count FROM annotations 
  WHERE image_id = qual_image_id AND dish_index IS NOT NULL;
  
  -- Plates: посчитать bbox
  SELECT COUNT(*) INTO main_plates_count FROM annotations
  WHERE image_id = main_image_id AND object_type = 'plate';
  
  SELECT COUNT(*) INTO qual_plates_count FROM annotations
  WHERE image_id = qual_image_id AND object_type = 'plate';
  
  -- Проверка суммарного совпадения блюд
  IF expected_count != main_count OR main_count != qual_count THEN
    RETURN 'edit';
  END IF;
  
  -- Проверка посблюдного совпадения
  SELECT bool_and(
    (SELECT COUNT(*) FROM annotations WHERE image_id = main_image_id AND dish_index = dish_idx) = dish_count
    AND
    (SELECT COUNT(*) FROM annotations WHERE image_id = qual_image_id AND dish_index = dish_idx) = dish_count
  ) INTO dish_aligned
  FROM (
    SELECT 
      row_number() OVER () - 1 as dish_idx,
      (cd->>'Count')::INTEGER as dish_count
    FROM recognitions r, jsonb_array_elements(r.correct_dishes) cd
    WHERE r.recognition_id = p_recognition_id
  ) dishes;
  
  IF NOT COALESCE(dish_aligned, FALSE) THEN
    RETURN 'edit';
  END IF;
  
  -- Проверка plates: должны совпадать по количеству (в т.ч. 0:0)
  -- Убрана проверка на > 0, т.к. если тарелок нет - это тоже правильно
  IF main_plates_count != qual_plates_count THEN
    RETURN 'edit';
  END IF;
  
  -- Все проверки пройдены - quick mode
  RETURN 'quick';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_validation_mode(TEXT) IS 
  'Вычисляет validation_mode (quick/edit) на основе совпадения блюд И plates. Quick если: блюда совпадают (суммарно и посблюдно) И plates совпадают по количеству (в т.ч. 0:0)';

-- ============================================================================
-- Пересчитать validation_mode для существующих задач
-- ============================================================================

UPDATE recognitions 
SET validation_mode = calculate_validation_mode(recognition_id)
WHERE task_queue = 'dish_validation' 
  AND workflow_state = 'pending';

-- ============================================================================
-- Логирование
-- ============================================================================

DO $$
DECLARE
  quick_count INTEGER;
  edit_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO quick_count 
  FROM recognitions 
  WHERE task_queue = 'dish_validation' 
    AND workflow_state = 'pending' 
    AND validation_mode = 'quick';
  
  SELECT COUNT(*) INTO edit_count 
  FROM recognitions 
  WHERE task_queue = 'dish_validation' 
    AND workflow_state = 'pending' 
    AND validation_mode = 'edit';
  
  RAISE NOTICE '✅ Migration completed: plates 0:0 теперь считается совпадением';
  RAISE NOTICE '   - quick: %', quick_count;
  RAISE NOTICE '   - edit: %', edit_count;
END $$;

