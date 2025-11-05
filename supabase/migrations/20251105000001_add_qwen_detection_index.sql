-- Миграция для добавления индекса связи с оригинальными QWEN детекциями
-- Решает проблему потери связи с оригиналом при изменении аннотаций
-- Только ADD COLUMN - никаких потерь данных

-- 1. Добавить поле для индекса оригинальной детекции в массиве original_annotations
ALTER TABLE annotations 
ADD COLUMN IF NOT EXISTS qwen_detection_index INT,
ADD COLUMN IF NOT EXISTS qwen_detection_type TEXT;

-- 2. Комментарии для документации
COMMENT ON COLUMN annotations.qwen_detection_index IS 'Индекс оригинальной детекции в массиве original_annotations (qwen_dishes_detections или qwen_plates_detections)';
COMMENT ON COLUMN annotations.qwen_detection_type IS 'Тип детекции: dish или plate - определяет какой массив использовать в original_annotations';

-- 3. Индекс для ускорения запросов при поиске по типу детекции
CREATE INDEX IF NOT EXISTS idx_annotations_qwen_detection ON annotations(qwen_detection_index, qwen_detection_type) WHERE qwen_detection_index IS NOT NULL;

-- Примечание:
-- После применения этой миграции необходимо запустить скрипт populate-qwen-detection-indexes.ts
-- для заполнения индексов в существующих аннотациях

