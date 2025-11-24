-- =====================================================
-- Multi-Step Validation Architecture
-- =====================================================
-- Цель: Один recognition = один work_log со всеми типами валидации
-- Переключение между типами БЕЗ перезагрузки страницы

-- 1. Добавить поля для multi-step в validation_work_log
-- =====================================================
ALTER TABLE validation_work_log 
  ADD COLUMN IF NOT EXISTS validation_steps JSONB,
  ADD COLUMN IF NOT EXISTS current_step_index INT DEFAULT 0;

COMMENT ON COLUMN validation_work_log.validation_steps IS 
  'Array of validation steps: [{type: "FOOD_VALIDATION", status: "pending"}, ...]. NULL for legacy single-type work_logs.';

COMMENT ON COLUMN validation_work_log.current_step_index IS 
  'Current step index in validation_steps array. Used for multi-step validations.';

-- 2. Обновить view: блокировать recognition целиком (не по типам)
-- =====================================================
DROP VIEW IF EXISTS available_validation_tasks;

CREATE VIEW available_validation_tasks AS
SELECT 
  r.id as recognition_id,
  p.validation_type,
  p.priority,
  p.order_in_session
FROM recognitions r
CROSS JOIN validation_priority_config p
WHERE p.is_active = true
  -- Блокировка на уровне recognition (не типа!)
  AND NOT EXISTS (
    SELECT 1 FROM validation_work_log w
    WHERE w.recognition_id = r.id 
      AND w.status IN ('in_progress', 'completed')
  );

COMMENT ON VIEW available_validation_tasks IS 
  'Available recognitions for validation. Each recognition is blocked entirely once taken by any user.';

-- 3. Функция для захвата recognition со всеми validation types
-- =====================================================
CREATE OR REPLACE FUNCTION acquire_recognition_with_steps(p_user_id UUID)
RETURNS TABLE(
  work_log_id BIGINT,
  recognition_id BIGINT,
  validation_steps JSONB,
  current_step_index INT
) AS $$
DECLARE
  v_recognition_id BIGINT;
  v_work_log_id BIGINT;
  v_steps JSONB;
BEGIN
  -- Найти первый доступный recognition с блокировкой
  SELECT r.id
  INTO v_recognition_id
  FROM recognitions r
  WHERE NOT EXISTS (
    SELECT 1 FROM validation_work_log w
    WHERE w.recognition_id = r.id
      AND w.status IN ('in_progress', 'completed')
  )
  ORDER BY r.id
  LIMIT 1
  FOR UPDATE OF r SKIP LOCKED;
  
  IF v_recognition_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Собрать все активные validation types в массив steps
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', validation_type,
      'status', 'pending',
      'order', order_in_session
    ) ORDER BY priority, order_in_session
  )
  INTO v_steps
  FROM validation_priority_config
  WHERE is_active = true;
  
  -- Создать work_log со всеми steps
  INSERT INTO validation_work_log (
    recognition_id,
    validation_type, -- Оставляем для backward compatibility (первый тип)
    assigned_to,
    status,
    started_at,
    validation_steps,
    current_step_index
  )
  SELECT
    v_recognition_id,
    (v_steps->0->>'type')::validation_type, -- Первый тип для совместимости
    p_user_id,
    'in_progress',
    NOW(),
    v_steps,
    0
  RETURNING id INTO v_work_log_id;
  
  RETURN QUERY 
  SELECT v_work_log_id, v_recognition_id, v_steps, 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION acquire_recognition_with_steps IS 
  'Atomically acquire recognition with all validation types as steps. Blocks entire recognition for user.';

-- 4. Функция для перехода к следующему step
-- =====================================================
CREATE OR REPLACE FUNCTION move_to_next_step(p_work_log_id BIGINT)
RETURNS TABLE(
  success BOOLEAN,
  new_step_index INT,
  current_step JSONB
) AS $$
DECLARE
  v_steps JSONB;
  v_current_index INT;
  v_new_index INT;
  v_updated_steps JSONB;
BEGIN
  -- Получить текущее состояние
  SELECT validation_steps, current_step_index
  INTO v_steps, v_current_index
  FROM validation_work_log
  WHERE id = p_work_log_id;
  
  IF v_steps IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INT, NULL::JSONB;
    RETURN;
  END IF;
  
  -- Пометить текущий step как completed
  v_updated_steps := jsonb_set(
    v_steps,
    array[v_current_index::text, 'status'],
    '"completed"'
  );
  
  -- Переход к следующему step
  v_new_index := v_current_index + 1;
  
  -- Если есть следующий step - пометить его как in_progress
  IF v_new_index < jsonb_array_length(v_updated_steps) THEN
    v_updated_steps := jsonb_set(
      v_updated_steps,
      array[v_new_index::text, 'status'],
      '"in_progress"'
    );
  END IF;
  
  -- Обновить work_log
  UPDATE validation_work_log
  SET 
    validation_steps = v_updated_steps,
    current_step_index = v_new_index,
    validation_type = (v_updated_steps->v_new_index->>'type')::validation_type,
    updated_at = NOW()
  WHERE id = p_work_log_id;
  
  -- Вернуть результат
  RETURN QUERY 
  SELECT TRUE, v_new_index, v_updated_steps->v_new_index;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION move_to_next_step IS 
  'Mark current step as completed and move to next step in validation_steps array.';

-- 5. Функция для проверки завершенности всех steps
-- =====================================================
CREATE OR REPLACE FUNCTION all_steps_completed(p_work_log_id BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
  v_steps JSONB;
  v_step JSONB;
BEGIN
  SELECT validation_steps INTO v_steps
  FROM validation_work_log
  WHERE id = p_work_log_id;
  
  IF v_steps IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Проверить что все steps имеют status = 'completed'
  FOR v_step IN SELECT jsonb_array_elements(v_steps)
  LOOP
    IF v_step->>'status' != 'completed' THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION all_steps_completed IS 
  'Check if all validation steps are completed for a work_log.';

-- 6. Обновить updated_at column если отсутствует
-- =====================================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'validation_work_log' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE validation_work_log ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;











