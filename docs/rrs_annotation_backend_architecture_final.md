# RRS Annotation Backend - Финальная Архитектура

## Контекст Продукта

**RRS Annotation Backend** - система управления аннотациями для разметки блюд на фотографиях подносов в ресторане.

### Бизнес-цель
Обеспечить точное соответствие между:
- Физическими блюдами на подносе
- Их местоположением на фотографиях (bbox)
- Кассовым чеком
- Меню ресторана

### Источники данных
1. **2 камеры** → 2 фотографии каждого подноса
2. **VLM модель (Qwen)** → предварительная разметка (bbox + класс)
3. **Кассовый чек** → список блюд с количеством
4. **Активное меню** → справочник блюд в момент съемки

### Типы объектов для аннотации
- **FOOD** - блюда (основной фокус)
- **PLATE** - тарелки
- **BUZZER** - пейджеры/пищалки
- **BOTTLE** - бутылки
- **OCCLUSION** - окклюзии

---

## Физическая Модель Данных

### Иерархия сущностей

```
Recognition (поднос)
  ├── Images (2 фотографии: camera 1, camera 2)
  ├── Active Menu (JSONB: доступные блюда)
  ├── Check (кассовый чек)
  │     └── Check Lines (строки чека)
  └── Items (физические объекты на подносе)
        └── Annotations (bbox на каждой фотографии)
              ├── camera 1: bbox для item
              └── camera 2: bbox для item
```

### Ключевые принципы

1. **Annotations → Items** (простая связь)
   - Каждая annotation указывает на конкретный физический item
   - НЕ напрямую на menu_item (через item)

2. **Версионирование**
   - Items и Annotations имеют `version` (0=initial от Qwen, 1+=human edits)
   - Храним только изменения (версии > 0), не дублируем всё

3. **Активное меню = JSONB**
   - Меню привязано к конкретному recognition (не глобальная таблица)
   - Меню может меняться между recognitions

4. **Validation "на лету"**
   - Нет предсозданных tasks
   - Work log создается когда user берет задачу
   - Админ меняет приоритеты → никакие tasks не пересоздаются

---

## Схема Базы Данных

### Layer 1: Raw Data (источники)

```sql
CREATE SCHEMA raw;

-- Файлы recognition (metadata + активное меню)
CREATE TABLE raw.recognition_files (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL,
  batch_id TEXT,
  active_menu JSONB, -- AM.json content
  image1_path TEXT,
  image2_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Кассовые чеки
CREATE TABLE raw.correct_dishes (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL,
  payload JSONB, -- полный JSON чека
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Детекции от Qwen
CREATE TABLE raw.qwen_annotations (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL,
  image_path TEXT, -- camera1.jpg или camera2.jpg
  bbox JSONB, -- {x, y, w, h}
  class_name TEXT, -- что Qwen определила
  external_id TEXT, -- код блюда (если есть)
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Layer 2: Domain Model (public schema)

#### Core Tables

```sql
-- ENUM типы
CREATE TYPE public.user_role AS ENUM ('admin', 'editor', 'viewer');
CREATE TYPE public.item_type AS ENUM ('FOOD', 'BUZZER', 'PLATE', 'BOTTLE', 'OCCLUSION');
CREATE TYPE public.validation_type AS ENUM (
  'FOOD_VALIDATION',
  'PLATE_VALIDATION', 
  'BUZZER_VALIDATION',
  'OCCLUSION_VALIDATION',
  'BOTTLE_ORIENTATION_VALIDATION'
);

-- 1. Recognitions (подносы)
CREATE TABLE public.recognitions (
  id BIGINT PRIMARY KEY,
  batch_id TEXT,
  active_menu JSONB, -- меню ресторана в момент recognition
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Images (фотографии)
CREATE TABLE public.images (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL REFERENCES recognitions(id) ON DELETE CASCADE,
  camera_number INTEGER NOT NULL CHECK (camera_number IN (1, 2)),
  storage_path TEXT NOT NULL, -- путь в Supabase Storage
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recognition_id, camera_number)
);

