-- Migration: Remove priority field from validation_priority_config
-- Description: Priority is not used in multi-step architecture, only order_in_session matters

-- Drop legacy view and function that depend on priority
-- These are no longer used after multi-step architecture (acquire_recognition_with_steps is used instead)
DROP VIEW IF EXISTS available_validation_tasks CASCADE;
DROP FUNCTION IF EXISTS acquire_next_task(UUID);

-- Drop the index that includes priority
DROP INDEX IF EXISTS idx_validation_priority_active;

-- Remove priority column
ALTER TABLE validation_priority_config DROP COLUMN IF EXISTS priority;

-- Recreate index without priority
CREATE INDEX idx_validation_priority_active ON validation_priority_config(is_active, order_in_session);

