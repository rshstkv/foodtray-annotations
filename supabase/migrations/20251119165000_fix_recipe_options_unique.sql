-- Fix duplicate recipe_line_options issue
-- Problem: ON CONFLICT DO NOTHING doesn't work without UNIQUE constraint
-- This causes transform_raw_recipes to insert duplicates

-- Add UNIQUE constraint to prevent duplicates
-- Same recipe_line can have multiple options, but each (recipe_line_id, external_id, name) should be unique
ALTER TABLE recipe_line_options
ADD CONSTRAINT recipe_line_options_unique_option 
UNIQUE (recipe_line_id, external_id, name);

-- Note: This will fail if there are existing duplicates
-- Need to clean data first

