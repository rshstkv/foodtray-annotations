# Development Guide

Руководство по безопасной разработке и восстановлению локальной базы данных.

## 🔐 Защита Production

### Автоматическая защита от db:reset

Проект защищен от случайного удаления production базы данных:

- ✅ Production база **полностью защищена** от `db:reset`
- ✅ Все команды проверяют окружение перед выполнением
- ✅ Wrapper скрипт блокирует опасные операции для production
- ✅ Логирование всех попыток reset в `scripts/db_reset.log`

### Команды базы данных

```bash
# Безопасный reset с проверками (РЕКОМЕНДУЕТСЯ)
npm run db:reset

# Только миграции (без удаления данных)
npm run db:migrate

# Опасная команда с прямым reset (используйте осторожно!)
npm run db:reset:dangerous
```

**⚠️ ВАЖНО:** Команда `db:reset` автоматически:
- Проверяет окружение (local/production)
- Блокирует выполнение для production
- Запрашивает подтверждение для local
- Логирует все попытки

## 🚀 Быстрое Восстановление Локальной БД

### Quick Restore (Рекомендуется)

Используйте эти команды для быстрого восстановления после случайного `db:reset`:

```bash
# Быстрое восстановление (100 recognitions, ~2 минуты)
npm run db:restore:quick

# Полное восстановление (1000 recognitions, ~5-10 минут)
npm run db:restore:full

# Проверка целостности Storage
npm run db:check
```

### Ручное восстановление

Если нужен больший контроль, используйте Python скрипты напрямую:

```bash
# Восстановление с кастомными параметрами
python3 scripts/quick_restore.py --count 500 --workers 40

# Только данные, без Storage upload
python3 scripts/quick_restore.py --count 100 --no-storage

# Пропустить db:reset (если БД уже чистая)
python3 scripts/quick_restore.py --count 100 --skip-reset
```

## 📋 Доступные Скрипты

### Database Management

| Команда | Описание | Безопасность |
|---------|----------|--------------|
| `npm run db:migrate` | Применить только миграции | ✅ Безопасно |
| `npm run db:reset` | Reset с проверками | ✅ Защищено wrapper |
| `npm run db:reset:dangerous` | Прямой reset БЕЗ проверок | ⚠️ ОПАСНО |

### Data Restoration

| Команда | Описание | Время |
|---------|----------|-------|
| `npm run db:restore:quick` | 100 recognitions | ~2-3 мин |
| `npm run db:restore:full` | 1000 recognitions | ~5-10 мин |
| `npm run db:check` | Проверка Storage | ~30 сек |

### Python Скрипты

#### 1. quick_restore.py - Главный скрипт восстановления

```bash
# Базовое использование
python3 scripts/quick_restore.py --count 100

# С увеличенным числом workers
python3 scripts/quick_restore.py --count 100 --workers 40

# Без подтверждения (для автоматизации)
python3 scripts/quick_restore.py --count 100 --force

# Только данные (без Storage)
python3 scripts/quick_restore.py --count 100 --no-storage
```

**Что делает:**
1. Проверяет что мы в локальном окружении
2. Запрашивает подтверждение
3. Выполняет `supabase db reset`
4. Загружает данные через `import_dataset_fast.py`
5. Загружает картинки в Storage (параллельно)
6. Проверяет целостность Storage
7. Показывает статистику

#### 2. seed_local.py - Seed данных

```bash
# Базовое использование
python3 scripts/seed_local.py

# Кастомное количество
python3 scripts/seed_local.py --count 500

# Без Storage upload
python3 scripts/seed_local.py --count 100 --no-storage

# С увеличенным числом workers
python3 scripts/seed_local.py --count 1000 --workers 40

# Кастомные пути
python3 scripts/seed_local.py --dataset-path /path/to/dataset --qwen-path /path/to/qwen.json
```

#### 3. upload_images_only.py - Загрузка картинок

```bash
# Загрузить все картинки
python3 scripts/upload_images_only.py

# Первые 100 картинок
python3 scripts/upload_images_only.py --limit 100

# С проверкой существующих файлов
python3 scripts/upload_images_only.py --check-existing

# Увеличенное число workers и retry
python3 scripts/upload_images_only.py --workers 40 --max-retries 5
```

