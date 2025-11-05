-- Миграция для добавления полей workflow в таблицу recognitions

-- Добавляем новые поля
ALTER TABLE recognitions 
ADD COLUMN IF NOT EXISTS tier INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS workflow_state TEXT DEFAULT 'pending' CHECK (workflow_state IN ('pending', 'in_progress', 'completed', 'requires_correction')),
ADD COLUMN IF NOT EXISTS current_stage_id INTEGER REFERENCES workflow_stages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS completed_stages INTEGER[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS assigned_to TEXT,
ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Создаем индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_recognitions_tier ON recognitions(tier);
CREATE INDEX IF NOT EXISTS idx_recognitions_workflow_state ON recognitions(workflow_state);
CREATE INDEX IF NOT EXISTS idx_recognitions_current_stage ON recognitions(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_recognitions_assigned_to ON recognitions(assigned_to);

-- Индекс для приоритизации (tier + date)
CREATE INDEX IF NOT EXISTS idx_recognitions_priority ON recognitions(tier, recognition_date DESC);

-- Комментарии
COMMENT ON COLUMN recognitions.tier IS 'Уровень сложности (1-5), вычисляется автоматически';
COMMENT ON COLUMN recognitions.workflow_state IS 'Текущее состояние в workflow: pending, in_progress, completed, requires_correction';
COMMENT ON COLUMN recognitions.current_stage_id IS 'ID текущего этапа workflow';
COMMENT ON COLUMN recognitions.completed_stages IS 'Массив ID завершенных этапов';
COMMENT ON COLUMN recognitions.assigned_to IS 'ID аннотатора (опционально, для будущего использования)';
COMMENT ON COLUMN recognitions.started_at IS 'Когда начата работа над recognition';
COMMENT ON COLUMN recognitions.completed_at IS 'Когда завершена вся работа';

