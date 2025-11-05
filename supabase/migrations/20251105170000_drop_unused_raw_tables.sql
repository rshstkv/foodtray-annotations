-- Удаление неиспользуемых RAW таблиц
-- 
-- recognitions_raw: menu_all переехал в recognitions
-- recognition_images_raw: никогда не использовалась
--
-- Все необходимые данные теперь в основных таблицах:
-- - recognitions.menu_all (для поиска блюд в UI)
-- - recognition_images.original_annotations (для Undo)

BEGIN;

-- Удаляем recognition_images_raw (не используется)
DROP TABLE IF EXISTS recognition_images_raw CASCADE;

-- Удаляем recognitions_raw (menu_all теперь в recognitions)
DROP TABLE IF EXISTS recognitions_raw CASCADE;

COMMIT;

