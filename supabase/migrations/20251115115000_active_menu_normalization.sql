-- Migration: Active Menu Normalization
-- Description: Extract active_menu from JSONB into separate table for easier querying

-- Active menu items per recognition
-- Represents menu items available at the time of recognition
CREATE TABLE public.recognition_active_menu_items (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL REFERENCES recognitions(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL, -- Menu item code (SKU)
  name TEXT NOT NULL, -- Dish name as it appeared in menu
  category TEXT, -- Category from menu (optional)
  price NUMERIC(10,2), -- Price at that moment (optional)
  metadata JSONB, -- Any additional fields from active_menu.json
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One entry per recognition+external_id combination
  UNIQUE(recognition_id, external_id)
);

CREATE INDEX idx_active_menu_recognition ON recognition_active_menu_items(recognition_id);
CREATE INDEX idx_active_menu_external_id ON recognition_active_menu_items(external_id);
CREATE INDEX idx_active_menu_name ON recognition_active_menu_items(name);

-- Drop active_menu JSONB column from recognitions (if it exists from old migrations)
-- This is handled in 20251115050000_physical_layer.sql now

-- Add foreign keys from tray_items to active menu items
-- This ensures menu_item_external_id references valid entries
ALTER TABLE public.initial_tray_items
ADD CONSTRAINT fk_initial_tray_items_menu
FOREIGN KEY (recognition_id, menu_item_external_id)
REFERENCES recognition_active_menu_items(recognition_id, external_id)
DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.current_tray_items
ADD CONSTRAINT fk_current_tray_items_menu
FOREIGN KEY (recognition_id, menu_item_external_id)
REFERENCES recognition_active_menu_items(recognition_id, external_id)
DEFERRABLE INITIALLY DEFERRED;

COMMENT ON TABLE recognition_active_menu_items IS 'Menu items that were active at the time of recognition. Used when annotators need to link tray items to dishes from menu.';
COMMENT ON CONSTRAINT fk_initial_tray_items_menu ON initial_tray_items IS 'Ensures menu_item_external_id references valid active menu item for this recognition';
COMMENT ON CONSTRAINT fk_current_tray_items_menu ON current_tray_items IS 'Ensures menu_item_external_id references valid active menu item for this recognition';

