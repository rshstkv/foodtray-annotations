-- Рефакторинг workflow системы
-- 1. Unified Validation (count_validation + dish_selection)
-- 2. Error Flows (check_error, dish_correction, manual_review)
-- 3. Bottle Orientation with dish_codes

-- ============================================================================
-- 1. Unified Validation
-- ============================================================================

-- Обновить task_type: count_validation → dish_validation
UPDATE task_types 
SET 
  code = 'dish_validation',
  name = 'Проверка блюд и количества',
  description = 'Проверка правильности bbox и соответствия блюдам из чека',
  ui_config = '{
    "layout": "dual-image",
    "actions": {
      "bbox_create": true,
      "bbox_delete": true,
      "bbox_assign_dish": true,
      "correct_dish_change_count": true
    },
    "ui": {
      "show_both_images": true,
      "focus_mode": "bbox",
      "sync_dish_highlight": true,
      "buttons": ["approve", "dish_error", "check_error", "full_editor", "manual_review"],
      "simplified_controls": true,
      "auto_next": false
    }
  }'::jsonb
WHERE code = 'count_validation';

-- Обновить workflow_stage соответственно
UPDATE workflow_stages
SET name = 'Проверка блюд и количества'
WHERE task_type_id = (SELECT id FROM task_types WHERE code = 'dish_validation');

-- Удалить dish_selection (теперь часть unified validation)
DELETE FROM workflow_stages 
WHERE task_type_id = (SELECT id FROM task_types WHERE code = 'dish_selection');

DELETE FROM task_types 
WHERE code = 'dish_selection';

-- ============================================================================
-- 2. Error Flow States
-- ============================================================================

-- Обновить constraint для workflow_state (добавить новые состояния)
ALTER TABLE recognitions 
DROP CONSTRAINT IF EXISTS recognitions_workflow_state_check;

ALTER TABLE recognitions 
ADD CONSTRAINT recognitions_workflow_state_check 
CHECK (workflow_state IN (
  'pending', 
  'in_progress', 
  'completed', 
  'requires_correction',
  'check_error_pending',
  'dish_correction_pending',
  'manual_review_pending'
));

-- Создать views для каждой очереди ошибок
CREATE OR REPLACE VIEW recognitions_check_errors AS
SELECT r.*, 
       COUNT(ri.id) as image_count,
       COUNT(a.id) as annotation_count
FROM recognitions r
LEFT JOIN recognition_images ri ON r.recognition_id = ri.recognition_id
LEFT JOIN annotations a ON ri.id = a.image_id
WHERE r.workflow_state = 'check_error_pending'
GROUP BY r.id, r.recognition_id, r.recognition_date, r.status, r.is_mistake, 
         r.correct_dishes, r.menu_all, r.tier, r.workflow_state, 
         r.current_stage_id, r.completed_stages, r.assigned_to, 
         r.started_at, r.completed_at, r.annotator_notes, 
         r.created_at, r.updated_at;

CREATE OR REPLACE VIEW recognitions_dish_corrections AS
SELECT r.*, 
       COUNT(ri.id) as image_count,
       COUNT(a.id) as annotation_count
FROM recognitions r
LEFT JOIN recognition_images ri ON r.recognition_id = ri.recognition_id
LEFT JOIN annotations a ON ri.id = a.image_id
WHERE r.workflow_state = 'dish_correction_pending'
GROUP BY r.id, r.recognition_id, r.recognition_date, r.status, r.is_mistake, 
         r.correct_dishes, r.menu_all, r.tier, r.workflow_state, 
         r.current_stage_id, r.completed_stages, r.assigned_to, 
         r.started_at, r.completed_at, r.annotator_notes, 
         r.created_at, r.updated_at;

CREATE OR REPLACE VIEW recognitions_manual_review AS
SELECT r.*, 
       COUNT(ri.id) as image_count,
       COUNT(a.id) as annotation_count
FROM recognitions r
LEFT JOIN recognition_images ri ON r.recognition_id = ri.recognition_id
LEFT JOIN annotations a ON ri.id = a.image_id
WHERE r.workflow_state = 'manual_review_pending'
GROUP BY r.id, r.recognition_id, r.recognition_date, r.status, r.is_mistake, 
         r.correct_dishes, r.menu_all, r.tier, r.workflow_state, 
         r.current_stage_id, r.completed_stages, r.assigned_to, 
         r.started_at, r.completed_at, r.annotator_notes, 
         r.created_at, r.updated_at;

-- ============================================================================
-- 3. Bottle Orientation with dish_codes
-- ============================================================================

-- Создать таблицу dish_metadata для связи dish_name → dish_code
CREATE TABLE IF NOT EXISTS dish_metadata (
  id SERIAL PRIMARY KEY,
  dish_name TEXT NOT NULL UNIQUE,
  dish_code TEXT NOT NULL,
  dish_category TEXT,
  requires_orientation_check BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_dish_metadata_dish_code ON dish_metadata(dish_code);
CREATE INDEX IF NOT EXISTS idx_dish_metadata_category ON dish_metadata(dish_category);

-- Seed данные для bottle_orientation
INSERT INTO dish_metadata (dish_name, dish_code, dish_category, requires_orientation_check) VALUES
('Бутылка вина', 'wine_bottle', 'beverages', true),
('Бутылка пива', 'beer_bottle', 'beverages', true),
('Банка', 'can', 'beverages', true)
ON CONFLICT (dish_name) DO UPDATE SET
  dish_code = EXCLUDED.dish_code,
  dish_category = EXCLUDED.dish_category,
  requires_orientation_check = EXCLUDED.requires_orientation_check;

-- Обновить ui_config для bottle_orientation
UPDATE task_types 
SET ui_config = jsonb_set(
  ui_config,
  '{filters,dish_codes}',
  '["wine_bottle", "beer_bottle", "can"]'::jsonb
)
WHERE code = 'bottle_orientation';

-- ============================================================================
-- Комментарии
-- ============================================================================

COMMENT ON VIEW recognitions_check_errors IS 'Recognitions с ошибками в исходных данных (чеке)';
COMMENT ON VIEW recognitions_dish_corrections IS 'Recognitions с ошибками определения блюд AI';
COMMENT ON VIEW recognitions_manual_review IS 'Recognitions требующие ручного ревью (сложные случаи)';
COMMENT ON TABLE dish_metadata IS 'Метаданные блюд для фильтрации задач';

-- Вывод результата
DO $$
DECLARE
  dish_validation_id INTEGER;
  bottle_orientation_id INTEGER;
BEGIN
  SELECT id INTO dish_validation_id FROM task_types WHERE code = 'dish_validation';
  SELECT id INTO bottle_orientation_id FROM task_types WHERE code = 'bottle_orientation';
  
  RAISE NOTICE 'Migration completed successfully';
  RAISE NOTICE 'Dish validation task_type_id: %', dish_validation_id;
  RAISE NOTICE 'Bottle orientation task_type_id: %', bottle_orientation_id;
END $$;

