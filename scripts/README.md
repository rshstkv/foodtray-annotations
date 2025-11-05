# Scripts для импорта данных

## import_dataset.py

Финальный универсальный скрипт для импорта датасета распознаваний в Supabase.

### Особенности:
- ✅ Автоматически находит директорию `export_*` внутри RRS_Dataset
- ✅ Избегает дублирования - проверяет существующие recognition_id
- ✅ Сохраняет `original_annotations` для возможности восстановления
- ✅ Поддерживает local и prod окружения
- ✅ Можно ограничить количество импортируемых recognitions

### Использование:

```bash
# Импорт всех данных в local окружение
python3 scripts/import_dataset.py \
  /Users/user/Downloads/RRS_Dataset \
  /Users/user/Downloads/qwen_annotations.json \
  --env local

# Импорт первых 30 recognitions для тестирования
python3 scripts/import_dataset.py \
  /Users/user/Downloads/RRS_Dataset \
  /Users/user/Downloads/qwen_annotations.json \
  --env local \
  --limit 30

# Импорт в prod окружение
python3 scripts/import_dataset.py \
  /Users/user/Downloads/RRS_Dataset \
  /Users/user/Downloads/qwen_annotations.json \
  --env prod
```

### Параметры:
- `dataset_dir` - путь к директории RRS_Dataset (содержит export_*)
- `qwen_json` - путь к файлу qwen_annotations.json
- `--env` - окружение: `local` (по умолчанию) или `prod`
- `--limit N` - ограничить импорт первыми N recognitions

### Что импортируется:
1. **recognitions** - основная информация о распознавании
2. **recognition_images** - изображения с `original_annotations` (для Undo)
3. **annotations** - bounding box аннотации от Qwen
4. **storage** - файлы изображений в Supabase Storage

### Повторный запуск:
Скрипт безопасно пропускает уже существующие recognitions, поэтому его можно запускать многократно для добавления новых данных.

---

## cleanup_all_data.py

Скрипт для полной очистки данных из Supabase.

⚠️ **ВНИМАНИЕ**: Удаляет ВСЕ данные!

```bash
# С подтверждением
python3 scripts/cleanup_all_data.py

# Без подтверждения (для скриптов)
python3 scripts/cleanup_all_data.py --force
```

---

## Требования

Установите зависимости:
```bash
pip install -r scripts/requirements.txt
```

Убедитесь что `.env.local` содержит:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

