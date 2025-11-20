-- Migration: Add RPC functions for counting recognitions with problems
-- Description: Функции для подсчета количества recognitions с различными проблемами

-- Функция для подсчета recognitions с неразрешенной неопределенностью
CREATE OR REPLACE FUNCTION count_unresolved_ambiguity()
RETURNS BIGINT AS $$
DECLARE
  result_count BIGINT;
BEGIN
  SELECT COUNT(DISTINCT r.id) INTO result_count
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
  );
  
  RETURN COALESCE(result_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION count_unresolved_ambiguity IS 
  'Count recognitions with unresolved ambiguity (multiple dish options, none selected)';


-- Функция для подсчета recognitions с несоответствием аннотаций FOOD
CREATE OR REPLACE FUNCTION count_food_annotation_mismatch()
RETURNS BIGINT AS $$
DECLARE
  result_count BIGINT;
BEGIN
  SELECT COUNT(DISTINCT r.id) INTO result_count
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
        SELECT COUNT(DISTINCT ann_count)
        FROM (
          SELECT i.camera_number, COUNT(ia.id) as ann_count
          FROM images i
          LEFT JOIN initial_annotations ia ON ia.image_id = i.id AND ia.initial_tray_item_id = iti.id
          WHERE i.recognition_id = r.id
          GROUP BY i.camera_number
        ) camera_counts
      ) > 1
  );
  
  RETURN COALESCE(result_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION count_food_annotation_mismatch IS 
  'Count recognitions with FOOD items having mismatched annotation counts between cameras';


-- Функция для подсчета recognitions с несоответствием аннотаций PLATE
CREATE OR REPLACE FUNCTION count_plate_annotation_mismatch()
RETURNS BIGINT AS $$
DECLARE
  result_count BIGINT;
BEGIN
  SELECT COUNT(DISTINCT r.id) INTO result_count
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
        SELECT COUNT(DISTINCT ann_count)
        FROM (
          SELECT i.camera_number, COUNT(ia.id) as ann_count
          FROM images i
          LEFT JOIN initial_annotations ia ON ia.image_id = i.id AND ia.initial_tray_item_id = iti.id
          WHERE i.recognition_id = r.id
          GROUP BY i.camera_number
        ) camera_counts
      ) > 1
  );
  
  RETURN COALESCE(result_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION count_plate_annotation_mismatch IS 
  'Count recognitions with PLATE items having mismatched annotation counts between cameras';


-- Функция для подсчета recognitions с любыми проблемами
CREATE OR REPLACE FUNCTION count_total_with_issues()
RETURNS BIGINT AS $$
DECLARE
  result_count BIGINT;
BEGIN
  SELECT COUNT(DISTINCT r.id) INTO result_count
  FROM recognitions r
  WHERE NOT EXISTS (
    SELECT 1 FROM validation_work_log w
    WHERE w.recognition_id = r.id
      AND (
        w.status = 'completed'
        OR (w.status = 'in_progress' AND w.updated_at >= NOW() - INTERVAL '30 minutes')
      )
  )
  AND (
    -- Неразрешенная неопределенность
    EXISTS (
      SELECT 1 
      FROM recipes rec
      JOIN recipe_lines rl ON rl.recipe_id = rec.id
      JOIN recipe_line_options rlo ON rlo.recipe_line_id = rl.id
      WHERE rec.recognition_id = r.id
      GROUP BY rlo.recipe_line_id
      HAVING COUNT(*) > 1 AND NOT BOOL_OR(rlo.is_selected)
    )
    OR
    -- Несоответствие аннотаций FOOD
    EXISTS (
      SELECT 1
      FROM initial_tray_items iti
      WHERE iti.recognition_id = r.id 
        AND iti.item_type = 'FOOD'
        AND (
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
    OR
    -- Несоответствие аннотаций PLATE
    EXISTS (
      SELECT 1
      FROM initial_tray_items iti
      WHERE iti.recognition_id = r.id 
        AND iti.item_type = 'PLATE'
        AND (
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
  );
  
  RETURN COALESCE(result_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION count_total_with_issues IS 
  'Count recognitions with any type of issue (ambiguity, food mismatch, or plate mismatch)';