-- 3. Items (физические объекты на подносе)
CREATE TABLE public.items (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL REFERENCES recognitions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 0, -- 0=initial, 1+=edits
  item_type public.item_type NOT NULL,
  
  -- Только для item_type = 'FOOD':
  menu_item_external_id TEXT,
  
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Annotations (bbox на фотографиях)
CREATE TABLE public.annotations (
  id BIGSERIAL PRIMARY KEY,
  image_id BIGINT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  bbox JSONB NOT NULL, -- {x, y, w, h}
  version INTEGER NOT NULL DEFAULT 0, -- 0=initial, 1+=edits
  
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Checks (кассовые чеки)
CREATE TABLE public.checks (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL REFERENCES recognitions(id) ON DELETE CASCADE,
  raw_payload JSONB,
  total_amount NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recognition_id)
);

CREATE TABLE public.check_lines (
  id BIGSERIAL PRIMARY KEY,
  check_id BIGINT NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL, -- код блюда
  quantity INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Validation System

```sql
-- Конфигурация приоритетов (управляется админом)
CREATE TABLE public.validation_priority_config (
  id BIGSERIAL PRIMARY KEY,
  validation_type public.validation_type NOT NULL UNIQUE,
  priority INTEGER NOT NULL, -- 1, 2, 3... (меньше = выше приоритет)
  order_in_session INTEGER NOT NULL, -- порядок внутри одного priority
  effective_from_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Журнал работы (создается "на лету")
CREATE TABLE public.validation_work_log (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL REFERENCES recognitions(id) ON DELETE CASCADE,
  validation_type public.validation_type NOT NULL,
  assigned_to UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Profiles & Auth

```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role public.user_role NOT NULL DEFAULT 'editor',
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Сценарии Использования (на уровне БД)

### 1. Загрузка новых данных

**Шаг 1: Загрузить Recognition с изображениями**
```python
# Upload images to Supabase Storage
upload_image(f"recognitions/{recognition_id}/camera1.jpg")
upload_image(f"recognitions/{recognition_id}/camera2.jpg")

# Insert into raw.recognition_files
INSERT INTO raw.recognition_files (recognition_id, batch_id, active_menu, image1_path, image2_path)
VALUES (31821, 'batch_001', '{"items": [...]}', 'camera1.jpg', 'camera2.jpg');

# Transform to domain
SELECT transform_recognitions_and_images();
```

**Результат:**
- `recognitions` получает запись с `active_menu`
- `images` получает 2 записи (camera 1 и 2)

**Шаг 2: Загрузить Check**
```python
INSERT INTO raw.correct_dishes (recognition_id, payload)
VALUES (31821, '{"Count": 3, "Dishes": [...]}');

SELECT transform_checks();
```

**Результат:**
- `checks` получает запись
- `check_lines` получает N записей (по количеству блюд)

**Шаг 3: Загрузить Qwen аннотации**
```python
INSERT INTO raw.qwen_annotations (recognition_id, image_path, bbox, class_name, external_id)
VALUES 
  (31821, 'camera1.jpg', '{"x": 100, "y": 200, "w": 50, "h": 60}', 'Борщ', '12345'),
  (31821, 'camera2.jpg', '{"x": 105, "y": 205, "w": 48, "h": 58}', 'Борщ', '12345');

SELECT transform_items_and_annotations();
```

**Результат:**
- `items` получает записи (version=0, item_type='FOOD')
- `annotations` получает 2 записи для каждого item (по одной на камеру, version=0)

### 2. User берет задачу (Validation Workflow)

**Frontend запрос: "Get Next Task"**
```sql
WITH completed AS (
  SELECT recognition_id, validation_type
  FROM validation_work_log
  WHERE status = 'completed'
),
in_progress AS (
  SELECT recognition_id, validation_type
  FROM validation_work_log
  WHERE status = 'in_progress' 
    AND started_at > NOW() - INTERVAL '30 minutes'
)
SELECT r.id, vpc.validation_type
FROM recognitions r
CROSS JOIN validation_priority_config vpc
WHERE vpc.is_active = TRUE
  AND (r.id, vpc.validation_type) NOT IN (SELECT * FROM completed)
  AND (r.id, vpc.validation_type) NOT IN (SELECT * FROM in_progress)
ORDER BY vpc.priority, vpc.order_in_session, r.id
LIMIT 1
FOR UPDATE SKIP LOCKED;
```

**Lock задачи:**
```sql
INSERT INTO validation_work_log (recognition_id, validation_type, assigned_to, started_at, status)
VALUES (31821, 'FOOD_VALIDATION', 'user-uuid', NOW(), 'in_progress')
RETURNING id;
```

**Загрузить данные для UI:**
```sql
-- Recognition + images
SELECT r.*, 
       json_agg(json_build_object('id', i.id, 'camera', i.camera_number, 'url', i.storage_path)) as images
FROM recognitions r
JOIN images i ON i.recognition_id = r.id
WHERE r.id = 31821
GROUP BY r.id;

-- Items (последние версии)
SELECT DISTINCT ON (id)
  *
FROM items
WHERE recognition_id = 31821
ORDER BY id, version DESC;

-- Annotations (последние версии)
SELECT DISTINCT ON (item_id, image_id)
  *
FROM annotations a
JOIN images i ON i.id = a.image_id
WHERE i.recognition_id = 31821
ORDER BY item_id, image_id, version DESC;

-- Check
SELECT c.*, json_agg(cl.*) as lines
FROM checks c
JOIN check_lines cl ON cl.check_id = c.id
WHERE c.recognition_id = 31821
GROUP BY c.id;
```

### 3. User редактирует аннотации

**Сценарий A: Поправить bbox**
```sql
-- Создать новую версию annotation
INSERT INTO annotations (image_id, item_id, bbox, version, created_by)
SELECT image_id, item_id, '{"x": 110, "y": 210, "w": 52, "h": 62}', version + 1, 'user-uuid'
FROM annotations
WHERE id = 12345; -- старая annotation
```

**Сценарий B: Добавить пейджер (не было в Qwen)**
```sql
-- 1. Создать новый item
INSERT INTO items (recognition_id, version, item_type, created_by)
VALUES (31821, 1, 'BUZZER', 'user-uuid')
RETURNING id; -- item_id = 999

-- 2. Создать annotations на обеих камерах
INSERT INTO annotations (image_id, item_id, bbox, version, created_by)
VALUES 
  ((SELECT id FROM images WHERE recognition_id = 31821 AND camera_number = 1), 999, '{"x": 300, "y": 400, "w": 30, "h": 40}', 1, 'user-uuid'),
  ((SELECT id FROM images WHERE recognition_id = 31821 AND camera_number = 2), 999, '{"x": 305, "y": 405, "w": 28, "h": 38}', 1, 'user-uuid');
```

**Сценарий C: Изменить тип блюда**
```sql
-- Создать новую версию item с другим menu_item_external_id
INSERT INTO items (recognition_id, version, item_type, menu_item_external_id, created_by)
SELECT recognition_id, version + 1, item_type, '67890', 'user-uuid'
FROM items
WHERE id = 456;
```

### 4. User завершает работу

```sql
UPDATE validation_work_log
SET status = 'completed', completed_at = NOW()
WHERE recognition_id = 31821 
  AND validation_type = 'FOOD_VALIDATION' 
  AND assigned_to = 'user-uuid';
```

### 5. Выгрузка результатов

**Получить все completed recognitions для FOOD_VALIDATION:**
```sql
SELECT DISTINCT recognition_id
FROM validation_work_log
WHERE validation_type = 'FOOD_VALIDATION'
  AND status = 'completed';
```

**Для каждого recognition получить финальное состояние:**
```sql
-- Items (последние версии)
SELECT DISTINCT ON (id)
  *
FROM items
WHERE recognition_id = ANY($recognition_ids)
ORDER BY id, version DESC;

-- Annotations (последние версии)
SELECT DISTINCT ON (item_id, image_id)
  a.*, i.camera_number
FROM annotations a
JOIN images i ON i.id = a.image_id
WHERE i.recognition_id = ANY($recognition_ids)
ORDER BY item_id, image_id, version DESC;
```

---

## Transform Functions (Идемпотентность)

### 1. transform_recognitions_and_images()

```sql
CREATE OR REPLACE FUNCTION transform_recognitions_and_images()
RETURNS void AS $$
BEGIN
  -- Insert recognitions (idempotent)
  INSERT INTO recognitions (id, batch_id, active_menu, created_at)
  SELECT recognition_id, batch_id, active_menu, created_at
  FROM raw.recognition_files
  ON CONFLICT (id) DO NOTHING;
  
  -- Insert images (idempotent)
  INSERT INTO images (recognition_id, camera_number, storage_path, created_at)
  SELECT 
    recognition_id,
    1,
    'recognitions/' || recognition_id || '/' || image1_path,
    created_at
  FROM raw.recognition_files
  ON CONFLICT (recognition_id, camera_number) DO NOTHING;
  
  INSERT INTO images (recognition_id, camera_number, storage_path, created_at)
  SELECT 
    recognition_id,
    2,
    'recognitions/' || recognition_id || '/' || image2_path,
    created_at
  FROM raw.recognition_files
  ON CONFLICT (recognition_id, camera_number) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
```

### 2. transform_checks()

```sql
CREATE OR REPLACE FUNCTION transform_checks()
RETURNS void AS $$
BEGIN
  -- Insert checks
  INSERT INTO checks (recognition_id, raw_payload, created_at)
  SELECT recognition_id, payload, created_at
  FROM raw.correct_dishes
  ON CONFLICT (recognition_id) DO NOTHING;
  
  -- Insert check_lines
  INSERT INTO check_lines (check_id, external_id, quantity)
  SELECT 
    c.id,
    (dish->>'ExternalId')::TEXT,
    (dish->>'Count')::INTEGER
  FROM raw.correct_dishes rcd
  JOIN checks c ON c.recognition_id = rcd.recognition_id
  CROSS JOIN LATERAL jsonb_array_elements(rcd.payload->'Dishes') AS dish
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;
```

### 3. transform_items_and_annotations()

```sql
CREATE OR REPLACE FUNCTION transform_items_and_annotations()
RETURNS void AS $$
DECLARE
  qwen_rec RECORD;
  new_item_id BIGINT;
  img_id BIGINT;
BEGIN
  -- Group Qwen annotations by recognition + external_id
  FOR qwen_rec IN
    SELECT 
      recognition_id,
      external_id,
      class_name,
      array_agg(json_build_object('image_path', image_path, 'bbox', bbox)) as detections
    FROM raw.qwen_annotations
    WHERE external_id IS NOT NULL
    GROUP BY recognition_id, external_id, class_name
  LOOP
    -- Check if item already exists
    SELECT id INTO new_item_id
    FROM items
    WHERE recognition_id = qwen_rec.recognition_id
      AND menu_item_external_id = qwen_rec.external_id
      AND version = 0
    LIMIT 1;
    
    -- Create item if not exists
    IF new_item_id IS NULL THEN
      INSERT INTO items (recognition_id, version, item_type, menu_item_external_id)
      VALUES (qwen_rec.recognition_id, 0, 'FOOD', qwen_rec.external_id)
      RETURNING id INTO new_item_id;
    END IF;
    
    -- Create annotations for each camera
    FOR i IN 0..jsonb_array_length(qwen_rec.detections::jsonb) - 1 LOOP
      DECLARE
        detection JSONB := (qwen_rec.detections::jsonb)->i;
        img_path TEXT := detection->>'image_path';
        camera_num INTEGER := CASE WHEN img_path LIKE '%camera1%' THEN 1 ELSE 2 END;
      BEGIN
        SELECT id INTO img_id
        FROM images
        WHERE recognition_id = qwen_rec.recognition_id
          AND camera_number = camera_num;
        
        IF img_id IS NOT NULL THEN
          INSERT INTO annotations (image_id, item_id, bbox, version)
          VALUES (img_id, new_item_id, detection->'bbox', 0)
          ON CONFLICT DO NOTHING;
        END IF;
      END;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

---

## Индексы

```sql
-- Recognitions
CREATE INDEX idx_recognitions_batch ON recognitions(batch_id);

-- Images
CREATE INDEX idx_images_recognition ON images(recognition_id);

-- Items
CREATE INDEX idx_items_recognition ON items(recognition_id);
CREATE INDEX idx_items_version ON items(recognition_id, version);
CREATE INDEX idx_items_external_id ON items(menu_item_external_id);

-- Annotations
CREATE INDEX idx_annotations_image ON annotations(image_id);
CREATE INDEX idx_annotations_item ON annotations(item_id);
CREATE INDEX idx_annotations_version ON annotations(item_id, image_id, version);

-- Checks
CREATE INDEX idx_checks_recognition ON checks(recognition_id);
CREATE INDEX idx_check_lines_check ON check_lines(check_id);

-- Validation
CREATE INDEX idx_validation_work_log_recognition ON validation_work_log(recognition_id);
CREATE INDEX idx_validation_work_log_status ON validation_work_log(status, validation_type);
CREATE INDEX idx_validation_work_log_assigned ON validation_work_log(assigned_to);

-- Raw tables
CREATE INDEX idx_raw_recognition_files_id ON raw.recognition_files(recognition_id);
CREATE INDEX idx_raw_correct_dishes_id ON raw.correct_dishes(recognition_id);
CREATE INDEX idx_raw_qwen_annotations_id ON raw.qwen_annotations(recognition_id);
```

---

## Storage

### Bucket: rrs-photos

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('rrs-photos', 'rrs-photos', TRUE);

CREATE POLICY "Public images are viewable by everyone."
ON storage.objects FOR SELECT
USING (bucket_id = 'rrs-photos');
```

**Структура путей:**
```
rrs-photos/
  recognitions/
    31821/
      camera1.jpg
      camera2.jpg
    31822/
      camera1.jpg
      camera2.jpg
```

---

## Инварианты и Ограничения

### Обязательные проверки:

1. **Каждый recognition имеет ровно 2 изображения**
   - `UNIQUE(recognition_id, camera_number)`
   - `CHECK (camera_number IN (1, 2))`

2. **Item типа FOOD должен иметь menu_item_external_id**
   - Проверка на уровне приложения

3. **Annotation всегда указывает на существующий item**
   - `FOREIGN KEY (item_id) REFERENCES items(id)`

4. **Для каждого item должны быть annotations на обеих камерах**
   - Проверка на уровне приложения при выгрузке

5. **Version всегда >= 0**
   - `CHECK (version >= 0)`

6. **Validation work log: только один in_progress на (recognition_id, validation_type)**
   - Проверка через SELECT FOR UPDATE SKIP LOCKED

---

## Миграция Данных (если нужна)

Если есть старая схема с `menu_items` таблицей:

```sql
-- 1. Собрать active_menu для каждого recognition
UPDATE recognitions r
SET active_menu = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'external_id', mi.external_id,
      'name', mi.name,
      'payload', mi.raw_payload
    )
  )
  FROM menu_items mi
  JOIN recognition_menu rm ON rm.menu_item_id = mi.id
  WHERE rm.recognition_id = r.id
);

-- 2. Мигрировать initial_annotations → annotations (version=0)
INSERT INTO annotations (image_id, item_id, bbox, version, created_at)
SELECT image_id, item_id, bbox, 0, created_at
FROM initial_annotations;
```

---

## Масштабирование

### Текущий масштаб (ожидаемый):
- **Recognitions**: 10,000 - 100,000
- **Images**: 20,000 - 200,000 (2 на recognition)
- **Items**: 50,000 - 500,000 (в среднем 5 на recognition)
- **Annotations**: 100,000 - 1,000,000 (2 на item)
- **Validation work log**: растет линейно с работой users

### Оптимизации:
1. **Партиционирование** (если > 1M recognitions):
   ```sql
   CREATE TABLE recognitions (...)
   PARTITION BY RANGE (id);
   ```

2. **Архивирование старых версий**:
   ```sql
   -- Периодически удалять старые версии (кроме последней)
   DELETE FROM annotations
   WHERE version < (
     SELECT MAX(version)
     FROM annotations a2
     WHERE a2.item_id = annotations.item_id
       AND a2.image_id = annotations.image_id
   )
   AND created_at < NOW() - INTERVAL '30 days';
   ```

3. **Материализованные представления** для статистики:
   ```sql
   CREATE MATERIALIZED VIEW validation_progress AS
   SELECT 
     validation_type,
     COUNT(DISTINCT recognition_id) FILTER (WHERE status = 'completed') as completed,
     COUNT(DISTINCT recognition_id) as total
   FROM validation_work_log
   GROUP BY validation_type;
   ```

---

## Frequently Asked Questions

### Q: Зачем версионирование, а не просто UPDATE?
**A:** Версионирование позволяет:
- Откатывать изменения
- Видеть историю правок
- Сравнивать Qwen vs Human
- Audit trail (кто и когда менял)

### Q: Почему активное меню в JSONB, а не таблица?
**A:** 
- Меню уникально для каждого recognition
- Не нужны JOIN'ы при загрузке
- Проще загружать из AM.json "как есть"
- Нет конфликтов при дублировании external_id

### Q: Как обеспечить что annotations есть на обеих камерах?
**A:** Валидация на уровне приложения:
```python
def validate_item_completeness(item_id):
    cameras = db.query("""
        SELECT DISTINCT i.camera_number
        FROM annotations a
        JOIN images i ON i.id = a.image_id
        WHERE a.item_id = %s
        AND a.version = (SELECT MAX(version) FROM annotations WHERE item_id = %s)
    """, [item_id, item_id])
    
    assert len(cameras) == 2, "Item must have annotations on both cameras"
```

### Q: Как отличить "пользователь удалил item" от "нет annotation"?
**A:** Два варианта:
1. Soft delete: добавить `is_deleted` флаг в items
2. Явное удаление: создать version с `item_type = 'DELETED'`

---

## Дальнейшее Развитие

### Phase 2: Advanced Features
- [ ] Confidence scores для annotations
- [ ] Связь между items на разных камерах (same_item_id)
- [ ] Автоматический merge Qwen + Check данных
- [ ] Batch operations (approve all, reject all)

### Phase 3: Analytics
- [ ] Dashboard: кто сколько отаннотировал
- [ ] Quality metrics: Qwen accuracy vs Human
- [ ] Inter-annotator agreement

### Phase 4: Export
- [ ] Export в COCO format
- [ ] Export в YOLO format
- [ ] Export в CSV для анализа

---

**Документ обновлен:** 2025-11-14  
**Версия:** 1.0  
**Статус:** Утверждено для реализации











