# RRS Annotation Backend – Full Product & Supabase Spec (v1)

> Этот документ предназначен для **Cursor** (или другой код‑ИИ), который будет поднимать *новый* backend.  
> Его можно класть в репу как `docs/rrs_backend_spec.md` и использовать как единственный источник правды.

---

## 0. Жёсткие правила и рамки

1. **Фронтенд сейчас не трогаем.**
   - В репозитории будет директория под Next.js (например, `apps/web` или `web`), но без реализации.
   - Никаких React/Next страниц и компонентов на этом этапе.

2. **Backend делаем “с нуля” как новый проект.**
   - Существующая БД и код в другом репо считаются мусором и не используются.
   - Всё, что нужно, описано в этом файле.
   - Никаких “давайте переиспользуем старый скрипт X” — всё пишем заново.

3. **Фокус: локальная Supabase‑среда, но с прицелом на staging/prod.**
   - Локальные переменные окружения (для dev):

     ```env
     NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
     NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
     SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
     DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
     ```

   - Архитектурно всё должно легко переноситься на staging/prod просто заменой `.env`.

4. **Перед выбором библиотек и CLI‑команд Cursor обязан проверить актуальные практики через MCP/интернет:**
   - актуальные версии Supabase CLI,
   - рекомендуемую структуру проекта,
   - best practices по работе с множеством окружений (local/staging/prod),
   - рекомендуемые Node/TS библиотеки (`@supabase/supabase-js`, etc).

5. **Нужны:**
   - схема БД (с миграциями),
   - слой сырых данных (RAW),
   - доменный слой (DOMAIN),
   - скрипты загрузки данных в локальную БД и Storage,
   - базовые тесты на БД (pgTAP/SQL),
   - минимальная структура репозитория (включая директорию под Next.js).

---

## 1. Продуктовый контекст

Мы делаем внутреннюю систему аннотации для стартапа RRS, который занимается **распознаванием изображений подносов** в столовых/кафетериях.

### 1.1. Что происходит в реальности

- Человек ставит поднос под терминал.
- Две камеры делают **две фотографии одного и того же подноса**:
  - `main` (основной ракурс),
  - `qualifying` (второй ракурс).
- В POS‑системе есть **чек** с блюдами и количествами.
- Модель (Qwen или другая VLM) даёт **детекции**:
  - несколькими bounding box‑ами для блюд,
  - bounding box‑ами для тарелок,
  - иногда ошибается: дублирует блюда, путает классы, не находит часть объектов.

Задача системы аннотации — дать людям‑аннотаторам удобный интерфейс, чтобы:

- **проверить и подправить**:
  - блюда относительно чека,
  - тарелки,
  - базеры (пейджеры),
  - перекрытия,
  - другие объекты,
- сделать это **максимально быстро**, с помощью горячих клавиш и минимального количества действий,
- **избежать ошибок** (инварианты и подсказки в UI),
- на выходе получить **чистый датасет** для обучения моделей.

### 1.2. Роли пользователей

1. **Annotator (аннотатор)**  
   - Низкопороговый пользователь, умеющий работать с аннотацией и знающий меню.
   - Работает по принципу очереди задач:
     - “Start / Next task” → система даёт следующую задачу,
     - он её выполняет и нажимает “Done”.

2. **Admin / DS Lead**
   - Определяет, какие типы проверок (валидаций) важны сейчас.
   - Следит за прогрессом, количеством размеченных подносов.
   - В будущем — может настраивать приоритеты, фильтры и т.п.

Фронтенд для этого будет позже. Сейчас нам важно, чтобы **бэкенд отражал эти сущности и инварианты**.

---

## 2. Доменная модель (логическая)

### 2.1. Recognition

**Recognition** — атом работы.

- Один поднос.
- Ровно две картинки (`main`, `qualifying`).
- Один чек.
- Модельные и (потом) человеческие аннотации.

Свойства (логически):

