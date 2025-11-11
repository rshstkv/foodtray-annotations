-- ============================================================================
-- Рефакторинг: переход на систему очередей (task_queue)
-- ============================================================================
-- Вместо специальных workflow_state используем task_queue для разделения потоков
-- workflow_state остается простым: pending, in_progress, completed

-- ============================================================================
-- 1. Добавляем колонку task_queue
-- ============================================================================

ALTER TABLE recognitions 
ADD COLUMN IF NOT EXISTS task_queue TEXT DEFAULT 'dish_validation';

COMMENT ON COLUMN recognitions.task_queue IS 'Type of task queue: dish_validation (quick/edit modes), check_error, buzzer, other_items (edit mode only)';

-- ============================================================================
-- 2. Мигрируем существующие специальные состояния в очереди
-- ============================================================================

-- requires_correction → edit mode в dish_validation (не отдельная очередь)
UPDATE recognitions 
SET 
  task_queue = 'dish_validation',
  validation_mode = 'edit',
  workflow_state = 'pending'
WHERE workflow_state = 'requires_correction';

-- check_error_pending → check_error queue
UPDATE recognitions 
SET 
  task_queue = 'check_error',
  workflow_state = 'pending'
WHERE workflow_state = 'check_error_pending';

-- manual_review_pending → other_items queue
UPDATE recognitions 
SET 
  task_queue = 'other_items',
  workflow_state = 'pending'
WHERE workflow_state = 'manual_review_pending';

-- buzzer_pending → buzzer queue
UPDATE recognitions 
SET 
  task_queue = 'buzzer',
  workflow_state = 'pending'
WHERE workflow_state = 'buzzer_pending';

-- ============================================================================
-- 3. Упрощаем constraint на workflow_state (только 3 значения)
-- ============================================================================

ALTER TABLE recognitions DROP CONSTRAINT IF EXISTS recognitions_workflow_state_check;

ALTER TABLE recognitions ADD CONSTRAINT recognitions_workflow_state_check 
CHECK (workflow_state IN ('pending', 'in_progress', 'completed'));

COMMENT ON CONSTRAINT recognitions_workflow_state_check ON recognitions 
IS 'Simple 3-state workflow: pending → in_progress → completed';

-- ============================================================================
-- 4. Обновляем функцию flag_task для работы с task_queue
-- ============================================================================

