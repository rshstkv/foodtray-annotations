-- =====================================================
-- Multi-step Validation: Add "skipped" status support
-- =====================================================
-- Добавляем поддержку статуса "skipped" для пропущенных этапов
-- и функции для навигации между этапами

-- 1. Обновить комментарий к полю validation_steps
-- =====================================================
COMMENT ON COLUMN validation_work_log.validation_steps IS 
  'Array of validation steps: [{type: "FOOD_VALIDATION", status: "pending|in_progress|completed|skipped"}, ...]. NULL for legacy single-type work_logs.';

-- 2. Функция для пропуска текущего step (помечает как skipped)
-- =====================================================
CREATE OR REPLACE FUNCTION skip_current_step(p_work_log_id BIGINT)
RETURNS TABLE(
  success BOOLEAN,
  new_step_index INT,
  current_step JSONB
) AS $$
DECLARE
  v_steps JSONB;
  v_current_index INT;
  v_new_index INT;
  v_updated_steps JSONB;
BEGIN
  -- Получить текущее состояние
  SELECT validation_steps, current_step_index
  INTO v_steps, v_current_index
  FROM validation_work_log
  WHERE id = p_work_log_id;
  
  IF v_steps IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INT, NULL::JSONB;
    RETURN;
  END IF;
  
  -- Пометить текущий step как skipped
  v_updated_steps := jsonb_set(
    v_steps,
    array[v_current_index::text, 'status'],
    '"skipped"'
  );
  
  -- Переход к следующему step
  v_new_index := v_current_index + 1;
  
  -- Если есть следующий step - пометить его как in_progress
  IF v_new_index < jsonb_array_length(v_updated_steps) THEN
    v_updated_steps := jsonb_set(
      v_updated_steps,
      array[v_new_index::text, 'status'],
      '"in_progress"'
    );
  END IF;
  
  -- Обновить work_log
  UPDATE validation_work_log
  SET 
    validation_steps = v_updated_steps,
    current_step_index = v_new_index,
    validation_type = (v_updated_steps->v_new_index->>'type')::validation_type,
    updated_at = NOW()
  WHERE id = p_work_log_id;
  
  -- Вернуть результат
  RETURN QUERY 
  SELECT TRUE, v_new_index, v_updated_steps->v_new_index;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION skip_current_step IS 
  'Mark current step as skipped (not completed) and move to next step in validation_steps array.';

-- 3. Функция для перехода на конкретный step (только назад)
-- =====================================================
CREATE OR REPLACE FUNCTION jump_to_step(p_work_log_id BIGINT, p_target_step_index INT)
RETURNS TABLE(
  success BOOLEAN,
  new_step_index INT,
  current_step JSONB,
  error_message TEXT
) AS $$
DECLARE
  v_steps JSONB;
  v_current_index INT;
  v_updated_steps JSONB;
  v_target_status TEXT;
BEGIN
  -- Получить текущее состояние
  SELECT validation_steps, current_step_index
  INTO v_steps, v_current_index
  FROM validation_work_log
  WHERE id = p_work_log_id;
  
  IF v_steps IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INT, NULL::JSONB, 'No validation steps found'::TEXT;
    RETURN;
  END IF;
  
  -- Проверка: можно переходить только назад
  IF p_target_step_index >= v_current_index THEN
    RETURN QUERY SELECT FALSE, NULL::INT, NULL::JSONB, 'Can only jump backwards to previous steps'::TEXT;
    RETURN;
  END IF;
  
  -- Проверка: target step должен быть completed или skipped
  v_target_status := v_steps->p_target_step_index->>'status';
  IF v_target_status NOT IN ('completed', 'skipped') THEN
    RETURN QUERY SELECT FALSE, NULL::INT, NULL::JSONB, 'Can only jump to completed or skipped steps'::TEXT;
    RETURN;
  END IF;
  
  -- Пометить текущий step как pending (откат)
  v_updated_steps := jsonb_set(
    v_steps,
    array[v_current_index::text, 'status'],
    '"pending"'
  );
  
  -- Пометить target step как in_progress
  v_updated_steps := jsonb_set(
    v_updated_steps,
    array[p_target_step_index::text, 'status'],
    '"in_progress"'
  );
  
  -- Обновить work_log
  UPDATE validation_work_log
  SET 
    validation_steps = v_updated_steps,
    current_step_index = p_target_step_index,
    validation_type = (v_updated_steps->p_target_step_index->>'type')::validation_type,
    updated_at = NOW()
  WHERE id = p_work_log_id;
  
  -- Вернуть результат
  RETURN QUERY 
  SELECT TRUE, p_target_step_index, v_updated_steps->p_target_step_index, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION jump_to_step IS 
  'Jump to a specific step (only backwards to completed/skipped steps). Current step becomes pending.';