- `id` (например, `100024`),
- дата/время,
- ссылка на экспортный батч (например, `export_20251024_121255`).

### 2.2. Image

**Image** — конкретная фотография подноса.

- Принадлежит `recognition`.
- Имеет роль:
  - `main` или `qualifying`.
- Хранится в Supabase Storage.

### 2.3. MenuItem

**MenuItem** — блюдо / продукт из меню.

Из исходных JSON‑ов есть:

- `ExternalId` — ключ, PLU/баркод (строка),
- `Name` — название (`"PEPSI 33CL - REST"`),
- масса доп. полей в `AM.json`.

Требования:

- `external_id` — PRIMARY KEY (или уникальный индекс),
- `name` — строка,
- остальное можно сохранять в JSONB, а потом декомпозировать при необходимости.

### 2.4. Check и CheckLine

**Check** — чек/корректный список блюд для recognition.

- Один `check` на `recognition`.
- `check_line`:
  - `menu_item_external_id`,
  - `quantity` (Count из correct_dishes.json).

Пока чеком считаем именно **correct_dishes.json** (исходные “правильные” данные).  
В будущем может появиться “исходный чек” vs “исправленный чек”, но это уже надстройка.

### 2.5. Item (логический объект)

**Item** — логический объект на подносе.

Типы:

- `food` (блюдо/напиток),
- `plate`,
- `buzzer`,
- `other`.

Свойства:

- принадлежит `recognition`,
- `type` (`food|plate|buzzer|other`),
- для `food` обычно есть ссылка на `menu_item_external_id` (чек),
- `is_extra` (булево) — объект не из исходного чека (добавлен руками / найден при аннотации),
- item‑level флаги:
  - `orientation` (например, ориентация бутылки),
  - `undefined_item` (аннотатор не понимает, что это).

Инвариант:  
если у `CheckLine` количество `N`, то **в идеале** должно быть `N` food‑items для этого блюда.  
Допустимы extra‑items (лишнее на подносе).

### 2.6. Annotation (per-image)

**Annotation** — геометрическое представление item на одной картинке.

Свойства:

- `image_id`,
- `item_id`,
- `bbox` (четыре координаты),
- annotation‑level флаги:
  - `occluded`,
  - `occludes_other`,
  - другие позже.

Инвариант:  
каждый item должен иметь **по одной аннотации на каждое изображение** (main/qualifying),  
если не помечено иное (например, спец‑флаг “нет на втором изображении”).

### 2.7. Модельные vs человеческие аннотации

Нужно различать:

- **model_annotations** (от Qwen),
- **human_annotations** (созданные людьми).

Базовый подход:

- Таблица `model_annotations`:
  - `id`, `image_id`, `type` (`dish|plate`), `bbox`, `qwen_label`, `source_batch_id`.
- Таблицы `items` и `annotations` — человеческая истина (ground truth).

Позже можно добавить `annotation_versions` или флаг `source`.

### 2.8. ValidationType и Task (на будущее)

**ValidationType** — тип проверки:

- `FOOD_VALIDATION`,
- `PLATE_VALIDATION`,
- `BUZZER_VALIDATION`,
- `OCCLUSION_VALIDATION`,
- `BOTTLE_ORIENTATION_VALIDATION`,
- и т.п.

**Task**:

> `Task = recognition_id + validation_type`

Свойства:

- `state` (`pending|in_progress|completed|expired`),
- `locked_by_user_id` (кто сейчас взял),
- `locked_at`, `lock_expires_at`,
- в будущем — приоритет.

Нам нужно, чтобы БД позволяла легко реализовать queue‑подход:  
аннотатор нажимает “Start”, получает task, который **эксклюзивно** лочит recognition.

### 2.9. Пользователи и роли

Supabase Auth даёт `auth.users`.

Нам нужна таблица `public.profiles`:

