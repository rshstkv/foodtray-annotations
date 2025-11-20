-- Migration: Add priority_filter to validation_work_log
-- Description: Save user's selected filter to reuse when acquiring next task

-- Add priority_filter column
ALTER TABLE validation_work_log 
ADD COLUMN IF NOT EXISTS priority_filter priority_filter_type DEFAULT 'any';

-- Add index
CREATE INDEX IF NOT EXISTS idx_work_log_priority_filter 
ON validation_work_log(priority_filter);

COMMENT ON COLUMN validation_work_log.priority_filter IS 
  'Filter used when acquiring this recognition. Reused when acquiring next task after completion.';

