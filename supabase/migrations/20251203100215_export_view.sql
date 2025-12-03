-- =====================================================
-- Migration: Fast Export View
-- =====================================================
-- Description: Create optimized VIEW and function for fast export
-- Solves: 2+ minutes export time → 5-30 seconds
-- Benefits: Always up-to-date, no caching issues, bypasses PostgREST limits

-- =====================================================
-- 1. Create VIEW with pre-aggregated data
-- =====================================================

CREATE OR REPLACE VIEW export_recognitions_view AS
WITH completed_logs AS (
  SELECT DISTINCT ON (vwl.recognition_id)
    vwl.recognition_id,
    vwl.id as work_log_id,
    r.batch_id,
    p.email as assigned_to_email,
    p.id as assigned_to,
    vwl.completed_at,
    vwl.validation_steps
  FROM validation_work_log vwl
  JOIN profiles p ON p.id = vwl.assigned_to
  LEFT JOIN recognitions r ON r.id = vwl.recognition_id
  WHERE vwl.status = 'completed'
  ORDER BY vwl.recognition_id, vwl.completed_at DESC
)
SELECT 
  cl.recognition_id,
  cl.work_log_id,
  cl.batch_id,
  cl.assigned_to,
  cl.assigned_to_email,
  cl.completed_at,
  cl.validation_steps,
  -- Aggregate items with recipe information
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'item_id', wi.id,
        'item_type', wi.type::text,
        'external_id', rlo.external_id,
        'name', rlo.name,
        'quantity', wi.quantity,
        'bottle_orientation', wi.bottle_orientation::text,
        'metadata', wi.metadata
      ) ORDER BY wi.id
    )
    FROM work_items wi
    LEFT JOIN recipe_line_options rlo ON rlo.recipe_line_id = wi.recipe_line_id 
      AND (rlo.is_selected = true OR rlo.id = (
        SELECT MIN(id) FROM recipe_line_options WHERE recipe_line_id = wi.recipe_line_id
      ))
    WHERE wi.work_log_id = cl.work_log_id AND wi.is_deleted = false
  ) as items_json,
  -- Aggregate images with annotations
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'camera_number', img.camera_number,
        'image_name', CASE WHEN img.camera_number = 1 THEN 'Main' ELSE 'Qualifying' END,
        'storage_path', img.storage_path,
        'width', img.width,
        'height', img.height,
        'annotations', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'item_id', wa.work_item_id,
              'bbox', wa.bbox,
              'is_occluded', COALESCE(wa.is_occluded, false),
              'occlusion_metadata', wa.occlusion_metadata,
              'was_modified', CASE WHEN ia.bbox IS NOT NULL AND ia.bbox != wa.bbox THEN true ELSE false END,
              'original_bbox', CASE WHEN ia.bbox IS NOT NULL AND ia.bbox != wa.bbox THEN ia.bbox ELSE NULL END
            )
          )
          FROM work_annotations wa
          LEFT JOIN initial_annotations ia ON ia.id = wa.initial_annotation_id
          WHERE wa.image_id = img.id AND wa.is_deleted = false
        )
      ) ORDER BY img.camera_number
    )
    FROM images img
    WHERE img.recognition_id = cl.recognition_id
  ) as images_json
FROM completed_logs cl;

-- =====================================================
-- 2. Create index for fast email filtering
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- =====================================================
-- 3. Add comments
-- =====================================================

COMMENT ON VIEW export_recognitions_view IS 
  'Pre-aggregated export data. Always up-to-date. Used by get_export_data() function.';

-- =====================================================
-- 4. Create fast export function
-- =====================================================

CREATE OR REPLACE FUNCTION get_export_data(
  p_user_emails text[] DEFAULT NULL,
  p_step_food text DEFAULT NULL,
  p_step_plate text DEFAULT NULL,
  p_step_buzzer text DEFAULT NULL,
  p_step_occlusion text DEFAULT NULL,
  p_step_bottle text DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'recognitions', jsonb_agg(
      jsonb_build_object(
        'recognition_id', recognition_id,
        'batch_id', batch_id,
        'validation_metadata', jsonb_build_object(
          'work_log_id', work_log_id,
          'assigned_to', assigned_to::text,
          'assigned_to_email', assigned_to_email,
          'completed_at', completed_at::text,
          'validation_steps', validation_steps
        ),
        'recipe', jsonb_build_object('items', COALESCE(items_json, '[]'::jsonb)),
        'images', COALESCE(images_json, '[]'::jsonb)
      ) ORDER BY recognition_id DESC
    )
  )
  INTO v_result
  FROM export_recognitions_view
  WHERE 
    -- User filter
    (p_user_emails IS NULL OR assigned_to_email = ANY(p_user_emails))
    -- Validation step filters
    AND (p_step_food IS NULL OR p_step_food = 'any' OR 
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(validation_steps) as step
        WHERE step->>'type' = 'FOOD_VALIDATION' AND step->>'status' = p_step_food
      ))
    AND (p_step_plate IS NULL OR p_step_plate = 'any' OR 
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(validation_steps) as step
        WHERE step->>'type' = 'PLATE_VALIDATION' AND step->>'status' = p_step_plate
      ))
    AND (p_step_buzzer IS NULL OR p_step_buzzer = 'any' OR 
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(validation_steps) as step
        WHERE step->>'type' = 'BUZZER_VALIDATION' AND step->>'status' = p_step_buzzer
      ))
    AND (p_step_occlusion IS NULL OR p_step_occlusion = 'any' OR 
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(validation_steps) as step
        WHERE step->>'type' = 'OCCLUSION_VALIDATION' AND step->>'status' = p_step_occlusion
      ))
    AND (p_step_bottle IS NULL OR p_step_bottle = 'any' OR 
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(validation_steps) as step
        WHERE step->>'type' = 'BOTTLE_ORIENTATION_VALIDATION' AND step->>'status' = p_step_bottle
      ));
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- 5. Add function comment
-- =====================================================

COMMENT ON FUNCTION get_export_data IS 
  'Fast export function. Returns JSONB (bypasses PostgREST 1000 row limit). Supports all current filters.';

