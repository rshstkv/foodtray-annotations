# Workflow System Implementation

## Обзор

Реализована декларативная система workflow для аннотаторов с этапами работы, тирами сложности, версионностью изменений и автоматической выдачей задач.

## Что реализовано

### 1. База данных

#### Новые таблицы:
- **`task_types`** - типы задач с JSONB конфигурацией UI
- **`workflow_stages`** - этапы workflow с условиями пропуска
- **`recognition_history`** - полная история всех изменений
- **`annotation_corrections`** - исправления вне основного flow

#### Обновленные таблицы:
- **`recognitions`** - добавлены поля: `tier`, `workflow_state`, `current_stage_id`, `completed_stages`, `assigned_to`, `started_at`, `completed_at`

#### Функции:
- **`calculate_recognition_tier()`** - вычисление сложности (tier 1-5)
- **Триггеры** - автоматическое обновление tier при изменениях

#### View:
- **`recognitions_with_stats`** - обновлен для включения workflow полей

#### Seed данные:
- 6 типов задач: count_validation, dish_selection, overlap_marking, bottle_orientation, bbox_refinement, non_food_objects
- 5 workflow stages с приоритетами

### 2. API Endpoints

#### Workflow:
- `GET /api/annotations/tasks/next?task_type={code}&tier={n}` - получить следующую задачу
- `POST /api/annotations/tasks/{id}/complete` - завершить этап
- `POST /api/annotations/tasks/{id}/flag-correction` - отметить необходимость исправления

#### История:
- `GET /api/annotations/recognitions/{id}/history` - получить историю изменений
- `PUT /api/annotations/recognitions/{id}` - обновлен для автологирования в history

#### Вспомогательные:
- `GET /api/annotations/task-types` - список активных типов задач
- `GET /api/annotations/task-stats` - статистика по доступным задачам

### 3. UI Компоненты

#### Страницы:
- `/annotations/tasks` - список доступных типов задач со счетчиками по tier
- `/annotations/tasks/count_validation` - упрощенный UI для проверки количества
- `/annotations/[id]` - остается как полный админский интерфейс

## Миграции

Созданы следующие миграции (порядок важен):
1. `20251106000000_create_workflow_tables.sql` - создание новых таблиц
2. `20251106000001_update_recognitions_for_workflow.sql` - обновление recognitions
3. `20251106000002_seed_task_types_and_stages.sql` - seed данные
4. `20251106000003_tier_calculation_function.sql` - функции и триггеры
5. `20251106000004_initialize_existing_recognitions.sql` - инициализация существующих данных

## Как применить миграции

### Локально (разработка):
```bash
# 1. Убедитесь что вы на ветке feature/annotation-workflow
git branch

# 2. Применить миграции через Supabase CLI (если установлен)
supabase db push

# ИЛИ вручную через psql:
psql "$SUPABASE_CONNECTION_STRING" -f supabase/migrations/20251106000000_create_workflow_tables.sql
psql "$SUPABASE_CONNECTION_STRING" -f supabase/migrations/20251106000001_update_recognitions_for_workflow.sql
psql "$SUPABASE_CONNECTION_STRING" -f supabase/migrations/20251106000002_seed_task_types_and_stages.sql
psql "$SUPABASE_CONNECTION_STRING" -f supabase/migrations/20251106000003_tier_calculation_function.sql
psql "$SUPABASE_CONNECTION_STRING" -f supabase/migrations/20251106000004_initialize_existing_recognitions.sql
```

### Production:
```bash
# ВАЖНО: Создайте backup ПЕРЕД применением!
pg_dump "$PROD_DB_URL" > backup_$(date +%Y%m%d_%H%M%S).sql

# Затем применить миграции
```

## Полное руководство по тестированию

### Шаг 1: Применение миграций

