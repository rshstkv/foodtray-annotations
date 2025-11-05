-- Функция для получения статистики по задачам
-- Использует GROUP BY для правильного подсчета всех recognitions без лимита в 1000

CREATE OR REPLACE FUNCTION get_task_stats()
RETURNS TABLE (
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
  INNER JOIN workflow_stages ws ON r.current_stage_id = ws.id
  INNER JOIN task_types tt ON ws.task_type_id = tt.id
  WHERE r.workflow_state = 'pending'
  GROUP BY tt.code, r.tier
  ORDER BY tt.code, r.tier;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_task_stats() IS 'Возвращает статистику доступных задач по типам и tier (без лимита в 1000 записей)';

