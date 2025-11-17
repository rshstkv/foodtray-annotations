-- Migration: Validation System
-- Description: On-the-fly task assignment and work log

-- Validation priority configuration (admin manages)
CREATE TABLE public.validation_priority_config (
  id BIGSERIAL PRIMARY KEY,
  validation_type public.validation_type NOT NULL UNIQUE,
  priority INTEGER NOT NULL, -- 1, 2, 3... (lower = higher priority)
  order_in_session INTEGER NOT NULL, -- Order within same priority
  effective_from_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_validation_priority_active ON validation_priority_config(is_active, priority);

-- Work log (created on-the-fly when user takes task)
CREATE TABLE public.validation_work_log (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL REFERENCES recognitions(id) ON DELETE CASCADE,
  validation_type public.validation_type NOT NULL,
  assigned_to UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_validation_work_log_recognition ON validation_work_log(recognition_id);
CREATE INDEX idx_validation_work_log_status ON validation_work_log(status, validation_type);
CREATE INDEX idx_validation_work_log_assigned ON validation_work_log(assigned_to);

-- Insert default validation priorities
INSERT INTO validation_priority_config (validation_type, priority, order_in_session, is_active) VALUES
  ('FOOD_VALIDATION', 1, 1, true),
  ('PLATE_VALIDATION', 1, 2, true),
  ('BUZZER_VALIDATION', 2, 1, true),
  ('OCCLUSION_VALIDATION', 3, 1, false),
  ('BOTTLE_ORIENTATION_VALIDATION', 3, 2, false);





