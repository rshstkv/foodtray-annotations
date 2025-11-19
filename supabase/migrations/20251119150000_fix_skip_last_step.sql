-- Migration: Fix skip_current_step for last step
-- Description: Handle case when skipping the last step (v_new_index >= array length)

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
  v_current_validation_type validation_type;
BEGIN
  -- Получить текущее состояние
  SELECT validation_steps, current_step_index, validation_type
  INTO v_steps, v_current_index, v_current_validation_type
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
    
    -- Обновить work_log с новым validation_type
    UPDATE validation_work_log
    SET 
      validation_steps = v_updated_steps,
      current_step_index = v_new_index,
      validation_type = (v_updated_steps->v_new_index->>'type')::validation_type,
      updated_at = NOW()
    WHERE id = p_work_log_id;
    
    RETURN QUERY 
    SELECT TRUE, v_new_index, v_updated_steps->v_new_index;
  ELSE
    -- Это был последний step - не меняем validation_type
    UPDATE validation_work_log
    SET 
      validation_steps = v_updated_steps,
      current_step_index = v_new_index,
      updated_at = NOW()
    WHERE id = p_work_log_id;
    
    -- Вернуть NULL как current_step (больше нет шагов)
    RETURN QUERY 
    SELECT TRUE, v_new_index, NULL::JSONB;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION skip_current_step IS 
  'Mark current step as skipped (not completed) and move to next step. Handles last step correctly.';
