# RRS Annotation Backend

Система управления аннотациями для разметки блюд на фотографиях подносов в ресторане.

## Архитектура

Проект использует двухслойную архитектуру базы данных:

- **RAW слой** (`raw` схема) - сырые данные из источников (immutable, append-only)
- **DOMAIN слой** (`public` схема) - чистая модель данных для приложения

### Физическая модель

```
Recognition (поднос, 2 фото, активное меню)
  ↓
Items (физические объекты: еда/тарелки/пейджеры, версионируемые)
  ↓
Annotations (bbox на каждой фото → items, версионируемые)

Checks (кассовый чек, справочник)
Validation (приоритеты + факты работы "на лету")
```

### Ключевые принципы

- **Annotations указывают ТОЛЬКО на Items** (не на menu_items)
- **Active Menu** хранится как JSONB в каждом recognition
- **Версионирование**: items и annotations (0=initial от Qwen, 1+=human edits)
- **Validation на лету**: нет предсозданных tasks, только work_log
- **Простота**: легко править, легко выгружать

### Основные компоненты

- **Next.js 15** - фронтенд (в разработке)
- **Supabase** - база данных (PostgreSQL) + Storage + Auth
- **Python** - скрипты загрузки данных
- **TypeScript** - типизация

## Установка

### 1. Зависимости Node.js

```bash
npm install
```

### 2. Зависимости Python

```bash
pip3 install -r scripts/requirements.txt
```

### 3. Supabase CLI

