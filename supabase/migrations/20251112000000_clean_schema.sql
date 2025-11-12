-- =====================================================
-- CLEAN SLATE: Annotation System Schema
-- =====================================================
-- Чистая схема без legacy для системы аннотаций подносов
-- Удалены: clarifications, recognition_task_progress, validation_mode

-- =====================================================
-- 0. PROFILES: Пользователи системы
-- =====================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'annotator', 'viewer')),
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_email ON profiles(email);

COMMENT ON TABLE profiles IS 'Профили пользователей с ролями';

-- =====================================================
-- 1. RECOGNITIONS: Сырые данные распознавания (immutable)
-- =====================================================

CREATE TABLE recognitions (
  recognition_id TEXT PRIMARY KEY,
  recognition_date DATE NOT NULL,
  
  -- Данные из чека (JSONB)
  correct_dishes JSONB NOT NULL DEFAULT '[]',  -- [{name, count, price, ...}]
  menu_all JSONB DEFAULT '[]',                 -- Полное меню если есть
  
  -- Метаданные
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recognitions_date ON recognitions(recognition_date);

COMMENT ON TABLE recognitions IS 'Сырые данные распознавания от QWEN (immutable)';
COMMENT ON COLUMN recognitions.correct_dishes IS 'Массив блюд из чека [{name, count, price, ...}]';

-- =====================================================
-- 2. IMAGES: Изображения подносов
-- =====================================================

CREATE TABLE images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recognition_id TEXT NOT NULL REFERENCES recognitions(recognition_id) ON DELETE CASCADE,
  
  image_type TEXT NOT NULL CHECK (image_type IN ('main', 'quality')),
  storage_path TEXT NOT NULL,
  
  -- Оригинальные аннотации QWEN (immutable, для сравнения)
  original_annotations JSONB DEFAULT '[]',  -- [{bbox, object_type, ...}]
  
  width INT,
  height INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_images_recognition ON images(recognition_id);
CREATE INDEX idx_images_type ON images(image_type);

COMMENT ON TABLE images IS 'Изображения подносов (main и quality фото)';
COMMENT ON COLUMN images.original_annotations IS 'Оригинальные аннотации QWEN для сравнения';

-- =====================================================
-- 3. ANNOTATIONS: Результат работы аннотаторов
-- =====================================================

CREATE TABLE annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  
  -- Bounding box координаты (normalized 0-1)
  bbox_x1 REAL NOT NULL CHECK (bbox_x1 >= 0 AND bbox_x1 <= 1),
  bbox_y1 REAL NOT NULL CHECK (bbox_y1 >= 0 AND bbox_y1 <= 1),
  bbox_x2 REAL NOT NULL CHECK (bbox_x2 >= 0 AND bbox_x2 <= 1),
  bbox_y2 REAL NOT NULL CHECK (bbox_y2 >= 0 AND bbox_y2 <= 1),
  
  -- Классификация
  object_type TEXT NOT NULL CHECK (object_type IN ('dish', 'plate', 'buzzer', 'bottle', 'nonfood')),
  object_subtype TEXT,  -- 'vertical', 'horizontal' (для bottle), 'cup', 'cutlery' (для nonfood), etc.
  dish_index INT,       -- Связь с correct_dishes[dish_index]
  
  -- Дополнительные флаги
  is_overlapped BOOLEAN DEFAULT FALSE,  -- Для dish: перекрыто другим объектом
  
  -- Аудит: КТО создал/изменил
  source TEXT DEFAULT 'manual' CHECK (source IN ('qwen_auto', 'manual')),
  created_by UUID REFERENCES auth.users(id),  -- NULL если qwen_auto
  updated_by UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Soft delete (вместо DELETE делаем UPDATE is_deleted=true)
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_annotations_image ON annotations(image_id);
CREATE INDEX idx_annotations_type ON annotations(object_type) WHERE NOT is_deleted;
CREATE INDEX idx_annotations_dish ON annotations(dish_index) WHERE dish_index IS NOT NULL AND NOT is_deleted;
CREATE INDEX idx_annotations_active ON annotations(image_id) WHERE NOT is_deleted;
CREATE INDEX idx_annotations_source ON annotations(source);

COMMENT ON TABLE annotations IS 'Аннотации bbox от людей и QWEN';
COMMENT ON COLUMN annotations.source IS 'qwen_auto = от QWEN, manual = от человека';
COMMENT ON COLUMN annotations.is_deleted IS 'Soft delete для возможности отката';

-- Trigger: auto update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_annotations_updated_at
  BEFORE UPDATE ON annotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 4. TASKS: Задачи для аннотаторов (workflow)
-- =====================================================

CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'skipped');

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recognition_id TEXT NOT NULL REFERENCES recognitions(recognition_id) ON DELETE CASCADE,
  
  -- Назначение
  assigned_to UUID REFERENCES auth.users(id),
  
  -- Что нужно проверить (гибкий scope с этапами)
  task_scope JSONB NOT NULL DEFAULT '{
    "steps": [
      {
        "id": "validate_dishes",
        "name": "Проверка блюд с чеком",
        "type": "validation",
        "required": true,
        "allow_drawing": true,
        "allow_menu_edit": false,
        "checks": ["all_dishes_have_bbox", "dish_count_matches_receipt"]
      },
      {
        "id": "check_overlaps",
        "name": "Отметка перекрытий",
        "type": "annotation",
        "required": false,
        "allow_drawing": false,
        "checks": ["overlapped_dishes_marked"]
      },
      {
        "id": "validate_buzzers",
        "name": "Проверка buzzers",
        "type": "annotation",
        "required": false,
        "allow_drawing": true,
        "checks": ["at_least_one_buzzer"]
      },
      {
        "id": "validate_bottles",
        "name": "Ориентация бутылок",
        "type": "annotation",
        "required": false,
        "allow_drawing": true,
        "checks": ["bottles_have_orientation"]
      },
      {
        "id": "validate_nonfood",
        "name": "Другие предметы",
        "type": "annotation",
        "required": false,
        "allow_drawing": true,
        "checks": ["nonfood_items_marked"]
      },
      {
        "id": "validate_plates",
        "name": "Проверка plates",
        "type": "annotation",
        "required": false,
        "allow_drawing": false,
        "checks": ["plates_count_reasonable"]
      }
    ],
    "allow_menu_edit": false
  }',
  
  -- Прогресс выполнения этапов
  progress JSONB DEFAULT '{
    "current_step_index": 0,
    "steps": []
  }',
  
  -- Workflow статус
  status task_status NOT NULL DEFAULT 'pending',
  
  -- Приоритет (1=высокий/quick, 2=средний, 3=низкий/сложный)
  priority INT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  
  -- Временные метки
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,   -- Когда начали работу
  completed_at TIMESTAMPTZ, -- Когда завершили
  
  -- Аудит
  created_by UUID REFERENCES auth.users(id),  -- Админ который назначил
  completed_by UUID REFERENCES auth.users(id), -- Кто выполнил
  
  -- Причина пропуска (если skipped)
  skipped_reason TEXT,
  skipped_at TIMESTAMPTZ
);

