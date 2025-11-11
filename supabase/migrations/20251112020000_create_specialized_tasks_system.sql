-- ============================================================================
-- Создание системы автоматического создания специализированных задач
-- ============================================================================
-- Когда dish_validation задача завершается (completed), автоматически создаются
-- задачи для специализированных очередей: other_items, overlap_marking, non_food_objects
-- Для bottle_orientation - только если в чеке есть EAN из bottle_orientation_eans

-- ============================================================================
-- 1. Создать таблицу recognition_task_progress
-- ============================================================================

CREATE TABLE IF NOT EXISTS recognition_task_progress (
  id SERIAL PRIMARY KEY,
  recognition_id TEXT NOT NULL REFERENCES recognitions(recognition_id) ON DELETE CASCADE,
  task_queue TEXT NOT NULL CHECK (task_queue IN ('bottle_orientation', 'other_items', 'overlap_marking', 'non_food_objects')),
  workflow_state TEXT NOT NULL DEFAULT 'pending' CHECK (workflow_state IN ('pending', 'in_progress', 'completed', 'skipped')),
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recognition_id, task_queue)
);

CREATE INDEX IF NOT EXISTS idx_rtp_recognition_id ON recognition_task_progress(recognition_id);
CREATE INDEX IF NOT EXISTS idx_rtp_task_queue ON recognition_task_progress(task_queue);
CREATE INDEX IF NOT EXISTS idx_rtp_workflow_state ON recognition_task_progress(workflow_state);
CREATE INDEX IF NOT EXISTS idx_rtp_assigned_to ON recognition_task_progress(assigned_to);
CREATE INDEX IF NOT EXISTS idx_rtp_queue_state_assigned ON recognition_task_progress(task_queue, workflow_state, assigned_to);

COMMENT ON TABLE recognition_task_progress IS 'Прогресс выполнения специализированных задач для каждого recognition. Создается автоматически при завершении dish_validation.';
COMMENT ON COLUMN recognition_task_progress.task_queue IS 'Тип специализированной задачи';
COMMENT ON COLUMN recognition_task_progress.workflow_state IS 'Состояние задачи: pending, in_progress, completed, skipped';
COMMENT ON COLUMN recognition_task_progress.assigned_to IS 'Пользователь которому назначена задача';

-- ============================================================================
-- 2. Функция для проверки наличия EAN из bottle_orientation_eans в чеке
-- ============================================================================

CREATE OR REPLACE FUNCTION has_bottle_orientation_ean(p_recognition_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_ean BOOLEAN;
BEGIN
  -- Проверяем есть ли в correct_dishes хотя бы одно блюдо с EAN из bottle_orientation_eans
  SELECT EXISTS(
    SELECT 1
    FROM recognitions r,
         jsonb_array_elements(r.correct_dishes) AS dish,
         jsonb_array_elements(dish->'Dishes') AS dish_item,
         bottle_orientation_eans boe
    WHERE r.recognition_id = p_recognition_id
      AND dish_item->>'ExternalId' = boe.ean
  ) INTO v_has_ean;
  
  RETURN v_has_ean;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION has_bottle_orientation_ean(TEXT) IS 
  'Проверяет наличие в чеке блюд с EAN из списка bottle_orientation_eans';

-- ============================================================================
-- 3. Функция-триггер для автоматического создания специализированных задач
-- ============================================================================

CREATE OR REPLACE FUNCTION create_specialized_tasks_on_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- Проверяем что задача dish_validation завершена
  IF NEW.workflow_state = 'completed' 
     AND NEW.task_queue = 'dish_validation' 
     AND (OLD.workflow_state IS NULL OR OLD.workflow_state != 'completed') THEN
    
    -- Создаем задачи для обязательных специализированных очередей
    INSERT INTO recognition_task_progress (recognition_id, task_queue, workflow_state)
    VALUES 
      (NEW.recognition_id, 'other_items', 'pending'),
      (NEW.recognition_id, 'overlap_marking', 'pending'),
      (NEW.recognition_id, 'non_food_objects', 'pending')
    ON CONFLICT (recognition_id, task_queue) DO NOTHING;
    
    -- Создаем задачу для bottle_orientation только если есть подходящие EAN
    IF has_bottle_orientation_ean(NEW.recognition_id) THEN
      INSERT INTO recognition_task_progress (recognition_id, task_queue, workflow_state)
      VALUES (NEW.recognition_id, 'bottle_orientation', 'pending')
      ON CONFLICT (recognition_id, task_queue) DO NOTHING;
    END IF;
    
    RAISE NOTICE 'Created specialized tasks for recognition %', NEW.recognition_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_specialized_tasks_on_completion() IS 
  'Триггер: при завершении dish_validation создает записи в recognition_task_progress для специализированных очередей';

-- ============================================================================
-- 4. Создать триггер на recognitions
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_create_specialized_tasks ON recognitions;

CREATE TRIGGER trigger_create_specialized_tasks
  AFTER INSERT OR UPDATE OF workflow_state ON recognitions
  FOR EACH ROW
  EXECUTE FUNCTION create_specialized_tasks_on_completion();

COMMENT ON TRIGGER trigger_create_specialized_tasks ON recognitions IS 
  'Автоматически создает специализированные задачи при завершении dish_validation';

-- ============================================================================
-- 5. Создать специализированные задачи для уже существующих completed recognitions
-- ============================================================================

-- Для всех completed dish_validation задач создаем записи в recognition_task_progress
INSERT INTO recognition_task_progress (recognition_id, task_queue, workflow_state)
SELECT 
  r.recognition_id,
  queue.task_queue,
  'pending' AS workflow_state
FROM recognitions r
CROSS JOIN (
  VALUES 
    ('other_items'),
    ('overlap_marking'),
    ('non_food_objects')
) AS queue(task_queue)
WHERE r.workflow_state = 'completed'
  AND r.task_queue = 'dish_validation'
ON CONFLICT (recognition_id, task_queue) DO NOTHING;

-- Для bottle_orientation создаем только если есть подходящие EAN
INSERT INTO recognition_task_progress (recognition_id, task_queue, workflow_state)
SELECT DISTINCT
  r.recognition_id,
  'bottle_orientation' AS task_queue,
  'pending' AS workflow_state
FROM recognitions r
WHERE r.workflow_state = 'completed'
  AND r.task_queue = 'dish_validation'
  AND has_bottle_orientation_ean(r.recognition_id)
ON CONFLICT (recognition_id, task_queue) DO NOTHING;

-- Логирование результатов
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM recognition_task_progress;
  RAISE NOTICE 'Created % specialized task records', v_count;
END $$;

