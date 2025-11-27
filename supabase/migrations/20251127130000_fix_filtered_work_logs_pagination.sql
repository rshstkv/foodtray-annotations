-- Migration: Add pagination support to get_filtered_work_logs RPC
-- Description: Return total count separately and support LIMIT/OFFSET

-- Drop old function
DROP FUNCTION IF EXISTS get_filtered_work_logs(uuid[], bigint, text, text, text, text, text);

-- Create new function with pagination support
CREATE OR REPLACE FUNCTION get_filtered_work_logs(
  user_ids uuid[] DEFAULT NULL,
  search_recognition_id bigint DEFAULT NULL,
  step_food text DEFAULT NULL,
  step_plate text DEFAULT NULL,
  step_buzzer text DEFAULT NULL,
  step_occlusion text DEFAULT NULL,
  step_bottle text DEFAULT NULL,
  page_limit integer DEFAULT NULL,
  page_offset integer DEFAULT NULL
)
RETURNS TABLE (
  recognition_id bigint,
  work_log_id bigint,
  validation_steps jsonb,
  assigned_to uuid,
  completed_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_logs AS (
    SELECT DISTINCT ON (vwl.recognition_id)
      vwl.recognition_id,
      vwl.id as work_log_id,
      vwl.validation_steps,
      vwl.assigned_to,
      vwl.completed_at
    FROM validation_work_log vwl
    WHERE 
      vwl.status = 'completed'
      AND (user_ids IS NULL OR vwl.assigned_to = ANY(user_ids))
      AND (search_recognition_id IS NULL OR vwl.recognition_id = search_recognition_id)
    ORDER BY vwl.recognition_id, vwl.completed_at DESC
  ),
  filtered_logs AS (
    SELECT 
      ll.recognition_id,
      ll.work_log_id,
      ll.validation_steps,
      ll.assigned_to,
      ll.completed_at
    FROM latest_logs ll
    WHERE
      -- FOOD_VALIDATION filter
      (step_food IS NULL OR step_food = 'any' OR
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(ll.validation_steps) as step
          WHERE step->>'type' = 'FOOD_VALIDATION'
            AND step->>'status' = step_food
        )
      )
      AND
      -- PLATE_VALIDATION filter
      (step_plate IS NULL OR step_plate = 'any' OR
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(ll.validation_steps) as step
          WHERE step->>'type' = 'PLATE_VALIDATION'
            AND step->>'status' = step_plate
        )
      )
      AND
      -- BUZZER_VALIDATION filter
      (step_buzzer IS NULL OR step_buzzer = 'any' OR
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(ll.validation_steps) as step
          WHERE step->>'type' = 'BUZZER_VALIDATION'
            AND step->>'status' = step_buzzer
        )
      )
      AND
      -- OCCLUSION_VALIDATION filter
      (step_occlusion IS NULL OR step_occlusion = 'any' OR
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(ll.validation_steps) as step
          WHERE step->>'type' = 'OCCLUSION_VALIDATION'
            AND step->>'status' = step_occlusion
        )
      )
      AND
      -- BOTTLE_ORIENTATION_VALIDATION filter
      (step_bottle IS NULL OR step_bottle = 'any' OR
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(ll.validation_steps) as step
          WHERE step->>'type' = 'BOTTLE_ORIENTATION_VALIDATION'
            AND step->>'status' = step_bottle
        )
      )
    ORDER BY ll.recognition_id DESC
  )
  SELECT 
    fl.recognition_id,
    fl.work_log_id,
    fl.validation_steps,
    fl.assigned_to,
    fl.completed_at
  FROM filtered_logs fl
  LIMIT page_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- Separate function to get total count (for pagination)
CREATE OR REPLACE FUNCTION get_filtered_work_logs_count(
  user_ids uuid[] DEFAULT NULL,
  search_recognition_id bigint DEFAULT NULL,
  step_food text DEFAULT NULL,
  step_plate text DEFAULT NULL,
  step_buzzer text DEFAULT NULL,
  step_occlusion text DEFAULT NULL,
  step_bottle text DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  total_count bigint;
BEGIN
  WITH latest_logs AS (
    SELECT DISTINCT ON (vwl.recognition_id)
      vwl.recognition_id,
      vwl.validation_steps
    FROM validation_work_log vwl
    WHERE 
      vwl.status = 'completed'
      AND (user_ids IS NULL OR vwl.assigned_to = ANY(user_ids))
      AND (search_recognition_id IS NULL OR vwl.recognition_id = search_recognition_id)
    ORDER BY vwl.recognition_id, vwl.completed_at DESC
  )
  SELECT COUNT(*) INTO total_count
  FROM latest_logs ll
  WHERE
    (step_food IS NULL OR step_food = 'any' OR
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(ll.validation_steps) as step
        WHERE step->>'type' = 'FOOD_VALIDATION'
          AND step->>'status' = step_food
      )
    )
    AND
    (step_plate IS NULL OR step_plate = 'any' OR
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(ll.validation_steps) as step
        WHERE step->>'type' = 'PLATE_VALIDATION'
          AND step->>'status' = step_plate
      )
    )
    AND
    (step_buzzer IS NULL OR step_buzzer = 'any' OR
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(ll.validation_steps) as step
        WHERE step->>'type' = 'BUZZER_VALIDATION'
          AND step->>'status' = step_buzzer
      )
    )
    AND
    (step_occlusion IS NULL OR step_occlusion = 'any' OR
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(ll.validation_steps) as step
        WHERE step->>'type' = 'OCCLUSION_VALIDATION'
          AND step->>'status' = step_occlusion
      )
    )
    AND
    (step_bottle IS NULL OR step_bottle = 'any' OR
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(ll.validation_steps) as step
        WHERE step->>'type' = 'BOTTLE_ORIENTATION_VALIDATION'
          AND step->>'status' = step_bottle
      )
    );
  
  RETURN total_count;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_filtered_work_logs IS 
  'Returns latest completed work_log for each recognition with multi-stage filtering and pagination support';

COMMENT ON FUNCTION get_filtered_work_logs_count IS 
  'Returns total count of filtered work_logs for pagination';

