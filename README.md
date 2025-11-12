# RRS Annotation System

Профессиональная система аннотирования заказов ресторанов с валидацией блюд, буззеров и объектов.

## Быстрый старт

### 1. Reset БД и создать пользователей

```bash
supabase db reset
node scripts/create_test_users.mjs
```

Создаются пользователи:
- `rshstkv@gmail.com` / `16208075` (admin)
- `a@test.com` / `11111111` (annotator)

### 2. Импорт данных

```bash
python3 scripts/import_simple.py \
  "/path/to/dataset" \
  "/path/to/qwen_annotations.json" \
  --limit 400
```

Скрипт автоматически импортирует:
- Recognitions (correct_dishes, menu_all)
- Images (main + quality)
- Annotations (QWEN detections)

### 3. Создать задачи

```bash
python3 scripts/assign_test_tasks.py
```

### 4. Запустить

```bash
npm run dev
```

Откройте http://localhost:3000

## Архитектура

### Модульная структура

**Hooks** (`src/hooks/`):
- `useTaskManager` - управление задачей (загрузка, сохранение, переход между этапами)
- `useAnnotationManager` - CRUD операции с аннотациями
- `useHotkeys` - централизованная обработка горячих клавиш
- `useBBoxInteraction` - drag & resize bbox
- `useBBoxDrawing` - рисование новых bbox

**Components** (`src/components/`):
- `layout/` - AppHeader, Breadcrumbs, MainLayout, AdminLayout
- `bbox/` - BBoxCanvas, BBoxToolbar, BBoxLabel
- `task/` - TaskSidebar, ImageGrid, DishSelectionPanel, MenuSearchPanel
- `selectors/` - BuzzerColorSelector, BottleOrientationSelector, NonFoodSubtypeSelector

**Contexts** (`src/contexts/`):
- `TaskContext` - данные текущей задачи
- `AnnotationContext` - аннотации и изменения

### База данных

- `recognitions` - recognition data (correct_dishes, menu_all)
- `images` - фото (main + quality) с ссылками на storage
- `annotations` - bounding boxes с классификацией
- `tasks` - задачи с этапами (scopes) и прогрессом
- `profiles` - пользователи (admin / annotator)

### Task Scopes (этапы)

1. `validate_dishes` - валидация блюд из чека
2. `check_overlaps` - проверка перекрытий
3. `validate_buzzers` - валидация буззеров
4. `check_buzzer_positions` - позиции буззеров
5. `validate_bottles` - валидация бутылок (ориентация)
6. `validate_nonfood` - валидация посторонних объектов

## Workflow

### Для аннотатора

1. Перейти на `/tasks` - Dashboard со списком задач
2. Нажать "Начать следующую задачу"
3. Выполнить текущий этап:
   - **validate_dishes**: 
     - Проверить блюда из чека
     - Назначить bbox блюдам (1-9 для быстрого выбора)
     - Добавить блюда из меню ресторана
   - **validate_buzzers**: Нарисовать и классифицировать буззеры
   - **validate_bottles**: Указать ориентацию бутылок
   - И т.д.
4. Сохранить (S) и завершить этап (Enter)
5. Перейти к следующему этапу или завершить задачу

### Для админа

1. `/admin/users` - управление пользователями
2. `/admin/statistics` - статистика по задачам
3. `/admin/export` - экспорт завершенных задач в JSON

## Hotkeys

**Навигация по блюдам:**
- `1-9` - выбрать блюдо из чека по индексу
- `↑↓` - навигация по bbox (если блюдо выбрано - только его bbox)

**Управление:**
- `H` - показать/скрыть все bbox
- `S` - сохранить прогресс
- `Enter` - завершить текущий этап
- `Esc` - снять выделение / остановить рисование
- `Delete` / `Backspace` - удалить выбранную аннотацию

**В BBox:**
- Drag - переместить bbox
- Drag углы - изменить размер
- Click - выбрать bbox

## Corner Cases

### Несколько bbox на одно блюдо

Система показывает фактическое/ожидаемое количество:
- `2/2` (зеленый) - совпадает
- `1/2` (желтый) - недостаток
- `3/2` (красный) - избыток

### Блюда не из чека

Кнопка "+ Добавить из меню":
1. Открывает активное меню ресторана (menu_all)
2. Поиск по названию
3. Создает аннотацию с `custom_dish_name` и `dish_index = -1`

### Валидация с warnings

При завершении этапа система проверяет:
- **Errors** (блокируют): "Блюдо Х не аннотировано"
- **Warnings** (не блокируют): "Ожидается 2, найдено 3. Продолжить?"

## Design System

**Colors** (`src/styles/design-tokens.ts`):
- Object types: dish, plate, buzzer, bottle, nonfood
- Buzzer colors: red, green, white, blue, yellow, black
- Status: success, warning, error

**Typography:**
- Font: Geist Sans (next/font/google)
- Scale: xs (12px) → 4xl (36px)

**Spacing:**
- Grid: 8px базис
- Scale: xs (4px) → 3xl (64px)

**Philosophy:**
- Clean, minimal, focused (Linear, Vercel style)
- One accent color (blue-600)
- No emoji in UI (only in code comments)
- Generous whitespace

## API Endpoints

**Tasks:**
- `GET /api/tasks/next` - следующая задача по приоритету
- `GET /api/tasks/list` - список задач с фильтрами
- `GET /api/tasks/:id` - детали задачи
- `POST /api/tasks/:id/save` - сохранить прогресс
- `POST /api/tasks/:id/complete` - завершить этап
- `POST /api/tasks/:id/skip` - пропустить задачу

**Admin:**
- `GET /api/admin/users` - список пользователей
- `POST /api/admin/users` - создать пользователя
- `PATCH /api/admin/users/:id` - обновить пользователя
- `POST /api/admin/export` - экспорт задач

## Файлы

**Scripts:**
- `scripts/import_simple.py` - импорт recognitions, images, annotations
- `scripts/create_test_users.mjs` - создание тестовых пользователей
- `scripts/assign_test_tasks.py` - создание задач

**Database:**
- `supabase/migrations/20251112000000_clean_schema.sql` - чистая схема БД

## Development

**Structure:**
```
src/
├── app/                    # Next.js App Router
│   ├── task/[id]/          # Task page (~240 строк)
│   ├── tasks/              # Dashboard
│   ├── admin/              # Admin pages
│   └── api/                # API routes
├── components/
│   ├── layout/             # AppHeader, Breadcrumbs, Layouts
│   ├── bbox/               # BBox components
│   ├── task/               # Task UI components
│   ├── selectors/          # Type-specific selectors
│   └── ui/                 # shadcn/ui components
├── hooks/                  # Custom hooks
├── contexts/               # React contexts
├── styles/                 # Design tokens
└── types/                  # TypeScript types
```

**Principles:**
1. **Modularity**: Каждый файл < 250 строк
2. **Reusability**: Компоненты работают в любом контексте
3. **Clean Architecture**: hooks → contexts → components
4. **No mocks**: Только реальные данные
5. **Production Ready**: Error handling, loading states, breadcrumbs

## License

MIT
