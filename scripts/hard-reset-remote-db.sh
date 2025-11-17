#!/bin/bash

# Жёсткая перезагрузка удалённой Supabase БД
# ВНИМАНИЕ: Это удалит ВСЕ данные!

set -e

echo "🔥 ЖЁСТКАЯ ПЕРЕЗАГРУЗКА УДАЛЁННОЙ SUPABASE БД"
echo "=============================================="
echo ""
echo "⚠️  ВНИМАНИЕ: Это удалит ВСЕ данные в удалённой БД!"
echo ""
read -p "Вы уверены? Введите 'YES' для продолжения: " confirmation

if [ "$confirmation" != "YES" ]; then
  echo "❌ Отменено"
  exit 1
fi

echo ""
echo "1️⃣ Проверяем подключение к удалённому проекту..."
if ! npx supabase status --linked &>/dev/null; then
  echo "❌ Проект не подключен"
  echo "   Выполните: npx supabase link --project-ref YOUR_PROJECT_REF"
  exit 1
fi

echo "✅ Подключено к удалённому проекту"
echo ""

echo "2️⃣ Получаем параметры подключения..."
# Получаем DB URL из настроек Supabase
DB_URL=$(npx supabase status --linked -o json | grep -o '"DB URL":"[^"]*"' | sed 's/"DB URL":"//' | sed 's/"//')

if [ -z "$DB_URL" ]; then
  echo "❌ Не удалось получить DB URL"
  echo "   Получите его вручную из Dashboard: Settings > Database > Connection string (Direct connection)"
  exit 1
fi

echo "✅ Получен DB URL"
echo ""

echo "3️⃣ Удаляем историю миграций из supabase_migrations.schema_migrations..."
psql "$DB_URL" -c "TRUNCATE supabase_migrations.schema_migrations;" || echo "⚠️  Таблица может не существовать"

echo ""
echo "4️⃣ Удаляем все объекты из схем (таблицы, функции, триггеры)..."

# Создаём временный SQL файл для очистки
cat > /tmp/cleanup.sql << 'EOF'
-- Отключаем все триггеры
SET session_replication_role = replica;

-- Удаляем все таблицы из public
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;

-- Удаляем все функции из public
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT proname, oidvectortypes(proargtypes) as args
              FROM pg_proc INNER JOIN pg_namespace ns ON (pg_proc.pronamespace = ns.oid)
              WHERE ns.nspname = 'public' AND prokind = 'f') LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.args || ') CASCADE';
    END LOOP;
END $$;

-- Удаляем все типы из public
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typtype = 'e') LOOP
        EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
    END LOOP;
END $$;

-- Включаем триггеры обратно
SET session_replication_role = DEFAULT;
EOF

psql "$DB_URL" -f /tmp/cleanup.sql
rm /tmp/cleanup.sql

echo "✅ Схемы очищены"
echo ""

echo "5️⃣ Применяем все миграции заново..."
npx supabase db push --linked

echo ""
echo "✅ ГОТОВО! Удалённая БД полностью перезагружена"
echo ""
echo "Что дальше:"
echo "1. Проверьте БД в Dashboard: https://app.supabase.com"
echo "2. Загрузите тестовые данные если нужно"
echo "3. Закоммитьте и запушьте изменения в Git"

