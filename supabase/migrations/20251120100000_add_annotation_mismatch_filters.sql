-- Migration: Add annotation mismatch filters to priority_filter_type
-- Description: Добавляет фильтры для задач с несоответствием количества аннотаций между камерами

-- Добавляем новые значения в enum priority_filter_type
ALTER TYPE priority_filter_type ADD VALUE IF NOT EXISTS 'food_annotation_mismatch';
ALTER TYPE priority_filter_type ADD VALUE IF NOT EXISTS 'plate_annotation_mismatch';
ALTER TYPE priority_filter_type ADD VALUE IF NOT EXISTS 'annotation_mismatch';

-- Удаляем старую версию функции
DROP FUNCTION IF EXISTS acquire_recognition_with_steps(UUID, priority_filter_type);

-- Обновляем функцию acquire_recognition_with_steps с новыми фильтрами
CREATE OR REPLACE FUNCTION acquire_recognition_with_steps(
  p_user_id UUID,
  p_filter priority_filter_type DEFAULT 'any'
)
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
  -- С учетом фильтра приоритета
  IF p_filter = 'has_ambiguity' THEN
    -- Фильтр: recognition с неопределенностью (несколько вариантов блюда)
    SELECT r.id
    INTO v_recognition_id
    FROM recognitions r
    JOIN recipes rec ON rec.recognition_id = r.id
    WHERE NOT EXISTS (
      SELECT 1 FROM validation_work_log w
      WHERE w.recognition_id = r.id
        AND (
          w.status = 'completed'
          OR (w.status = 'in_progress' AND w.updated_at >= NOW() - INTERVAL '30 minutes')
        )
    )
    AND EXISTS (
      SELECT 1 
      FROM recipe_lines rl
      JOIN recipe_line_options rlo ON rlo.recipe_line_id = rl.id
      WHERE rl.recipe_id = rec.id
      GROUP BY rlo.recipe_line_id
      HAVING COUNT(*) > 1
    )
    ORDER BY r.id
    LIMIT 1
    FOR UPDATE OF r SKIP LOCKED;
    
  ELSIF p_filter = 'unresolved_ambiguity' THEN
    -- Фильтр: НЕРАЗРЕШЕННАЯ неопределенность (несколько вариантов, НИ ОДИН не выбран)
    SELECT r.id
    INTO v_recognition_id
    FROM recognitions r
    JOIN recipes rec ON rec.recognition_id = r.id
    WHERE NOT EXISTS (
      SELECT 1 FROM validation_work_log w
      WHERE w.recognition_id = r.id
        AND (
          w.status = 'completed'
          OR (w.status = 'in_progress' AND w.updated_at >= NOW() - INTERVAL '30 minutes')
        )
    )
    AND EXISTS (
      SELECT 1 
      FROM recipe_lines rl
      JOIN recipe_line_options rlo ON rlo.recipe_line_id = rl.id
      WHERE rl.recipe_id = rec.id
      GROUP BY rlo.recipe_line_id
      HAVING COUNT(*) > 1 AND NOT BOOL_OR(rlo.is_selected)
    )
    ORDER BY r.id
    LIMIT 1
    FOR UPDATE OF r SKIP LOCKED;
    
  ELSIF p_filter = 'food_annotation_mismatch' THEN
    -- Фильтр: несоответствие количества аннотаций для FOOD items между камерами
    SELECT r.id
    INTO v_recognition_id
    FROM recognitions r
    WHERE NOT EXISTS (
      SELECT 1 FROM validation_work_log w
      WHERE w.recognition_id = r.id
        AND (
          w.status = 'completed'
          OR (w.status = 'in_progress' AND w.updated_at >= NOW() - INTERVAL '30 minutes')
        )
    )
    AND EXISTS (
      SELECT 1
      FROM initial_tray_items iti
      WHERE iti.recognition_id = r.id 
        AND iti.item_type = 'FOOD'
        AND (
          -- Проверяем, что количество аннотаций на камерах различается
          SELECT COUNT(DISTINCT ann_count)
          FROM (
            SELECT i.camera_number, COUNT(ia.id) as ann_count
            FROM images i
            LEFT JOIN initial_annotations ia ON ia.image_id = i.id AND ia.initial_tray_item_id = iti.id
            WHERE i.recognition_id = r.id
            GROUP BY i.camera_number
          ) camera_counts
        ) > 1
    )
    ORDER BY r.id
    LIMIT 1
    FOR UPDATE OF r SKIP LOCKED;
    
  ELSIF p_filter = 'plate_annotation_mismatch' THEN
    -- Фильтр: несоответствие количества аннотаций для PLATE items между камерами
    SELECT r.id
    INTO v_recognition_id
    FROM recognitions r
    WHERE NOT EXISTS (
      SELECT 1 FROM validation_work_log w
      WHERE w.recognition_id = r.id
        AND (
          w.status = 'completed'
          OR (w.status = 'in_progress' AND w.updated_at >= NOW() - INTERVAL '30 minutes')
        )
    )
    AND EXISTS (
      SELECT 1
      FROM initial_tray_items iti
      WHERE iti.recognition_id = r.id 
        AND iti.item_type = 'PLATE'
        AND (
          -- Проверяем, что количество аннотаций на камерах различается
          SELECT COUNT(DISTINCT ann_count)
          FROM (
            SELECT i.camera_number, COUNT(ia.id) as ann_count
            FROM images i
            LEFT JOIN initial_annotations ia ON ia.image_id = i.id AND ia.initial_tray_item_id = iti.id
            WHERE i.recognition_id = r.id
            GROUP BY i.camera_number
          ) camera_counts
        ) > 1
    )
    ORDER BY r.id
    LIMIT 1
    FOR UPDATE OF r SKIP LOCKED;
    
  ELSIF p_filter = 'annotation_mismatch' THEN
    -- Фильтр: несоответствие количества аннотаций для FOOD ИЛИ PLATE items
    SELECT r.id
    INTO v_recognition_id
    FROM recognitions r
    WHERE NOT EXISTS (
      SELECT 1 FROM validation_work_log w
      WHERE w.recognition_id = r.id
        AND (
          w.status = 'completed'
          OR (w.status = 'in_progress' AND w.updated_at >= NOW() - INTERVAL '30 minutes')
        )
    )
    AND EXISTS (
      SELECT 1
      FROM initial_tray_items iti
      WHERE iti.recognition_id = r.id 
        AND iti.item_type IN ('FOOD', 'PLATE')
        AND (
          -- Проверяем, что количество аннотаций на камерах различается
          SELECT COUNT(DISTINCT ann_count)
          FROM (
            SELECT i.camera_number, COUNT(ia.id) as ann_count
            FROM images i
            LEFT JOIN initial_annotations ia ON ia.image_id = i.id AND ia.initial_tray_item_id = iti.id
            WHERE i.recognition_id = r.id
            GROUP BY i.camera_number
          ) camera_counts
        ) > 1
    )
    ORDER BY r.id
    LIMIT 1
    FOR UPDATE OF r SKIP LOCKED;
    
  ELSIF p_filter = 'clean_ambiguity' THEN
    -- Фильтр: ЧИСТАЯ неопределенность (без проблем с аннотациями)
    SELECT r.id
    INTO v_recognition_id
    FROM recognitions r
    JOIN recipes rec ON rec.recognition_id = r.id
    WHERE NOT EXISTS (
      SELECT 1 FROM validation_work_log w
      WHERE w.recognition_id = r.id
        AND (
          w.status = 'completed'
          OR (w.status = 'in_progress' AND w.updated_at >= NOW() - INTERVAL '30 minutes')
        )
    )
    AND EXISTS (
      SELECT 1 
      FROM recipe_lines rl
      JOIN recipe_line_options rlo ON rlo.recipe_line_id = rl.id
      WHERE rl.recipe_id = rec.id
      GROUP BY rlo.recipe_line_id
      HAVING COUNT(*) > 1 AND NOT BOOL_OR(rlo.is_selected)
    )
    ORDER BY r.id
    LIMIT 1
    FOR UPDATE OF r SKIP LOCKED;
    
  ELSIF p_filter = 'has_food_items' THEN
    -- Фильтр: recognition с блюдами (для тестирования FOOD_VALIDATION)
    SELECT r.id
    INTO v_recognition_id
    FROM recognitions r
    WHERE NOT EXISTS (
      SELECT 1 FROM validation_work_log w
      WHERE w.recognition_id = r.id
        AND (
          w.status = 'completed'
          OR (w.status = 'in_progress' AND w.updated_at >= NOW() - INTERVAL '30 minutes')
        )
    )
    AND EXISTS (
      SELECT 1 FROM initial_tray_items iti
      WHERE iti.recognition_id = r.id AND iti.item_type = 'FOOD'
    )
    ORDER BY r.id
    LIMIT 1
    FOR UPDATE OF r SKIP LOCKED;
    
  ELSIF p_filter = 'has_plates' THEN
    -- Фильтр: recognition с тарелками
    SELECT r.id
    INTO v_recognition_id
    FROM recognitions r
    WHERE NOT EXISTS (
      SELECT 1 FROM validation_work_log w
      WHERE w.recognition_id = r.id
        AND (
          w.status = 'completed'
          OR (w.status = 'in_progress' AND w.updated_at >= NOW() - INTERVAL '30 minutes')
        )
    )
    AND EXISTS (
      SELECT 1 FROM initial_tray_items iti
      WHERE iti.recognition_id = r.id AND iti.item_type = 'PLATE'
    )
    ORDER BY r.id
    LIMIT 1
    FOR UPDATE OF r SKIP LOCKED;
    
  ELSIF p_filter = 'has_buzzers' THEN
    -- Фильтр: recognition с пейджерами
    SELECT r.id
    INTO v_recognition_id
    FROM recognitions r
    WHERE NOT EXISTS (
      SELECT 1 FROM validation_work_log w
      WHERE w.recognition_id = r.id
        AND (
          w.status = 'completed'
          OR (w.status = 'in_progress' AND w.updated_at >= NOW() - INTERVAL '30 minutes')
        )
    )
    AND EXISTS (
      SELECT 1 FROM initial_tray_items iti
      WHERE iti.recognition_id = r.id AND iti.item_type = 'BUZZER'
    )
    ORDER BY r.id
    LIMIT 1
    FOR UPDATE OF r SKIP LOCKED;
    
  ELSIF p_filter = 'no_annotations' THEN
    -- Фильтр: recognition где есть items без аннотаций (ошибка в данных)
    SELECT r.id
    INTO v_recognition_id
    FROM recognitions r
    WHERE NOT EXISTS (
      SELECT 1 FROM validation_work_log w
      WHERE w.recognition_id = r.id
        AND (
          w.status = 'completed'
          OR (w.status = 'in_progress' AND w.updated_at >= NOW() - INTERVAL '30 minutes')
        )
    )
    AND EXISTS (
      SELECT 1 FROM initial_tray_items iti
      WHERE iti.recognition_id = r.id
        AND NOT EXISTS (
          SELECT 1 FROM initial_annotations ia
          WHERE ia.initial_tray_item_id = iti.id
        )
    )
    ORDER BY r.id
    LIMIT 1
    FOR UPDATE OF r SKIP LOCKED;
    
  ELSE
    -- Обычная логика (по умолчанию)
    SELECT r.id
    INTO v_recognition_id
    FROM recognitions r
    WHERE NOT EXISTS (
      SELECT 1 FROM validation_work_log w
      WHERE w.recognition_id = r.id
        AND (
          w.status = 'completed'
          OR (w.status = 'in_progress' AND w.updated_at >= NOW() - INTERVAL '30 minutes')
        )
    )
    ORDER BY r.id
    LIMIT 1
    FOR UPDATE OF r SKIP LOCKED;
  END IF;
  
  IF v_recognition_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Удалить любые старые in_progress work_logs для этого recognition
  DELETE FROM validation_work_log
  WHERE validation_work_log.recognition_id = v_recognition_id
    AND status = 'in_progress';

  -- Собрать все активные validation types в массив steps
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', validation_type,
      'status', 'pending',
      'order', order_in_session
    ) ORDER BY order_in_session
  )
  INTO v_steps
  FROM validation_priority_config
  WHERE is_active = true;
  
  -- Создать work_log со всеми steps
  INSERT INTO validation_work_log (
    recognition_id,
    validation_type,
    assigned_to,
    status,
    started_at,
    validation_steps,
    current_step_index
  )
  SELECT
    v_recognition_id,
    (v_steps->0->>'type')::validation_type,
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
  'Atomically acquire recognition with optional priority filter. Filters: any (default), unresolved_ambiguity, food_annotation_mismatch, plate_annotation_mismatch, annotation_mismatch, and others';