```bash
cd /Users/romanshestakov/RRS/assisted-orders-nextjs

# Применить все миграции (в порядке)
psql "$SUPABASE_CONNECTION_STRING" -f supabase/migrations/20251106000000_create_workflow_tables.sql
psql "$SUPABASE_CONNECTION_STRING" -f supabase/migrations/20251106000001_update_recognitions_for_workflow.sql
psql "$SUPABASE_CONNECTION_STRING" -f supabase/migrations/20251106000002_seed_task_types_and_stages.sql
psql "$SUPABASE_CONNECTION_STRING" -f supabase/migrations/20251106000003_tier_calculation_function.sql
psql "$SUPABASE_CONNECTION_STRING" -f supabase/migrations/20251106000004_initialize_existing_recognitions.sql
```

### Шаг 2: Проверка БД

```sql
-- 1. Проверить что таблицы созданы
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('task_types', 'workflow_stages', 'recognition_history', 'annotation_corrections');

-- Ожидаемый результат: все 4 таблицы

-- 2. Проверить seed данные
SELECT code, name FROM task_types WHERE is_active = true;

-- Ожидаемый результат: 6 типов задач

-- 3. Проверить workflow stages
SELECT stage_order, name FROM workflow_stages ORDER BY stage_order;

-- Ожидаемый результат: 5 этапов

-- 4. Проверить распределение по tier
SELECT tier, COUNT(*) as count FROM recognitions GROUP BY tier ORDER BY tier;

-- Ожидаемый результат: recognitions распределены по tier 1-5

-- 5. Проверить workflow_state
SELECT workflow_state, COUNT(*) FROM recognitions GROUP BY workflow_state;

-- Ожидаемый результат: большинство в 'pending'

-- 6. Проверить initial snapshots
SELECT COUNT(*) FROM recognition_history WHERE snapshot_type = 'initial';

-- Ожидаемый результат: количество = количеству recognitions
```

### Шаг 3: Запуск dev сервера

```bash
cd /Users/romanshestakov/RRS/assisted-orders-nextjs
npm run dev
```

### Шаг 4: Тестирование API

```bash
# 1. Список типов задач
curl http://localhost:3000/api/annotations/task-types

# Ожидаемый результат: JSON с 6 типами задач

# 2. Статистика по задачам
curl http://localhost:3000/api/annotations/task-stats

# Ожидаемый результат: JSON с распределением по tier для каждого task_type

# 3. Получить следующую задачу (tier 1, count_validation)
curl "http://localhost:3000/api/annotations/tasks/next?task_type=count_validation&tier=1"

# Ожидаемый результат: JSON с recognition, images, annotations, task_type, stage

# 4. История изменений (замените RECOGNITION_ID)
curl "http://localhost:3000/api/annotations/recognitions/RECOGNITION_ID/history"

# 5. Экспорт данных
curl "http://localhost:3000/api/annotations/export?tier=1&format=json"
```

### Шаг 5: Тестирование UI

#### 5.1 Главная страница задач
1. Откройте браузер: `http://localhost:3000/annotations/tasks`
2. **Ожидается**: 
   - Список из 6 типов задач
   - Счетчики по tier для каждого типа
   - Кнопки "Начать работу"

#### 5.2 Count Validation
1. Кликните "Начать" на `count_validation`
2. **Ожидается**:
   - Две картинки (Main и Qualifying) рядом
   - Счетчики bbox над каждой картинкой
   - Список блюд внизу
   - Кнопка "Готово →"
3. Кликните "Готово →"
4. **Ожидается**: Загрузится следующая задача или сообщение "Нет доступных задач"

#### 5.3 Dish Selection
1. Вернитесь на `/annotations/tasks`
2. Кликните "Начать" на `dish_selection`
3. **Ожидается**:
   - Крупные карточки с вариантами блюд
   - Progress bar вверху
   - Можно кликать на карточки или нажимать цифры 1-2-3
4. Выберите вариант
5. **Ожидается**: Автоматический переход к следующему блюду
6. После последнего - автосохранение и загрузка новой задачи

