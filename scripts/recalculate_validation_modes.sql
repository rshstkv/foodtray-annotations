-- Пересчитать validation_mode для всех recognitions

UPDATE recognitions
SET validation_mode = calculate_validation_mode(recognition_id)
WHERE workflow_state = 'pending' AND current_stage_id IS NOT NULL;

-- Показать результаты
SELECT 
  validation_mode,
  COUNT(*) as count
FROM recognitions
WHERE workflow_state = 'pending'
GROUP BY validation_mode
ORDER BY validation_mode;

