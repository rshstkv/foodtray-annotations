-- Migration: Business Layer
-- Description: Recipes (что должно быть по чеку) and menu items (справочник блюд)

-- Recipes (кассовые чеки/рецепты)
CREATE TABLE public.recipes (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL UNIQUE, -- One recipe per recognition
  raw_payload JSONB,
  total_amount NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recipes_recognition ON recipes(recognition_id);

-- Recipe lines (строки рецепта)
CREATE TABLE public.recipe_lines (
  id BIGSERIAL PRIMARY KEY,
  recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL, -- Order in recipe
  quantity INTEGER NOT NULL,
  has_ambiguity BOOLEAN DEFAULT FALSE, -- True if multiple options
  raw_name TEXT, -- Name as it appears in recipe
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recipe_id, line_number)
);

CREATE INDEX idx_recipe_lines_recipe ON recipe_lines(recipe_id);

-- Recipe line options (варианты для неопределенностей)
-- If has_ambiguity = true, recipe_line will have multiple options
CREATE TABLE public.recipe_line_options (
  id BIGSERIAL PRIMARY KEY,
  recipe_line_id BIGINT NOT NULL REFERENCES recipe_lines(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL, -- Menu item code
  name TEXT NOT NULL, -- Dish name
  is_selected BOOLEAN DEFAULT FALSE, -- Selected by annotator
  model_score FLOAT, -- Model confidence (optional)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recipe_line_options_line ON recipe_line_options(recipe_line_id);
CREATE INDEX idx_recipe_line_options_external ON recipe_line_options(external_id);

-- Menu items (справочник блюд из активного меню)
-- Stored as JSONB in recognitions.active_menu, but can be queried via views if needed
-- No separate table for now - active_menu is per-recognition JSONB