- `id` UUID = `auth.users.id`,
- `email`,
- `role` (ENUM):

  Предлагаемый enum `user_role`:

  - `annotator`
  - `admin`
  - `ds_lead`
  - (опционально) `viewer`

RLS/permissions можно спроектировать позже; сейчас достаточно структуры и enum‑ролей.

---

## 3. Инварианты (что нельзя нарушать)

Эти правила БД должна по возможности обеспечивать, а тесты — проверять:

1. **Two-image consistency**: для каждого item (кроме специально помеченных исключений) по аннотации на каждом изображении.
2. **Check vs food items**: суммы quantity по check_lines соответствуют количеству food‑items (с учётом extra).
3. **Buzzers и plates**: если объект есть на одном изображении — он должен быть и на другом.
4. **Task completion**: task не должен быть `completed`, если его доменные инварианты нарушены (это позже, но желательно предусмотреть).
5. **Single recognition per task**: один task всегда относится к одному recognition.

---

## 4. Источники данных для загрузки

### 4.1. Qwen annotations

Локальный путь:

```text
/Users/romanshestakov/Downloads/qwen_annotations.json
```

Формат:

```json
{
  "data/recognition_100024/photos/recognition_100024_2025-10-11_Main.jpg": {
    "dishes": {
      "qwen_detections": [
        { "bbox_2d": [x1, y1, x2, y2], "label": "dish_0" }
      ],
      "correct_dishes_path": "…/100024_recognition_2025-10-11_correct_dishes.json"
    },
    "plates": {
      "qwen_detections": [
        { "bbox_2d": [x1, y1, x2, y2], "label": "plate" }
      ]
    }
  },
  "data/recognition_100065/photos/recognition_100065_2025-10-11_Main.jpg": { … }
}
```

### 4.2. Каталог распознаваний

Базовый путь:

```text
/Users/romanshestakov/Downloads/RRS_Dataset 2
```

Внутри есть как минимум один экспорт, например:

```text
/Users/romanshestakov/Downloads/RRS_Dataset 2/export_20251024_121255/
```

Далее для каждого recognition:

```text
recognition_100024/
  photos/
    recognition_100024_2025-10-11_Main.jpg
    recognition_100024_2025-10-11_Qualifying.jpg
  100024_recognition_2025-10-11_correct_dishes.json
  100024_recognition_2025-10-11_AM.json
```

- `correct_dishes.json` — корректные блюда:
  - массив объектов с `Count` и `Dishes[]`, где у `Dishes` есть `Name`, `ExternalId`.
- `AM.json` — справочник меню (много позиций, много полей).

---

## 5. Supabase: целевая архитектура и схема БД

### 5.1. Схемы

- schema `public` — доменная модель.
- schema `raw` — сырые данные.

### 5.2. Перечень таблиц

#### 5.2.1. Схема `public`

1. `user_role` (ENUM)
   - значения: `'annotator' | 'admin' | 'ds_lead' | 'viewer'`

2. `profiles`
   - `id` `uuid` PK, FK → `auth.users.id`
   - `email` `text`
   - `role` `user_role` NOT NULL DEFAULT `'annotator'`
   - `created_at` `timestamptz` default now()
   - `updated_at` `timestamptz` default now()

3. `recognitions`
   - `id` `bigint` PK (например, 100024)
   - `batch_id` `text` (например, `export_20251024_121255`)
   - `captured_at` `timestamptz` NULL
   - `raw_path` `text` (путь к директории `recognition_XXXXXX`)
   - `created_at` `timestamptz` default now()

4. `images`
   - `id` `bigserial` PK
   - `recognition_id` `bigint` FK → `recognitions.id`
   - `role` `text` CHECK (`role in ('main','qualifying')`)
   - `storage_path` `text` (ключ в Supabase Storage)
   - `original_filename` `text`
   - `width` `int` NULL
   - `height` `int` NULL
   - `created_at` `timestamptz` default now()

