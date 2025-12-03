#!/bin/bash
# Тестирование экспорта на staging БД

# Получить DATABASE_URL из .env.staging или переменных окружения
if [ -f .env.staging ]; then
  export $(cat .env.staging | grep DATABASE_URL | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not set"
  echo "Usage: DATABASE_URL='postgres://...' ./scripts/test_export_staging.sh"
  exit 1
fi

echo "=== Testing export on staging ==="
echo ""

echo "1. Testing with small filter (one user)..."
psql "$DATABASE_URL" -c "\timing on" -c "
SELECT jsonb_array_length(
  (get_export_data(
    p_user_emails := ARRAY['tteryma@gmail.com']
  )->'recognitions')::jsonb
) as total_records;
"

echo ""
echo "2. Testing with full export (all users)..."
psql "$DATABASE_URL" -c "\timing on" -c "
SELECT jsonb_array_length(
  (get_export_data()->'recognitions')::jsonb
) as total_records;
"

echo ""
echo "3. Testing query plan..."
psql "$DATABASE_URL" -c "EXPLAIN ANALYZE SELECT get_export_data();"

