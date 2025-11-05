-- Миграция для системы аннотации bounding box
-- Создание таблиц для хранения сырых данных и рабочих данных аннотаций

-- 1. Таблица recognitions_raw - сырые данные recognition
CREATE TABLE IF NOT EXISTS recognitions_raw (
    id SERIAL PRIMARY KEY,
    recognition_id TEXT NOT NULL UNIQUE,
    recognition_date DATE NOT NULL,
    export_version TEXT NOT NULL,
    correct_dishes JSONB NOT NULL,
    menu_all JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индекс для быстрого поиска по recognition_id
CREATE INDEX idx_recognitions_raw_recognition_id ON recognitions_raw(recognition_id);
CREATE INDEX idx_recognitions_raw_export_version ON recognitions_raw(export_version);

-- 2. Таблица recognition_images_raw - сырые данные изображений
CREATE TABLE IF NOT EXISTS recognition_images_raw (
    id SERIAL PRIMARY KEY,
    recognition_id TEXT NOT NULL REFERENCES recognitions_raw(recognition_id) ON DELETE CASCADE,
    image_path TEXT NOT NULL UNIQUE,
    photo_type TEXT NOT NULL CHECK (photo_type IN ('Main', 'Qualifying')),
    storage_path TEXT NOT NULL,
    qwen_dishes_detections JSONB,
    qwen_plates_detections JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для поиска
CREATE INDEX idx_recognition_images_raw_recognition_id ON recognition_images_raw(recognition_id);
CREATE INDEX idx_recognition_images_raw_image_path ON recognition_images_raw(image_path);

-- 3. Таблица recognitions - основная таблица для работы
CREATE TABLE IF NOT EXISTS recognitions (
    id SERIAL PRIMARY KEY,
    recognition_id TEXT NOT NULL UNIQUE,
    recognition_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'rejected')),
    is_mistake BOOLEAN DEFAULT FALSE,
    correct_dishes JSONB NOT NULL,
    annotator_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для фильтрации и поиска
CREATE INDEX idx_recognitions_recognition_id ON recognitions(recognition_id);
CREATE INDEX idx_recognitions_status ON recognitions(status);
CREATE INDEX idx_recognitions_date ON recognitions(recognition_date);
CREATE INDEX idx_recognitions_is_mistake ON recognitions(is_mistake);

-- 4. Таблица recognition_images - рабочие изображения
CREATE TABLE IF NOT EXISTS recognition_images (
    id SERIAL PRIMARY KEY,
    recognition_id TEXT NOT NULL REFERENCES recognitions(recognition_id) ON DELETE CASCADE,
    photo_type TEXT NOT NULL CHECK (photo_type IN ('Main', 'Qualifying')),
    storage_path TEXT NOT NULL,
    image_width INTEGER,
    image_height INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_recognition_images_recognition_id ON recognition_images(recognition_id);
CREATE INDEX idx_recognition_images_photo_type ON recognition_images(photo_type);

-- 5. Таблица annotations - все аннотации (bbox) для изображений
CREATE TABLE IF NOT EXISTS annotations (
    id SERIAL PRIMARY KEY,
    image_id INTEGER NOT NULL REFERENCES recognition_images(id) ON DELETE CASCADE,
    object_type TEXT NOT NULL CHECK (object_type IN ('food', 'buzzer', 'plate', 'non_food', 'tray')),
    object_subtype TEXT,
    dish_index INTEGER,
    bbox_x1 INTEGER NOT NULL,
    bbox_y1 INTEGER NOT NULL,
    bbox_x2 INTEGER NOT NULL,
    bbox_y2 INTEGER NOT NULL,
    is_overlapped BOOLEAN DEFAULT FALSE,
    is_bottle_up BOOLEAN,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('qwen_auto', 'manual')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Проверка что координаты корректные
    CONSTRAINT check_bbox_coordinates CHECK (bbox_x2 > bbox_x1 AND bbox_y2 > bbox_y1)
);

-- Индексы для быстрого поиска
CREATE INDEX idx_annotations_image_id ON annotations(image_id);
CREATE INDEX idx_annotations_object_type ON annotations(object_type);
CREATE INDEX idx_annotations_dish_index ON annotations(dish_index);
CREATE INDEX idx_annotations_source ON annotations(source);

-- 6. Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггеры для автоматического обновления updated_at
CREATE TRIGGER update_recognitions_updated_at
    BEFORE UPDATE ON recognitions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_annotations_updated_at
    BEFORE UPDATE ON annotations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 7. View recognitions_with_stats - статистика по recognitions
CREATE OR REPLACE VIEW recognitions_with_stats AS
SELECT 
    r.id,
    r.recognition_id,
    r.recognition_date,
    r.status,
    r.is_mistake,
    r.correct_dishes,
    r.annotator_notes,
    r.created_at,
    r.updated_at,
    COUNT(DISTINCT ri.id) as image_count,
    COUNT(a.id) as annotation_count,
    COUNT(a.id) FILTER (WHERE a.source = 'qwen_auto') as qwen_annotation_count,
    COUNT(a.id) FILTER (WHERE a.source = 'manual') as manual_annotation_count,
    COUNT(a.id) FILTER (WHERE a.object_type = 'food') as food_annotation_count
FROM recognitions r
LEFT JOIN recognition_images ri ON r.recognition_id = ri.recognition_id
LEFT JOIN annotations a ON ri.id = a.image_id
GROUP BY r.id, r.recognition_id, r.recognition_date, r.status, r.is_mistake, 
         r.correct_dishes, r.annotator_notes, r.created_at, r.updated_at;

-- Комментарии к таблицам
COMMENT ON TABLE recognitions_raw IS 'Сырые данные recognition без обработки';
COMMENT ON TABLE recognition_images_raw IS 'Сырые данные изображений с автоматическими аннотациями от QWEN';
COMMENT ON TABLE recognitions IS 'Основная таблица с распознаваниями для работы аннотаторов';
COMMENT ON TABLE recognition_images IS 'Рабочие изображения для аннотирования';
COMMENT ON TABLE annotations IS 'Аннотации bounding box для всех типов объектов';
COMMENT ON VIEW recognitions_with_stats IS 'Статистика по recognitions с количеством изображений и аннотаций';





