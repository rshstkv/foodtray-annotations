-- Функция для получения статистики задач с группировкой по режимам
-- Quick Validation: E=M=Q суммарно И для каждого блюда количество bbox совпадает
-- Edit Mode: несовпадение данных

CREATE OR REPLACE FUNCTION get_task_stats_grouped()
RETURNS JSON AS $$
DECLARE
  result JSON;
  quick_count INTEGER := 0;
  edit_count INTEGER := 0;
  correction_count INTEGER := 0;
  completed_count INTEGER := 0;
  rec RECORD;
  expected_count INTEGER;
  main_count INTEGER;
  qual_count INTEGER;
  dish_aligned BOOLEAN;
  dish JSONB;
  current_dish_index INTEGER;
  dish_count INTEGER;
  main_dish_count INTEGER;
  qual_dish_count INTEGER;
  main_image_id INTEGER;
  qual_image_id INTEGER;
BEGIN
  -- Получаем dish_validation stage_id
  DECLARE
    dish_validation_stage_id INTEGER;
  BEGIN
    SELECT ws.id INTO dish_validation_stage_id
    FROM workflow_stages ws
    INNER JOIN task_types tt ON ws.task_type_id = tt.id
    WHERE tt.code = 'dish_validation'
    LIMIT 1;

    -- Считаем completed
    SELECT COUNT(*) INTO completed_count
    FROM recognitions
    WHERE workflow_state = 'completed';

    -- Считаем requires_correction  
    SELECT COUNT(*) INTO correction_count
    FROM recognitions
    WHERE workflow_state = 'requires_correction'
      AND current_stage_id = dish_validation_stage_id;

    -- Проходим по pending задачам dish_validation
    FOR rec IN 
      SELECT 
        r.recognition_id,
        r.correct_dishes
      FROM recognitions r
      WHERE r.workflow_state = 'pending'
        AND r.current_stage_id = dish_validation_stage_id
        AND r.assigned_to IS NULL
    LOOP
      -- Вычисляем expected_count
      expected_count := 0;
      IF rec.correct_dishes IS NOT NULL THEN
        FOR dish IN SELECT * FROM jsonb_array_elements(rec.correct_dishes)
        LOOP
          expected_count := expected_count + COALESCE((dish->>'Count')::INTEGER, 0);
        END LOOP;
      END IF;

      -- Получаем image IDs
      SELECT id INTO main_image_id
      FROM recognition_images
      WHERE recognition_id = rec.recognition_id AND photo_type = 'Main'
      LIMIT 1;

      SELECT id INTO qual_image_id
      FROM recognition_images
      WHERE recognition_id = rec.recognition_id AND photo_type = 'Qualifying'
      LIMIT 1;

      -- Считаем bbox на Main и Qualifying (исключая plate - dish_index IS NOT NULL)
      SELECT COUNT(*) INTO main_count
      FROM annotations a
      WHERE a.image_id = main_image_id AND a.dish_index IS NOT NULL;

      SELECT COUNT(*) INTO qual_count
      FROM annotations a
      WHERE a.image_id = qual_image_id AND a.dish_index IS NOT NULL;

      -- Проверяем суммарное совпадение
      IF expected_count = main_count AND main_count = qual_count THEN
        -- Проверяем посблюдовое совпадение
        dish_aligned := TRUE;
        current_dish_index := 0;
        
        IF rec.correct_dishes IS NOT NULL THEN
          FOR dish IN SELECT * FROM jsonb_array_elements(rec.correct_dishes)
          LOOP
            dish_count := COALESCE((dish->>'Count')::INTEGER, 0);
            
            -- Считаем bbox для этого блюда на Main
            SELECT COUNT(*) INTO main_dish_count
            FROM annotations a
            WHERE a.image_id = main_image_id AND a.dish_index = current_dish_index;

            -- Считаем bbox для этого блюда на Qualifying
            SELECT COUNT(*) INTO qual_dish_count
            FROM annotations a
            WHERE a.image_id = qual_image_id AND a.dish_index = current_dish_index;

            -- Если хоть одно блюдо не совпадает - не aligned
            IF main_dish_count != dish_count OR qual_dish_count != dish_count THEN
              dish_aligned := FALSE;
              EXIT;
            END IF;

            current_dish_index := current_dish_index + 1;
          END LOOP;
        END IF;

        -- Если все совпадает - quick_validation
        IF dish_aligned THEN
          quick_count := quick_count + 1;
        ELSE
          edit_count := edit_count + 1;
        END IF;
      ELSE
        -- Суммарно не совпадает - edit_mode
        edit_count := edit_count + 1;
      END IF;
    END LOOP;

  END;

  -- Формируем результат
  result := json_build_object(
    'quick_validation', quick_count,
    'edit_mode', edit_count,
    'requires_correction', correction_count,
    'completed', completed_count,
    'bottle_orientation', 0,
    'buzzer_annotation', 0,
    'non_food_objects', 0,
    'overlap_marking', 0
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_task_stats_grouped() IS 'Возвращает статистику задач с группировкой по режимам (quick_validation, edit_mode) на основе совпадения данных';

