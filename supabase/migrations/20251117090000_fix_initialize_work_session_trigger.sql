-- =====================================================
-- Исправление триггера initialize_work_session
-- =====================================================
-- Проблема: initial_tray_items имеет recipe_line_option_id, 
-- а work_items нужен recipe_line_id

CREATE OR REPLACE FUNCTION initialize_work_session()
RETURNS TRIGGER AS $$
DECLARE
  item_mapping JSONB := '{}'; -- {initial_item_id: work_item_id}
  item_record RECORD;
  new_item_id BIGINT;
  annotation_record RECORD;
  resolved_recipe_line_id BIGINT;
BEGIN
  -- Копируем все items из initial_tray_items
  FOR item_record IN 
    SELECT * FROM initial_tray_items 
    WHERE recognition_id = NEW.recognition_id
  LOOP
    -- Получаем recipe_line_id из recipe_line_options (если есть)
    resolved_recipe_line_id := NULL;
    IF item_record.recipe_line_option_id IS NOT NULL THEN
      SELECT recipe_line_id INTO resolved_recipe_line_id
      FROM recipe_line_options
      WHERE id = item_record.recipe_line_option_id;
    END IF;

    INSERT INTO work_items (
      work_log_id,
      initial_item_id,
      recognition_id,
      type,
      recipe_line_id,
      quantity
    ) VALUES (
      NEW.id,
      item_record.id,
      item_record.recognition_id,
      item_record.item_type, -- ИСПРАВЛЕНО: было type, стало item_type
      resolved_recipe_line_id, -- ИСПРАВЛЕНО: получаем из recipe_line_options
      1 -- ИСПРАВЛЕНО: по умолчанию 1 (в initial_tray_items нет quantity)
    ) RETURNING id INTO new_item_id;
    
    -- Сохраняем маппинг для аннотаций
    item_mapping := jsonb_set(
      item_mapping, 
      ARRAY[item_record.id::text], 
      to_jsonb(new_item_id)
    );
  END LOOP;

  -- Копируем все аннотации из initial_annotations
  FOR annotation_record IN
    SELECT ia.* 
    FROM initial_annotations ia
    JOIN images img ON ia.image_id = img.id
    WHERE img.recognition_id = NEW.recognition_id
  LOOP
    -- Находим соответствующий work_item_id
    DECLARE
      work_item_id BIGINT;
    BEGIN
      work_item_id := (item_mapping->annotation_record.initial_tray_item_id::text)::bigint;
      
      IF work_item_id IS NOT NULL THEN
        INSERT INTO work_annotations (
          work_log_id,
          initial_annotation_id,
          image_id,
          work_item_id,
          bbox,
          is_occluded
        ) VALUES (
          NEW.id,
          annotation_record.id,
          annotation_record.image_id,
          work_item_id,
          annotation_record.bbox,
          annotation_record.is_occluded
        );
      END IF;
    END;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;







