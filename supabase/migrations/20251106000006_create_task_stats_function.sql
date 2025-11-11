-- Создание функции для быстрого получения статистики по задачам
-- Это решает проблему лимита в 1000 записей

CREATE OR REPLACE FUNCTION get_task_stats()
RETURNS TABLE(
  task_type_code TEXT,
  tier INTEGER,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tt.code as task_type_code,
    r.tier,
    COUNT(*) as count
  FROM recognitions r
  JOIN workflow_stages ws ON r.current_stage_id = ws.id
  JOIN task_types tt ON ws.task_type_id = tt.id
  WHERE r.workflow_state = 'pending'
  GROUP BY tt.code, r.tier
  ORDER BY tt.code, r.tier;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_task_stats() IS 'Возвращает статистику по количеству pending recognitions для каждого типа задачи и tier';

