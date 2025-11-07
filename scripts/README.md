# Скрипт импорта датасета

## Быстрый старт

```bash
# Импорт данных (БЕЗ загрузки файлов в Storage - они уже там)
python3 import_dataset_fast.py \
  "/path/to/RRS_Dataset 2" \
  "/path/to/qwen_annotations.json" \
  --env prod \
  --skip-storage-upload
```

**Время выполнения**: ~1.5 минуты для полного датасета (12,904 recognitions + 25,808 images + 132,365 annotations)

## Что делает скрипт

- ✅ Автоматически обрабатывает дубликаты (обновляет существующие записи)
- ✅ Использует PostgreSQL COPY для максимальной скорости (в 40-60x быстрее API)
- ✅ Не нужно беспокоиться о повторных запусках - просто запускай с новыми данными
- ✅ Опционально загружает файлы в Supabase Storage

## Требования

1. **Python зависимости**:
```bash
pip install psycopg2-binary supabase python-dotenv tqdm
```

2. **DATABASE_URL в .env файле**:
   - Для prod: добавь в `.env.production`
   - Для local: добавь в `.env.local`
   - Используй "Pooled connection string" из Supabase (Settings → Database → Connection string)

## Примеры использования

### Полный импорт (обычный случай)
```bash
# Импорт ТОЛЬКО данных (файлы уже в Storage)
python3 import_dataset_fast.py \
  "/Users/romanshestakov/Downloads/RRS_Dataset 2" \
  "/Users/romanshestakov/Downloads/qwen_annotations.json" \
  --env prod \
  --skip-storage-upload
```

### Первый импорт (с файлами)
```bash
# Импорт данных + загрузка файлов в Storage
python3 import_dataset_fast.py \
  "/Users/romanshestakov/Downloads/RRS_Dataset 2" \
  "/Users/romanshestakov/Downloads/qwen_annotations.json" \
  --env prod
```

### Тестовый импорт
```bash
# Импорт только первых 100 записей
python3 import_dataset_fast.py \
  "/Users/romanshestakov/Downloads/RRS_Dataset 2" \
  "/Users/romanshestakov/Downloads/qwen_annotations.json" \
  --env prod \
  --limit 100 \
  --skip-storage-upload
```

### Максимальная скорость (с удалением индексов)
```bash
# Дополнительное ускорение в 2-3 раза
python3 import_dataset_fast.py \
  "/Users/romanshestakov/Downloads/RRS_Dataset 2" \
  "/Users/romanshestakov/Downloads/qwen_annotations.json" \
  --env prod \
  --skip-storage-upload \
  --drop-indexes
```

## Флаги

- `--env prod|local` - окружение (по умолчанию: local)
- `--skip-storage-upload` - не загружать файлы в Storage (используй если файлы уже там)
- `--limit N` - ограничить количество записей для теста
- `--workers N` - количество параллельных потоков для загрузки файлов (по умолчанию: 20)
- `--drop-indexes` - временно удалить индексы для ускорения (дает 2-3x speedup)
- `--no-upsert` - только новые записи, не обновлять существующие (не рекомендуется)
- `--no-pg-direct` - использовать медленный API вместо прямого Postgres (не рекомендуется)

## Производительность

| Операция | Количество | Время (COPY) | Время (старый API) | Ускорение |
|----------|------------|--------------|-------------------|-----------|
| Recognitions | 12,904 | 59 сек | ~40 минут | **40x** |
| Images | 25,808 | 2.7 сек | ~10 минут | **220x** |
| Annotations | 132,365 | 4.4 сек | ~30 минут | **400x** |
| **ИТОГО** | 171,077 | **~1.5 мин** | **~1.5 часа** | **60x** |

## Troubleshooting

### "DATABASE_URL is not set"
Добавь DATABASE_URL в соответствующий .env файл:
```bash
# В .env.production
DATABASE_URL=postgresql://postgres.xxx:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

### "ModuleNotFoundError: No module named 'psycopg2'"
Установи зависимости:
```bash
pip install psycopg2-binary
```

### Медленная загрузка
- Убедись что используешь `--skip-storage-upload` если файлы уже загружены
- Попробуй добавить `--drop-indexes` для дополнительного ускорения
- Проверь что не используешь `--no-pg-direct` (это медленно)



