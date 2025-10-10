-- Create correct_dishes table to store manually selected correct dishes
-- Records are created ONLY when state='no' and user manually selects the correct dish
BEGIN;

CREATE TABLE correct_dishes (
  id BIGSERIAL PRIMARY KEY,
  clarification_db_id BIGINT UNIQUE NOT NULL REFERENCES clarifications(id) ON DELETE CASCADE,
  clarification_id TEXT NOT NULL,
  selected_ean TEXT NOT NULL,
  selected_product_name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('available', 'menu')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for joins
CREATE INDEX idx_correct_dishes_clarification_db_id ON correct_dishes(clarification_db_id);
CREATE INDEX idx_correct_dishes_clarification_id ON correct_dishes(clarification_id);
CREATE INDEX idx_correct_dishes_selected_ean ON correct_dishes(selected_ean);

-- RLS for local dev
ALTER TABLE correct_dishes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on correct_dishes" ON correct_dishes FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE correct_dishes IS 'Manually selected correct dishes when state=no';
COMMENT ON COLUMN correct_dishes.clarification_db_id IS 'Foreign key to clarifications.id';
COMMENT ON COLUMN correct_dishes.clarification_id IS 'Original clarification_id for lookup (not FK)';
COMMENT ON COLUMN correct_dishes.selected_ean IS 'EAN of the manually selected correct dish';
COMMENT ON COLUMN correct_dishes.selected_product_name IS 'Name of the manually selected correct dish';
COMMENT ON COLUMN correct_dishes.source IS 'Source of selection: available (from available_products) or menu (from full menu search)';

COMMIT;

