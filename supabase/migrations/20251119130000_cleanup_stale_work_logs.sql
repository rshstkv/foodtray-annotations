-- =====================================================
-- Cleanup Stale Work Logs
-- =====================================================
-- Функция для автоматической очистки устаревших work_log
-- Освобождает recognition если пользователь не работал > 30 минут

-- Функция для очистки старых work_log
CREATE OR REPLACE FUNCTION cleanup_stale_work_logs(p_timeout_minutes INT DEFAULT 30)
RETURNS TABLE(
  deleted_count INT,
  freed_recognitions INT[]
) AS $$
DECLARE
  v_deleted_count INT;
  v_recognition_ids INT[];
BEGIN
  -- Найти все устаревшие work_log
  SELECT ARRAY_AGG(recognition_id)
  INTO v_recognition_ids
  FROM validation_work_log
  WHERE updated_at < NOW() - (p_timeout_minutes || ' minutes')::INTERVAL;
  
  -- Удалить устаревшие work_log
  WITH deleted AS (
    DELETE FROM validation_work_log
    WHERE updated_at < NOW() - (p_timeout_minutes || ' minutes')::INTERVAL
    RETURNING id
  )
  SELECT COUNT(*)::INT INTO v_deleted_count FROM deleted;
  
  -- Вернуть результат
  RETURN QUERY SELECT v_deleted_count, COALESCE(v_recognition_ids, ARRAY[]::INT[]);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_stale_work_logs IS 
  'Delete work_logs older than timeout (default 30 minutes). Frees recognitions for other users.';

-- Можно настроить pg_cron для автоматического запуска каждые 5 минут:
-- SELECT cron.schedule('cleanup-stale-work-logs', '*/5 * * * *', 'SELECT cleanup_stale_work_logs(30)');

