-- =====================================================
-- Test Split Validation: isolated tables for parquet-based review
-- Does NOT touch any existing tables or data
-- =====================================================

-- 1. Test split recognitions (metadata from parquet)
CREATE TABLE public.test_split_recognitions (
  recognition_id BIGINT PRIMARY KEY REFERENCES recognitions(id) ON DELETE CASCADE,
  canteen_guid TEXT,
  canteen_name TEXT,
  captured_at TIMESTAMPTZ,
  active_menu JSONB,
  correct_dishes JSONB,
  split TEXT NOT NULL DEFAULT 'test',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE test_split_recognitions IS
  'Test split recognitions imported from parquet. Fully isolated from main validation flow.';

-- 2. Test split items (objects detected in parquet bboxes)
CREATE TABLE public.test_split_items (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL REFERENCES test_split_recognitions(recognition_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ean TEXT,
  product_type TEXT NOT NULL,
  item_type public.item_type NOT NULL,
  up BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ts_items_recognition ON test_split_items(recognition_id);

COMMENT ON TABLE test_split_items IS
  'Items (objects) from parquet bboxes for test split validation. Each unique (name, ean) per recognition = one item.';

-- 3. Test split annotations (bboxes from parquet, one per camera per item)
CREATE TABLE public.test_split_annotations (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL REFERENCES test_split_recognitions(recognition_id) ON DELETE CASCADE,
  test_split_item_id BIGINT NOT NULL REFERENCES test_split_items(id) ON DELETE CASCADE,
  image_id BIGINT REFERENCES images(id) ON DELETE CASCADE,
  camera_number INTEGER NOT NULL CHECK (camera_number IN (1, 2)),
  bbox JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ts_annotations_recognition ON test_split_annotations(recognition_id);
CREATE INDEX idx_ts_annotations_item ON test_split_annotations(test_split_item_id);
CREATE INDEX idx_ts_annotations_image ON test_split_annotations(image_id);

COMMENT ON TABLE test_split_annotations IS
  'Bboxes from parquet for test split. bbox format: {x, y, w, h} in pixels.';

-- 4. Test split work log (task assignment, isolated from validation_work_log)
CREATE TABLE public.test_split_work_log (
  id BIGSERIAL PRIMARY KEY,
  recognition_id BIGINT NOT NULL REFERENCES test_split_recognitions(recognition_id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'abandoned')) DEFAULT 'in_progress',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ts_work_log_recognition ON test_split_work_log(recognition_id);
CREATE INDEX idx_ts_work_log_status ON test_split_work_log(status);
CREATE INDEX idx_ts_work_log_assigned ON test_split_work_log(assigned_to);

COMMENT ON TABLE test_split_work_log IS
  'Work log for test split validation. Isolated from main validation_work_log.';

-- 5. Test split work items (editable copies during session)
CREATE TABLE public.test_split_work_items (
  id BIGSERIAL PRIMARY KEY,
  work_log_id BIGINT NOT NULL REFERENCES test_split_work_log(id) ON DELETE CASCADE,
  initial_item_id BIGINT REFERENCES test_split_items(id),
  recognition_id BIGINT NOT NULL REFERENCES test_split_recognitions(recognition_id) ON DELETE CASCADE,
  type public.item_type NOT NULL,
  name TEXT,
  ean TEXT,
  product_type TEXT,
  up BOOLEAN,
  bottle_orientation public.bottle_orientation,
  quantity INTEGER NOT NULL DEFAULT 1,
  metadata JSONB,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ts_work_items_work_log ON test_split_work_items(work_log_id);
CREATE INDEX idx_ts_work_items_recognition ON test_split_work_items(recognition_id);
CREATE INDEX idx_ts_work_items_not_deleted ON test_split_work_items(work_log_id) WHERE NOT is_deleted;

-- 6. Test split work annotations (editable copies during session)
CREATE TABLE public.test_split_work_annotations (
  id BIGSERIAL PRIMARY KEY,
  work_log_id BIGINT NOT NULL REFERENCES test_split_work_log(id) ON DELETE CASCADE,
  initial_annotation_id BIGINT REFERENCES test_split_annotations(id),
  image_id BIGINT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  work_item_id BIGINT NOT NULL REFERENCES test_split_work_items(id) ON DELETE CASCADE,
  bbox JSONB NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  is_occluded BOOLEAN DEFAULT FALSE,
  occlusion_metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ts_work_annotations_work_log ON test_split_work_annotations(work_log_id);
CREATE INDEX idx_ts_work_annotations_image ON test_split_work_annotations(image_id);
CREATE INDEX idx_ts_work_annotations_item ON test_split_work_annotations(work_item_id);
CREATE INDEX idx_ts_work_annotations_not_deleted ON test_split_work_annotations(work_log_id) WHERE NOT is_deleted;

-- Triggers for updated_at
CREATE TRIGGER update_ts_work_items_updated_at
  BEFORE UPDATE ON test_split_work_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ts_work_annotations_updated_at
  BEFORE UPDATE ON test_split_work_annotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ts_work_log_updated_at
  BEFORE UPDATE ON test_split_work_log
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Trigger: copy test_split_items/annotations into work tables on work_log creation
-- =====================================================
CREATE OR REPLACE FUNCTION initialize_test_split_work_session()
RETURNS TRIGGER AS $$
DECLARE
  item_mapping JSONB := '{}';
  item_record RECORD;
  new_item_id BIGINT;
BEGIN
  FOR item_record IN
    SELECT * FROM test_split_items
    WHERE recognition_id = NEW.recognition_id
  LOOP
    INSERT INTO test_split_work_items (
      work_log_id, initial_item_id, recognition_id,
      type, name, ean, product_type, up, quantity, metadata
    ) VALUES (
      NEW.id, item_record.id, item_record.recognition_id,
      item_record.item_type, item_record.name, item_record.ean,
      item_record.product_type, item_record.up, 1,
      jsonb_build_object('name', item_record.name, 'ean', item_record.ean)
    )
    RETURNING id INTO new_item_id;

    item_mapping := item_mapping || jsonb_build_object(item_record.id::text, new_item_id);
  END LOOP;

  -- Copy annotations, remapping item IDs
  INSERT INTO test_split_work_annotations (
    work_log_id, initial_annotation_id, image_id,
    work_item_id, bbox
  )
  SELECT
    NEW.id,
    ta.id,
    ta.image_id,
    (item_mapping->>ta.test_split_item_id::text)::bigint,
    ta.bbox
  FROM test_split_annotations ta
  WHERE ta.recognition_id = NEW.recognition_id
    AND item_mapping ? ta.test_split_item_id::text;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_initialize_test_split_work_session
  AFTER INSERT ON test_split_work_log
  FOR EACH ROW
  EXECUTE FUNCTION initialize_test_split_work_session();

COMMENT ON FUNCTION initialize_test_split_work_session IS
  'Copies test_split_items and test_split_annotations into work tables when a test_split_work_log is created.';

-- =====================================================
-- RPC: acquire next test split recognition for validation
-- =====================================================
CREATE OR REPLACE FUNCTION acquire_test_split_recognition(p_user_id UUID)
RETURNS TABLE(work_log_id BIGINT, recognition_id BIGINT) AS $$
DECLARE
  v_recognition_id BIGINT;
  v_work_log_id BIGINT;
BEGIN
  -- Check if user already has an in_progress task
  SELECT wl.id, wl.recognition_id
  INTO v_work_log_id, v_recognition_id
  FROM test_split_work_log wl
  WHERE wl.assigned_to = p_user_id AND wl.status = 'in_progress'
  LIMIT 1;

  IF v_work_log_id IS NOT NULL THEN
    RETURN QUERY SELECT v_work_log_id, v_recognition_id;
    RETURN;
  END IF;

  -- Find next available recognition (not currently in_progress by anyone, not completed)
  SELECT tsr.recognition_id INTO v_recognition_id
  FROM test_split_recognitions tsr
  WHERE NOT EXISTS (
    SELECT 1 FROM test_split_work_log wl
    WHERE wl.recognition_id = tsr.recognition_id
      AND wl.status IN ('in_progress', 'completed')
  )
  ORDER BY tsr.recognition_id
  LIMIT 1
  FOR UPDATE OF tsr SKIP LOCKED;

  IF v_recognition_id IS NULL THEN
    RETURN;
  END IF;

  -- Create work log (trigger will copy items/annotations)
  INSERT INTO test_split_work_log (recognition_id, assigned_to, status)
  VALUES (v_recognition_id, p_user_id, 'in_progress')
  RETURNING id INTO v_work_log_id;

  RETURN QUERY SELECT v_work_log_id, v_recognition_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION acquire_test_split_recognition IS
  'Atomically acquire next available test split recognition for validation. Returns existing in_progress task if any.';

-- =====================================================
-- RLS policies (same approach as main tables)
-- =====================================================
ALTER TABLE test_split_recognitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_split_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_split_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_split_work_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_split_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_split_work_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON test_split_recognitions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON test_split_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON test_split_annotations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON test_split_work_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON test_split_work_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON test_split_work_annotations FOR ALL TO authenticated USING (true) WITH CHECK (true);
