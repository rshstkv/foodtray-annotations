-- Добавление menu_all в recognitions для упрощения архитектуры
-- Убираем необходимость JOIN с recognitions_raw

BEGIN;

-- Добавить колонку menu_all
ALTER TABLE recognitions ADD COLUMN IF NOT EXISTS menu_all JSONB;

-- Создать GIN индекс для быстрого поиска по содержимому JSONB
CREATE INDEX IF NOT EXISTS idx_recognitions_menu_all ON recognitions USING GIN (menu_all);

-- Комментарий
COMMENT ON COLUMN recognitions.menu_all IS 'Available menu items for this recognition (from *_AM.json files). Used for search when adding new dishes.';

COMMIT;




