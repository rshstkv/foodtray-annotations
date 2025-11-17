-- Migration: Add source field to work_items
-- Description: work_items should track source (MODEL/RECIPE_LINE_OPTION/MANUAL) from initial_tray_items

-- Add source column to work_items
ALTER TABLE work_items
ADD COLUMN source public.tray_item_source NOT NULL DEFAULT 'MANUAL';

-- Update initialize_work_session function to copy source
CREATE OR REPLACE FUNCTION initialize_work_session()
RETURNS TRIGGER AS $$
BEGIN
  -- Copy initial_tray_items to work_items
  INSERT INTO work_items (
    work_log_id,
    initial_item_id,
    recognition_id,
    type,
    source,  -- Copy source!
    recipe_line_id,
    quantity,
    bottle_orientation
  )
  SELECT 
    NEW.id,
    iti.id,
    iti.recognition_id,
    iti.item_type,
    iti.source,  -- Copy source from initial_tray_items
    iti.recipe_line_id,
    iti.quantity,
    iti.bottle_orientation
  FROM initial_tray_items iti
  WHERE iti.recognition_id = NEW.recognition_id
    AND NOT iti.is_deleted;

  -- Copy initial_annotations to work_annotations
  INSERT INTO work_annotations (
    work_log_id,
    initial_annotation_id,
    image_id,
    work_item_id,
    bbox,
    is_occluded,
    occlusion_metadata
  )
  SELECT 
    NEW.id,
    ia.id,
    ia.image_id,
    wi.id,
    ia.bbox,
    ia.is_occluded,
    ia.occlusion_metadata
  FROM initial_annotations ia
  JOIN work_items wi ON wi.initial_item_id = ia.initial_tray_item_id 
    AND wi.work_log_id = NEW.id
  WHERE ia.image_id IN (
    SELECT id FROM images WHERE recognition_id = NEW.recognition_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

