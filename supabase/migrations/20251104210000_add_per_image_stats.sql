-- Обновляем view чтобы показывать ВСЕ аннотации раздельно для Main и Qualifying

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
    r.created_at,
    r.updated_at,
    COUNT(DISTINCT ri.id) as image_count,
    COUNT(a.id) as annotation_count,
    COUNT(a.id) FILTER (WHERE a.source = 'qwen_auto') as qwen_annotation_count,
    COUNT(a.id) FILTER (WHERE a.source = 'manual') as manual_annotation_count,
    COUNT(a.id) FILTER (WHERE a.object_type = 'food') as food_annotation_count,
    -- ВСЕ аннотации по типам изображений
    COUNT(a.id) FILTER (WHERE ri.photo_type = 'Main') as main_count,
    COUNT(a.id) FILTER (WHERE ri.photo_type = 'Qualifying') as qualifying_count
FROM recognitions r
LEFT JOIN recognition_images ri ON r.recognition_id = ri.recognition_id
LEFT JOIN annotations a ON ri.id = a.image_id
GROUP BY r.id, r.recognition_id, r.recognition_date, r.status, r.is_mistake, 
         r.correct_dishes, r.annotator_notes, r.created_at, r.updated_at;

COMMENT ON VIEW recognitions_with_stats IS 'Статистика по recognitions с количеством ВСЕХ аннотаций (раздельно для Main/Qualifying)';

