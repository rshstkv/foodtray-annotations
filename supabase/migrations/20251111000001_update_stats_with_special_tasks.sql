-- Обновить get_task_stats_grouped для подсчета специальных задач

CREATE OR REPLACE FUNCTION get_task_stats_grouped()
RETURNS JSON AS $$
BEGIN
  RETURN json_build_object(
    'quick_validation', (
      SELECT COUNT(*) 
      FROM recognitions 
      WHERE workflow_state = 'pending' 
        AND validation_mode = 'quick'
    ),
    'edit_mode', (
      SELECT COUNT(*) 
      FROM recognitions 
      WHERE workflow_state = 'pending' 
        AND validation_mode = 'edit'
    ),
    'check_errors', (
      SELECT COUNT(*) 
      FROM recognitions 
      WHERE workflow_state = 'check_error'
    ),
    'bottle_orientation', (
      SELECT COUNT(*) 
      FROM recognitions 
      WHERE workflow_state = 'pending'
        AND EXISTS (
          SELECT 1 FROM recognition_images ri
          INNER JOIN annotations a ON a.image_id = ri.id
          WHERE ri.recognition_id = recognitions.recognition_id
            AND a.object_type = 'bottle'
            AND a.is_bottle_up IS NULL
        )
    ),
    'buzzer_annotation', (
      SELECT COUNT(*) 
      FROM recognitions 
      WHERE workflow_state = 'buzzer_present'
    ),
    'non_food_objects', (
      SELECT COUNT(*) 
      FROM recognitions 
      WHERE workflow_state = 'manual_review'
    ),
    'completed', (
      SELECT COUNT(*) 
      FROM recognitions 
      WHERE workflow_state = 'completed'
    )
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_task_stats_grouped() IS 'Возвращает статистику задач включая специальные (баззеры, другие объекты, ошибки чека)';