CREATE INDEX idx_tasks_recognition ON tasks(recognition_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to) WHERE status != 'completed';
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority, created_at) WHERE status = 'pending';
CREATE INDEX idx_tasks_assigned_pending ON tasks(assigned_to, priority) WHERE status = 'pending';

COMMENT ON TABLE tasks IS 'Задачи для аннотаторов с этапами (steps)';
COMMENT ON COLUMN tasks.task_scope IS 'JSONB с этапами: steps=[{id, name, type, allow_drawing, allow_menu_edit, checks}], allow_menu_edit';
COMMENT ON COLUMN tasks.progress IS 'JSONB с прогрессом: { current_step_index, steps: [{ id, status, completed_at }] }';
COMMENT ON COLUMN tasks.priority IS '1=быстрая валидация (quick), 2=средняя правка, 3=сложная правка';

-- Trigger: auto set started_at when status -> in_progress
CREATE OR REPLACE FUNCTION auto_set_started_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status = 'pending' AND NEW.started_at IS NULL THEN
    NEW.started_at = NOW();
  END IF;
  
  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at = NOW();
  END IF;
  
  IF NEW.status = 'skipped' AND NEW.skipped_at IS NULL THEN
    NEW.skipped_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tasks_status_timestamps
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION auto_set_started_at();