Установите Supabase CLI согласно [официальной документации](https://supabase.com/docs/guides/cli).

macOS:
```bash
brew install supabase/tap/supabase
```

### 4. Переменные окружения

Создайте файл `.env.local` в корне проекта:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

## Локальная разработка

### 1. Запуск Supabase

```bash
supabase start
```

Это запустит локальный инстанс Supabase со всеми сервисами:
- PostgreSQL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- API: `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`

### 2. Применение миграций

```bash
npm run db:reset
```

Эта команда:
- Удаляет все данные
- Применяет все миграции из `supabase/migrations/`
- Запускает seed файл (`supabase/seed.sql`)
- Создает тестовых пользователей (admin, editor, viewer)

### 3. Загрузка данных

**ВАЖНО:** Для загрузки данных необходимо:
1. Разместить датасет `RRS_Dataset 2` в родительской директории
2. Разместить `qwen_annotations.json` в корне проекта

**Простой способ (рекомендуется):**

Загрузить 100 recognitions + соответствующие Qwen аннотации:
```bash
npm run ingest:all
```

Эта команда:
1. Загружает 100 recognitions с фотографиями в Supabase Storage
2. Автоматически находит и загружает соответствующие Qwen аннотации
3. Создает items (version=0) и annotations (version=0)

**Полная загрузка всех данных:**

```bash
npm run ingest:full
```

**Раздельная загрузка (для отладки):**

```bash
# Сначала recognitions
npm run ingest:recognitions

# Потом Qwen (автоматически найдет соответствия)
npm run ingest:qwen
```

### 4. Запуск Next.js

```bash
npm run dev
```

Приложение будет доступно по адресу: `http://localhost:3000`

## Структура проекта

```
.
├─ supabase/                    # Supabase конфигурация
│  ├─ migrations/               # Миграции БД (11 файлов)
│  │  ├─ 20251114220000_core_schemas.sql
│  │  ├─ 20251114230000_profiles_auth.sql
│  │  ├─ 20251114240000_raw_layer.sql
│  │  ├─ 20251114250000_domain_recognitions.sql
│  │  ├─ 20251114260000_domain_items_annotations.sql
│  │  ├─ 20251114270000_domain_checks.sql
│  │  ├─ 20251114280000_validation_system.sql
│  │  ├─ 20251114290000_indexes.sql
│  │  ├─ 20251114300000_triggers.sql
│  │  ├─ 20251114310000_transform_functions.sql
│  │  └─ 20251114320000_storage_bucket.sql
│  ├─ seed.sql                  # Seed данные (тестовые пользователи)
│  └─ config.toml               # Конфигурация Supabase
├─ scripts/                     # Скрипты
│  ├─ ingest/                   # Скрипты загрузки данных
│  │  ├─ shared.py              # Общие утилиты
│  │  ├─ ingest_qwen.py         # Загрузка Qwen аннотаций
│  │  └─ ingest_recognitions.py # Загрузка recognitions + фото
│  └─ requirements.txt          # Python зависимости
├─ src/                         # Next.js приложение (в разработке)
├─ docs/                        # Документация
│  └─ rrs_annotation_backend_architecture_final.md  # Полная спецификация
└─ README.md                    # Этот файл
```

## Схема базы данных

### RAW слой (схема `raw`)

Сырые данные из источников (immutable):

- `raw.qwen_annotations` - аннотации от Qwen (bbox + класс)
- `raw.correct_dishes` - кассовые чеки (CD.json)
- `raw.recognition_files` - метаданные recognitions + активное меню (AM.json)

### DOMAIN слой (схема `public`)

Чистые данные для приложения:

**Пользователи:**
- `profiles` - профили с ролями (admin, editor, viewer)

**Основные сущности:**
- `recognitions` - распознавания подносов (+ active_menu JSONB)
- `images` - изображения (camera 1, camera 2)
- `checks` - кассовые чеки
- `check_lines` - строки чека

**Аннотации (версионируемые):**
- `items` - физические объекты на подносе (версионируемые)
- `annotations` - bbox на изображениях → items (версионируемые)

**Validation система (на лету):**
- `validation_priority_config` - приоритеты validation types (admin управляет)
- `validation_work_log` - факты работы (создается когда user берет задачу)

**Storage:**
- `rrs-photos` bucket - фотографии recognitions (public read access)

### Трансформации RAW → DOMAIN

Автоматические PostgreSQL функции (idempotent):
- `transform_recognitions_and_images()` - создание recognitions + images
- `transform_checks()` - создание checks + check_lines
- `transform_items_and_annotations()` - создание items + annotations из Qwen

Все функции вызываются автоматически в скриптах загрузки.

## Пользователи

Создаются автоматически после `npm run db:reset` или вручную:

```bash
npm run db:seed-users          # Локально
npm run db:seed-users:prod     # Продакшн
```

| Email | Password | Role |
|-------|----------|------|
| admin@rrs.ru | admin2024 | admin |
| editor@rrs.ru | editor2024 | editor |
| viewer@rrs.ru | viewer2024 | viewer |

## Полезные команды

```bash
# База данных
npm run db:reset              # Пересоздать БД + создать пользователей
npm run db:migrate            # Применить новые миграции
npm run db:seed-users         # Создать пользователей локально
npm run db:seed-users:prod    # Создать пользователей в продакшн

# Загрузка данных
npm run ingest:all            # 100 recognitions + Qwen (рекомендуется)
npm run ingest:load           # Загрузить recognitions
npm run ingest:load-qwen      # Загрузить Qwen аннотации
npm run ingest:status         # Статус данных
npm run ingest:reset          # Удалить batch данных

# Прямые команды (больше опций)
python3 scripts/ingest/cli.py load --limit 100
python3 scripts/ingest/cli.py load --production --limit 10
python3 scripts/ingest/cli.py load-qwen --file qwen_annotations.json
python3 scripts/ingest/cli.py reset --batch-id batch_xxx --confirm
python3 scripts/ingest/cli.py --production status

# Разработка
npm run dev                   # Запустить Next.js в dev режиме
npm run build                 # Собрать для production
npm run lint                  # Проверить код линтером

# Supabase
supabase start                # Запустить локальный Supabase
supabase stop                 # Остановить локальный Supabase
supabase status               # Статус сервисов
```

## Доступ к сервисам

После `supabase start`:

- **Supabase Studio**: http://localhost:54323 - UI для управления БД
- **API**: http://localhost:54321
- **Storage**: http://localhost:54321/storage/v1/object/public/rrs-photos/ - публичный доступ к фото
- **PostgreSQL**: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

### Просмотр фотографий

Фото доступны по URL:
```
http://127.0.0.1:54321/storage/v1/object/public/rrs-photos/recognitions/[recognition_id]/camera1.jpg
http://127.0.0.1:54321/storage/v1/object/public/rrs-photos/recognitions/[recognition_id]/camera2.jpg
```

Пример:
```
http://127.0.0.1:54321/storage/v1/object/public/rrs-photos/recognitions/31821/camera1.jpg
```

## Документация

Полная архитектурная спецификация:
- `docs/rrs_annotation_backend_architecture_final.md` - детальная документация по всем аспектам системы

## Troubleshooting

### Ошибка при загрузке данных

Убедитесь что:
1. Supabase запущен (`supabase start`)
2. Переменные окружения настроены (`.env.local`)
3. Python зависимости установлены (`pip3 install -r scripts/requirements.txt`)
4. Датасет `RRS_Dataset 2` находится в правильной директории
5. Файл `qwen_annotations.json` находится в корне проекта

### База данных не создается

```bash
supabase stop
supabase start
npm run db:reset
```

### Ошибки миграций

Если миграции не применяются:
```bash
supabase db reset
```

## Дальнейшие шаги

1. ✅ База данных настроена (новая архитектура)
2. ✅ Скрипты загрузки данных работают
3. ✅ Версионирование items и annotations
4. ✅ Validation система "на лету"
5. 🚧 Фронтенд в разработке
6. 📋 API для работы с задачами
7. 📊 Аналитика и отчеты (в планах)

## Лицензия

Внутренний проект RRS.
