-- Migration: Cleanup stale work logs
-- Description: Remove duplicate and stale in_progress work_logs to free up recognitions

-- 1. Найти и удалить дубликаты: для каждого recognition_id оставить только самый свежий in_progress work_log
-- Удаляем старые in_progress work_logs, оставляя только самый новый для каждого recognition
DELETE FROM validation_work_log
WHERE id IN (
  SELECT w1.id
  FROM validation_work_log w1
  WHERE w1.status = 'in_progress'
    AND EXISTS (
      -- Есть более новый in_progress work_log для того же recognition
      SELECT 1 FROM validation_work_log w2
      WHERE w2.recognition_id = w1.recognition_id
        AND w2.status = 'in_progress'
        AND w2.started_at > w1.started_at
    )
);

-- 2. Удалить все in_progress work_logs старше 2 часов
-- (они явно застряли и должны быть освобождены)
DELETE FROM validation_work_log
WHERE status = 'in_progress'
  AND started_at < NOW() - INTERVAL '2 hours';

-- 3. Опционально: пометить старые in_progress work_logs (30мин - 2ч) как abandoned
UPDATE validation_work_log
SET status = 'abandoned'
WHERE status = 'in_progress'
  AND started_at < NOW() - INTERVAL '30 minutes'
  AND started_at >= NOW() - INTERVAL '2 hours';

COMMENT ON TABLE validation_work_log IS 
  'Журнал валидационной работы. Очищен от дубликатов и stale записей.';

