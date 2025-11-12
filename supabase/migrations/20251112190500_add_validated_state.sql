-- =====================================================
-- Add validated_state system for tracking validation history
-- =====================================================
-- Добавляет систему хранения валидированного состояния:
-- - validated_state: JSON с snapshot'ами после каждого этапа
-- - custom_dish_name: для разрешенных неопределенностей
-- - changes_log: история изменений (delta)

-- =====================================================
-- 1. Add validated_state to tasks table
-- =====================================================

ALTER TABLE tasks 
ADD COLUMN validated_state JSONB DEFAULT '{"steps": {}, "current_draft": null}';

COMMENT ON COLUMN tasks.validated_state IS 
'Валидированное состояние задачи после каждого этапа.
Структура:
{
  "steps": {
    "step_id": {
      "validated_at": "2025-11-12T19:00:00Z",
      "validated_by": "user_uuid",
      "snapshot": {
        "dishes": [...],
        "annotations": {"image_id": [...]}
      },
      "changes_log": [...]
    }
  },
  "current_draft": {
    "step_id": "current_step",
    "changes_log": [...]
  }
}';

-- Index for fast access to validated tasks
CREATE INDEX idx_tasks_validated_state 
ON tasks USING gin(validated_state);

-- =====================================================
-- 2. Add custom_dish_name to annotations table
-- =====================================================

ALTER TABLE annotations 
ADD COLUMN custom_dish_name TEXT;

COMMENT ON COLUMN annotations.custom_dish_name IS 
'Название блюда для:
1. Разрешенных неопределенностей (когда выбрано одно из нескольких вариантов)
2. Блюд добавленных из меню (не из чека)';

-- Index for searching by custom dish name
CREATE INDEX idx_annotations_custom_dish_name 
ON annotations(custom_dish_name) 
WHERE custom_dish_name IS NOT NULL;

-- =====================================================
-- 3. Update trigger to track validated_state updates
-- =====================================================

CREATE OR REPLACE FUNCTION update_validated_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  -- Автоматически обновляем updated_at при изменении validated_state
  IF NEW.validated_state IS DISTINCT FROM OLD.validated_state THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tasks_validated_state_update
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_validated_state_timestamp();

-- =====================================================
-- 4. Migration notes
-- =====================================================

-- Note: Existing tasks will have validated_state = {"steps": {}, "current_draft": null}
-- This is correct - they don't have validation history yet
-- When they complete a step, the snapshot will be created

-- Note: Existing annotations will have custom_dish_name = NULL
-- This is correct - they were created before this feature
-- New annotations from ambiguity resolution will have this field populated

