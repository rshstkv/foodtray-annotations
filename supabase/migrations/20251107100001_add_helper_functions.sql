-- PostgreSQL Functions для упрощения API
-- Выносим сложную логику в БД для лучшей производительности и тестируемости

-- ============================================================================
-- 1. Получить следующую задачу
-- ============================================================================

CREATE OR REPLACE FUNCTION get_next_task(
  p_task_type_code TEXT,
  p_user_id TEXT DEFAULT NULL,
  p_tier INTEGER DEFAULT NULL
) RETURNS TABLE (
  recognition_id TEXT,
  recognition_date DATE,
  tier INTEGER,
  workflow_state TEXT,
  current_stage_id INTEGER,
  stage_name TEXT,
  task_type_code TEXT,
  task_type_name TEXT
) AS $$
DECLARE
  v_stage_id INTEGER;
BEGIN
  -- Получаем stage_id для данного task_type
  SELECT ws.id INTO v_stage_id
  FROM workflow_stages ws
  JOIN task_types tt ON ws.task_type_id = tt.id
  WHERE tt.code = p_task_type_code
    AND tt.is_active = true
  LIMIT 1;

  IF v_stage_id IS NULL THEN
    RAISE EXCEPTION 'Task type not found or inactive: %', p_task_type_code;
  END IF;

  -- Ищем следующую доступную задачу
  RETURN QUERY
  SELECT 
    r.recognition_id,
    r.recognition_date,
    r.tier,
    r.workflow_state,
    r.current_stage_id,
    ws.name as stage_name,
    tt.code as task_type_code,
    tt.name as task_type_name
  FROM recognitions r
  JOIN workflow_stages ws ON r.current_stage_id = ws.id
  JOIN task_types tt ON ws.task_type_id = tt.id
  WHERE r.workflow_state = 'pending'
    AND r.current_stage_id = v_stage_id
    AND (r.assigned_to IS NULL OR r.started_at < NOW() - INTERVAL '15 minutes')
    AND (p_tier IS NULL OR r.tier = p_tier)
  ORDER BY r.tier ASC, r.recognition_date DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. Завершить задачу
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_task(
  p_recognition_id TEXT,
  p_stage_id INTEGER,
  p_move_to_next BOOLEAN DEFAULT true,
  p_changes JSONB DEFAULT '{}'::jsonb
) RETURNS BOOLEAN AS $$
DECLARE
  v_completed_stages INTEGER[];
  v_next_stage_id INTEGER;
  v_is_last_stage BOOLEAN;
BEGIN
  -- Получаем текущие completed_stages
  SELECT completed_stages INTO v_completed_stages
  FROM recognitions
  WHERE recognition_id = p_recognition_id;

  -- Добавляем текущий stage если его еще нет
  IF NOT (p_stage_id = ANY(v_completed_stages)) THEN
    v_completed_stages := array_append(v_completed_stages, p_stage_id);
  END IF;

  IF p_move_to_next THEN
    -- Находим следующий stage
    SELECT ws.id, (ws.stage_order = (SELECT MAX(stage_order) FROM workflow_stages WHERE task_type_id = ws.task_type_id))
    INTO v_next_stage_id, v_is_last_stage
    FROM workflow_stages ws
    WHERE ws.task_type_id = (SELECT task_type_id FROM workflow_stages WHERE id = p_stage_id)
      AND ws.stage_order > (SELECT stage_order FROM workflow_stages WHERE id = p_stage_id)
    ORDER BY ws.stage_order ASC
    LIMIT 1;

    -- Обновляем recognition
    IF v_is_last_stage OR v_next_stage_id IS NULL THEN
      -- Это был последний stage - завершаем весь workflow
      UPDATE recognitions
      SET 
        completed_stages = v_completed_stages,
        workflow_state = 'completed',
        current_stage_id = NULL,
        assigned_to = NULL,
        started_at = NOW(),
        completed_at = NOW()
      WHERE recognition_id = p_recognition_id;
    ELSE
      -- Переходим к следующему stage
      UPDATE recognitions
      SET 
        completed_stages = v_completed_stages,
        current_stage_id = v_next_stage_id,
        workflow_state = 'pending',
        assigned_to = NULL,
        started_at = NOW()
      WHERE recognition_id = p_recognition_id;
    END IF;
  ELSE
    -- Не переходим к следующему - просто обновляем completed_stages
    UPDATE recognitions
    SET 
      completed_stages = v_completed_stages,
      assigned_to = NULL,
      started_at = NOW()
    WHERE recognition_id = p_recognition_id;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. Отметить задачу флагом
