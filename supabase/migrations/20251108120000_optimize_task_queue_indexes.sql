-- ============================================================================
-- Optimize task queue indexes for better performance
-- ============================================================================

-- Удалить неэффективный partial index с NOW() в WHERE clause
DROP INDEX IF EXISTS idx_recognitions_workflow_state_stage;

-- Создать составной индекс для главного запроса поиска задач
-- Покрывает: workflow_state + current_stage_id + tier + recognition_date
-- Partial index только для неназначенных задач
CREATE INDEX IF NOT EXISTS idx_recognitions_task_queue 
  ON recognitions(workflow_state, current_stage_id, tier, recognition_date DESC)
  WHERE assigned_to IS NULL;

-- Отдельный индекс для auto-release (задачи старше 15 минут)
-- Используется для второго запроса, если первый не нашёл задач
CREATE INDEX IF NOT EXISTS idx_recognitions_stale_tasks 
  ON recognitions(workflow_state, current_stage_id, started_at)
  WHERE started_at IS NOT NULL;

-- Индекс для быстрого получения images с annotations через JOIN
CREATE INDEX IF NOT EXISTS idx_recognition_images_full 
  ON recognition_images(recognition_id, photo_type, id);

-- Обновить статистику планировщика запросов для оптимального выбора индексов
ANALYZE recognitions;
ANALYZE recognition_images;
ANALYZE annotations;

-- Выводим информацию о созданных индексах
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('recognitions', 'recognition_images')
  AND indexname LIKE '%task_queue%' OR indexname LIKE '%stale_tasks%' OR indexname LIKE '%images_full%'
ORDER BY tablename, indexname;


