# Система версионирования аннотаций

## Обзор

Реализована система версионирования для аннотаций bbox с возможностью полного отката к оригинальным QWEN данным.

## Основные возможности

1. **Хранение оригинальных данных** - все оригинальные QWEN аннотации сохраняются в БД
2. **Отслеживание модификаций** - система автоматически отмечает recognition с изменениями
3. **Визуальная подсветка** - модифицированные bbox помечены иконкой ✨
4. **Восстановление оригинала** - одна кнопка для отката всех изменений
5. **Автоматический статус** - статус "В работе" устанавливается автоматически при любых изменениях

## Установка

### 1. Применить миграцию БД

```bash
# Миграция применится автоматически при следующем запуске Supabase
# Или примените вручную:
psql -U postgres -d postgres -f supabase/migrations/20251105000000_add_versioning_system.sql
```

### 2. Заполнить оригинальные данные

Для существующих recognition необходимо заполнить поле `original_annotations` из raw данных:

```bash
npx tsx scripts/populate-original-annotations.ts
```

Этот скрипт:
- Копирует QWEN детекции из `recognition_images_raw` в `recognition_images.original_annotations`
- Проставляет флаг `has_modifications = true` для recognition с manual аннотациями

## Использование

### В интерфейсе

1. **Индикатор изменений** - если recognition был модифицирован, в header появится желтый индикатор "⚠️ Есть изменения"

2. **Кнопка восстановления** - рядом с индикатором будет кнопка "Восстановить оригинал"

3. **Подсветка модифицированных bbox** - все вручную добавленные bbox помечены иконкой ✨ в левой панели

4. **Автоматический статус** - при любом действии (создание/изменение/удаление bbox) статус автоматически меняется на "В работе"

### API

#### Восстановление оригинала

```typescript
POST /api/annotations/recognitions/[id]/restore
```

Удаляет все manual аннотации и восстанавливает qwen_auto из `original_annotations`.

## Структура данных

### Таблица `recognition_images`

- `original_annotations` (JSONB) - хранит оригинальные QWEN детекции:
  ```json
  {
    "qwen_dishes_detections": [...],
    "qwen_plates_detections": [...]
  }
  ```

### Таблица `recognitions`

- `has_modifications` (BOOLEAN) - флаг наличия пользовательских модификаций

### Таблица `annotations`

- `source` (TEXT) - источник аннотации:
  - `'qwen_auto'` - оригинальная QWEN детекция
  - `'manual'` - создано/изменено пользователем

## Логика отслеживания модификаций

Флаг `has_modifications` устанавливается в `true` при:
- Создании нового bbox (POST /api/annotations/annotations)
- Изменении существующего bbox (PUT /api/annotations/annotations/[id])
- Удалении bbox (DELETE /api/annotations/annotations/[id])
- Изменении `correct_dishes` (PUT /api/annotations/recognitions/[id])

Флаг сбрасывается в `false` только при восстановлении оригинала.

## Визуальные индикаторы

- ✨ - Вручную добавленный bbox (source = 'manual')
- ⚠️ (желтый) - Recognition имеет модификации
- ⚠️ (красный) - Ошибка распознавания

## Файлы изменены

1. **База данных:**
   - `supabase/migrations/20251105000000_add_versioning_system.sql`

2. **Скрипты:**
   - `scripts/populate-original-annotations.ts`

3. **API:**
   - `src/app/api/annotations/recognitions/[id]/route.ts`
   - `src/app/api/annotations/recognitions/[id]/restore/route.ts` (новый)
   - `src/app/api/annotations/annotations/route.ts`
   - `src/app/api/annotations/annotations/[id]/route.ts`

4. **UI:**
   - `src/app/annotations/[id]/page.tsx`

## Тестирование

1. Откройте любой recognition
2. Создайте новый bbox или измените существующий
3. Проверьте что появился индикатор "⚠️ Есть изменения"
4. Проверьте что bbox помечен иконкой ✨ в левой панели
5. Нажмите "Восстановить оригинал"
6. Убедитесь что все изменения откатились

## Примечания

- Восстановление удаляет ВСЕ пользовательские изменения
- Статус recognition автоматически сбрасывается на "Новый" при восстановлении
- Оригинальные данные хранятся только для recognition импортированных через систему