-- ============================================================================

CREATE OR REPLACE FUNCTION flag_task(
  p_recognition_id TEXT,
  p_flag_type TEXT, -- 'dish_error', 'check_error', 'manual_review'
  p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_new_state TEXT;
BEGIN
  -- Определяем новый workflow_state на основе флага
  CASE p_flag_type
    WHEN 'dish_error' THEN
      v_new_state := 'dish_correction_pending';
    WHEN 'check_error' THEN
      v_new_state := 'check_error_pending';
    WHEN 'manual_review' THEN
      v_new_state := 'manual_review_pending';
    ELSE
      RAISE EXCEPTION 'Invalid flag_type: %', p_flag_type;
  END CASE;

  -- Обновляем recognition
  UPDATE recognitions
  SET 
    workflow_state = v_new_state,
    assigned_to = NULL,
    started_at = NOW(),
    annotator_notes = COALESCE(annotator_notes || E'\n', '') || 
                      '[' || NOW()::TEXT || '] ' || 
                      p_flag_type || ': ' || COALESCE(p_reason, 'No reason provided')
  WHERE recognition_id = p_recognition_id;

  -- Добавляем запись в annotation_corrections для tracking
  INSERT INTO annotation_corrections (
    recognition_id,
    correction_type,
    reason,
    status
  ) VALUES (
    p_recognition_id,
    p_flag_type,
    p_reason,
    'pending'
  );

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. Получить recognition со всеми данными
-- ============================================================================

CREATE OR REPLACE FUNCTION get_recognition_full(
  p_recognition_id TEXT
) RETURNS TABLE (
  recognition JSONB,
  images JSONB,
  task_info JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    row_to_json(r.*)::jsonb as recognition,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ri.id,
          'photo_type', ri.photo_type,
          'storage_path', ri.storage_path,
          'image_width', ri.image_width,
          'image_height', ri.image_height,
          'annotations', (
            SELECT jsonb_agg(row_to_json(a.*))
            FROM annotations a
            WHERE a.image_id = ri.id
          )
        )
      )
      FROM recognition_images ri
      WHERE ri.recognition_id = r.recognition_id
    ) as images,
    (
      SELECT jsonb_build_object(
        'task_type', row_to_json(tt.*),
        'stage', row_to_json(ws.*)
      )
      FROM workflow_stages ws
      JOIN task_types tt ON ws.id = r.current_stage_id
      WHERE ws.id = r.current_stage_id
    ) as task_info
  FROM recognitions r
  WHERE r.recognition_id = p_recognition_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. Получить статистику по задачам
-- ============================================================================

