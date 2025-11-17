-- Migration: Add bottle_orientation field to initial_tray_items and work_items
-- Date: 2025-11-17

-- Add enum type for bottle orientation
CREATE TYPE bottle_orientation AS ENUM ('horizontal', 'vertical');

-- Add bottle_orientation column to initial_tray_items
ALTER TABLE initial_tray_items
ADD COLUMN bottle_orientation bottle_orientation NULL;

COMMENT ON COLUMN initial_tray_items.bottle_orientation IS 'Orientation of bottle items (horizontal/vertical), NULL for non-bottle items';

-- Add bottle_orientation column to work_items
ALTER TABLE work_items
ADD COLUMN bottle_orientation bottle_orientation NULL;

COMMENT ON COLUMN work_items.bottle_orientation IS 'Orientation of bottle items (horizontal/vertical), NULL for non-bottle items';

