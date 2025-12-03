-- Optimize transform function to process only NEW records
-- This fixes statement timeout on active_menu processing

CREATE OR REPLACE FUNCTION transform_recognitions_and_images()
RETURNS TABLE(recognitions_created INTEGER, images_created INTEGER, menu_items_created INTEGER) AS $$
DECLARE
  rec_count INTEGER := 0;
  img_count INTEGER := 0;
  menu_count INTEGER := 0;
BEGIN
  -- Insert recognitions (idempotent)
  WITH inserted AS (
    INSERT INTO recognitions (id, batch_id, created_at)
    SELECT DISTINCT ON (recognition_id) recognition_id, batch_id, created_at
    FROM raw.recognition_files
    ORDER BY recognition_id, created_at DESC
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO rec_count FROM inserted;
  
  -- Insert active menu items (idempotent)
  -- OPTIMIZED: Only process records that don't have menu items yet
  WITH new_recognitions AS (
    SELECT rf.recognition_id, rf.active_menu
    FROM raw.recognition_files rf
    WHERE rf.active_menu IS NOT NULL
      -- Only process if this recognition has no menu items yet
      AND NOT EXISTS (
        SELECT 1 FROM recognition_active_menu_items m 
        WHERE m.recognition_id = rf.recognition_id
      )
  ),
  menu_items_extracted AS (
    SELECT DISTINCT
      nr.recognition_id,
      item->>'ExternalId' as external_id,
      item->>'Name' as name,
      item->>'Category' as category,
      (item->>'Price')::NUMERIC as price,
      item - 'ExternalId' - 'Name' - 'Category' - 'Price' as metadata
    FROM new_recognitions nr,
    jsonb_array_elements(nr.active_menu) as item
  ),
  inserted_menu AS (
    INSERT INTO recognition_active_menu_items (recognition_id, external_id, name, category, price, metadata)
    SELECT 
      recognition_id,
      external_id,
      name,
      category,
      price,
      metadata
    FROM menu_items_extracted
    ON CONFLICT (recognition_id, external_id) DO UPDATE
    SET 
      name = EXCLUDED.name,
      category = EXCLUDED.category,
      price = EXCLUDED.price,
      metadata = EXCLUDED.metadata
    RETURNING id
  )
  SELECT COUNT(*) INTO menu_count FROM inserted_menu;
  
  -- Insert camera 1 images with actual dimensions
  WITH inserted AS (
    INSERT INTO images (recognition_id, camera_number, storage_path, width, height, created_at)
    SELECT DISTINCT ON (recognition_id)
      recognition_id,
      1,
      'recognitions/' || recognition_id || '/' || image1_path,
      COALESCE(image1_width, 1920),  -- Use actual width or default to 1920
      COALESCE(image1_height, 1080), -- Use actual height or default to 1080
      created_at
    FROM raw.recognition_files
    WHERE image1_path IS NOT NULL
    ORDER BY recognition_id, created_at DESC
    ON CONFLICT (recognition_id, camera_number) DO UPDATE
    SET 
      width = COALESCE(EXCLUDED.width, images.width),
      height = COALESCE(EXCLUDED.height, images.height)
    RETURNING id
  )
  SELECT COUNT(*) INTO img_count FROM inserted;
  
  -- Insert camera 2 images with actual dimensions
  WITH inserted AS (
    INSERT INTO images (recognition_id, camera_number, storage_path, width, height, created_at)
    SELECT DISTINCT ON (recognition_id)
      recognition_id,
      2,
      'recognitions/' || recognition_id || '/' || image2_path,
      COALESCE(image2_width, 1920),
      COALESCE(image2_height, 1080),
      created_at
    FROM raw.recognition_files
    WHERE image2_path IS NOT NULL
    ORDER BY recognition_id, created_at DESC
    ON CONFLICT (recognition_id, camera_number) DO UPDATE
    SET 
      width = COALESCE(EXCLUDED.width, images.width),
      height = COALESCE(EXCLUDED.height, images.height)
    RETURNING id
  )
  SELECT img_count + COUNT(*) INTO img_count FROM inserted;
  
  RETURN QUERY SELECT rec_count, img_count, menu_count;
END;
$$ LANGUAGE plpgsql;