CREATE OR REPLACE FUNCTION get_task_stats(
  p_task_type_code TEXT DEFAULT NULL
) RETURNS TABLE (
  task_type TEXT,
  total BIGINT,
  pending BIGINT,
  in_progress BIGINT,
  completed BIGINT,
  requires_correction BIGINT,
  check_error_pending BIGINT,
  dish_correction_pending BIGINT,
  manual_review_pending BIGINT,
  tier_1 BIGINT,
  tier_2 BIGINT,
  tier_3 BIGINT,
  tier_4 BIGINT,
  tier_5 BIGINT
) AS $$
BEGIN
  IF p_task_type_code IS NOT NULL THEN
    -- Статистика для конкретного task_type
    RETURN QUERY
    SELECT 
      tt.code as task_type,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE r.workflow_state = 'pending') as pending,
      COUNT(*) FILTER (WHERE r.workflow_state = 'in_progress') as in_progress,
      COUNT(*) FILTER (WHERE r.workflow_state = 'completed') as completed,
      COUNT(*) FILTER (WHERE r.workflow_state = 'requires_correction') as requires_correction,
      COUNT(*) FILTER (WHERE r.workflow_state = 'check_error_pending') as check_error_pending,
      COUNT(*) FILTER (WHERE r.workflow_state = 'dish_correction_pending') as dish_correction_pending,
      COUNT(*) FILTER (WHERE r.workflow_state = 'manual_review_pending') as manual_review_pending,
      COUNT(*) FILTER (WHERE r.tier = 1) as tier_1,
      COUNT(*) FILTER (WHERE r.tier = 2) as tier_2,
      COUNT(*) FILTER (WHERE r.tier = 3) as tier_3,
      COUNT(*) FILTER (WHERE r.tier = 4) as tier_4,
      COUNT(*) FILTER (WHERE r.tier = 5) as tier_5
    FROM recognitions r
    JOIN workflow_stages ws ON r.current_stage_id = ws.id
    JOIN task_types tt ON ws.task_type_id = tt.id
    WHERE tt.code = p_task_type_code
    GROUP BY tt.code;
  ELSE
    -- Статистика по всем task_types
    RETURN QUERY
    SELECT 
      tt.code as task_type,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE r.workflow_state = 'pending') as pending,
      COUNT(*) FILTER (WHERE r.workflow_state = 'in_progress') as in_progress,
      COUNT(*) FILTER (WHERE r.workflow_state = 'completed') as completed,
      COUNT(*) FILTER (WHERE r.workflow_state = 'requires_correction') as requires_correction,
      COUNT(*) FILTER (WHERE r.workflow_state = 'check_error_pending') as check_error_pending,
      COUNT(*) FILTER (WHERE r.workflow_state = 'dish_correction_pending') as dish_correction_pending,
      COUNT(*) FILTER (WHERE r.workflow_state = 'manual_review_pending') as manual_review_pending,
      COUNT(*) FILTER (WHERE r.tier = 1) as tier_1,
      COUNT(*) FILTER (WHERE r.tier = 2) as tier_2,
      COUNT(*) FILTER (WHERE r.tier = 3) as tier_3,
      COUNT(*) FILTER (WHERE r.tier = 4) as tier_4,
      COUNT(*) FILTER (WHERE r.tier = 5) as tier_5
    FROM recognitions r
    JOIN workflow_stages ws ON r.current_stage_id = ws.id
    JOIN task_types tt ON ws.task_type_id = tt.id
    GROUP BY tt.code;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Комментарии
-- ============================================================================

COMMENT ON FUNCTION get_next_task IS 'Получить следующую доступную задачу с учетом автоосвобождения';
COMMENT ON FUNCTION complete_task IS 'Завершить задачу и перейти к следующему stage';
COMMENT ON FUNCTION flag_task IS 'Отметить задачу флагом (dish_error, check_error, manual_review)';
COMMENT ON FUNCTION get_recognition_full IS 'Получить recognition со всеми связанными данными одним запросом';
COMMENT ON FUNCTION get_task_stats IS 'Получить статистику по задачам';

-- Вывод результата
DO $$
BEGIN
  RAISE NOTICE 'Helper functions created successfully';
  RAISE NOTICE '  - get_next_task()';
  RAISE NOTICE '  - complete_task()';
  RAISE NOTICE '  - flag_task()';
  RAISE NOTICE '  - get_recognition_full()';
  RAISE NOTICE '  - get_task_stats()';
END $$;