5. `menu_items`
   - `external_id` `text` PK
   - `name` `text`
   - `raw_payload` `jsonb` NULL (из AM.json)
   - `created_at` `timestamptz` default now()

6. `checks`
   - `id` `bigserial` PK
   - `recognition_id` `bigint` UNIQUE FK → `recognitions.id`
   - `source` `text` default `'correct_dishes'`  -- позже можно расширять
   - `raw_path` `text`  -- путь к исходному correct_dishes.json
   - `created_at` `timestamptz` default now()

7. `check_lines`
   - `id` `bigserial` PK
   - `check_id` `bigint` FK → `checks.id`
   - `menu_item_external_id` `text` FK → `menu_items.external_id`
   - `quantity` `int` NOT NULL
   - `created_at` `timestamptz` default now()

8. `items`
   - `id` `bigserial` PK
   - `recognition_id` `bigint` FK → `recognitions.id`
   - `type` `text` CHECK (`type in ('food','plate','buzzer','other')`)
   - `menu_item_external_id` `text` FK → `menu_items.external_id` NULL
   - `is_extra` `bool` default false
   - `orientation` `text` NULL
   - `undefined_item` `bool` default false
   - `created_at` `timestamptz` default now()

9. `annotations`
   - `id` `bigserial` PK
   - `item_id` `bigint` FK → `items.id`
   - `image_id` `bigint` FK → `images.id`
   - `bbox` `int[4]`  -- [x1,y1,x2,y2]
   - `occluded` `bool` default false
   - `occludes_other` `bool` default false
   - `created_at` `timestamptz` default now()

10. `model_annotations`
    - `id` `bigserial` PK
    - `image_id` `bigint` FK → `images.id`
    - `type` `text` CHECK (`type in ('dish','plate')`)
    - `bbox` `int[4]`
    - `qwen_label` `text`  -- "dish_0" / "plate" etc.
    - `source_batch_id` `text`
    - `created_at` `timestamptz` default now()

11. `tasks`
    - `id` `bigserial` PK
    - `recognition_id` `bigint` FK → `recognitions.id`
    - `validation_type` `text`  -- можно позже вынести в enum
    - `state` `text` CHECK (`state in ('pending','in_progress','completed','expired')`) default 'pending'
    - `locked_by` `uuid` FK → `profiles.id` NULL
    - `locked_at` `timestamptz` NULL
    - `lock_expires_at` `timestamptz` NULL
    - `priority` `int` NULL
    - `created_at` `timestamptz` default now()
    - индекс по (`state`,`priority`,`recognition_id`)

#### 5.2.2. Схема `raw`

1. `raw.qwen_annotations`
   - `id` `bigserial` PK
   - `image_path` `text`  -- ключ из JSON
   - `payload` `jsonb`    -- полный объект (dishes, plates, etc.)
   - `batch_id` `text`    -- чтобы различать загрузки
   - `created_at` `timestamptz` default now()

2. `raw.correct_dishes`
   - `id` `bigserial` PK
   - `recognition_id` `bigint`
   - `file_path` `text`
   - `payload` `jsonb`
   - `batch_id` `text`
   - `created_at` `timestamptz` default now()

3. `raw.dish_catalog`
   - `id` `bigserial` PK
   - `recognition_id` `bigint`
   - `file_path` `text`
   - `payload` `jsonb`
   - `batch_id` `text`
   - `created_at` `timestamptz` default now()

4. `raw.recognition_files`
   - `id` `bigserial` PK
   - `recognition_id` `bigint`
   - `batch_id` `text`
   - `dir_path` `text`
   - `main_filename` `text`
   - `qualifying_filename` `text`
   - `created_at` `timestamptz` default now()

---

## 6. Структура репозитория

Предлагаемая структура:

