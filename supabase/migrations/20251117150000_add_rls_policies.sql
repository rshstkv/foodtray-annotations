-- Migration: Add RLS policies for all tables
-- Description: Enable RLS and create permissive policies for local development

-- Enable RLS on all tables
ALTER TABLE recognitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_line_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE recognition_active_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE initial_tray_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE initial_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_priority_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_work_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_annotations ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for authenticated users (local development)
-- recognitions
CREATE POLICY "Allow all for authenticated users" ON recognitions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- images  
CREATE POLICY "Allow all for authenticated users" ON images
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- recipes
CREATE POLICY "Allow all for authenticated users" ON recipes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- recipe_lines
CREATE POLICY "Allow all for authenticated users" ON recipe_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- recipe_line_options
CREATE POLICY "Allow all for authenticated users" ON recipe_line_options
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- recognition_active_menu_items
CREATE POLICY "Allow all for authenticated users" ON recognition_active_menu_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- initial_tray_items
CREATE POLICY "Allow all for authenticated users" ON initial_tray_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- initial_annotations
CREATE POLICY "Allow all for authenticated users" ON initial_annotations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- validation_priority_config
CREATE POLICY "Allow all for authenticated users" ON validation_priority_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- validation_work_log
CREATE POLICY "Allow all for authenticated users" ON validation_work_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- work_items
CREATE POLICY "Allow all for authenticated users" ON work_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- work_annotations
CREATE POLICY "Allow all for authenticated users" ON work_annotations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

