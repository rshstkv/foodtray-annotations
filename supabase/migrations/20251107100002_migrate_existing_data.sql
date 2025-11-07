-- Миграция существующих recognitions для перехода на новую систему
-- Обновляем current_stage_id с dish_selection на dish_validation

-- ============================================================================
-- 1. Обновить recognitions с dish_selection stage
-- ============================================================================

DO $$
DECLARE
  v_old_stage_id INTEGER;
  v_new_stage_id INTEGER;
  v_updated_count INTEGER;
BEGIN
  -- Получаем ID старого stage (dish_selection может уже не существовать после предыдущей миграции)
  -- Поэтому ищем по stage_order = 2
  SELECT id INTO v_old_stage_id
  FROM workflow_stages
  WHERE stage_order = 2
  AND name LIKE '%блюд%'
  LIMIT 1;

  -- Получаем ID нового stage (dish_validation)
  SELECT ws.id INTO v_new_stage_id
  FROM workflow_stages ws
  JOIN task_types tt ON ws.task_type_id = tt.id
  WHERE tt.code = 'dish_validation'
  LIMIT 1;

  IF v_new_stage_id IS NULL THEN
    RAISE EXCEPTION 'dish_validation stage not found. Run previous migration first.';
  END IF;

  -- Обновляем recognitions которые были на stage dish_selection
  -- Переводим их на новый unified stage
  UPDATE recognitions
  SET current_stage_id = v_new_stage_id
  WHERE current_stage_id = v_old_stage_id
    OR (current_stage_id IS NOT NULL 
        AND current_stage_id IN (
          SELECT id FROM workflow_stages 
          WHERE stage_order IN (1, 2)
        ));

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RAISE NOTICE 'Updated % recognitions to use dish_validation stage', v_updated_count;
END $$;

-- ============================================================================
-- 2. Обновить completed_stages arrays
-- ============================================================================

DO $$
DECLARE
  v_old_count_val_id INTEGER;
  v_old_dish_sel_id INTEGER;
  v_new_dish_val_id INTEGER;
  v_updated_count INTEGER;
BEGIN
  -- Получаем IDs старых stages
  SELECT id INTO v_old_count_val_id
  FROM workflow_stages
  WHERE stage_order = 1
  LIMIT 1;

  SELECT id INTO v_old_dish_sel_id
  FROM workflow_stages
  WHERE stage_order = 2
  AND name LIKE '%блюд%'
  LIMIT 1;

  -- Получаем ID нового stage
  SELECT ws.id INTO v_new_dish_val_id
  FROM workflow_stages ws
  JOIN task_types tt ON ws.task_type_id = tt.id
  WHERE tt.code = 'dish_validation'
  LIMIT 1;

  -- Обновляем completed_stages arrays
  -- Если в массиве есть старые stage IDs, заменяем их на новый
  UPDATE recognitions
  SET completed_stages = array_remove(
    array_remove(completed_stages, v_old_count_val_id),
    v_old_dish_sel_id
  ) || ARRAY[v_new_dish_val_id]
  WHERE (v_old_count_val_id = ANY(completed_stages) 
    OR v_old_dish_sel_id = ANY(completed_stages))
    AND NOT (v_new_dish_val_id = ANY(completed_stages));

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RAISE NOTICE 'Updated completed_stages for % recognitions', v_updated_count;
END $$;

-- ============================================================================
-- 3. Очистка старых данных
-- ============================================================================

-- Удаляем старые workflow_stages которые больше не нужны
-- (уже удалено в предыдущей миграции, но на всякий случай проверяем)
DELETE FROM workflow_stages
WHERE id NOT IN (SELECT DISTINCT current_stage_id FROM recognitions WHERE current_stage_id IS NOT NULL)
  AND id NOT IN (SELECT UNNEST(completed_stages) FROM recognitions)
  AND task_type_id NOT IN (SELECT id FROM task_types WHERE is_active = true);

-- ============================================================================
-- 4. Валидация результата
-- ============================================================================

DO $$
DECLARE
  v_pending_count INTEGER;
  v_dish_val_count INTEGER;
  v_orphaned_count INTEGER;
BEGIN
  -- Подсчитываем recognitions в pending
  SELECT COUNT(*) INTO v_pending_count
  FROM recognitions
  WHERE workflow_state = 'pending';

  -- Подсчитываем recognitions на dish_validation stage
  SELECT COUNT(*) INTO v_dish_val_count
  FROM recognitions r
  JOIN workflow_stages ws ON r.current_stage_id = ws.id
  JOIN task_types tt ON ws.task_type_id = tt.id
  WHERE tt.code = 'dish_validation';

  -- Проверяем orphaned recognitions (без валидного stage)
  SELECT COUNT(*) INTO v_orphaned_count
  FROM recognitions
  WHERE current_stage_id IS NOT NULL
    AND current_stage_id NOT IN (SELECT id FROM workflow_stages);

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration Summary:';
  RAISE NOTICE '  Total pending recognitions: %', v_pending_count;
  RAISE NOTICE '  On dish_validation stage: %', v_dish_val_count;
  RAISE NOTICE '  Orphaned recognitions: %', v_orphaned_count;
  RAISE NOTICE '========================================';

  IF v_orphaned_count > 0 THEN
    RAISE WARNING 'Found % orphaned recognitions! Check data integrity.', v_orphaned_count;
  END IF;
END $$;

