-- =====================================================
-- Task Queue Optimization with Materialized View
-- =====================================================
-- Цель: Ускорить выдачу задач с 500-800ms до 80-150ms
-- Подход: Materialized view + атомарный захват с блокировками

-- 1. Создаем materialized view с доступными задачами
-- =====================================================
CREATE MATERIALIZED VIEW available_validation_tasks AS
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

-- Уникальный индекс для CONCURRENTLY refresh (требуется для параллельного обновления)
CREATE UNIQUE INDEX idx_available_tasks_pk 
  ON available_validation_tasks(recognition_id, validation_type);

-- Индекс для быстрой сортировки по приоритетам
CREATE INDEX idx_available_tasks_priority 
  ON available_validation_tasks(priority, order_in_session, recognition_id);

COMMENT ON MATERIALIZED VIEW available_validation_tasks IS 
  'Precomputed list of available (recognition, validation_type) pairs for task assignment. Refreshed on priority changes.';

-- 2. Функция для атомарного захвата следующей задачи
-- =====================================================
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
  -- FOR UPDATE SKIP LOCKED гарантирует:
  --   1. Только один процесс захватит эту строку
  --   2. Другие процессы пропустят занятые строки без блокировки
  SELECT t.recognition_id, t.validation_type
  INTO v_task
  FROM available_validation_tasks t
  ORDER BY t.priority, t.order_in_session, t.recognition_id
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  -- Если нет доступных задач
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
  
  -- Удалить из materialized view (больше не доступна)
  DELETE FROM available_validation_tasks 
  WHERE recognition_id = v_task.recognition_id 
    AND validation_type = v_task.validation_type;
  
  -- Вернуть информацию о захваченной задаче
  RETURN QUERY 
  SELECT v_work_log_id, v_task.recognition_id, v_task.validation_type;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION acquire_next_task IS 
  'Atomically acquire next available validation task for a user. Uses FOR UPDATE SKIP LOCKED to prevent race conditions.';

-- 3. Функция для синхронного обновления materialized view
-- =====================================================
CREATE OR REPLACE FUNCTION refresh_materialized_view_concurrently(view_name TEXT)
RETURNS void AS $$
BEGIN
  -- CONCURRENTLY позволяет обновлять view без блокировки чтения
  -- Требует уникальный индекс (создан выше)
  EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', view_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION refresh_materialized_view_concurrently IS 
  'Refresh materialized view without blocking reads. Called when admin changes priorities.';

-- 4. Дополнительные индексы для оптимизации поиска задач
-- =====================================================

-- Для быстрого поиска последней завершенной задачи пользователя
CREATE INDEX IF NOT EXISTS idx_work_log_user_completed 
  ON validation_work_log(assigned_to, completed_at DESC)
  WHERE status = 'completed';

-- Для исключения активных in_progress tasks
CREATE INDEX IF NOT EXISTS idx_work_log_active 
  ON validation_work_log(recognition_id, validation_type, started_at)
  WHERE status = 'in_progress';

-- Composite индекс для validation_work_log (оптимизация EXISTS запросов)
CREATE INDEX IF NOT EXISTS idx_work_log_recognition_type_status
  ON validation_work_log(recognition_id, validation_type, status, started_at);

-- 5. Инициализация: наполнить materialized view данными
-- =====================================================
REFRESH MATERIALIZED VIEW available_validation_tasks;








