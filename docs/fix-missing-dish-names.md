# Исправление проблемы с пропавшими названиями блюд

## Проблема
Названия блюд не отображаются в интерфейсе валидации, вместо них показывается только "Блюдо".

## Причина
В таблице `work_items` поле `recipe_line_id` было установлено в `NULL` при создании/сбросе данных. Без этого поля система не может найти соответствующее название блюда из `recipe_line_options`.

## Что было исправлено

### 1. API для сброса данных
**Файл:** `src/app/api/validation/[workLogId]/reset/route.ts`

Исправлен код, который создает `work_items` из `initial_tray_items`. Теперь правильно получает `recipe_line_id` через JOIN с `recipe_line_options`.

### 2. SQL-скрипт для исправления существующих данных
**Файл:** `scripts/fix_missing_recipe_line_ids.sql`

Создан скрипт для проверки и исправления существующих записей в базе данных.

## Как исправить существующие данные

### Шаг 1: Подключитесь к базе данных

```bash
# Если используете Supabase локально
npx supabase db reset

# Или подключитесь к удаленной БД
psql -h <host> -U <user> -d <database>
```

### Шаг 2: Проверьте проблему

```sql
-- Проверка: сколько записей нужно исправить
SELECT 
  COUNT(*) as items_to_fix,
  COUNT(DISTINCT wi.work_log_id) as affected_work_logs
FROM work_items wi
JOIN initial_tray_items iti ON wi.initial_item_id = iti.id
JOIN recipe_line_options rlo ON iti.recipe_line_option_id = rlo.id
WHERE wi.recipe_line_id IS NULL
  AND iti.recipe_line_option_id IS NOT NULL;
```

### Шаг 3: Посмотрите детали (опционально)

```sql
SELECT 
  wi.id as work_item_id,
  wi.work_log_id,
  wi.type,
  rlo.name as dish_name
FROM work_items wi
JOIN initial_tray_items iti ON wi.initial_item_id = iti.id
JOIN recipe_line_options rlo ON iti.recipe_line_option_id = rlo.id
WHERE wi.recipe_line_id IS NULL
  AND iti.recipe_line_option_id IS NOT NULL
LIMIT 10;
```

### Шаг 4: Исправьте данные

```sql
-- ВНИМАНИЕ: Это обновит данные в БД!
UPDATE work_items wi
SET recipe_line_id = rlo.recipe_line_id
FROM initial_tray_items iti
JOIN recipe_line_options rlo ON iti.recipe_line_option_id = rlo.id
WHERE wi.initial_item_id = iti.id
  AND wi.recipe_line_id IS NULL
  AND iti.recipe_line_option_id IS NOT NULL;
```

### Шаг 5: Проверьте результат

```sql
-- Должно вернуть 0
SELECT COUNT(*) as remaining_problems
FROM work_items wi
JOIN initial_tray_items iti ON wi.initial_item_id = iti.id
WHERE wi.recipe_line_id IS NULL
  AND iti.recipe_line_option_id IS NOT NULL;
```

### Шаг 6: Обновите страницу в браузере

После выполнения UPDATE запроса обновите страницу валидации в браузере. Названия блюд должны появиться.

## Как использовать готовый скрипт

Вы можете выполнить все команды из файла `scripts/fix_missing_recipe_line_ids.sql`:

```bash
# Для локальной Supabase
psql -h localhost -p 54322 -U postgres -d postgres -f scripts/fix_missing_recipe_line_ids.sql

# Для удаленной БД
psql -h <your-db-host> -U <user> -d <database> -f scripts/fix_missing_recipe_line_ids.sql
```

## Проверка в интерфейсе

1. Откройте страницу валидации: `http://localhost:3000/work/42`
2. Посмотрите на список блюд слева
3. Вместо "Блюдо" должны отображаться реальные названия блюд

## Предотвращение проблемы в будущем

### Триггер базы данных
Убедитесь, что применена последняя миграция триггера:
- `supabase/migrations/20251117160000_fix_initialize_work_session.sql`

Этот триггер автоматически заполняет `recipe_line_id` при создании новых `work_log` записей.

### API для сброса
Исправленный API `/api/validation/[workLogId]/reset` теперь правильно создает `work_items` с заполненным `recipe_line_id`.

## Дополнительная отладка

Если проблема сохраняется, проверьте:

```sql
-- Проверка данных для конкретного recognition_id
SELECT 
  wi.id,
  wi.type,
  wi.recipe_line_id,
  rl.id as recipe_line_id_from_table,
  rlo.name as dish_name,
  rlo.is_selected
FROM work_items wi
LEFT JOIN initial_tray_items iti ON wi.initial_item_id = iti.id
LEFT JOIN recipe_line_options rlo ON iti.recipe_line_option_id = rlo.id
LEFT JOIN recipe_lines rl ON rlo.recipe_line_id = rl.id
WHERE wi.work_log_id = <YOUR_WORK_LOG_ID>
  AND wi.type = 'FOOD'
ORDER BY wi.id;
```

## Контакты
Если проблема не решена, проверьте логи браузера (Console) и сервера.

