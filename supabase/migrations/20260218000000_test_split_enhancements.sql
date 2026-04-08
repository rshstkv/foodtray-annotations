-- =====================================================
-- Test Split Enhancements
-- 1. Product catalog table
-- 2. Add label_visible (separate from up/orientation)
-- 3. Add flagged/flag_comment to test_split_work_items
-- =====================================================

-- 1. Product catalog
CREATE TABLE public.product_catalog (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  ean TEXT,
  product_type TEXT NOT NULL,
  item_type public.item_type NOT NULL DEFAULT 'FOOD',
  is_dummy BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_product_catalog_name_ean
  ON product_catalog(name, COALESCE(ean, ''));

CREATE INDEX idx_product_catalog_product_type
  ON product_catalog(product_type);

ALTER TABLE product_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated"
  ON product_catalog FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

COMMENT ON TABLE product_catalog IS
  'Master catalog of known products for test split validation. Populated from test_split_items unique names.';

-- 2. Add label_visible to test_split_work_items
-- Two separate properties for bottles:
--   up (BOOLEAN) = vertical (true) / horizontal (false) — physical position
--   label_visible (BOOLEAN) = label facing camera — only relevant for horizontal bottles
ALTER TABLE test_split_work_items
  ADD COLUMN IF NOT EXISTS label_visible BOOLEAN;

-- 3. Add flagged/flag_comment to test_split_work_items
ALTER TABLE test_split_work_items
  ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS flag_comment TEXT;

CREATE INDEX idx_ts_work_items_flagged
  ON test_split_work_items(work_log_id) WHERE flagged = TRUE;
