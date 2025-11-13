-- Миграция для Unified Annotation Engine
-- Добавляет новые поля в таблицу annotations с обратной совместимостью

-- 1. Добавляем новые поля в таблицу annotations
ALTER TABLE annotations
  ADD COLUMN IF NOT EXISTS item_id UUID,  -- Ссылка на Item (унифицированный подход)
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE,  -- Создано/изменено вручную
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE,  -- Запрет редактирования
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;  -- Версионность

-- 2. Создаем индексы для производительности
CREATE INDEX IF NOT EXISTS idx_annotations_item_id ON annotations(item_id);
CREATE INDEX IF NOT EXISTS idx_annotations_is_manual ON annotations(is_manual) WHERE is_manual = TRUE;
CREATE INDEX IF NOT EXISTS idx_annotations_version ON annotations(version);

-- 3. Обновляем существующие записи: is_manual = TRUE если source = 'manual'
UPDATE annotations
SET is_manual = (source = 'manual')
WHERE is_manual IS NULL OR is_manual = FALSE;

-- 4. Создаем таблицу для Items (унифицированная модель)
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('dish', 'plate', 'buzzer', 'bottle', 'nonfood')),
  name TEXT NOT NULL,
  expected_count INT,
  source TEXT NOT NULL CHECK (source IN ('receipt', 'menu', 'qwen')),
  is_manual BOOLEAN DEFAULT FALSE,
  pairing_required BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для items
CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
CREATE INDEX IF NOT EXISTS idx_items_is_manual ON items(is_manual) WHERE is_manual = TRUE;

-- 5. Создаем таблицу для Snapshots (для Reset функционала)
CREATE TABLE IF NOT EXISTS annotation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id TEXT NOT NULL,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  items JSONB NOT NULL,  -- Массив Items
  annotations JSONB NOT NULL,  -- Массив Annotations
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Индексы для snapshots
CREATE INDEX IF NOT EXISTS idx_snapshots_task_id ON annotation_snapshots(task_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_step_id ON annotation_snapshots(step_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_unique_step_task 
  ON annotation_snapshots(task_id, step_id);

-- 6. Функция для автообновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для annotations
DROP TRIGGER IF EXISTS update_annotations_updated_at ON annotations;
CREATE TRIGGER update_annotations_updated_at
  BEFORE UPDATE ON annotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Триггер для items
DROP TRIGGER IF EXISTS update_items_updated_at ON items;
CREATE TRIGGER update_items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. Комментарии для документации
COMMENT ON COLUMN annotations.item_id IS 'Ссылка на Item (унифицированный подход) - NEW';
COMMENT ON COLUMN annotations.is_manual IS 'TRUE если создано/изменено вручную пользователем - NEW';
COMMENT ON COLUMN annotations.is_locked IS 'Запрет редактирования (для overlaps этапа) - NEW';
COMMENT ON COLUMN annotations.version IS 'Версия аннотации (инкрементируется при каждом изменении) - NEW';

COMMENT ON TABLE items IS 'Унифицированная модель для Dish/Plate/Buzzer/Bottle - NEW';
COMMENT ON TABLE annotation_snapshots IS 'Snapshots для Reset функционала (откат к Qwen) - NEW';

-- 8. RLS Policies (если включены)
-- Пока оставляем без RLS, но можно добавить позже
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotation_snapshots ENABLE ROW LEVEL SECURITY;

-- Политики для items (все могут читать, только authenticated могут изменять)
DROP POLICY IF EXISTS "items_select_policy" ON items;
CREATE POLICY "items_select_policy" ON items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "items_insert_policy" ON items;
CREATE POLICY "items_insert_policy" ON items FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "items_update_policy" ON items;
CREATE POLICY "items_update_policy" ON items FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "items_delete_policy" ON items;
CREATE POLICY "items_delete_policy" ON items FOR DELETE TO authenticated USING (true);

-- Политики для snapshots
DROP POLICY IF EXISTS "snapshots_select_policy" ON annotation_snapshots;
CREATE POLICY "snapshots_select_policy" ON annotation_snapshots FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "snapshots_insert_policy" ON annotation_snapshots;
CREATE POLICY "snapshots_insert_policy" ON annotation_snapshots FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "snapshots_delete_policy" ON annotation_snapshots;
CREATE POLICY "snapshots_delete_policy" ON annotation_snapshots FOR DELETE TO authenticated USING (true);