-- =====================================================
-- 5. ANNOTATION_HISTORY: Аудит изменений (опционально)
-- =====================================================

CREATE TYPE history_change_type AS ENUM ('create', 'update', 'delete');

CREATE TABLE annotation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annotation_id UUID NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  
  -- Что изменилось
  change_type history_change_type NOT NULL,
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  
  -- До/После (для диффа)
  before_value JSONB,  -- Старое состояние {bbox, type, ...}
  after_value JSONB,   -- Новое состояние
  
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_history_annotation ON annotation_history(annotation_id, changed_at);
CREATE INDEX idx_history_user ON annotation_history(changed_by);
CREATE INDEX idx_history_change_type ON annotation_history(change_type);

COMMENT ON TABLE annotation_history IS 'История изменений аннотаций для аудита';

-- =====================================================
-- 6. STORAGE: Bucket для изображений
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bbox-images',
  'bbox-images',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: public read
CREATE POLICY "Public read access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bbox-images');

-- Storage policy: authenticated users can upload
CREATE POLICY "Authenticated users can upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'bbox-images' 
    AND auth.role() = 'authenticated'
  );

-- =====================================================
-- 7. RLS (Row Level Security)
-- =====================================================

-- TASKS: Пользователи видят только свои задачи
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own tasks"
  ON tasks FOR SELECT
  USING (assigned_to = auth.uid());

CREATE POLICY "Users update their own tasks"
  ON tasks FOR UPDATE
  USING (assigned_to = auth.uid());

-- Админы видят все задачи
CREATE POLICY "Admins see all tasks"
  ON tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- ANNOTATIONS: Пользователи могут работать с аннотациями своих задач
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create annotations"
  ON annotations FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    OR auth.uid() IN (
      SELECT assigned_to FROM tasks t
      JOIN images i ON i.recognition_id = t.recognition_id
      WHERE i.id = image_id
    )
  );

CREATE POLICY "Users can update annotations"
  ON annotations FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT assigned_to FROM tasks t
      JOIN images i ON i.recognition_id = t.recognition_id
      WHERE i.id = annotations.image_id
    )
  );

