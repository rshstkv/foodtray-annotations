-- Migration: Physical Layer  
-- Description: Recognitions and tray items (что фактически на подносе)

-- Recognitions (съемки подноса)
CREATE TABLE public.recognitions (
  id BIGINT PRIMARY KEY,
  batch_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recognitions_batch ON recognitions(batch_id);

COMMENT ON TABLE recognitions IS 'Recognition sessions (tray captures). Active menu items are stored in recognition_active_menu_items table.';

-- Initial tray items (неизменяемое начальное состояние от Qwen + recipe)
CREATE TABLE public.initial_tray_items (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL REFERENCES recognitions(id) ON DELETE CASCADE,
  item_type public.item_type NOT NULL,
  source public.tray_item_source NOT NULL,
  
  -- References based on source:
  recipe_line_option_id BIGINT REFERENCES recipe_line_options(id), -- if source = RECIPE_LINE_OPTION
  menu_item_external_id TEXT, -- if source = MENU_ITEM (from active_menu)
  
  -- Metadata (характеристики объекта)
  metadata JSONB, -- e.g. {"color": "red"} for buzzers, {"label": "wallet"} for others
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_initial_tray_items_recognition ON initial_tray_items(recognition_id);
CREATE INDEX idx_initial_tray_items_type ON initial_tray_items(item_type);
CREATE INDEX idx_initial_tray_items_recipe_option ON initial_tray_items(recipe_line_option_id);

-- Current tray items (измененное состояние после правок user)
-- Only exists if user made changes
CREATE TABLE public.current_tray_items (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL REFERENCES recognitions(id) ON DELETE CASCADE,
  initial_tray_item_id BIGINT REFERENCES initial_tray_items(id), -- NULL if newly added
  item_type public.item_type NOT NULL,
  source public.tray_item_source NOT NULL,
  
  -- References based on source:
  recipe_line_option_id BIGINT REFERENCES recipe_line_options(id),
  menu_item_external_id TEXT,
  
  -- Metadata
  metadata JSONB,
  
  is_deleted BOOLEAN DEFAULT FALSE, -- Soft delete
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_current_tray_items_recognition ON current_tray_items(recognition_id);
CREATE INDEX idx_current_tray_items_initial ON current_tray_items(initial_tray_item_id);
CREATE INDEX idx_current_tray_items_type ON current_tray_items(item_type);

