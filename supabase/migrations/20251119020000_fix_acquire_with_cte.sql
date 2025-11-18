-- =====================================================
-- Fix acquire_next_task: использовать блокировку recognitions вместо materialized view
-- =====================================================
-- FOR UPDATE не работает на materialized view
-- Решение: блокировать базовую таблицу recognitions

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
  -- Найти лучшую задачу из materialized view и заблокировать recognition
  SELECT 
    avt.recognition_id, 
    avt.validation_type
  INTO v_task
  FROM available_validation_tasks avt
  INNER JOIN recognitions r ON r.id = avt.recognition_id
  ORDER BY avt.priority, avt.order_in_session, avt.recognition_id
  LIMIT 1
  FOR UPDATE OF r SKIP LOCKED;
  
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


