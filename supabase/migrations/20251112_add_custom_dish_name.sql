-- Add custom_dish_name column to annotations table
ALTER TABLE annotations 
ADD COLUMN IF NOT EXISTS custom_dish_name TEXT;

-- Add comment
COMMENT ON COLUMN annotations.custom_dish_name IS 'Selected dish name when there are multiple options in receipt (resolves ambiguity)';

