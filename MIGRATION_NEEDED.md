# Требуется миграция базы данных

## Добавление колонки `custom_dish_name`

Выполните этот SQL в Supabase Dashboard (SQL Editor):

```sql
ALTER TABLE annotations 
ADD COLUMN IF NOT EXISTS custom_dish_name TEXT;

COMMENT ON COLUMN annotations.custom_dish_name IS 'Selected dish name when there are multiple options in receipt (resolves ambiguity)';
```

Или используйте файл миграции:
`supabase/migrations/20251112_add_custom_dish_name.sql`

## Зачем нужна эта колонка?

Когда в чеке для одной позиции указано несколько вариантов блюд (например, "Robalo Grelhado / Dourada Grelhada"), аннотатор должен выбрать правильный вариант. Выбранное название сохраняется в `custom_dish_name` для всех bbox с этим `dish_index`.

## Временное решение

До применения миграции выбранное название сохраняется в `metadata.custom_dish_name`.

