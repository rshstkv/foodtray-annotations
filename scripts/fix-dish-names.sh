#!/bin/bash

# Скрипт для быстрого исправления пропавших названий блюд
# Использование: ./scripts/fix-dish-names.sh

set -e

echo "🔧 Исправление пропавших названий блюд..."
echo ""

# Проверяем, запущен ли Supabase локально
if ! npx supabase status &>/dev/null; then
  echo "❌ Ошибка: Supabase не запущен локально"
  echo "   Запустите: npx supabase start"
  exit 1
fi

# Получаем параметры подключения к БД
DB_HOST="localhost"
DB_PORT="54322"
DB_USER="postgres"
DB_NAME="postgres"
export PGPASSWORD="postgres"

echo "1️⃣ Проверяем проблему..."
RESULT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
SELECT COUNT(*)
FROM work_items wi
JOIN initial_tray_items iti ON wi.initial_item_id = iti.id
JOIN recipe_line_options rlo ON iti.recipe_line_option_id = rlo.id
WHERE wi.recipe_line_id IS NULL
  AND iti.recipe_line_option_id IS NOT NULL;
" | xargs)

echo "   Найдено записей для исправления: $RESULT"
echo ""

if [ "$RESULT" = "0" ]; then
  echo "✅ Все в порядке! Проблем не обнаружено."
  exit 0
fi

echo "2️⃣ Исправляем данные..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
UPDATE work_items wi
SET recipe_line_id = rlo.recipe_line_id
FROM initial_tray_items iti
JOIN recipe_line_options rlo ON iti.recipe_line_option_id = rlo.id
WHERE wi.initial_item_id = iti.id
  AND wi.recipe_line_id IS NULL
  AND iti.recipe_line_option_id IS NOT NULL;
" > /dev/null

echo ""
echo "3️⃣ Проверяем результат..."
REMAINING=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
SELECT COUNT(*)
FROM work_items wi
JOIN initial_tray_items iti ON wi.initial_item_id = iti.id
WHERE wi.recipe_line_id IS NULL
  AND iti.recipe_line_option_id IS NOT NULL;
" | xargs)

echo "   Осталось проблем: $REMAINING"
echo ""

if [ "$REMAINING" = "0" ]; then
  echo "✅ Успешно! Все названия блюд восстановлены."
  echo "   Обновите страницу в браузере, чтобы увидеть изменения."
else
  echo "⚠️  Внимание: остались записи с проблемами ($REMAINING)"
  echo "   Проверьте логи или обратитесь к документации."
fi

echo ""
echo "📝 Подробности см. в: docs/fix-missing-dish-names.md"

