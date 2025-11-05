-- Миграция для создания таблиц workflow системы
-- Создание: task_types, workflow_stages, recognition_history, annotation_corrections

-- 1. Таблица task_types - типы задач для аннотаторов
CREATE TABLE IF NOT EXISTS task_types (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  ui_config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_task_types_code ON task_types(code);
CREATE INDEX IF NOT EXISTS idx_task_types_is_active ON task_types(is_active);

-- Комментарии
COMMENT ON TABLE task_types IS 'Типы задач для аннотаторов с декларативной конфигурацией UI';
COMMENT ON COLUMN task_types.code IS 'Уникальный код задачи (например, count_validation)';
COMMENT ON COLUMN task_types.ui_config IS 'JSON конфигурация UI: layout, actions, ui settings, filters';

-- 2. Таблица workflow_stages - этапы workflow
CREATE TABLE IF NOT EXISTS workflow_stages (
  id SERIAL PRIMARY KEY,
  task_type_id INTEGER NOT NULL REFERENCES task_types(id) ON DELETE CASCADE,
  stage_order INTEGER NOT NULL,
  name TEXT NOT NULL,
  skip_condition JSONB,
  is_optional BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(task_type_id, stage_order)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_workflow_stages_task_type ON workflow_stages(task_type_id);
CREATE INDEX IF NOT EXISTS idx_workflow_stages_order ON workflow_stages(stage_order);

-- Комментарии
COMMENT ON TABLE workflow_stages IS 'Этапы workflow с условиями пропуска';
COMMENT ON COLUMN workflow_stages.skip_condition IS 'JSON условия для автоматического пропуска этапа';
COMMENT ON COLUMN workflow_stages.is_optional IS 'Опциональный этап (можно пропустить вручную)';

-- 3. Таблица recognition_history - версионность изменений
CREATE TABLE IF NOT EXISTS recognition_history (
  id SERIAL PRIMARY KEY,
  recognition_id TEXT NOT NULL,
  stage_id INTEGER REFERENCES workflow_stages(id) ON DELETE SET NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('initial', 'stage_complete', 'correction', 'manual_save')),
  data_snapshot JSONB NOT NULL,
  changes_summary JSONB,
  annotator_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_history_recognition_id ON recognition_history(recognition_id);
CREATE INDEX IF NOT EXISTS idx_history_stage_id ON recognition_history(stage_id);
CREATE INDEX IF NOT EXISTS idx_history_snapshot_type ON recognition_history(snapshot_type);
CREATE INDEX IF NOT EXISTS idx_history_created_at ON recognition_history(created_at DESC);

-- Комментарии
COMMENT ON TABLE recognition_history IS 'История всех изменений recognition с полными snapshots';
COMMENT ON COLUMN recognition_history.data_snapshot IS 'Полный snapshot: {correct_dishes, annotations, status, etc}';
COMMENT ON COLUMN recognition_history.changes_summary IS 'Краткое описание изменений для быстрого просмотра';

-- 4. Таблица annotation_corrections - исправления вне основного flow
CREATE TABLE IF NOT EXISTS annotation_corrections (
  id SERIAL PRIMARY KEY,
  recognition_id TEXT NOT NULL,
  correction_type TEXT NOT NULL,
  source_stage_id INTEGER REFERENCES workflow_stages(id) ON DELETE SET NULL,
  target_stage_id INTEGER REFERENCES workflow_stages(id) ON DELETE SET NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_corrections_recognition_id ON annotation_corrections(recognition_id);
CREATE INDEX IF NOT EXISTS idx_corrections_status ON annotation_corrections(status);
CREATE INDEX IF NOT EXISTS idx_corrections_source_stage ON annotation_corrections(source_stage_id);
CREATE INDEX IF NOT EXISTS idx_corrections_target_stage ON annotation_corrections(target_stage_id);

-- Комментарии
COMMENT ON TABLE annotation_corrections IS 'Отклонения от основного workflow (найденные ошибки на других этапах)';
COMMENT ON COLUMN annotation_corrections.correction_type IS 'Тип ошибки: count_error, wrong_dish, missing_bbox, etc';
COMMENT ON COLUMN annotation_corrections.source_stage_id IS 'На каком этапе обнаружена ошибка';
COMMENT ON COLUMN annotation_corrections.target_stage_id IS 'На какой этап нужно вернуться для исправления';

