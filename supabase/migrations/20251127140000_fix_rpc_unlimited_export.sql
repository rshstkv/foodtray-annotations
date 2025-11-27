-- Migration: Fix RPC to support unlimited export (up to 100k records)
-- Description: Replace NULL limit with large number to bypass Supabase restrictions

DROP FUNCTION IF EXISTS get_filtered_work_logs(uuid[], bigint, text, text, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION get_filtered_work_logs(
  user_ids uuid[] DEFAULT NULL,
  search_recognition_id bigint DEFAULT NULL,
  step_food text DEFAULT NULL,
  step_plate text DEFAULT NULL,
  step_buzzer text DEFAULT NULL,
  step_occlusion text DEFAULT NULL,
  step_bottle text DEFAULT NULL,
  page_limit integer DEFAULT 50,
  page_offset integer DEFAULT 0
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
  LIMIT COALESCE(page_limit, 100000)  -- Default 100k instead of NULL
  OFFSET COALESCE(page_offset, 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_filtered_work_logs IS 
  'Returns latest completed work_log for each recognition with multi-stage filtering and pagination support. Max 100k records for export.';

