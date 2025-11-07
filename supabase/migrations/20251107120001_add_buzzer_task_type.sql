-- ============================================================================
-- Add buzzer_annotation task type and workflow stage
-- ============================================================================

-- Insert buzzer_annotation task type
INSERT INTO task_types (code, name, description, ui_config, is_active)
VALUES (
  'buzzer_annotation',
  'Разметка баззеров',
  'Рисование bounding boxes для баззеров и выбор их цвета',
  '{
    "layout": "dual-image",
    "object_type": "buzzer",
    "colors": ["blue", "red", "green", "white"],
    "actions": {
      "bbox_create": true,
      "bbox_delete": true,
      "color_select": true
    },
    "ui": {
      "show_both_images": true,
      "require_both_images": true,
      "quick_keys": {
        "d": "toggle_drawing",
        "del": "delete_bbox",
        "tab": "toggle_image",
        "enter": "complete",
        "esc": "skip"
      }
    }
  }'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  ui_config = EXCLUDED.ui_config,
  is_active = EXCLUDED.is_active;

-- Insert workflow stage for buzzer_annotation
INSERT INTO workflow_stages (task_type_id, stage_order, name, skip_condition, is_optional)
SELECT 
  tt.id,
  1,
  'Разметка баззеров',
  NULL,
  false
FROM task_types tt
WHERE tt.code = 'buzzer_annotation'
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN task_types.ui_config IS 'UI configuration for the task including colors for buzzer_annotation';

