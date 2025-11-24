-- =====================================================
-- Переход на обычный VIEW вместо MATERIALIZED VIEW
-- =====================================================
-- Materialized view не обновляется автоматически
-- Обычный view всегда актуален и имеет все нужные индексы на базовых таблицах

-- 1. Удалить materialized view
DROP MATERIALIZED VIEW IF EXISTS available_validation_tasks;

-- 2. Создать обычный view (автоматически актуальный)
CREATE VIEW available_validation_tasks AS
SELECT 
  r.id as recognition_id,
  p.validation_type,
  p.priority,
  p.order_in_session
FROM recognitions r
CROSS JOIN validation_priority_config p
WHERE p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM validation_work_log w
    WHERE w.recognition_id = r.id 
      AND w.validation_type = p.validation_type
      AND (
        w.status = 'completed' 
        OR (w.status = 'in_progress' AND w.started_at >= NOW() - INTERVAL '30 minutes')
      )
  );

COMMENT ON VIEW available_validation_tasks IS 
  'Always up-to-date list of available (recognition, validation_type) pairs. Auto-updates when work_log changes.';

-- 3. Обновить функцию acquire_next_task (убрать ненужную блокировку для view)
CREATE OR REPLACE FUNCTION acquire_next_task(p_user_id UUID)
RETURNS TABLE(
  work_log_id BIGINT,
  recognition_id BIGINT,
  validation_type validation_type
) AS $$
DECLARE
  v_recognition_id BIGINT;
  v_validation_type validation_type;
  v_work_log_id BIGINT;
BEGIN
  -- Найти лучшую задачу с блокировкой на уровне recognitions
  SELECT 
    r.id,
    avt.validation_type
  INTO v_recognition_id, v_validation_type
  FROM recognitions r
  INNER JOIN available_validation_tasks avt ON avt.recognition_id = r.id
  ORDER BY avt.priority, avt.order_in_session, avt.recognition_id
  LIMIT 1
  FOR UPDATE OF r SKIP LOCKED;
  
  IF v_recognition_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Проверить еще раз что задача доступна (может измениться между SELECT и INSERT)
  IF EXISTS (
    SELECT 1 FROM validation_work_log w
    WHERE w.recognition_id = v_recognition_id
      AND w.validation_type = v_validation_type
      AND (
        w.status = 'completed'
        OR (w.status = 'in_progress' AND w.started_at >= NOW() - INTERVAL '30 minutes')
      )
  ) THEN
    RETURN;
  END IF;
  
  -- Создать work_log запись
  INSERT INTO validation_work_log (
    recognition_id, 
    validation_type, 
    assigned_to, 
    status, 
    started_at
  )
  VALUES (
    v_recognition_id, 
    v_validation_type, 
    p_user_id, 
    'in_progress', 
    NOW()
  )
  RETURNING id INTO v_work_log_id;
  
  RETURN QUERY 
  SELECT v_work_log_id, v_recognition_id, v_validation_type;
END;
$$ LANGUAGE plpgsql;

-- 4. Удалить функцию refresh (больше не нужна для обычного view)
DROP FUNCTION IF EXISTS refresh_materialized_view_concurrently(TEXT);











