-- Add additional clarification states: bbox_error and unknown
BEGIN;

-- Update the check constraint to include new states
ALTER TABLE clarification_states DROP CONSTRAINT IF EXISTS clarification_states_state_check;
ALTER TABLE clarification_states ADD CONSTRAINT clarification_states_state_check 
  CHECK (state IN ('yes', 'no', 'bbox_error', 'unknown'));

-- Add comment explaining the new states
COMMENT ON COLUMN clarification_states.state IS 'Clarification validation state: yes (correct), no (incorrect), bbox_error (bounding box error), unknown (unclear/uncertain)';

COMMIT;
