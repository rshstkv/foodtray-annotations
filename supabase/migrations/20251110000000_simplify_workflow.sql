-- Упрощение workflow системы для dish_validation
-- Удаляем переусложнённую логику: tier, skip_condition, лишние states/views

-- ============================================================================
-- 0. Удаляем триггеры и функции связанные с tier
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_update_tier ON recognitions;
DROP TRIGGER IF EXISTS trigger_update_tier_on_annotation ON annotations;
DROP FUNCTION IF EXISTS update_recognition_tier() CASCADE;
DROP FUNCTION IF EXISTS update_recognition_tier_on_annotation_change() CASCADE;
DROP FUNCTION IF EXISTS calculate_recognition_tier(TEXT) CASCADE;
DROP FUNCTION IF EXISTS recalculate_recognition_tier(TEXT) CASCADE;
DROP FUNCTION IF EXISTS calculate_tier_correct(TEXT) CASCADE;

-- ============================================================================
-- 1. Удаляем колонку tier из recognitions
-- ============================================================================

ALTER TABLE recognitions DROP COLUMN IF EXISTS tier CASCADE;

-- ============================================================================
-- 2. Добавляем has_check_error флаг
-- ============================================================================

ALTER TABLE recognitions ADD COLUMN IF NOT EXISTS has_check_error BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- 3. Упрощаем workflow_state constraint (только 3 состояния)
-- ============================================================================

ALTER TABLE recognitions DROP CONSTRAINT IF EXISTS recognitions_workflow_state_check;

ALTER TABLE recognitions ADD CONSTRAINT recognitions_workflow_state_check 
CHECK (workflow_state IN ('pending', 'in_progress', 'completed'));

-- ============================================================================
-- 4. Удаляем skip_condition из workflow_stages
-- ============================================================================

ALTER TABLE workflow_stages DROP COLUMN IF EXISTS skip_condition CASCADE;

-- ============================================================================
-- 5. Удаляем лишние views
-- ============================================================================

DROP VIEW IF EXISTS recognitions_check_errors CASCADE;
DROP VIEW IF EXISTS recognitions_dish_corrections CASCADE;
DROP VIEW IF EXISTS recognitions_manual_review CASCADE;

-- ============================================================================
-- 6. Создаём dish_validation если его нет, деактивируем старые task_types
-- ============================================================================

-- Создаём dish_validation если не существует
INSERT INTO task_types (code, name, description, ui_config, is_active) VALUES
('dish_validation', 'Проверка блюд и количества', 'Unified задача проверки bbox и блюд',
'{
  "layout": "dual-image",
  "actions": {
    "bbox_create": true,
    "bbox_delete": true,
    "bbox_assign_dish": true
  },
  "ui": {
    "show_both_images": true,
    "focus_mode": "bbox",
    "simplified_controls": true,
    "auto_next": false
  }
}'::jsonb, TRUE)
ON CONFLICT (code) DO UPDATE SET is_active = TRUE;

-- Создаём workflow_stage для dish_validation
INSERT INTO workflow_stages (task_type_id, stage_order, name, is_optional) VALUES
((SELECT id FROM task_types WHERE code = 'dish_validation'), 0, 'Проверка блюд и количества', FALSE)
ON CONFLICT DO NOTHING;

-- Деактивируем старые task_types
UPDATE task_types SET is_active = FALSE 
WHERE code IN ('count_validation', 'dish_selection', 'bbox_refinement');

-- ============================================================================
-- 7. skip_condition уже удален в шаге 4
-- ============================================================================

-- Ничего не делаем, колонка уже удалена

-- ============================================================================
-- 8. Сбрасываем workflow_state для существующих recognitions
-- ============================================================================

-- Все recognitions с устаревшими states переводим в pending
UPDATE recognitions 
SET workflow_state = 'pending'
WHERE workflow_state NOT IN ('pending', 'in_progress', 'completed');

-- ============================================================================
-- 9. Индексы для оптимизации
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_recognitions_has_check_error 
ON recognitions(has_check_error) 
WHERE has_check_error = TRUE;

CREATE INDEX IF NOT EXISTS idx_recognitions_workflow_simple 
ON recognitions(workflow_state, current_stage_id, started_at);

-- ============================================================================
-- Вывод результата
-- ============================================================================

DO $$
DECLARE
  pending_count INTEGER;
  check_error_count INTEGER;
  active_tasks INTEGER;
BEGIN
  SELECT COUNT(*) INTO pending_count 
  FROM recognitions WHERE workflow_state = 'pending';
  
  SELECT COUNT(*) INTO check_error_count 
  FROM recognitions WHERE has_check_error = TRUE;
  
  SELECT COUNT(*) INTO active_tasks 
  FROM task_types WHERE is_active = TRUE;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Workflow Simplification Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Pending recognitions: %', pending_count;
  RAISE NOTICE 'Check errors: %', check_error_count;
  RAISE NOTICE 'Active task types: %', active_tasks;
  RAISE NOTICE '========================================';
END $$;

