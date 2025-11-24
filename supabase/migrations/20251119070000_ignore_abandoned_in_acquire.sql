-- Migration: Update acquire_recognition_with_steps to ignore abandoned work_logs
-- Description: Abandoned work_logs should not block recognitions from being available again

CREATE OR REPLACE FUNCTION acquire_recognition_with_steps(p_user_id UUID)
RETURNS TABLE(
  work_log_id BIGINT,
  recognition_id BIGINT,
  validation_steps JSONB,
  current_step_index INT
) AS $$
DECLARE
  v_recognition_id BIGINT;
  v_work_log_id BIGINT;
  v_steps JSONB;
BEGIN
  -- Найти первый доступный recognition с блокировкой
  -- Игнорируем только in_progress и completed, но не abandoned
  SELECT r.id
  INTO v_recognition_id
  FROM recognitions r
  WHERE NOT EXISTS (
    SELECT 1 FROM validation_work_log w
    WHERE w.recognition_id = r.id
      AND w.status IN ('in_progress', 'completed')
  )
  ORDER BY r.id
  LIMIT 1
  FOR UPDATE OF r SKIP LOCKED;
  
  IF v_recognition_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Собрать все активные validation types в массив steps (только order_in_session)
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', validation_type,
      'status', 'pending',
      'order', order_in_session
    ) ORDER BY order_in_session
  )
  INTO v_steps
  FROM validation_priority_config
  WHERE is_active = true;
  
  -- Создать work_log со всеми steps
  INSERT INTO validation_work_log (
    recognition_id,
    validation_type, -- Оставляем для backward compatibility (первый тип)
    assigned_to,
    status,
    started_at,
    validation_steps,
    current_step_index
  )
  SELECT
    v_recognition_id,
    (v_steps->0->>'type')::validation_type, -- Первый тип для совместимости
    p_user_id,
    'in_progress',
    NOW(),
    v_steps,
    0
  RETURNING id INTO v_work_log_id;
  
  RETURN QUERY 
  SELECT v_work_log_id, v_recognition_id, v_steps, 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION acquire_recognition_with_steps IS 
  'Atomically acquire recognition with all validation types as steps. Ignores abandoned work_logs, allowing recognitions to be re-validated.';





