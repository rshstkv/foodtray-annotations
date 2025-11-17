# Загрузка изображений в Supabase Storage

## Проблема
При первоначальной загрузке данных изображения не загружались в Supabase Storage из-за ошибки в логике проверки существования файлов.

## Решение

### 1. Догрузка недостающих изображений
Если у вас уже есть recognitions в БД, но нет изображений в Storage, используйте:

```bash
cd /Users/romanshestakov/RRS/assisted-orders-nextjs
python3 scripts/ingest/upload_missing_images.py
```

Этот скрипт:
- Находит все recognitions в БД
- Ищет соответствующие изображения в датасете
- Загружает их в Supabase Storage
- Пропускает уже загруженные файлы

### 2. Загрузка новых данных
Для загрузки новых recognitions с изображениями:

```bash
python3 scripts/ingest/ingest_recognitions.py --limit 50
```

Опции:
- `--limit N` - ограничить количество recognitions для загрузки (полезно для тестирования)
- Без `--limit` - загрузить все recognitions из датасета

### 3. Где находится датасет
Скрипты автоматически ищут датасет в следующих местах:
1. `/Users/romanshestakov/RRS/assisted-orders-nextjs/RRS_Dataset 2`
2. `~/Downloads/RRS_Dataset 2`
3. `~/RRS_Dataset 2`

Структура датасета должна быть:
```
RRS_Dataset 2/
└── export_YYYYMMDD_HHMMSS/
    └── recognition_NNNNNN/
        ├── photos/
        │   ├── recognition_NNNNNN_*_Main.jpg
        │   └── recognition_NNNNNN_*_Qualifying.jpg
        ├── NNNNNN_recognition_*_AM.json
        └── NNNNNN_recognition_*_correct_dishes.json
```

## Исправления в ingest_recognitions.py

**Было:**
```python
try:
    supabase_client.storage.from_('rrs-photos').list(path=f"recognitions/{recognition_id}")
    # Всегда пропускал загрузку, т.к. list() всегда успешен
    uploaded_data.append((f"camera{camera_num}.jpg", img_width, img_height))
    continue
except:
    pass
```

**Стало:**
```python
file_exists = False
try:
    objects = supabase_client.storage.from_('rrs-photos').list(path=f"recognitions/{recognition_id}")
    if objects:
        file_exists = any(obj.get('name') == f"camera{camera_num}.jpg" for obj in objects)
except:
    file_exists = False

if file_exists:
    uploaded_data.append((f"camera{camera_num}.jpg", img_width, img_height))
    continue
```

Теперь скрипт правильно проверяет существование конкретного файла в результатах `list()`.

## Проверка загрузки

### Проверить количество изображений в Storage:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c \
  "SELECT COUNT(*) FROM storage.objects WHERE bucket_id = 'rrs-photos';"
```

Должно быть: `количество recognitions × 2` (две камеры)

### Проверить доступность конкретного изображения:
```bash
curl -I "http://127.0.0.1:54321/storage/v1/object/public/rrs-photos/recognitions/100324/camera1.jpg"
```

Должен вернуть: `HTTP/1.1 200 OK`

## Текущее состояние
- ✅ 50 recognitions в БД
- ✅ 100 изображений в Storage (50 × 2 камеры)
- ✅ Все изображения доступны через API
- ✅ Валидация работает корректно



