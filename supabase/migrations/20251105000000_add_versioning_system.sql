-- Миграция для добавления системы версионирования аннотаций
-- Позволяет хранить оригинальные QWEN данные и отслеживать модификации

-- 1. Добавить поле для хранения оригинальных аннотаций в recognition_images
ALTER TABLE recognition_images 
ADD COLUMN IF NOT EXISTS original_annotations JSONB;

-- 2. Добавить флаг наличия модификаций в recognitions
ALTER TABLE recognitions 
ADD COLUMN IF NOT EXISTS has_modifications BOOLEAN DEFAULT FALSE;

-- 3. Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_recognitions_has_modifications ON recognitions(has_modifications);

-- 4. Комментарии
COMMENT ON COLUMN recognition_images.original_annotations IS 'Оригинальные QWEN аннотации для возможности отката';
COMMENT ON COLUMN recognitions.has_modifications IS 'Флаг наличия пользовательских модификаций (создание/изменение/удаление bbox)';

