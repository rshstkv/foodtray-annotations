-- Создание Storage bucket для изображений bbox аннотаций

-- Создаем bucket для изображений
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'bbox-images',
    'bbox-images',
    true,
    52428800, -- 50MB limit
    ARRAY['image/jpeg', 'image/jpg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Политика для публичного чтения (для локальной разработки)
CREATE POLICY "Public read access for bbox images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'bbox-images');

-- Политика для записи (для локальной разработки - разрешаем всем)
CREATE POLICY "Public write access for bbox images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'bbox-images');

-- Политика для обновления
CREATE POLICY "Public update access for bbox images"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'bbox-images');

-- Политика для удаления
CREATE POLICY "Public delete access for bbox images"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'bbox-images');

