-- =====================================================
-- Fix acquire_next_task: убрать DELETE из materialized view
-- =====================================================
-- Materialized view нельзя модифицировать через DELETE
-- Она обновляется только через REFRESH

CREATE OR REPLACE FUNCTION acquire_next_task(p_user_id UUID)
RETURNS TABLE(
  work_log_id BIGINT,
  recognition_id BIGINT,
  validation_type validation_type
) AS $$
DECLARE
  v_task RECORD;
  v_work_log_id BIGINT;
BEGIN
  -- Найти лучшую задачу с row-level блокировкой
  SELECT t.recognition_id, t.validation_type
  INTO v_task
  FROM available_validation_tasks t
  ORDER BY t.priority, t.order_in_session, t.recognition_id
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_task IS NULL THEN
    RETURN;
  END IF;
  
  -- Создать work_log запись атомарно
  INSERT INTO validation_work_log (
    recognition_id, 
    validation_type, 
    assigned_to, 
    status, 
    started_at
  )
  VALUES (
    v_task.recognition_id, 
    v_task.validation_type, 
    p_user_id, 
    'in_progress', 
    NOW()
  )
  RETURNING id INTO v_work_log_id;
  
  -- Вернуть информацию о захваченной задаче
  RETURN QUERY 
  SELECT v_work_log_id, v_task.recognition_id, v_task.validation_type;
END;
$$ LANGUAGE plpgsql;


