# Импорт датасета

## Быстрый старт (1 команда)

```bash
python3 scripts/import_dataset_fast.py \
  "/path/to/RRS_Dataset 2" \
  "/path/to/qwen_annotations.json" \
  --env prod \
  --skip-storage-upload
```

⏱️ **Время**: ~1.5 минуты для полного датасета

## Что нужно знать

✅ **Автоматически обрабатывает дубликаты** - просто запускай с новыми данными, не беспокоясь о повторах

✅ **Очень быстро** - использует PostgreSQL COPY (в 60 раз быстрее старого метода)

✅ **Безопасно** - не трогает файлы в Storage (используй `--skip-storage-upload`)

## Первый раз?

### 1. Установи зависимости
```bash
cd scripts
pip install -r requirements.txt
```

### 2. Добавь DATABASE_URL в .env.production
```bash
# Скопируй "Pooled connection string" из Supabase
# Settings → Database → Connection string → Pooled
DATABASE_URL=postgresql://postgres.xxx:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

### 3. Запусти импорт
```bash
python3 scripts/import_dataset_fast.py \
  "/Users/romanshestakov/Downloads/RRS_Dataset 2" \
  "/Users/romanshestakov/Downloads/qwen_annotations.json" \
  --env prod \
  --skip-storage-upload
```

## Подробная документация

См. [scripts/README.md](scripts/README.md)



