-- =====================================================
-- AUTO CREATE PROFILES: Триггер для автоматического создания профилей
-- =====================================================
-- Эта миграция добавляет триггер, который автоматически создает
-- запись в таблице profiles при создании нового пользователя

-- =====================================================
-- Функция: Автоматическое создание профиля
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Создаем профиль для нового пользователя
  INSERT INTO public.profiles (
    id,
    email,
    role,
    full_name,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      (NEW.raw_user_meta_data->>'role')::TEXT,
      'annotator'  -- По умолчанию роль annotator
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.email  -- Если full_name не указан, используем email
    ),
    NOW(),
    NOW()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.handle_new_user IS 'Автоматически создает профиль при регистрации пользователя';

-- =====================================================
-- Триггер: При создании пользователя в auth.users
-- =====================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- Исправление: Создаем профили для существующих пользователей
-- =====================================================
-- На случай, если уже есть пользователи без профилей

INSERT INTO public.profiles (
  id,
  email,
  role,
  full_name,
  created_at,
  updated_at
)
SELECT 
  u.id,
  u.email,
  COALESCE(
    (u.raw_user_meta_data->>'role')::TEXT,
    'annotator'
  ) as role,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.email
  ) as full_name,
  u.created_at,
  u.updated_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;  -- Только для пользователей без профиля

-- =====================================================
-- ✅ ГОТОВО
-- =====================================================
-- Теперь при создании пользователя через:
-- - Supabase Dashboard
-- - Auth API
-- - Регистрацию на сайте
-- Автоматически будет создаваться запись в profiles