```text
.
├─ supabase/                # standard supabase CLI folder (migrations, config, tests)
│  ├─ migrations/
│  ├─ tests/                # pgTAP / SQL tests
│  └─ config.toml
├─ apps/
│  └─ web/                  # резерв под будущий Next.js (пока только README)
├─ scripts/                 # скрипты загрузки/ингеста
│  ├─ ingest-qwen.ts
│  ├─ ingest-recognitions.ts
│  └─ shared/
│      └─ supabaseClient.ts
├─ .env                     # базовые переменные окружения
├─ package.json
└─ docs/
   └─ rrs_backend_spec.md   # этот документ
```

Пока в `apps/web` достаточно `README.md` с пометкой, что фронтенд будет позже.

---

## 7. Ингест: загрузка данных в локальную БД и Storage

### 7.1. Требования по окружению

- Использовать `.env` с переменными (см. выше).
- Supabase CLI работает с локальным инстансом (`supabase start`).
- Скрипты запускаются через `npm`/`pnpm`:

  ```bash
  pnpm ingest:qwen --limit 50
  pnpm ingest:recognitions --limit 10
  ```

### 7.2. Общие требования к скриптам

- Язык: TypeScript (Node.js), с использованием `@supabase/supabase-js` + `pg` или вызовов `psql`/`COPY`.
- Управляемый объём:
  - параметр `--limit` (кол-во recognitions),
  - параметр `--ids` (список ID через запятую или файл).
- Логи:
  - прогресс по числу обработанных recognitions / изображений,
  - ошибки с понятными сообщениями.
- Устойчивость:
  - не падать при первой ошибке (лог + продолжение),
  - возможность перезапуска (idempotent там, где возможно, либо явный `batch_id`).

### 7.3. Скрипт `ingest-qwen.ts`

Задача:

1. Прочитать `/Users/romanshestakov/Downloads/qwen_annotations.json`.
2. Для каждой записи:
   - записать в `raw.qwen_annotations`:
     - `image_path`,
     - `payload` (JSON),
     - `batch_id` (например, имя файла или явный параметр).
3. В идеале использовать `COPY`:
   - скрипт генерирует временный CSV/JSONL,
   - запускает `COPY raw.qwen_annotations FROM STDIN`.

Опции:

- `--limit` по количеству записей, которые загружаем (для тестов).

### 7.4. Скрипт `ingest-recognitions.ts`

Задача:

1. Пройти по каталогу `/Users/romanshestakov/Downloads/RRS_Dataset 2/export_...`.
2. Для каждой директории `recognition_<id>`:
   - прочитать:
     - `photos/*.jpg`,
     - `*_correct_dishes.json`,
     - `*_AM.json`.
   - записать в `raw.recognition_files`, `raw.correct_dishes`, `raw.dish_catalog`.
   - Upload:
     - JPG‑файлы в Storage bucket, например `rrs-photos`,
     - ключи вида `batch_id/recognition_id/<filename>`.
   - Использовать параллельную загрузку (pool ~20 задач).
   - При ошибке upload:
     - сделать несколько retry,
     - если не удалось — лог + переход к следующему файлу.

Опции:

- `--limit` по количеству recognitions,
- `--batch-id` для пометки в raw‑таблицах и Storage‑пути.

### 7.5. Трансформации RAW → DOMAIN

После загрузки сырых данных нужны SQL/PLpgSQL‑скрипты (можно оформить как миграции или отдельные процедуры), которые:

1. Создают/обновляют `menu_items` на основе `raw.dish_catalog`:
   - извлекают `ExternalId`, `Name`, сохраняют `raw_payload`.

2. Создают/апдейтят `recognitions` и `images`:
   - из `raw.recognition_files`:
     - `recognition_id`,
     - `batch_id`,
     - `dir_path`,
     - `main_filename`, `qualifying_filename`.

3. Создают `checks` и `check_lines`:
   - из `raw.correct_dishes`:
     - для каждого recognition один `check`,
     - `check_lines` по `Count` и `Dishes[].ExternalId`.

