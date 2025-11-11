-- ============================================================================
-- Optimize performance: add indexes and update queries
-- ============================================================================

-- 1. Индексы для быстрого поиска задач
CREATE INDEX IF NOT EXISTS idx_recognitions_workflow_state_stage 
  ON recognitions(workflow_state, current_stage_id, tier, assigned_to, started_at);

CREATE INDEX IF NOT EXISTS idx_recognitions_tier_pending 
  ON recognitions(tier, workflow_state, current_stage_id)
  WHERE workflow_state = 'pending';

CREATE INDEX IF NOT EXISTS idx_recognitions_started_at 
  ON recognitions(started_at) 
  WHERE started_at IS NOT NULL;

-- 2. Индекс для быстрого подсчёта annotations по image
CREATE INDEX IF NOT EXISTS idx_annotations_image_dish 
  ON annotations(image_id, dish_index) 
  WHERE dish_index IS NOT NULL;

-- 3. Индекс для recognition_images
CREATE INDEX IF NOT EXISTS idx_recognition_images_recognition_id 
  ON recognition_images(recognition_id, photo_type);

-- 4. ANALYZE таблицы для обновления статистики
ANALYZE recognitions;
ANALYZE recognition_images;
ANALYZE annotations;

-- Выводим информацию об индексах
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('recognitions', 'recognition_images', 'annotations')
  AND indexname LIKE '%idx_%'
ORDER BY tablename, indexname;

