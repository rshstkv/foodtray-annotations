-- =====================================================
-- SEED DATA: Тестовые пользователи для локальной разработки
-- =====================================================
-- Этот файл автоматически выполняется после db reset

-- ВАЖНО: Этот seed работает ТОЛЬКО локально при db reset
-- В проде создавайте пользователей через:
-- 1. Supabase Dashboard (Authentication -> Users)
-- 2. Скрипт scripts/create_test_users.mjs с продакшн credentials
-- 3. API эндпоинт /api/admin/users

-- =====================================================
-- Создание тестовых пользователей
-- =====================================================

-- Функция для создания пользователя с профилем
CREATE OR REPLACE FUNCTION create_test_user(
  user_email TEXT,
  user_password TEXT,
  user_role TEXT,
  user_full_name TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  user_id UUID;
BEGIN
  -- Проверяем, существует ли пользователь
  SELECT id INTO user_id
  FROM auth.users
  WHERE email = user_email;

  IF user_id IS NULL THEN
    -- Создаем нового пользователя
    user_id := extensions.uuid_generate_v4();
    
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      role,
      aud
    ) VALUES (
      user_id,
      '00000000-0000-0000-0000-000000000000',
      user_email,
      crypt(user_password, gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
      jsonb_build_object('full_name', user_full_name),
      false,
      'authenticated',
      'authenticated'
    );

    -- Создаем identity
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      extensions.uuid_generate_v4(),
      user_id,
      jsonb_build_object(
        'sub', user_id::text,
        'email', user_email
      ),
      'email',
      NOW(),
      NOW(),
      NOW()
    );
  END IF;

  -- Создаем/обновляем профиль (upsert)
  INSERT INTO profiles (
    id,
    email,
    role,
    full_name,
    created_at,
    updated_at
  ) VALUES (
    user_id,
    user_email,
    user_role,
    user_full_name,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    updated_at = NOW();

  RETURN user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Создаем тестовых пользователей
-- =====================================================

-- 1. Admin пользователь
SELECT create_test_user(
  'rshstkv@gmail.com',
  '16208075',
  'admin',
  'Roman Shestakov'
);

-- 2. Тестовый аннотатор
SELECT create_test_user(
  'a@test.com',
  '11111111',
  'annotator',
  'Test Annotator'
);

-- Удаляем временную функцию (она нам больше не нужна)
DROP FUNCTION IF EXISTS create_test_user;

-- =====================================================
-- ИНФОРМАЦИЯ
-- =====================================================
-- После выполнения seed у вас будут доступны:
--
-- Admin:
--   Email: rshstkv@gmail.com
--   Password: 16208075
--
-- Annotator:
--   Email: a@test.com
--   Password: 11111111
-- =====================================================