CREATE POLICY "Users can view annotations for their tasks"
  ON annotations FOR SELECT
  USING (
    auth.uid() IN (
      SELECT assigned_to FROM tasks t
      JOIN images i ON i.recognition_id = t.recognition_id
      WHERE i.id = annotations.image_id
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- RECOGNITIONS, IMAGES: Только чтение для аннотаторов
ALTER TABLE recognitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view recognitions for their tasks"
  ON recognitions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE recognition_id = recognitions.recognition_id
      AND assigned_to = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

ALTER TABLE images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view images for their tasks"
  ON images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE recognition_id = images.recognition_id
      AND assigned_to = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- =====================================================
-- 8. HELPER FUNCTIONS
-- =====================================================

-- Функция расчета priority для задачи (заменяет validation_mode)
CREATE OR REPLACE FUNCTION calculate_task_priority(
  p_recognition_id TEXT
) RETURNS INT AS $$
DECLARE
  v_main_dishes INT;
  v_qual_dishes INT;
  v_expected_count INT;
  v_main_plates INT;
  v_qual_plates INT;
BEGIN
  -- Подсчитываем блюда (dish)
  SELECT 
    COUNT(*) FILTER (WHERE i.image_type = 'main'),
    COUNT(*) FILTER (WHERE i.image_type = 'quality')
  INTO v_main_dishes, v_qual_dishes
  FROM images i
  JOIN annotations a ON a.image_id = i.id
  WHERE i.recognition_id = p_recognition_id
    AND a.object_type = 'dish'
    AND NOT a.is_deleted;
  
  -- Ожидаемое количество из чека
  SELECT COALESCE(jsonb_array_length(correct_dishes), 0)
  INTO v_expected_count
  FROM recognitions
  WHERE recognition_id = p_recognition_id;
  
  -- Подсчитываем тарелки (plate)
  SELECT 
    COUNT(*) FILTER (WHERE i.image_type = 'main'),
    COUNT(*) FILTER (WHERE i.image_type = 'quality')
  INTO v_main_plates, v_qual_plates
  FROM images i
  JOIN annotations a ON a.image_id = i.id
  WHERE i.recognition_id = p_recognition_id
    AND a.object_type = 'plate'
    AND NOT a.is_deleted;
  
  -- ЛОГИКА ПРИОРИТЕТА:
  -- 1 = Быстрая валидация (всё совпадает)
  -- 2 = Нужна небольшая правка (разница ±1)
  -- 3 = Нужна большая правка (разница >1)
  
  IF v_main_dishes = v_expected_count 
     AND v_qual_dishes = v_expected_count
     AND v_main_plates = v_qual_plates THEN
    RETURN 1;  -- QUICK validation
  ELSIF ABS(v_main_dishes - v_expected_count) <= 1 THEN
    RETURN 2;  -- MEDIUM edit
  ELSE
    RETURN 3;  -- HEAVY edit
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_task_priority IS 'Рассчитывает priority для задачи: 1=quick, 2=medium, 3=heavy';

-- Функция создания задачи с автоматическим priority
CREATE OR REPLACE FUNCTION create_task_with_priority(
  p_recognition_id TEXT,
  p_assigned_to UUID,
  p_task_scope JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_task_id UUID;
  v_priority INT;
BEGIN
  -- Рассчитать priority
  v_priority := calculate_task_priority(p_recognition_id);
  
  -- Создать задачу
  INSERT INTO tasks (
    recognition_id,
    assigned_to,
    task_scope,
    priority,
    status
  ) VALUES (
    p_recognition_id,
    p_assigned_to,
    COALESCE(p_task_scope, '{
      "steps": [
        {"id": "validate_dishes", "name": "Проверка блюд с чеком", "type": "validation", "required": true, "allow_drawing": true, "allow_menu_edit": false},
        {"id": "check_overlaps", "name": "Отметка перекрытий", "type": "annotation", "required": false, "allow_drawing": false},
        {"id": "validate_buzzers", "name": "Проверка buzzers", "type": "annotation", "required": false, "allow_drawing": true},
        {"id": "validate_bottles", "name": "Ориентация бутылок", "type": "annotation", "required": false, "allow_drawing": true},
        {"id": "validate_nonfood", "name": "Другие предметы", "type": "annotation", "required": false, "allow_drawing": true},
        {"id": "validate_plates", "name": "Проверка plates", "type": "annotation", "required": false, "allow_drawing": false}
      ],
      "allow_menu_edit": false
    }'::jsonb),
    v_priority,
    'pending'
  ) RETURNING id INTO v_task_id;
  
  RETURN v_task_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_task_with_priority IS 'Создает задачу с автоматическим расчетом priority';

-- Функция получения следующей задачи для пользователя
CREATE OR REPLACE FUNCTION get_next_task(p_user_id UUID)
RETURNS TABLE (
  task_id UUID,
  recognition_id TEXT,
  priority INT,
  task_scope JSONB,
  progress JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.recognition_id,
    t.priority,
    t.task_scope,
    t.progress
  FROM tasks t
  WHERE t.assigned_to = p_user_id
    AND t.status = 'pending'
  ORDER BY t.priority ASC, t.created_at ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_next_task IS 'Получить следующую задачу для пользователя (сортировка по priority)';

-- =====================================================
-- 9. VIEWS для статистики
-- =====================================================

CREATE OR REPLACE VIEW task_stats AS
SELECT 
  assigned_to,
  status,
  priority,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds
FROM tasks
GROUP BY assigned_to, status, priority;

COMMENT ON VIEW task_stats IS 'Статистика задач по пользователям';

-- =====================================================
-- ✅ MIGRATION COMPLETE
-- =====================================================

