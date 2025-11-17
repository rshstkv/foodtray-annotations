-- =====================================================
-- Рефакторинг: копирование данных вместо merge
-- =====================================================
-- При создании validation_work_log копируем все данные
-- из initial_tray_items и initial_annotations в рабочие таблицы
-- Это упрощает откат, изоляцию сессий и устраняет конфликты ID

-- 1. Создаем новые таблицы для рабочих копий
-- =====================================================

-- Рабочие копии объектов на подносе (для конкретной сессии)
CREATE TABLE public.work_items (
  id BIGSERIAL PRIMARY KEY,
  work_log_id BIGINT NOT NULL REFERENCES validation_work_log(id) ON DELETE CASCADE,
  initial_item_id BIGINT REFERENCES initial_tray_items(id), -- ссылка на исходный (может быть NULL для новых)
  recognition_id BIGINT NOT NULL REFERENCES recognitions(id) ON DELETE CASCADE,
  type item_type NOT NULL,
  recipe_line_id BIGINT REFERENCES recipe_lines(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE, -- soft delete
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Рабочие копии аннотаций (для конкретной сессии)
CREATE TABLE public.work_annotations (
  id BIGSERIAL PRIMARY KEY,
  work_log_id BIGINT NOT NULL REFERENCES validation_work_log(id) ON DELETE CASCADE,
  initial_annotation_id BIGINT REFERENCES initial_annotations(id), -- ссылка на исходную (может быть NULL для новых)
  image_id BIGINT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  work_item_id BIGINT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  bbox JSONB NOT NULL, -- {x, y, w, h}
  is_deleted BOOLEAN DEFAULT FALSE, -- soft delete
  is_occluded BOOLEAN DEFAULT FALSE, -- аннотация перекрыта
  occlusion_metadata JSONB, -- дополнительная информация
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Индексы для быстрого поиска
CREATE INDEX idx_work_items_work_log ON work_items(work_log_id);
CREATE INDEX idx_work_items_recognition ON work_items(recognition_id);
CREATE INDEX idx_work_items_initial ON work_items(initial_item_id) WHERE initial_item_id IS NOT NULL;
CREATE INDEX idx_work_items_not_deleted ON work_items(work_log_id) WHERE NOT is_deleted;

CREATE INDEX idx_work_annotations_work_log ON work_annotations(work_log_id);
CREATE INDEX idx_work_annotations_image ON work_annotations(image_id);
CREATE INDEX idx_work_annotations_item ON work_annotations(work_item_id);
CREATE INDEX idx_work_annotations_initial ON work_annotations(initial_annotation_id) WHERE initial_annotation_id IS NOT NULL;
CREATE INDEX idx_work_annotations_not_deleted ON work_annotations(work_log_id) WHERE NOT is_deleted;

-- Триггер для updated_at
CREATE TRIGGER update_work_items_updated_at
  BEFORE UPDATE ON work_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_work_annotations_updated_at
  BEFORE UPDATE ON work_annotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 2. Функция для копирования данных при создании work_log
-- =====================================================

CREATE OR REPLACE FUNCTION initialize_work_session()
RETURNS TRIGGER AS $$
DECLARE
  item_mapping JSONB := '{}'; -- {initial_item_id: work_item_id}
  item_record RECORD;
  new_item_id BIGINT;
  annotation_record RECORD;
BEGIN
  -- Копируем все items из initial_tray_items
  FOR item_record IN 
    SELECT * FROM initial_tray_items 
    WHERE recognition_id = NEW.recognition_id
  LOOP
    INSERT INTO work_items (
      work_log_id,
      initial_item_id,
      recognition_id,
      type,
      recipe_line_id,
      quantity
    ) VALUES (
      NEW.id,
      item_record.id,
      item_record.recognition_id,
      item_record.type,
      item_record.recipe_line_id,
      item_record.quantity
    ) RETURNING id INTO new_item_id;
    
    -- Сохраняем маппинг для аннотаций
    item_mapping := jsonb_set(
      item_mapping, 
      ARRAY[item_record.id::text], 
      to_jsonb(new_item_id)
    );
  END LOOP;

  -- Копируем все аннотации из initial_annotations
  FOR annotation_record IN
    SELECT ia.* 
    FROM initial_annotations ia
    JOIN images img ON ia.image_id = img.id
    WHERE img.recognition_id = NEW.recognition_id
  LOOP
    -- Находим соответствующий work_item_id
    DECLARE
      work_item_id BIGINT;
    BEGIN
      work_item_id := (item_mapping->annotation_record.initial_tray_item_id::text)::bigint;
      
      IF work_item_id IS NOT NULL THEN
        INSERT INTO work_annotations (
          work_log_id,
          initial_annotation_id,
          image_id,
          work_item_id,
          bbox,
          is_occluded
        ) VALUES (
          NEW.id,
          annotation_record.id,
          annotation_record.image_id,
          work_item_id,
          annotation_record.bbox,
          annotation_record.is_occluded
        );
      END IF;
    END;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер: копируем данные после создания work_log
CREATE TRIGGER initialize_work_session_trigger
  AFTER INSERT ON validation_work_log
  FOR EACH ROW
  EXECUTE FUNCTION initialize_work_session();

-- 3. Удаляем старые таблицы (после проверки что новые работают)
-- =====================================================
-- ВАЖНО: сначала удалим внешние ключи и зависимости

-- Удаляем таблицу current_tray_items (если существует)
DROP TABLE IF EXISTS current_tray_items CASCADE;

-- Удаляем старую таблицу annotations (заменена на work_annotations)
-- Сначала проверим что она не используется
DO $$ 
BEGIN
  -- Если таблица annotations существует и отличается от initial_annotations
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'annotations'
  ) THEN
    -- Удаляем (данные уже скопированы в initial_annotations)
    DROP TABLE public.annotations CASCADE;
  END IF;
END $$;

-- 4. Комментарии для документации
-- =====================================================

COMMENT ON TABLE work_items IS 'Рабочие копии объектов для validation сессии. Копируются из initial_tray_items при создании work_log.';
COMMENT ON TABLE work_annotations IS 'Рабочие копии аннотаций для validation сессии. Копируются из initial_annotations при создании work_log.';

COMMENT ON COLUMN work_items.initial_item_id IS 'Ссылка на исходный item из initial_tray_items. NULL для новых объектов, созданных пользователем.';
COMMENT ON COLUMN work_annotations.initial_annotation_id IS 'Ссылка на исходную аннотацию из initial_annotations. NULL для новых аннотаций.';

COMMENT ON FUNCTION initialize_work_session IS 'Триггер-функция: копирует все items и annotations при создании validation_work_log';

