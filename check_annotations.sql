-- Проверяем есть ли аннотации для recognition_id = 75882
SELECT 
    ri.recognition_id,
    ri.photo_type,
    COUNT(a.id) as annotation_count
FROM recognition_images ri
LEFT JOIN annotations a ON ri.id = a.image_id
WHERE ri.recognition_id = '75882'
GROUP BY ri.recognition_id, ri.photo_type;