4. Создают `model_annotations`:
   - join по `raw.qwen_annotations` и уже созданным `images`,
   - на основе `dishes.qwen_detections` и `plates.qwen_detections`.

Требование:  
эти процедуры должны уметь выполняться **повторно** (например, по `batch_id`), не создавая дубликаты.

---

## 8. Тесты на БД

Используем стандартный для Supabase формат:

- каталог `supabase/tests`,
- SQL/pgTAP тесты.

Примеры проверок:

1. После загрузки тестового мини‑набора (1–3 recognitions):

   - существует запись в `recognitions` с конкретным `id`,
   - у неё две записи в `images` с ролями `main` и `qualifying`,
   - есть `check` и `check_lines` с ожидаемыми количествами,
   - `menu_items` содержит нужные `external_id` из correct_dishes.

2. `model_annotations`:

   - количество записей для конкретного `image` совпадает с количеством `qwen_detections` в raw,
   - bounding box‑ы корректно перенесены.

3. Интеграционные инварианты:

   - сумма `check_lines.quantity` по чек‑у >= количества связанных `food` items (когда items появятся),
   - внешние ключи не нарушаются.

На этом этапе достаточно нескольких проверок на маленьком наборе.

---

## 9. Стратегия окружений и веток (кратко)

Целевая картина (на будущее):

- **main** → прод, **develop** → staging, feature‑ветки → локальная работа.
- Для каждого окружения свои `.env` и свой Supabase‑проект:
  - `SUPABASE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DATABASE_URL` различаются.
- Миграции должны быть одинаковы для всех окружений:
  - применяем через Supabase CLI.

Для локальной разработки сейчас достаточно:

```bash
supabase init
supabase start   # локальный Postgres + API + Studio
supabase db reset --env local   # если нужно пересоздать схему
```

Cursor должен уточнить через MCP/документацию актуальные команды CLI и отразить их в README.

---

## 10. Конкретные задачи для Cursor

1. **Инициализировать новый репозиторий** (если нужно — мысленно, кодом в ответе):
   - настроить `package.json`, `supabase/`, `scripts/`, `apps/web/`, `docs/`.

2. **Настроить Supabase локально**:
   - использовать приведённые env‑переменные,
   - описать в README, как запускать `supabase start`, `supabase db reset` и т.п.

3. **Создать миграции для схем `public` и `raw`** ровно по таблицам, описанным в разделе 5:
   - использовать ENUM `user_role`,
   - настроить все FK, индексы, CHECK‑ограничения.

4. **Настроить `profiles` и базовую авторизацию**:
   - таблица `profiles` с FK на `auth.users`,
   - использовать enum‑роль.

5. **Реализовать TypeScript‑скрипты для ingesta** в директории `scripts/`:
   - `ingest-qwen.ts`,
   - `ingest-recognitions.ts`,
   - общий модуль `shared/supabaseClient.ts` для подключения к БД и Storage.
   - предусмотреть параметры `--limit`, `--batch-id`, `--ids`.

6. **Реализовать SQL/PLpgSQL‑процедуры для трансформации RAW → DOMAIN**:
   - загрузка menu_items,
   - recognitions+images,
   - checks+check_lines,
   - model_annotations.

7. **Добавить pgTAP/SQL тесты** в `supabase/tests`, которые:
   - поднимают небольшой тестовый набор данных,
   - проверяют связи и базовые инварианты.

8. **Документация**:
   - добавить `README.md` в корень с:
     - шагами по запуску локальной Supabase,
     - запуску скриптов ingesta,
     - запуску тестов,
   - README в `apps/web` с пометкой, что это будущий Next.js‑проект.

---

На этом всё.  
Если Cursor следует этому документу, на выходе должен получиться **чистый локальный Supabase‑backend** с продуманной схемой, сырым и доменным слоями, скриптами загрузки и базовыми тестами, готовый к тому, чтобы позже на него “повесить” Next.js фронтенд и UI аннотации.
