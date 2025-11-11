-- Добавление validation_mode, profiles таблицы, и системы assignment
-- БЕЗ db reset - только добавление новых колонок и структур

-- 1. Добавить validation_mode колонку
ALTER TABLE recognitions ADD COLUMN IF NOT EXISTS validation_mode TEXT CHECK (validation_mode IN ('quick', 'edit'));
CREATE INDEX IF NOT EXISTS idx_recognitions_validation_mode ON recognitions(validation_mode);

-- 2. Добавить assignment поля (UUID для связи с auth.users)
ALTER TABLE recognitions ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE recognitions ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_recognitions_assigned_to ON recognitions(assigned_to);

-- 3. Создать таблицу profiles (best practice Supabase)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'annotator' CHECK (role IN ('admin', 'annotator')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS на profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS политики: все могут читать свой профиль, только админы могут менять роли
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can update profiles" ON profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 4. Trigger для автоматического создания profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'annotator');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Функция для вычисления validation_mode
CREATE OR REPLACE FUNCTION calculate_validation_mode(p_recognition_id TEXT)
RETURNS TEXT AS $$
DECLARE
  expected_count INTEGER;
  main_count INTEGER;
  qual_count INTEGER;
  dish_aligned BOOLEAN;
  main_image_id INTEGER;
  qual_image_id INTEGER;
BEGIN
  -- Получить expected count
  SELECT SUM((cd->>'Count')::INTEGER) INTO expected_count
  FROM recognitions r, jsonb_array_elements(r.correct_dishes) cd
  WHERE r.recognition_id = p_recognition_id;
  
  -- Получить image IDs
  SELECT id INTO main_image_id FROM recognition_images 
  WHERE recognition_id = p_recognition_id AND photo_type = 'Main' LIMIT 1;
  
  SELECT id INTO qual_image_id FROM recognition_images 
  WHERE recognition_id = p_recognition_id AND photo_type = 'Qualifying' LIMIT 1;
  
  -- Посчитать bbox
  SELECT COUNT(*) INTO main_count FROM annotations 
  WHERE image_id = main_image_id AND dish_index IS NOT NULL;
  
  SELECT COUNT(*) INTO qual_count FROM annotations 
  WHERE image_id = qual_image_id AND dish_index IS NOT NULL;
  
  -- Проверка общего совпадения
  IF expected_count != main_count OR main_count != qual_count THEN
    RETURN 'edit';
  END IF;
  
  -- Проверка посблюдного совпадения
  SELECT bool_and(
    (SELECT COUNT(*) FROM annotations WHERE image_id = main_image_id AND dish_index = dish_idx) = dish_count
    AND
    (SELECT COUNT(*) FROM annotations WHERE image_id = qual_image_id AND dish_index = dish_idx) = dish_count
  ) INTO dish_aligned
  FROM (
    SELECT 
      row_number() OVER () - 1 as dish_idx,
      (cd->>'Count')::INTEGER as dish_count
    FROM recognitions r, jsonb_array_elements(r.correct_dishes) cd
    WHERE r.recognition_id = p_recognition_id
  ) dishes;
  
  RETURN CASE WHEN dish_aligned THEN 'quick' ELSE 'edit' END;
END;
$$ LANGUAGE plpgsql;

-- 6. Заполнить validation_mode для существующих данных
UPDATE recognitions SET validation_mode = calculate_validation_mode(recognition_id)
WHERE validation_mode IS NULL AND workflow_state = 'pending';

-- 7. Обновить get_task_stats_grouped()
CREATE OR REPLACE FUNCTION get_task_stats_grouped()
RETURNS JSON AS $$
BEGIN
  RETURN json_build_object(
    'quick_validation', (SELECT COUNT(*) FROM recognitions WHERE workflow_state = 'pending' AND validation_mode = 'quick'),
    'edit_mode', (SELECT COUNT(*) FROM recognitions WHERE workflow_state = 'pending' AND validation_mode = 'edit'),
    'requires_correction', (SELECT COUNT(*) FROM recognitions WHERE workflow_state = 'requires_correction'),
    'completed', (SELECT COUNT(*) FROM recognitions WHERE workflow_state = 'completed'),
    'bottle_orientation', 0,
    'buzzer_annotation', 0,
    'non_food_objects', 0,
    'overlap_marking', 0
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_validation_mode(TEXT) IS 'Вычисляет validation_mode (quick/edit) на основе совпадения bbox с check данными';
COMMENT ON FUNCTION get_task_stats_grouped() IS 'Возвращает статистику задач с группировкой по режимам (quick_validation, edit_mode)';

