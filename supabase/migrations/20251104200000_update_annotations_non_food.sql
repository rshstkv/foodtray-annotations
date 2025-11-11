-- Миграция для добавления поддержки non-food объектов
-- Обновляем CHECK constraint для object_type чтобы включить все типы

-- Удаляем старый constraint
ALTER TABLE annotations DROP CONSTRAINT IF EXISTS annotations_object_type_check;

-- Добавляем новый constraint с non-food типами
ALTER TABLE annotations 
ADD CONSTRAINT annotations_object_type_check 
CHECK (object_type IN ('food', 'buzzer', 'plate', 'non_food', 'tray'));

-- Комментарии для понимания структуры non_food
COMMENT ON COLUMN annotations.object_subtype IS 
'For non_food objects: hand, phone, wallet, cards, cutlery, other. For buzzer: red, green, white, blue. NULL for other types.';

COMMENT ON COLUMN annotations.is_error IS 
'Indicates that the object was not found in correct_dishes or menu_all - marking as error for review';

-- Создаем индекс на is_error для быстрого поиска проблемных аннотаций
CREATE INDEX IF NOT EXISTS idx_annotations_is_error ON annotations(is_error) WHERE is_error = true;

-- Индекс для non_food объектов
CREATE INDEX IF NOT EXISTS idx_annotations_non_food ON annotations(object_type, object_subtype) 
WHERE object_type = 'non_food';









