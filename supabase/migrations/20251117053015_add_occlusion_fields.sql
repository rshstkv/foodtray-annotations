-- Migration: Add Occlusion Fields
-- Description: Добавляет поля для отметки окклюзий (перекрытий) в аннотациях

-- Добавить is_occluded в initial_annotations
ALTER TABLE public.initial_annotations 
ADD COLUMN IF NOT EXISTS is_occluded BOOLEAN DEFAULT FALSE;

-- Добавить is_occluded и occlusion_metadata в annotations
ALTER TABLE public.annotations 
ADD COLUMN IF NOT EXISTS is_occluded BOOLEAN DEFAULT FALSE;

ALTER TABLE public.annotations 
ADD COLUMN IF NOT EXISTS occlusion_metadata JSONB;

-- Комментарии
COMMENT ON COLUMN initial_annotations.is_occluded IS 'Аннотация перекрыта другим объектом на фото';
COMMENT ON COLUMN annotations.is_occluded IS 'Аннотация перекрыта другим объектом на фото';
COMMENT ON COLUMN annotations.occlusion_metadata IS 'Дополнительная информация об окклюзии (степень перекрытия, что перекрывает)';


