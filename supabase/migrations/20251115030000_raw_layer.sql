-- Migration: Raw Data Layer
-- Description: Tables for ingesting raw data from source systems

-- Recognition files metadata
CREATE TABLE raw.recognition_files (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL,
  batch_id TEXT,
  active_menu JSONB, -- AM.json content (menu items available at recognition time)
  image1_path TEXT,
  image2_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_raw_recognition_files_id ON raw.recognition_files(recognition_id);

-- Recipes (correct_dishes from source)
CREATE TABLE raw.recipes (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL,
  payload JSONB, -- Full JSON payload
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_raw_recipes_id ON raw.recipes(recognition_id);

-- Qwen annotations (model detections)
CREATE TABLE raw.qwen_annotations (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL,
  image_path TEXT, -- camera1.jpg or camera2.jpg
  bbox JSONB, -- {x, y, w, h}
  class_name TEXT, -- dish_0, dish_1, plate, etc.
  item_type TEXT, -- FOOD or PLATE
  external_id TEXT, -- menu item code (usually NULL for Qwen)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_raw_qwen_annotations_id ON raw.qwen_annotations(recognition_id);
CREATE INDEX idx_raw_qwen_annotations_image ON raw.qwen_annotations(recognition_id, image_path);

