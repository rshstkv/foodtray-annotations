-- Добавление поля для отметки ошибки на конкретной аннотации
-- Это позволяет отметить что конкретное блюдо распознано неправильно

ALTER TABLE annotations 
ADD COLUMN IF NOT EXISTS is_error BOOLEAN DEFAULT FALSE;

-- Индекс для фильтрации по ошибкам
CREATE INDEX IF NOT EXISTS idx_annotations_is_error ON annotations(is_error);

-- Комментарий
COMMENT ON COLUMN annotations.is_error IS 'Флаг ошибки распознавания для конкретного блюда/объекта';








