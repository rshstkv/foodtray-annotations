-- Seed validation_priority_config with default active types
INSERT INTO validation_priority_config (validation_type, is_active, order_in_session)
VALUES 
  ('FOOD_VALIDATION', true, 1),
  ('PLATE_VALIDATION', true, 2),
  ('BUZZER_VALIDATION', true, 3),
  ('OCCLUSION_VALIDATION', true, 4)
ON CONFLICT (validation_type) DO UPDATE
SET 
  is_active = EXCLUDED.is_active,
  order_in_session = EXCLUDED.order_in_session;

COMMENT ON TABLE validation_priority_config IS 'Конфигурация порядка валидаций в multi-step сессии';
