-- Диагностика системы валидации
-- Выполните этот файл в Supabase Studio (http://localhost:54323)

-- 1. Проверить активные типы валидации
SELECT 
  id,
  validation_type,
  priority,
  order_in_session,
  is_active
FROM validation_priority_config
ORDER BY priority, order_in_session;

-- 2. Проверить наличие recognitions
SELECT 
  COUNT(*) as total_recognitions,
  MIN(id) as min_id,
  MAX(id) as max_id
FROM recognitions;

-- 3. Показать первые 5 recognitions
SELECT id, recognition_id, created_at
FROM recognitions
ORDER BY id
LIMIT 5;

-- 4. Проверить work_log
SELECT 
  COUNT(*) as total_work_logs
FROM validation_work_log;

-- 5. Если есть work_log - показать их
SELECT 
  vwl.id,
  vwl.recognition_id,
  vwl.validation_type,
  vwl.status,
  vwl.started_at,
  vwl.completed_at,
  u.email as user_email
FROM validation_work_log vwl
LEFT JOIN auth.users u ON vwl.assigned_to = u.id
ORDER BY vwl.started_at DESC
LIMIT 10;

-- 6. Для каждого активного типа - сколько recognitions доступно
WITH active_types AS (
  SELECT validation_type, priority, order_in_session 
  FROM validation_priority_config 
  WHERE is_active = true
  ORDER BY priority, order_in_session
),
recognition_count AS (
  SELECT COUNT(*) as total FROM recognitions
)
SELECT 
  at.validation_type,
  at.priority,
  at.order_in_session,
  rc.total as total_recognitions,
  COALESCE(
    (SELECT COUNT(DISTINCT recognition_id) 
     FROM validation_work_log 
     WHERE validation_type = at.validation_type 
     AND status = 'completed'), 
    0
  ) as completed,
  COALESCE(
    (SELECT COUNT(DISTINCT recognition_id) 
     FROM validation_work_log 
     WHERE validation_type = at.validation_type 
     AND status = 'in_progress'
     AND started_at >= NOW() - INTERVAL '30 minutes'), 
    0
  ) as in_progress,
  rc.total - COALESCE(
    (SELECT COUNT(DISTINCT recognition_id) 
     FROM validation_work_log 
     WHERE validation_type = at.validation_type 
     AND status IN ('completed', 'in_progress')
     AND (status != 'in_progress' OR started_at >= NOW() - INTERVAL '30 minutes')), 
    0
  ) as available
FROM active_types at
CROSS JOIN recognition_count rc;