CREATE OR REPLACE FUNCTION flag_task(
  p_recognition_id TEXT,
  p_flag_type TEXT, -- 'bbox_error', 'check_error', 'other_items', 'buzzer_present'
  p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_new_queue TEXT;
  v_new_mode TEXT;
BEGIN
  -- Определяем новую очередь и режим на основе флага
  CASE p_flag_type
    WHEN 'bbox_error' THEN
      -- bbox_error просто переводит в edit mode той же очереди dish_validation
      v_new_queue := 'dish_validation';
      v_new_mode := 'edit';
    WHEN 'check_error' THEN
      v_new_queue := 'check_error';
      v_new_mode := 'edit';
    WHEN 'other_items' THEN
      v_new_queue := 'other_items';
      v_new_mode := 'edit';
    WHEN 'buzzer_present' THEN
      v_new_queue := 'buzzer';
      v_new_mode := 'edit';
    ELSE
      RAISE EXCEPTION 'Invalid flag_type: %. Must be one of: bbox_error, check_error, other_items, buzzer_present', p_flag_type;
  END CASE;

  -- Обновляем recognition: меняем очередь/режим и возвращаем в pending
  UPDATE recognitions
  SET 
    task_queue = v_new_queue,
    validation_mode = v_new_mode,
    workflow_state = 'pending',
    assigned_to = NULL,
    started_at = NULL,
    annotator_notes = COALESCE(annotator_notes || E'\n', '') || 
                      '[' || NOW()::TEXT || '] ' || 
                      p_flag_type || ': ' || COALESCE(p_reason, 'No reason provided')
  WHERE recognition_id = p_recognition_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recognition % not found', p_recognition_id;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION flag_task IS 'Flags a recognition and moves it to appropriate task queue. bbox_error → dish_validation/edit, special queues (check_error, other_items, buzzer) → edit mode';

-- ============================================================================
-- 5. Создаём индексы для эффективной работы с очередями
-- ============================================================================

-- Основной индекс для выборки задач из очереди
CREATE INDEX IF NOT EXISTS idx_recognitions_task_queue 
ON recognitions(task_queue, workflow_state, recognition_date DESC)
WHERE workflow_state IN ('pending', 'in_progress');

-- Индексы для конкретных очередей (для быстрой статистики)
-- dish_validation с учетом режима
CREATE INDEX IF NOT EXISTS idx_recognitions_dish_validation_quick 
ON recognitions(workflow_state, recognition_date DESC) 
WHERE task_queue = 'dish_validation' AND validation_mode = 'quick' AND workflow_state = 'pending';

CREATE INDEX IF NOT EXISTS idx_recognitions_dish_validation_edit 
ON recognitions(workflow_state, recognition_date DESC) 
WHERE task_queue = 'dish_validation' AND validation_mode = 'edit' AND workflow_state = 'pending';

-- Специальные очереди (всегда edit mode)
CREATE INDEX IF NOT EXISTS idx_recognitions_check_error_pending 
ON recognitions(workflow_state, recognition_date DESC) 
WHERE task_queue = 'check_error' AND workflow_state = 'pending';

CREATE INDEX IF NOT EXISTS idx_recognitions_buzzer_pending 
ON recognitions(workflow_state, recognition_date DESC) 
WHERE task_queue = 'buzzer' AND workflow_state = 'pending';

CREATE INDEX IF NOT EXISTS idx_recognitions_other_items_pending 
ON recognitions(workflow_state, recognition_date DESC) 
WHERE task_queue = 'other_items' AND workflow_state = 'pending';

-- Удаляем старые индексы для специфичных состояний (они больше не нужны)
DROP INDEX IF EXISTS idx_recognitions_requires_correction;
DROP INDEX IF EXISTS idx_recognitions_check_error;
DROP INDEX IF EXISTS idx_recognitions_manual_review;
DROP INDEX IF EXISTS idx_recognitions_buzzer;

-- ============================================================================
-- 6. Создаём view для статистики по очередям
-- ============================================================================

CREATE OR REPLACE VIEW task_queue_stats AS
SELECT 
  task_queue,
  workflow_state,
  COUNT(*) as count,
  MIN(recognition_date) as oldest_task,
  MAX(recognition_date) as newest_task
FROM recognitions
GROUP BY task_queue, workflow_state
ORDER BY task_queue, workflow_state;

COMMENT ON VIEW task_queue_stats IS 'Statistics for each task queue and workflow state';

-- ============================================================================
-- Вывод результата
-- ============================================================================

DO $$
DECLARE
  dish_val_quick_count INTEGER;
  dish_val_edit_count INTEGER;
  check_err_count INTEGER;
  buzzer_count INTEGER;
  other_items_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dish_val_quick_count 
  FROM recognitions WHERE task_queue = 'dish_validation' AND validation_mode = 'quick' AND workflow_state = 'pending';
  
  SELECT COUNT(*) INTO dish_val_edit_count 
  FROM recognitions WHERE task_queue = 'dish_validation' AND validation_mode = 'edit' AND workflow_state = 'pending';
  
  SELECT COUNT(*) INTO check_err_count 
  FROM recognitions WHERE task_queue = 'check_error' AND workflow_state = 'pending';
  
  SELECT COUNT(*) INTO buzzer_count 
  FROM recognitions WHERE task_queue = 'buzzer' AND workflow_state = 'pending';
  
  SELECT COUNT(*) INTO other_items_count 
  FROM recognitions WHERE task_queue = 'other_items' AND workflow_state = 'pending';
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Task Queue System Initialized';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Pending tasks:';
  RAISE NOTICE '  📋 dish_validation (quick): %', dish_val_quick_count;
  RAISE NOTICE '  ✏️  dish_validation (edit): %', dish_val_edit_count;
  RAISE NOTICE '  ⚠️  check_error: %', check_err_count;
  RAISE NOTICE '  🔔 buzzer: %', buzzer_count;
  RAISE NOTICE '  📦 other_items: %', other_items_count;
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Architecture:';
  RAISE NOTICE '  - dish_validation: quick + edit modes';
  RAISE NOTICE '  - check_error, buzzer, other_items: edit mode only';
  RAISE NOTICE '  - bbox_error flag → dish_validation/edit';
  RAISE NOTICE '========================================';
END $$;

