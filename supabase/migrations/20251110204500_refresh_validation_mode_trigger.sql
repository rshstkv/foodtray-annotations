-- Обновление validation_mode при изменении аннотаций

-- 1. Функция обновления validation_mode по измененным изображениям
CREATE OR REPLACE FUNCTION refresh_validation_mode_for_annotation()
RETURNS TRIGGER AS $$
DECLARE
  target_recognition TEXT;
BEGIN
  -- Определяем связанный recognition_id по image_id в NEW или OLD
  SELECT recognition_id
    INTO target_recognition
    FROM recognition_images
   WHERE id = COALESCE(NEW.image_id, OLD.image_id)
   LIMIT 1;

  IF target_recognition IS NULL THEN
    RETURN NEW;
  END IF;

  -- Обновляем validation_mode на основе текущих данных
  UPDATE recognitions
     SET validation_mode = calculate_validation_mode(target_recognition)
   WHERE recognition_id = target_recognition;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_validation_mode_for_annotation()
  IS 'Пересчитывает validation_mode при изменениях в таблице annotations.';

-- 2. Триггеры на вставку/обновление/удаление аннотаций
DROP TRIGGER IF EXISTS trg_annotations_refresh_validation_mode ON annotations;
CREATE TRIGGER trg_annotations_refresh_validation_mode
AFTER INSERT OR UPDATE OR DELETE ON annotations
FOR EACH ROW
EXECUTE FUNCTION refresh_validation_mode_for_annotation();

