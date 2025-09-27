-- Orders table (one per pos_transaction_id)
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  pos_transaction_id TEXT UNIQUE NOT NULL,
  device_canteen_name TEXT NOT NULL,
  start_dtts TIMESTAMP WITH TIME ZONE NOT NULL,
  has_assistant_events BOOLEAN NOT NULL DEFAULT false,
  image_url_main TEXT,
  image_url_qualifying TEXT,
  sign TEXT, -- which image is primary: "main" or "qualifying"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Clarifications table (one per dish in order)
CREATE TABLE clarifications (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  clarification_id TEXT UNIQUE NOT NULL, -- original system ID
  rectangle TEXT NOT NULL, -- coordinates of dish
  clarification_type TEXT NOT NULL,
  image_found BOOLEAN NOT NULL DEFAULT false,
  product_name TEXT, -- human readable dish name
  superclass TEXT,
  hyperclass TEXT,
  ean_matched JSONB, -- matched products array
  ean_matched_count INTEGER DEFAULT 0,
  available_products JSONB NOT NULL, -- d.details array
  metadata JSONB, -- is_buzzer, buzzer_type, buzzer_color, is_auto_chosen
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- States table (unchanged, references clarification_id)
CREATE TABLE IF NOT EXISTS clarification_states (
  id BIGSERIAL PRIMARY KEY,
  clarification_id TEXT UNIQUE NOT NULL REFERENCES clarifications(clarification_id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('yes', 'no')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_orders_pos_transaction_id ON orders(pos_transaction_id);
CREATE INDEX idx_orders_device_canteen_name ON orders(device_canteen_name);
CREATE INDEX idx_orders_start_dtts ON orders(start_dtts);

CREATE INDEX idx_clarifications_order_id ON clarifications(order_id);
CREATE INDEX idx_clarifications_clarification_id ON clarifications(clarification_id);
CREATE INDEX idx_clarifications_product_name ON clarifications(product_name);

CREATE INDEX idx_clarification_states_clarification_id ON clarification_states(clarification_id);
CREATE INDEX idx_clarification_states_updated_at ON clarification_states(updated_at);

-- RLS and policies for local dev
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE clarifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE clarification_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on clarifications" ON clarifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on clarification_states" ON clarification_states FOR ALL USING (true) WITH CHECK (true);
