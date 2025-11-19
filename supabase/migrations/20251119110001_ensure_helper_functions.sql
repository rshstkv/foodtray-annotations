-- =====================================================
-- Ensure helper functions exist for multi-step validation
-- =====================================================

-- Функция для перехода к следующему step
CREATE OR REPLACE FUNCTION move_to_next_step(p_work_log_id BIGINT)
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
  
  -- Пометить текущий step как completed
  v_updated_steps := jsonb_set(
    v_steps,
    array[v_current_index::text, 'status'],
    '"completed"'
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

COMMENT ON FUNCTION move_to_next_step IS 
  'Mark current step as completed and move to next step in validation_steps array.';

-- Функция для проверки завершенности всех steps
CREATE OR REPLACE FUNCTION all_steps_completed(p_work_log_id BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
  v_steps JSONB;
  v_step JSONB;
BEGIN
  SELECT validation_steps INTO v_steps
  FROM validation_work_log
  WHERE id = p_work_log_id;
  
  IF v_steps IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Проверить что все steps имеют status = 'completed'
  FOR v_step IN SELECT jsonb_array_elements(v_steps)
  LOOP
    IF v_step->>'status' != 'completed' THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION all_steps_completed IS 
  'Check if all validation steps are completed for a work_log.';