#### 5.4 Overlap Marking
1. Вернитесь на `/annotations/tasks`
2. Кликните "Начать" на `overlap_marking`
3. **Ожидается**:
   - Темный интерфейс с двумя картинками
   - Желтая подсветка текущего bbox
   - Большие кнопки "НЕТ перекрытия" и "ЕСТЬ перекрытие"
4. Нажмите Y (да) или N (нет)
5. **Ожидается**: Автоматический переход к следующему bbox
6. После последнего - автосохранение

### Шаг 6: Тестирование полного workflow

1. Откройте `/annotations/tasks`
2. Выберите задачу tier 1
3. Выполните задачу и нажмите "Готово"
4. В БД проверьте:

```sql
-- Проверить что этап завершен
SELECT recognition_id, workflow_state, current_stage_id, completed_stages 
FROM recognitions 
WHERE recognition_id = 'YOUR_RECOGNITION_ID';

-- Ожидается: current_stage_id перешел на следующий этап

-- Проверить что создан snapshot
SELECT snapshot_type, created_at 
FROM recognition_history 
WHERE recognition_id = 'YOUR_RECOGNITION_ID' 
ORDER BY created_at DESC 
LIMIT 1;

-- Ожидается: snapshot_type = 'stage_complete'
```

### Шаг 7: Тестирование экспорта

```bash
# JSON экспорт
curl "http://localhost:3000/api/annotations/export?tier=1&workflow_state=completed&format=json" > export.json

# CSV экспорт
curl "http://localhost:3000/api/annotations/export?format=csv" > export.csv

# С историей
curl "http://localhost:3000/api/annotations/export?include_history=true&format=json" > export_with_history.json
```

Проверьте содержимое файлов.

### Checklist завершения тестирования

- [ ] Все миграции применены без ошибок
- [ ] В БД созданы все таблицы и функции
- [ ] Seed данные загружены корректно
- [ ] API endpoints возвращают ожидаемые результаты
- [ ] UI страницы открываются и работают
- [ ] Workflow переходит между этапами
- [ ] История изменений сохраняется
- [ ] Экспорт работает в обоих форматах
- [ ] Нет ошибок в консоли браузера
- [ ] Нет ошибок в логах сервера

## Архитектура

### Tier Calculation (уровни сложности):
- **Tier 1**: Идеальный случай - все совпадает
- **Tier 2**: Совпадает bbox, но есть выбор блюд
- **Tier 3**: Небольшая разница в bbox (1-2)
- **Tier 4**: Средняя сложность
- **Tier 5**: Сложные случаи

### Workflow State Machine:
```
pending → in_progress → completed
              ↓
     requires_correction
```

### Skip Conditions:
Этапы могут автоматически пропускаться на основе условий:
- count_validation: пропустить если main_count == qualifying_count
- dish_selection: пропустить если все блюда с одним вариантом

## ✅ Реализовано в рамках MVP

### UI Компоненты:
- ✅ **DishSelectionUI** (`/annotations/tasks/dish_selection`) - крупные карточки, быстрый выбор 1-2-3, автопереход
- ✅ **OverlapMarkingUI** (`/annotations/tasks/overlap_marking`) - две картинки с подсветкой, Y/N для перекрытия
- ✅ **CountValidationUI** (`/annotations/tasks/count_validation`) - сравнение счетчиков bbox

### API для экспорта:
- ✅ `GET /api/annotations/export` - экспорт в JSON/CSV с фильтрами по tier, workflow_state, датам
- ✅ `PUT /api/annotations/{id}` - обновление отдельной аннотации

## Что можно добавить в будущем

### Дополнительные UI:
1. **BottleOrientationUI** (`/annotations/tasks/bottle_orientation`)
   - Одна картинка, bbox увеличен
   - Иконки ↑ / → для выбора ориентации

