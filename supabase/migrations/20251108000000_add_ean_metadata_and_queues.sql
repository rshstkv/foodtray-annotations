-- ============================================================================
-- Add EAN metadata and correction queues
-- ============================================================================

-- 1. Create dish_ean_metadata table
CREATE TABLE IF NOT EXISTS dish_ean_metadata (
  id SERIAL PRIMARY KEY,
  ean TEXT NOT NULL UNIQUE,
  dish_name TEXT NOT NULL,
  requires_bottle_orientation BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_dish_ean_metadata_ean ON dish_ean_metadata(ean);
CREATE INDEX IF NOT EXISTS idx_dish_ean_metadata_bottle_orientation 
  ON dish_ean_metadata(requires_bottle_orientation) 
  WHERE requires_bottle_orientation = true;

-- Seed данные для напитков требующих проверки ориентации
INSERT INTO dish_ean_metadata (ean, dish_name, requires_bottle_orientation) VALUES
('4820024793278', 'Вино белое сухое', true),
('4820024793285', 'Вино красное сухое', true),
('4820024793292', 'Пиво светлое', true),
('4820024793308', 'Пиво темное', true),
('4820024793315', 'Банка Кока-кола', true),
('4820024793322', 'Банка Пепси', true)
ON CONFLICT (ean) DO UPDATE SET
  dish_name = EXCLUDED.dish_name,
  requires_bottle_orientation = EXCLUDED.requires_bottle_orientation,
  updated_at = NOW();

-- 2. Create view для очереди requires_correction
CREATE OR REPLACE VIEW recognitions_requires_correction AS
SELECT 
  r.*,
  COUNT(ri.id) as image_count,
  COUNT(a.id) as annotation_count,
  COALESCE(
    jsonb_agg(
      DISTINCT jsonb_build_object(
        'image_id', ri.id,
        'photo_type', ri.photo_type
      )
    ) FILTER (WHERE ri.id IS NOT NULL),
    '[]'::jsonb
  ) as images_summary
FROM recognitions r
LEFT JOIN recognition_images ri ON r.recognition_id = ri.recognition_id
LEFT JOIN annotations a ON ri.id = a.image_id
WHERE r.workflow_state = 'requires_correction'
GROUP BY r.id, r.recognition_id, r.recognition_date, r.status, r.is_mistake, 
         r.correct_dishes, r.menu_all, r.tier, r.workflow_state, 
         r.current_stage_id, r.completed_stages, r.assigned_to, 
         r.started_at, r.completed_at, r.annotator_notes, 
         r.created_at, r.updated_at;

-- 3. Удалить bbox_refinement как отдельную задачу
-- Деактивировать task_type (сохраняем для истории)
UPDATE task_types 
SET is_active = false
WHERE code = 'bbox_refinement';

-- Удалить workflow_stage (больше не нужен в workflow)
DELETE FROM workflow_stages 
WHERE task_type_id = (SELECT id FROM task_types WHERE code = 'bbox_refinement');

-- 4. Комментарии
COMMENT ON TABLE dish_ean_metadata IS 'Метаданные блюд по EAN для специальной фильтрации задач';
COMMENT ON COLUMN dish_ean_metadata.requires_bottle_orientation IS 'Требуется ли проверка ориентации (up/down) для этого блюда';
COMMENT ON VIEW recognitions_requires_correction IS 'Recognitions требующие исправления bbox (перепутаны или неверно привязаны)';

-- Вывод результата
DO $$
DECLARE
  ean_count INTEGER;
  correction_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO ean_count FROM dish_ean_metadata;
  SELECT COUNT(*) INTO correction_count FROM recognitions_requires_correction;
  
  RAISE NOTICE 'Migration completed successfully';
  RAISE NOTICE 'Dish EAN metadata records: %', ean_count;
  RAISE NOTICE 'Recognitions requiring correction: %', correction_count;
  RAISE NOTICE 'bbox_refinement task deactivated';
END $$;