**Features:**
- ✅ Retry механизм для failed uploads
- ✅ Автоматический skip дубликатов
- ✅ Статистика скорости (images/s, MB/s)
- ✅ До 40 параллельных workers

#### 4. check_storage.py - Проверка Storage

```bash
# Базовая проверка
python3 scripts/check_storage.py

# Детальный отчет
python3 scripts/check_storage.py --detailed

# Показать missing files
python3 scripts/check_storage.py --show-missing

# Автоматическое восстановление
python3 scripts/check_storage.py --fix
```

**Что проверяет:**
- 📊 Количество файлов в БД vs Storage
- 📊 Общий размер Storage
- ⚠️ Missing files (в БД, но не в Storage)
- ⚠️ Extra files (в Storage, но не в БД)

#### 5. import_dataset_fast.py - Прямой импорт

```bash
# Полный импорт с файлами
python3 scripts/import_dataset_fast.py \
  "/path/to/dataset" \
  "/path/to/qwen.json" \
  --env local \
  --limit 1000

# Только данные (без Storage)
python3 scripts/import_dataset_fast.py \
  "/path/to/dataset" \
  "/path/to/qwen.json" \
  --env local \
  --limit 100 \
  --skip-storage-upload

# С максимальной скоростью (drop indexes)
python3 scripts/import_dataset_fast.py \
  "/path/to/dataset" \
  "/path/to/qwen.json" \
  --env local \
  --limit 1000 \
  --drop-indexes
```

## 🔧 Конфигурация

### scripts/db_config.json

Центральная конфигурация защиты и путей:

```json
{
  "production": {
    "allow_reset": false,
    "require_confirmation": true,
    "warning_message": "⛔️ DANGER: Production database reset is DISABLED!"
  },
  "local": {
    "allow_reset": true,
    "require_confirmation": true
  },
  "dataset_paths": {
    "default_dataset_dir": "/Users/romanshestakov/Downloads/RRS_Dataset 2",
    "default_qwen_json": "/Users/romanshestakov/Downloads/qwen_annotations.json"
  }
}
```

**Как изменить пути к датасету:**
1. Отредактируйте `scripts/db_config.json`
2. Обновите `default_dataset_dir` и `default_qwen_json`
3. Все скрипты автоматически используют новые пути

## 🎯 Типичные Сценарии

### Сценарий 1: Случайный db:reset

```bash
# 1. Вы случайно запустили db:reset и потеряли данные
# 2. Быстро восстановите локальную БД:
npm run db:restore:quick

# Готово! Данные и картинки восстановлены за ~2-3 минуты
```

### Сценарий 2: Чистая установка

```bash
# 1. Клонировали проект
git clone <repo>
cd assisted-orders-nextjs

# 2. Установите зависимости
npm install
pip3 install -r scripts/requirements.txt

# 3. Запустите Supabase локально
supabase start

# 4. Настройте пути в scripts/db_config.json

# 5. Восстановите данные
npm run db:restore:quick

# 6. Запустите приложение
npm run dev
```

### Сценарий 3: Обновление миграций

```bash
# 1. Применить новые миграции (без удаления данных)
npm run db:migrate

# 2. Если нужен полный reset с новыми миграциями
npm run db:reset
npm run db:restore:full
```

### Сценарий 4: Проблемы с картинками

```bash
# 1. Проверьте состояние Storage
npm run db:check

# 2. Если нашлись missing files, восстановите:
python3 scripts/check_storage.py --fix

# 3. Или загрузите только картинки:
python3 scripts/upload_images_only.py
```

### Сценарий 5: Тестирование с разным количеством данных

```bash
# Быстрое тестирование (50 recognitions)
python3 scripts/quick_restore.py --count 50 --force

# Среднее тестирование (200 recognitions)
python3 scripts/quick_restore.py --count 200

# Стресс-тестирование (1000 recognitions)
npm run db:restore:full
```

## ⚡️ Производительность

### Время выполнения

| Операция | Количество | Время | Скорость |
|----------|-----------|-------|----------|
| Quick restore | 100 recognitions | ~2-3 мин | ~33 rec/min |
| Full restore | 1000 recognitions | ~5-10 мин | ~100-200 rec/min |
| Storage upload | 2000 images | ~3-5 мин | ~400-700 img/min |
| DB check | Any | ~30 сек | N/A |

### Оптимизация