2. **NonFoodObjectsUI** (`/annotations/tasks/non_food_objects`)
   - Рисование bbox
   - Быстрый выбор типа объекта

### Интеграция с существующим редактором:
- Добавить кнопку "Флаг исправления" в полном редакторе
- Показывать текущий этап workflow
- Виджет истории изменений

### Система пользователей:
- Аутентификация по email
- Назначение задач конкретным аннотаторам
- Трекинг продуктивности
- Dashboard с метриками

## Структура проекта

```
supabase/migrations/
  ├── 20251106000000_create_workflow_tables.sql
  ├── 20251106000001_update_recognitions_for_workflow.sql
  ├── 20251106000002_seed_task_types_and_stages.sql
  ├── 20251106000003_tier_calculation_function.sql
  └── 20251106000004_initialize_existing_recognitions.sql

src/app/
  ├── annotations/
  │   ├── tasks/
  │   │   ├── page.tsx                    # Список задач
  │   │   ├── count_validation/
  │   │   │   └── page.tsx                # UI для проверки количества
  │   │   ├── dish_selection/             # TODO
  │   │   ├── overlap_marking/            # TODO
  │   │   └── bottle_orientation/         # TODO
  │   └── [id]/
  │       └── page.tsx                    # Полный редактор (существующий)
  └── api/
      └── annotations/
          ├── task-types/route.ts         # GET типы задач
          ├── task-stats/route.ts         # GET статистика
          ├── tasks/
          │   ├── next/route.ts           # GET следующая задача
          │   └── [id]/
          │       ├── complete/route.ts   # POST завершить этап
          │       └── flag-correction/route.ts  # POST флаг исправления
          └── recognitions/
              └── [id]/
                  ├── route.ts            # GET/PUT (обновлен для history)
                  └── history/route.ts    # GET история
```

## Примеры использования

### Получение следующей задачи:
```typescript
const response = await fetch(
  '/api/annotations/tasks/next?task_type=count_validation&tier=1'
)
const data = await response.json()
// Возвращает: { recognition, images, menu_all, task_type, stage }
```

### Завершение этапа:
```typescript
await fetch(
  `/api/annotations/tasks/${recognitionId}/complete`,
  {
    method: 'POST',
    body: JSON.stringify({
      stage_id: 1,
      move_to_next: true,
      changes: { ... }
    })
  }
)
```

### Получение истории:
```typescript
const response = await fetch(
  `/api/annotations/recognitions/${recognitionId}/history`
)
const data = await response.json()
// Возвращает: { history, corrections, total_snapshots }
```

## Troubleshooting

### Проблема: Миграции не применяются
```bash
# Проверить подключение к БД
psql "$SUPABASE_CONNECTION_STRING" -c "SELECT version();"

# Проверить существующие таблицы
psql "$SUPABASE_CONNECTION_STRING" -c "\dt"
```

### Проблема: Tier не вычисляется
```sql
-- Проверить триггеры
SELECT * FROM pg_trigger WHERE tgname LIKE '%tier%';

# Вручную пересчитать tier
UPDATE recognitions SET tier = calculate_recognition_tier(recognition_id);
```

### Проблема: Нет доступных задач
```sql
-- Проверить workflow_state
SELECT workflow_state, COUNT(*) FROM recognitions GROUP BY workflow_state;

-- Проверить current_stage_id
SELECT current_stage_id, COUNT(*) FROM recognitions 
WHERE workflow_state = 'pending' 
GROUP BY current_stage_id;
```

## Заключение

Базовая инфраструктура workflow системы полностью реализована и готова к тестированию. Система спроектирована для легкого расширения - добавление новых типов задач требует только записи в БД и создания соответствующего UI компонента.

**Следующие шаги:**
1. Протестировать миграции на локальной БД
2. Проверить работу API endpoints
3. Завершить оставшиеся UI компоненты
4. Провести end-to-end тестирование полного workflow
5. Развернуть в production после тщательного тестирования

