-- Инициализация существующих recognitions для workflow системы

-- 1. Вычислить tier для всех existing recognitions
UPDATE recognitions 
SET tier = calculate_recognition_tier(recognition_id)
WHERE tier IS NULL OR tier = 1;

-- 2. Инициализировать workflow_state на основе текущего status
UPDATE recognitions 
SET workflow_state = CASE 
  WHEN status = 'completed' THEN 'completed'
  WHEN status = 'in_progress' THEN 'in_progress'
  WHEN status = 'rejected' THEN 'requires_correction'
  ELSE 'pending'
END
WHERE workflow_state IS NULL OR workflow_state = 'pending';

-- 3. Установить current_stage_id в первый этап для pending recognitions
UPDATE recognitions 
SET current_stage_id = (SELECT id FROM workflow_stages ORDER BY stage_order LIMIT 1)
WHERE workflow_state = 'pending' AND current_stage_id IS NULL;

-- 4. Создать initial snapshots для всех recognitions
INSERT INTO recognition_history (recognition_id, snapshot_type, data_snapshot, changes_summary)
SELECT 
  r.recognition_id,
  'initial' AS snapshot_type,
  jsonb_build_object(
    'recognition_id', r.recognition_id,
    'correct_dishes', r.correct_dishes,
    'annotations', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'image_id', a.image_id,
            'bbox_x1', a.bbox_x1,
            'bbox_y1', a.bbox_y1,
            'bbox_x2', a.bbox_x2,
            'bbox_y2', a.bbox_y2,
            'object_type', a.object_type,
            'object_subtype', a.object_subtype,
            'dish_index', a.dish_index,
            'is_overlapped', a.is_overlapped,
            'is_bottle_up', a.is_bottle_up,
            'is_error', a.is_error,
            'source', a.source
          )
        )
        FROM recognition_images ri
        JOIN annotations a ON ri.id = a.image_id
        WHERE ri.recognition_id = r.recognition_id
      ),
      '[]'::jsonb
    ),
    'status', r.status,
    'is_mistake', r.is_mistake,
    'has_modifications', r.has_modifications,
    'tier', r.tier
  ) AS data_snapshot,
  jsonb_build_object(
    'message', 'Initial snapshot created during workflow migration',
    'annotation_count', (
      SELECT COUNT(*)
      FROM recognition_images ri
      JOIN annotations a ON ri.id = a.image_id
      WHERE ri.recognition_id = r.recognition_id
    ),
    'dish_count', jsonb_array_length(r.correct_dishes)
  ) AS changes_summary
FROM recognitions r
WHERE NOT EXISTS (
  SELECT 1 FROM recognition_history rh 
  WHERE rh.recognition_id = r.recognition_id 
  AND rh.snapshot_type = 'initial'
);

-- 5. Обновить view recognitions_with_stats для включения новых полей
DROP VIEW IF EXISTS recognitions_with_stats;
CREATE OR REPLACE VIEW recognitions_with_stats AS
SELECT 
    r.id,
    r.recognition_id,
    r.recognition_date,
    r.status,
    r.is_mistake,
    r.correct_dishes,
    r.annotator_notes,
    r.tier,
    r.workflow_state,
    r.current_stage_id,
    r.completed_stages,
    r.assigned_to,
    r.started_at,
    r.completed_at,
    r.has_modifications,
    r.created_at,
    r.updated_at,
    COUNT(DISTINCT ri.id) as image_count,
    COUNT(a.id) as annotation_count,
    COUNT(a.id) FILTER (WHERE a.source = 'qwen_auto') as qwen_annotation_count,
    COUNT(a.id) FILTER (WHERE a.source = 'manual') as manual_annotation_count,
    COUNT(a.id) FILTER (WHERE a.object_type = 'food') as food_annotation_count,
    COUNT(a.id) FILTER (WHERE ri.photo_type = 'Main') as main_count,
    COUNT(a.id) FILTER (WHERE ri.photo_type = 'Qualifying') as qualifying_count
FROM recognitions r
LEFT JOIN recognition_images ri ON r.recognition_id = ri.recognition_id
LEFT JOIN annotations a ON ri.id = a.image_id
GROUP BY r.id, r.recognition_id, r.recognition_date, r.status, r.is_mistake, 
         r.correct_dishes, r.annotator_notes, r.tier, r.workflow_state,
         r.current_stage_id, r.completed_stages, r.assigned_to,
         r.started_at, r.completed_at, r.has_modifications,
         r.created_at, r.updated_at;

COMMENT ON VIEW recognitions_with_stats IS 'Статистика по recognitions с workflow полями и количеством аннотаций';

-- Вывод статистики для проверки
DO $$
DECLARE
  total_count INTEGER;
  tier1_count INTEGER;
  tier2_count INTEGER;
  tier3_count INTEGER;
  tier4_count INTEGER;
  tier5_count INTEGER;
  snapshot_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM recognitions;
  SELECT COUNT(*) INTO tier1_count FROM recognitions WHERE tier = 1;
  SELECT COUNT(*) INTO tier2_count FROM recognitions WHERE tier = 2;
  SELECT COUNT(*) INTO tier3_count FROM recognitions WHERE tier = 3;
  SELECT COUNT(*) INTO tier4_count FROM recognitions WHERE tier = 4;
  SELECT COUNT(*) INTO tier5_count FROM recognitions WHERE tier = 5;
  SELECT COUNT(*) INTO snapshot_count FROM recognition_history WHERE snapshot_type = 'initial';
  
  RAISE NOTICE 'Migration complete:';
  RAISE NOTICE '  Total recognitions: %', total_count;
  RAISE NOTICE '  Tier 1 (easiest): %', tier1_count;
  RAISE NOTICE '  Tier 2: %', tier2_count;
  RAISE NOTICE '  Tier 3: %', tier3_count;
  RAISE NOTICE '  Tier 4: %', tier4_count;
  RAISE NOTICE '  Tier 5 (hardest): %', tier5_count;
  RAISE NOTICE '  Initial snapshots created: %', snapshot_count;
END $$;