**Увеличьте workers для более быстрой загрузки:**
```bash
# Стандарт (20 workers)
python3 scripts/quick_restore.py --count 100

# Оптимизировано (40 workers)
python3 scripts/quick_restore.py --count 100 --workers 40
```

**Используйте --drop-indexes для максимальной скорости:**
```bash
python3 scripts/import_dataset_fast.py \
  "/path/to/dataset" \
  "/path/to/qwen.json" \
  --env local \
  --limit 1000 \
  --drop-indexes
```

**Пропустите Storage для data-only восстановления:**
```bash
python3 scripts/quick_restore.py --count 1000 --no-storage
```

## 🐛 Troubleshooting

### Проблема: "Database reset failed"

**Решение:**
```bash
# Попробуйте reset вручную
supabase db reset

# Затем восстановите данные
npm run db:restore:quick
```

### Проблема: "Dataset directory not found"

**Решение:**
1. Проверьте путь в `scripts/db_config.json`
2. Или укажите путь явно:
```bash
python3 scripts/quick_restore.py --dataset-path /correct/path/to/dataset
```

### Проблема: "Some uploads failed"

**Решение:**
```bash
# Увеличьте retry attempts
python3 scripts/upload_images_only.py --max-retries 5

# Или используйте меньше workers (если сеть медленная)
python3 scripts/upload_images_only.py --workers 10
```

### Проблема: "Can't connect to Supabase"

**Решение:**
```bash
# Убедитесь что Supabase запущен
supabase status

# Если не запущен, запустите:
supabase start

# Проверьте .env.local файл
cat .env.local | grep SUPABASE_URL
```

### Проблема: Protection блокирует local database

**Решение:**
Проверьте что ваш `SUPABASE_URL` в `.env.local` содержит:
- `localhost` ИЛИ
- `127.0.0.1` ИЛИ
- порт `54321`

```bash
# Правильный local URL:
SUPABASE_URL=http://127.0.0.1:54321

# Неправильный (будет заблокирован):
SUPABASE_URL=https://xxx.supabase.co
```

## 📝 Логирование

### DB Reset Log

Все попытки reset логируются в `scripts/db_reset.log`:

```bash
# Посмотреть последние попытки reset
tail -20 scripts/db_reset.log

# Мониторить в реальном времени
tail -f scripts/db_reset.log
```

### Import Logs

Import скрипт сохраняет логи в корне проекта:
- `seed_output.log` - логи seed_local.py
- `upload_output.log` - логи upload_images_only.py

## 🔒 Безопасность

### Защита Production

1. **Автоматическая проверка URL:**
   - Все скрипты проверяют `SUPABASE_URL`
   - Production URL автоматически блокируется
   - Требуется подтверждение для local

2. **Wrapper скрипт:**
   - `scripts/db_reset_wrapper.sh` оборачивает `supabase db reset`
   - Читает конфигурацию из `scripts/db_config.json`
   - Логирует все попытки

3. **NPM команды:**
   - Безопасные команды используют wrapper
   - Опасные команды помечены как `:dangerous`

### Best Practices

✅ **DO:**
- Используйте `npm run db:reset` (с wrapper)
- Используйте `quick_restore.py` для восстановления
- Регулярно проверяйте `npm run db:check`
- Проверяйте окружение перед опасными операциями

❌ **DON'T:**
- НЕ используйте `db:reset:dangerous` без крайней необходимости
- НЕ редактируйте `scripts/db_config.json` для разрешения production reset
- НЕ пропускайте подтверждения с `--force` в production
- НЕ запускайте скрипты с production credentials

## 📚 Дополнительная Документация

- [Dataset Import Guide](./DATASET_IMPORT.md) - детали импорта датасета
- [Workflow Implementation](./WORKFLOW_IMPLEMENTATION.md) - архитектура workflow
- [scripts/README.md](./scripts/README.md) - детали import_dataset_fast.py

## 🆘 Поддержка

Если у вас проблемы:

1. Проверьте этот документ (DEVELOPMENT.md)
2. Проверьте логи (`scripts/db_reset.log`, `seed_output.log`)
3. Запустите `npm run db:check` для диагностики Storage
4. Попробуйте `quick_restore.py` с `--force --count 10` для быстрого теста

---

**Последнее обновление:** 2025-11-09
**Версия:** 1.0


