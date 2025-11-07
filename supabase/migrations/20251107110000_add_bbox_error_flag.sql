-- ============================================================================
-- Add bbox_error flag type support
-- ============================================================================

-- Update flag_task function to support bbox_error
CREATE OR REPLACE FUNCTION flag_task(
  p_recognition_id TEXT,
  p_flag_type TEXT, -- 'bbox_error', 'check_error', 'manual_review'
  p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_new_state TEXT;
BEGIN
  -- Определяем новый workflow_state на основе флага
  CASE p_flag_type
    WHEN 'bbox_error' THEN
      v_new_state := 'requires_correction';
    WHEN 'check_error' THEN
      v_new_state := 'check_error_pending';
    WHEN 'manual_review' THEN
      v_new_state := 'manual_review_pending';
    ELSE
      RAISE EXCEPTION 'Invalid flag_type: %', p_flag_type;
  END CASE;

  -- Обновляем recognition
  UPDATE recognitions
  SET 
    workflow_state = v_new_state,
    assigned_to = NULL,
    started_at = NULL,
    annotator_notes = COALESCE(annotator_notes || E'\n', '') || 
                      '[' || NOW()::TEXT || '] ' || 
                      p_flag_type || ': ' || COALESCE(p_reason, 'No reason provided')
  WHERE recognition_id = p_recognition_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Удалить старый constraint на recognitions.workflow_state если он есть и создать новый
ALTER TABLE recognitions DROP CONSTRAINT IF EXISTS recognitions_workflow_state_check;
ALTER TABLE recognitions ADD CONSTRAINT recognitions_workflow_state_check 
  CHECK (workflow_state IN ('pending', 'in_progress', 'completed', 'requires_correction', 'check_error_pending', 'manual_review_pending'));

COMMENT ON FUNCTION flag_task IS 'Flags a recognition with specific error type and moves it to appropriate workflow state';

