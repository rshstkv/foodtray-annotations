-- Автоматический расчет validation_mode при INSERT/UPDATE recognitions

-- Функция для автоматического расчета validation_mode
CREATE OR REPLACE FUNCTION auto_set_validation_mode()
RETURNS TRIGGER AS $$
BEGIN
  -- Рассчитываем validation_mode только для pending recognitions
  IF NEW.workflow_state = 'pending' THEN
    NEW.validation_mode := calculate_validation_mode(NEW.recognition_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер на INSERT recognitions
DROP TRIGGER IF EXISTS trg_recognitions_auto_validation_mode ON recognitions;
CREATE TRIGGER trg_recognitions_auto_validation_mode
BEFORE INSERT ON recognitions
FOR EACH ROW
EXECUTE FUNCTION auto_set_validation_mode();

-- Также пересчитываем при изменении correct_dishes
DROP TRIGGER IF EXISTS trg_recognitions_update_validation_mode ON recognitions;
CREATE TRIGGER trg_recognitions_update_validation_mode
BEFORE UPDATE OF correct_dishes ON recognitions
FOR EACH ROW
WHEN (NEW.workflow_state = 'pending')
EXECUTE FUNCTION auto_set_validation_mode();

-- Пересчитать для существующих записей
UPDATE recognitions 
SET validation_mode = calculate_validation_mode(recognition_id)
WHERE workflow_state = 'pending';

