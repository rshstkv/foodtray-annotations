-- Create menu_items table to store the reference menu
BEGIN;

CREATE TABLE menu_items (
  id BIGSERIAL PRIMARY KEY,
  proto_name TEXT NOT NULL,
  ean TEXT,
  super_class TEXT,
  product_name TEXT NOT NULL,
  english_name TEXT,
  reference_image_url TEXT,
  index_order INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast search
CREATE INDEX idx_menu_items_ean ON menu_items(ean) WHERE ean IS NOT NULL;
CREATE INDEX idx_menu_items_product_name ON menu_items(product_name);
CREATE INDEX idx_menu_items_proto_name ON menu_items(proto_name);

-- RLS for local dev
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on menu_items" ON menu_items FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE menu_items IS 'Reference menu items from the CSV file';
COMMENT ON COLUMN menu_items.proto_name IS 'Internal proto name identifier';
COMMENT ON COLUMN menu_items.ean IS 'Product EAN code (may be null or duplicated)';
COMMENT ON COLUMN menu_items.super_class IS 'Super class category';
COMMENT ON COLUMN menu_items.product_name IS 'Product name in Portuguese';
COMMENT ON COLUMN menu_items.english_name IS 'Product name in English';
COMMENT ON COLUMN menu_items.reference_image_url IS 'URL to reference image (nullable, to be added later)';
COMMENT ON COLUMN menu_items.index_order IS 'Original order from CSV';

COMMIT;

