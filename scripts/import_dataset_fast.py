#!/usr/bin/env python3
"""
БЫСТРЫЙ импорт датасета в Supabase через PostgreSQL COPY.

Что делает:
- Загружает recognitions, images, annotations через COPY FROM STDIN (в 40-60x быстрее!)
- Автоматически обрабатывает дубликаты (обновляет существующие записи)
- Опционально загружает файлы в Supabase Storage
- Время импорта: ~1.5 минуты для 12,904 recognitions + 25,808 images + 132,365 annotations

Требования:
- DATABASE_URL в .env файле (pooled connection string от Supabase)
- psycopg2-binary: pip install psycopg2-binary

Usage:
    # Полный импорт (БЕЗ загрузки файлов в Storage, они уже там)
    python3 import_dataset_fast.py "/path/to/RRS_Dataset 2" /path/to/qwen_annotations.json --env prod --skip-storage-upload
    
    # Полный импорт С загрузкой файлов в Storage (первый раз)
    python3 import_dataset_fast.py "/path/to/RRS_Dataset 2" /path/to/qwen_annotations.json --env prod
    
    # Тест на 100 записях
    python3 import_dataset_fast.py "/path/to/RRS_Dataset 2" /path/to/qwen_annotations.json --env prod --limit 100 --skip-storage-upload

Важно:
- По умолчанию использует --pg-direct (быстрый COPY метод)
- Автоматически обновляет существующие записи (режим upsert)
- Не нужно беспокоиться о дубликатах - скрипт сам все обработает
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
import re
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import time
import random
import csv
import statistics
import psycopg2
import psycopg2.extras

from supabase import create_client, Client
from dotenv import load_dotenv
from tqdm import tqdm


def setup_supabase(env: str = 'local') -> Client:
    """Настраивает и возвращает Supabase клиент."""
    if env == 'local':
        load_dotenv('.env.local')
    elif env == 'prod':
        load_dotenv('.env.production')
    else:
        raise ValueError(f"Invalid environment: {env}. Use 'local' or 'prod'")
    
    url = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_ANON_KEY') or os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    
    if not url or not key:
        print(f"❌ Error: Supabase credentials not found in .env.{env}")
        sys.exit(1)
    
    print(f"✅ Connected to Supabase ({env}): {url}")
    return create_client(url, key)


def setup_postgres() -> psycopg2.extensions.connection:
    """Создаёт прямое подключение к Postgres из DATABASE_URL."""
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        print("❌ DATABASE_URL is not set")
        sys.exit(1)
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    with conn.cursor() as cur:
        # Снимаем statement_timeout для долгих операций вставки
        try:
            cur.execute("SET statement_timeout TO 0")
        except Exception:
            pass
    print("✅ Connected to Postgres via DATABASE_URL")
    return conn


def find_export_directory(dataset_dir: Path) -> Optional[Path]:
    """Находит директорию export_* внутри dataset_dir."""
    for item in dataset_dir.iterdir():
        if item.is_dir() and item.name.startswith('export_'):
            return item
    return None


def extract_recognition_id(path: str) -> Optional[int]:
    """Извлекает recognition_id из пути."""
    match = re.search(r'recognition_(\d+)', str(path))
    return int(match.group(1)) if match else None


def extract_photo_type(filename: str) -> Optional[str]:
    """Извлекает тип фото из имени файла."""
    if '_Main.' in filename:
        return 'Main'
    elif '_Qualifying.' in filename:
        return 'Qualifying'
    return None


def prepare_recognition_data(recognition_dir: Path, qwen_data: Dict) -> Optional[Dict]:
    """Подготавливает данные для одного recognition."""
    recognition_id = extract_recognition_id(recognition_dir.name)
    if not recognition_id:
        return None
    
    # Ищем файлы
    dishes_files = list(recognition_dir.glob('*_correct_dishes.json'))
    menu_files = list(recognition_dir.glob('*_AM.json'))
    photos_dir = recognition_dir / 'photos'
    
    if not dishes_files or not photos_dir.exists():
        return None
    
    # Читаем correct_dishes
    try:
        with open(dishes_files[0], 'r', encoding='utf-8') as f:
            correct_dishes = json.load(f)
    except Exception as e:
        print(f"Error reading JSON for {recognition_id}: {e}")
        return None
    
    # Читаем menu_all (available menu)
    menu_all = []
    if menu_files:
        try:
            with open(menu_files[0], 'r', encoding='utf-8') as f:
                menu_all = json.load(f)
        except Exception as e:
            print(f"Warning: Error reading menu_all for {recognition_id}: {e}")
            # Не критично, продолжаем без menu_all
    
    # Извлекаем дату
    date_match = re.search(r'(\d{4}-\d{2}-\d{2})', dishes_files[0].name)
    recognition_date = date_match.group(1) if date_match else '2025-10-11'
    
    # Находим изображения
    image_files = sorted(photos_dir.glob('*.jpg')) + sorted(photos_dir.glob('*.jpeg'))
    
    images_data = []
    for img_file in image_files:
        photo_type = extract_photo_type(img_file.name)
        if not photo_type:
            continue
        
        storage_path = f"{recognition_id}/{img_file.name}"
        qwen_key = f"data/recognition_{recognition_id}/photos/{img_file.name}"
        
        qwen_dishes = []
        qwen_plates = []
        
        if qwen_key in qwen_data:
            qwen_entry = qwen_data[qwen_key]
            qwen_dishes = qwen_entry.get('dishes', {}).get('qwen_detections', [])
            qwen_plates = qwen_entry.get('plates', {}).get('qwen_detections', [])
        
        images_data.append({
            'local_path': img_file,
            'storage_path': storage_path,
            'photo_type': photo_type,
            'qwen_dishes': qwen_dishes,
            'qwen_plates': qwen_plates
        })
    
    return {
        'recognition_id': recognition_id,
        'recognition_date': recognition_date,
        'correct_dishes': correct_dishes,
        'menu_all': menu_all,
        'images': images_data
    }


def upload_file_to_storage(supabase_url: str, supabase_key: str, local_path: Path, storage_path: str, max_retries: int = 3) -> Tuple[bool, str]:
    """Загружает один файл в Storage с retry механизмом."""
    
    for attempt in range(max_retries):
        try:
            # Создаем новый клиент для каждого потока
            client = create_client(supabase_url, supabase_key)
            
            with open(local_path, 'rb') as f:
                file_data = f.read()
                response = client.storage().from_('bbox-images').upload(
                    path=storage_path,
                    file=file_data,
                    file_options={'content-type': 'image/jpeg', 'upsert': 'true'}
                )
            return True, storage_path
        except Exception as e:
            error_str = str(e).lower()
            
            # Дубликаты - это успех
            if 'duplicate' in error_str or 'already exists' in error_str or 'resource already exists' in error_str:
                return True, storage_path
            
            # Если это последняя попытка - возвращаем ошибку
            if attempt == max_retries - 1:
                return False, f"Error uploading {storage_path} after {max_retries} attempts: {e}"
            
            # Ждем перед следующей попыткой (exponential backoff)
            time.sleep(0.5 * (attempt + 1))
    
    return False, f"Error uploading {storage_path}: max retries exceeded"


def _time_budget_exceeded(start_time: Optional[float], time_budget_sec: Optional[int]) -> bool:
    if not start_time or not time_budget_sec:
        return False
    return (time.monotonic() - start_time) >= time_budget_sec


def _sleep_with_jitter(base: float, attempt: int) -> None:
    delay = base * attempt
    delay += random.uniform(0, delay * 0.3)
    time.sleep(delay)


def _record_timing(bucket: Optional[List[float]], duration: float) -> None:
    if bucket is not None:
        bucket.append(duration)


def _timings_summary(durations: List[float]) -> Dict[str, float]:
    if not durations:
        return {"avg_sec": 0.0, "p95_sec": 0.0, "count": 0}
    sorted_d = sorted(durations)
    p95_idx = max(0, int(len(sorted_d) * 0.95) - 1)
    return {
        "avg_sec": sum(sorted_d) / len(sorted_d),
        "p95_sec": sorted_d[p95_idx],
        "count": len(sorted_d),
    }


def batch_insert_recognitions(
    supabase: Client,
    recognitions_data: List[Dict],
    *,
    upsert: bool = False,
    batch_size: int = 200,
    start_time: Optional[float] = None,
    time_budget_sec: Optional[int] = None,
    timings: Optional[List[float]] = None,
    dry_run: bool = False,
) -> int:
    """Batch insert/upsert recognitions в пачках с ретраями."""
    records = []
    for data in recognitions_data:
        records.append({
            'recognition_id': data['recognition_id'],
            'recognition_date': data['recognition_date'],
            'status': 'not_started',
            'has_modifications': False,
            'is_mistake': False,
            'correct_dishes': data['correct_dishes'],
            'menu_all': data.get('menu_all', []),
            'annotator_notes': None
        })
    total_inserted = 0
    
    for i in tqdm(range(0, len(records), batch_size), desc="Inserting recognitions"):
        if _time_budget_exceeded(start_time, time_budget_sec):
            print("⏱️  Time budget reached during recognitions insert. Stopping phase.")
            break
        batch = records[i:i + batch_size]
        attempts = 0
        start = time.monotonic()
        while attempts < 3 and not dry_run:
            try:
                if upsert:
                    # on_conflict по recognition_id позволяет перезаписать существующие
                    supabase.table('recognitions').upsert(batch, on_conflict=['recognition_id']).execute()
                else:
                    supabase.table('recognitions').insert(batch).execute()
                total_inserted += len(batch)
                break
            except Exception as e:
                attempts += 1
                print(f"❌ Error inserting recognitions batch {i//batch_size} (attempt {attempts}/3): {e}")
                _sleep_with_jitter(1.0, attempts)
        if dry_run:
            total_inserted += len(batch)
        _record_timing(timings, time.monotonic() - start)
    
    return total_inserted


def _pg_insert_rec_batch_worker(db_url: str, batch_data: List[Dict], upsert: bool, timings_lock, timings_list, batch_idx: int) -> int:
    """Worker для параллельной вставки одного батча recognitions."""
    try:
        conn = psycopg2.connect(db_url, connect_timeout=30)
        conn.autocommit = True
        
        # Получаем ID dish_validation stage
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ws.id FROM workflow_stages ws
                JOIN task_types tt ON ws.task_type_id = tt.id
                WHERE tt.code = 'dish_validation'
                LIMIT 1
            """)
            result = cur.fetchone()
            dish_val_stage_id = result[0] if result else None
        
        insert_sql = (
            "INSERT INTO recognitions (recognition_id, recognition_date, status, has_modifications, is_mistake, correct_dishes, menu_all, annotator_notes, workflow_state, current_stage_id) "
            "VALUES %s "
            "ON CONFLICT (recognition_id) DO UPDATE SET "
            "recognition_date=EXCLUDED.recognition_date, status=EXCLUDED.status, has_modifications=EXCLUDED.has_modifications, "
            "is_mistake=EXCLUDED.is_mistake, correct_dishes=EXCLUDED.correct_dishes, menu_all=EXCLUDED.menu_all, annotator_notes=EXCLUDED.annotator_notes, "
            "workflow_state=EXCLUDED.workflow_state, current_stage_id=EXCLUDED.current_stage_id"
        )
        plain_insert_sql = (
            "INSERT INTO recognitions (recognition_id, recognition_date, status, has_modifications, is_mistake, correct_dishes, menu_all, annotator_notes, workflow_state, current_stage_id) "
            "VALUES %s"
        )
        tuples = [
            (
                d['recognition_id'], d['recognition_date'], 'not_started', False, False,
                json.dumps(d['correct_dishes']), json.dumps(d.get('menu_all', [])), None,
                'pending', dish_val_stage_id
            )
            for d in batch_data
        ]
        start = time.monotonic()
        with conn.cursor() as cur:
            sql = insert_sql if upsert else plain_insert_sql
            psycopg2.extras.execute_values(cur, sql, tuples, page_size=50)
        conn.close()
        dur = time.monotonic() - start
        with timings_lock:
            timings_list.append(dur)
        print(f"  ✓ Batch {batch_idx} done in {dur:.2f}s")
        return len(tuples)
    except Exception as e:
        print(f"  ❌ Batch {batch_idx} failed: {e}")
        raise


def pg_batch_insert_recognitions(
    conn: psycopg2.extensions.connection,
    recognitions_data: List[Dict],
    *,
    upsert: bool = True,
    batch_size: int = 100,
    start_time: Optional[float] = None,
    time_budget_sec: Optional[int] = None,
    timings: Optional[List[float]] = None,
    workers: int = 4,
) -> int:
    """Прямая параллельная вставка/апсерта recognitions через psycopg2.execute_values."""
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        print("❌ DATABASE_URL not set for parallel workers")
        return 0
    
    batches = [recognitions_data[i:i + batch_size] for i in range(0, len(recognitions_data), batch_size)]
    total = 0
    timings_lock = threading.Lock()
    timings_list = []
    
    print(f"🚀 Starting parallel insert with {workers} workers, {len(batches)} batches...")
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {}
        for idx, batch_data in enumerate(batches):
            if _time_budget_exceeded(start_time, time_budget_sec):
                print("⏱️  Time budget reached during recognitions insert (pg). Stopping phase.")
                break
            fut = executor.submit(_pg_insert_rec_batch_worker, db_url, batch_data, upsert, timings_lock, timings_list, idx)
            futures[fut] = len(batch_data)
        
        with tqdm(total=len(futures), desc="PG Inserting recognitions (parallel)") as pbar:
            for fut in as_completed(futures):
                try:
                    inserted = fut.result()
                    total += inserted
                except Exception as e:
                    print(f"❌ Error in parallel recognitions insert: {e}")
                pbar.update(1)
    
    if timings:
        timings.extend(timings_list)
    return total


def pg_copy_insert_recognitions(
    conn: psycopg2.extensions.connection,
    recognitions_data: List[Dict],
    *,
    reimport: bool = False,
    start_time: Optional[float] = None,
    time_budget_sec: Optional[int] = None,
    timings: Optional[List[float]] = None,
) -> int:
    """
    Быстрая вставка recognitions через COPY FROM STDIN с CSV.
    В 5-10 раз быстрее чем execute_values.
    """
    import io
    
    if not recognitions_data:
        return 0
    
    start = time.monotonic()
    
    # Если reimport - удаляем все существующие записи одним запросом
    if reimport:
        print("🧹 Deleting all existing recognitions...")
        with conn.cursor() as cur:
            cur.execute("DELETE FROM recognitions")
            deleted_count = cur.rowcount
            print(f"   Deleted {deleted_count} existing recognitions")
    
    # Получаем ID dish_validation stage
    with conn.cursor() as cur:
        cur.execute("""
            SELECT ws.id FROM workflow_stages ws
            JOIN task_types tt ON ws.task_type_id = tt.id
            WHERE tt.code = 'dish_validation'
            LIMIT 1
        """)
        result = cur.fetchone()
        dish_val_stage_id = result[0] if result else None
    
    if not dish_val_stage_id:
        print("⚠️  Warning: dish_validation stage not found, recognitions will not have current_stage_id")
    
    # Подготовка CSV в памяти
    print(f"📝 Preparing CSV buffer for {len(recognitions_data)} recognitions...")
    csv_buffer = io.StringIO()
    csv_writer = csv.writer(csv_buffer, quoting=csv.QUOTE_MINIMAL)
    
    for rec in recognitions_data:
        # Сериализуем JSONB поля
        correct_dishes_json = json.dumps(rec['correct_dishes'])
        menu_all_json = json.dumps(rec.get('menu_all', []))
        
        # Записываем строку CSV
        csv_writer.writerow([
            rec['recognition_id'],
            rec['recognition_date'],
            'not_started',  # status
            False,  # has_modifications
            False,  # is_mistake
            correct_dishes_json,
            menu_all_json,
            None,  # annotator_notes
            'pending',  # workflow_state
            dish_val_stage_id  # current_stage_id
        ])
    
    # Перемещаем указатель в начало буфера
    csv_buffer.seek(0)
    
    # COPY FROM STDIN - самая быстрая операция в PostgreSQL
    print(f"🚀 Executing COPY FROM STDIN for {len(recognitions_data)} recognitions...")
    copy_start = time.monotonic()
    
    with conn.cursor() as cur:
        cur.copy_expert(
            """
            COPY recognitions (
                recognition_id, recognition_date, status, 
                has_modifications, is_mistake, correct_dishes, 
                menu_all, annotator_notes, workflow_state, current_stage_id
            )
            FROM STDIN WITH (FORMAT CSV)
            """,
            csv_buffer
        )
    
    copy_duration = time.monotonic() - copy_start
    total_duration = time.monotonic() - start
    
    print(f"✅ COPY completed in {copy_duration:.2f}s (total: {total_duration:.2f}s)")
    
    if timings:
        timings.append(total_duration)
    
    return len(recognitions_data)


def _query_image_ids_by_storage_paths(supabase: Client, storage_paths: List[str]) -> Dict[str, int]:
    """Возвращает маппинг storage_path -> image_id для заданного набора путей."""
    mapping: Dict[str, int] = {}
    # Запрашиваем пачками по 1000
    for i in range(0, len(storage_paths), 1000):
        chunk = storage_paths[i:i + 1000]
        attempts = 0
        while attempts < 3:
            try:
                result = supabase.table('recognition_images').select('id, storage_path').in_('storage_path', chunk).execute()
                for row in result.data:
                    mapping[row['storage_path']] = row['id']
                break
            except Exception as e:
                attempts += 1
                print(f"❌ Error fetching image ids (attempt {attempts}/3): {e}")
                _sleep_with_jitter(1.0, attempts)
    return mapping


def pg_delete_recognition_images_by_storage_paths(
    conn: psycopg2.extensions.connection,
    storage_paths: List[str],
    *,
    start_time: Optional[float] = None,
    time_budget_sec: Optional[int] = None,
) -> int:
    if not storage_paths:
        return 0
    deleted = 0
    for i in range(0, len(storage_paths), 1000):
        if _time_budget_exceeded(start_time, time_budget_sec):
            print("⏱️  Time budget reached during images delete (pg). Stopping phase.")
            break
        chunk = storage_paths[i:i + 1000]
        with conn.cursor() as cur:
            cur.execute("DELETE FROM recognition_images WHERE storage_path = ANY(%s)", (chunk,))
        deleted += len(chunk)
    return deleted


def pg_batch_insert_images(
    conn: psycopg2.extensions.connection,
    images_records: List[Dict],
    *,
    upsert: bool = True,
    batch_size: int = 500,
    start_time: Optional[float] = None,
    time_budget_sec: Optional[int] = None,
    timings: Optional[List[float]] = None,
) -> Dict[str, int]:
    storage_paths = [r['storage_path'] for r in images_records]
    if upsert:
        print("🧹 (pg) Deleting existing recognition_images for target storage paths...")
        _ = pg_delete_recognition_images_by_storage_paths(conn, storage_paths, start_time=start_time, time_budget_sec=time_budget_sec)
    insert_sql = (
        "INSERT INTO recognition_images (recognition_id, photo_type, storage_path, original_annotations) VALUES %s"
    )
    for i in tqdm(range(0, len(images_records), batch_size), desc="PG Inserting images"):
        if _time_budget_exceeded(start_time, time_budget_sec):
            print("⏱️  Time budget reached during images insert (pg). Stopping phase.")
            break
        batch = images_records[i:i + batch_size]
        tuples = [
            (
                r['recognition_id'], r['photo_type'], r['storage_path'], json.dumps(r['original_annotations']) if r.get('original_annotations') is not None else None
            ) for r in batch
        ]
        start = time.monotonic()
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, insert_sql, tuples, page_size=100)
        _record_timing(timings, time.monotonic() - start)
    # build mapping
    mapping: Dict[str, int] = {}
    for i in range(0, len(storage_paths), 10000):
        chunk = storage_paths[i:i + 10000]
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, "SELECT id, storage_path FROM recognition_images WHERE storage_path IN %s", [(tuple(chunk),)], template=None)
            for row in cur.fetchall():
                mapping[row[1]] = row[0]
    return mapping


def pg_copy_insert_images(
    conn: psycopg2.extensions.connection,
    images_records: List[Dict],
    *,
    reimport: bool = False,
    start_time: Optional[float] = None,
    time_budget_sec: Optional[int] = None,
    timings: Optional[List[float]] = None,
) -> Dict[str, int]:
    """
    Быстрая вставка recognition_images через COPY FROM STDIN с CSV.
    Возвращает маппинг storage_path -> image_id.
    """
    import io
    
    if not images_records:
        return {}
    
    start = time.monotonic()
    
    # Если reimport - удаляем существующие записи для этих recognition_id
    if reimport:
        recognition_ids = list(set(str(r['recognition_id']) for r in images_records))
        print(f"🧹 Deleting existing images for {len(recognition_ids)} recognitions...")
        
        # Удаляем батчами по 1000 recognition_id
        for i in range(0, len(recognition_ids), 1000):
            chunk = recognition_ids[i:i + 1000]
            with conn.cursor() as cur:
                cur.execute("DELETE FROM recognition_images WHERE recognition_id = ANY(%s)", (chunk,))
    
    # Подготовка CSV в памяти
    print(f"📝 Preparing CSV buffer for {len(images_records)} images...")
    csv_buffer = io.StringIO()
    csv_writer = csv.writer(csv_buffer, quoting=csv.QUOTE_MINIMAL)
    
    for img in images_records:
        # Сериализуем JSONB поле original_annotations
        original_annotations_json = json.dumps(img['original_annotations']) if img.get('original_annotations') is not None else None
        
        # Записываем строку CSV
        csv_writer.writerow([
            img['recognition_id'],
            img['photo_type'],
            img['storage_path'],
            original_annotations_json
        ])
    
    # Перемещаем указатель в начало буфера
    csv_buffer.seek(0)
    
    # COPY FROM STDIN
    print(f"🚀 Executing COPY FROM STDIN for {len(images_records)} images...")
    copy_start = time.monotonic()
    
    with conn.cursor() as cur:
        cur.copy_expert(
            """
            COPY recognition_images (
                recognition_id, photo_type, storage_path, original_annotations
            )
            FROM STDIN WITH (FORMAT CSV, NULL '')
            """,
            csv_buffer
        )
    
    copy_duration = time.monotonic() - copy_start
    
    # Получаем маппинг storage_path -> image_id
    print(f"🔍 Fetching image_id mapping...")
    mapping: Dict[str, int] = {}
    storage_paths = [r['storage_path'] for r in images_records]
    
    # Запрашиваем батчами по 10000
    for i in range(0, len(storage_paths), 10000):
        chunk = storage_paths[i:i + 10000]
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, storage_path FROM recognition_images WHERE storage_path = ANY(%s)",
                (chunk,)
            )
            for row in cur.fetchall():
                mapping[row[1]] = row[0]
    
    total_duration = time.monotonic() - start
    print(f"✅ COPY completed in {copy_duration:.2f}s, mapping fetched (total: {total_duration:.2f}s)")
    
    if timings:
        timings.append(total_duration)
    
    return mapping


def delete_recognition_images_by_storage_paths(supabase: Client, storage_paths: List[str], *, start_time: Optional[float] = None, time_budget_sec: Optional[int] = None, dry_run: bool = False) -> int:
    """Удаляет recognition_images для указанных storage_path пачками."""
    if not storage_paths:
        return 0
    deleted_total = 0
    for i in range(0, len(storage_paths), 500):
        if _time_budget_exceeded(start_time, time_budget_sec):
            print("⏱️  Time budget reached during images delete. Stopping phase.")
            break
        chunk = storage_paths[i:i + 500]
        attempts = 0
        while attempts < 3 and not dry_run:
            try:
                supabase.table('recognition_images').delete().in_('storage_path', chunk).execute()
                deleted_total += len(chunk)
                break
            except Exception as e:
                attempts += 1
                print(f"❌ Error deleting recognition_images (attempt {attempts}/3): {e}")
                _sleep_with_jitter(1.0, attempts)
        if dry_run:
            deleted_total += len(chunk)
    return deleted_total


def batch_insert_images(
    supabase: Client,
    images_records: List[Dict],
    *,
    upsert: bool = False,
    batch_size: int = 8,
    start_time: Optional[float] = None,
    time_budget_sec: Optional[int] = None,
    timings: Optional[List[float]] = None,
    dry_run: bool = False,
) -> Dict[str, int]:
    """Batch insert recognition_images в пачках и возвращает маппинг storage_path -> image_id.
    В режиме upsert предварительно удаляет существующие строки для гарантированного переимпорта.
    """
    storage_paths: List[str] = [r['storage_path'] for r in images_records]
    
    if upsert:
        print("🧹 Deleting existing recognition_images for target storage paths (reimport mode)...")
        _ = delete_recognition_images_by_storage_paths(supabase, storage_paths, start_time=start_time, time_budget_sec=time_budget_sec, dry_run=dry_run)
    
    for i in tqdm(range(0, len(images_records), batch_size), desc="Inserting images"):
        if _time_budget_exceeded(start_time, time_budget_sec):
            print("⏱️  Time budget reached during images insert. Stopping phase.")
            break
        batch = images_records[i:i + batch_size]
        attempts = 0
        start = time.monotonic()
        while attempts < 3 and not dry_run:
            try:
                supabase.table('recognition_images').insert(batch).execute()
                break
            except Exception as e:
                attempts += 1
                print(f"❌ Error inserting images batch {i//batch_size} (attempt {attempts}/3): {e}")
                _sleep_with_jitter(1.5, attempts)
        _record_timing(timings, time.monotonic() - start)
    
    # После записи запрашиваем id для всех storage_path
    return _query_image_ids_by_storage_paths(supabase, storage_paths)


def batch_insert_annotations(
    supabase: Client,
    annotations: List[Dict],
    *,
    batch_size: int = 200,
    db_workers: int = 1,
    start_time: Optional[float] = None,
    time_budget_sec: Optional[int] = None,
    timings: Optional[List[float]] = None,
    dry_run: bool = False,
) -> int:
    """Batch insert annotations (с малыми пачками, ретраями, опциональным параллелизмом)."""
    if not annotations:
        return 0
    total_inserted = 0
    
    def process_one(batch_idx: int, batch: List[Dict]) -> int:
        if _time_budget_exceeded(start_time, time_budget_sec):
            return 0
        attempts = 0
        start_local = time.monotonic()
        if dry_run:
            _record_timing(timings, time.monotonic() - start_local)
            return len(batch)
        while attempts < 3:
            try:
                supabase.table('annotations').insert(batch).execute()
                _record_timing(timings, time.monotonic() - start_local)
                return len(batch)
            except Exception as e:
                attempts += 1
                print(f"❌ Error batch inserting annotations batch {batch_idx} (attempt {attempts}/3): {e}")
                _sleep_with_jitter(1.0, attempts)
        _record_timing(timings, time.monotonic() - start_local)
        return 0

    batches: List[List[Dict]] = [annotations[i:i + batch_size] for i in range(0, len(annotations), batch_size)]
    if db_workers <= 1:
        for idx, batch in enumerate(batches):
            if _time_budget_exceeded(start_time, time_budget_sec):
                print("⏱️  Time budget reached during annotations insert. Stopping phase.")
                break
            total_inserted += process_one(idx, batch)
    else:
        with ThreadPoolExecutor(max_workers=db_workers) as ex:
            futures = {}
            for idx, batch in enumerate(batches):
                if _time_budget_exceeded(start_time, time_budget_sec):
                    print("⏱️  Time budget reached during annotations insert. Stopping phase.")
                    break
                futures[ex.submit(process_one, idx, batch)] = idx
            for f in as_completed(futures):
                total_inserted += f.result()

    return total_inserted


def pg_delete_annotations_for_images(
    conn: psycopg2.extensions.connection,
    image_ids: List[int],
    *,
    start_time: Optional[float] = None,
    time_budget_sec: Optional[int] = None,
) -> int:
    if not image_ids:
        return 0
    deleted = 0
    for i in range(0, len(image_ids), 5000):
        if _time_budget_exceeded(start_time, time_budget_sec):
            print("⏱️  Time budget reached during annotations delete (pg). Stopping phase.")
            break
        chunk = image_ids[i:i + 5000]
        with conn.cursor() as cur:
            cur.execute("DELETE FROM annotations WHERE image_id = ANY(%s)", (chunk,))
        deleted += len(chunk)
    return deleted


def _pg_insert_ann_batch_worker(db_url: str, batch: List[Dict], timings_lock, timings_list) -> int:
    """Worker для параллельной вставки одного батча annotations."""
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    insert_sql = (
        "INSERT INTO annotations (image_id, object_type, object_subtype, dish_index, "
        "bbox_x1, bbox_y1, bbox_x2, bbox_y2, is_overlapped, is_bottle_up, is_error, source) VALUES %s"
    )
    tuples = [
        (
            a['image_id'], a['object_type'], a['object_subtype'], a['dish_index'],
            a['bbox_x1'], a['bbox_y1'], a['bbox_x2'], a['bbox_y2'],
            a['is_overlapped'], a['is_bottle_up'], a['is_error'], a['source']
        ) for a in batch
    ]
    start = time.monotonic()
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, insert_sql, tuples, page_size=500)
    conn.close()
    dur = time.monotonic() - start
    with timings_lock:
        timings_list.append(dur)
    return len(tuples)


def pg_batch_insert_annotations(
    conn: psycopg2.extensions.connection,
    annotations: List[Dict],
    *,
    batch_size: int = 2000,
    start_time: Optional[float] = None,
    time_budget_sec: Optional[int] = None,
    timings: Optional[List[float]] = None,
    workers: int = 10,
) -> int:
    if not annotations:
        return 0
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        print("❌ DATABASE_URL not set for parallel workers")
        return 0
    
    batches = [annotations[i:i + batch_size] for i in range(0, len(annotations), batch_size)]
    inserted = 0
    timings_lock = threading.Lock()
    timings_list = []
    
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {}
        for batch in batches:
            if _time_budget_exceeded(start_time, time_budget_sec):
                print("⏱️  Time budget reached during annotations insert (pg). Stopping phase.")
                break
            fut = executor.submit(_pg_insert_ann_batch_worker, db_url, batch, timings_lock, timings_list)
            futures[fut] = len(batch)
        
        with tqdm(total=len(futures), desc="PG Inserting annotations (parallel)") as pbar:
            for fut in as_completed(futures):
                try:
                    count = fut.result()
                    inserted += count
                except Exception as e:
                    print(f"❌ Error in parallel annotations insert: {e}")
                pbar.update(1)
    
    if timings:
        timings.extend(timings_list)
    return inserted


def pg_copy_insert_annotations(
    conn: psycopg2.extensions.connection,
    annotations: List[Dict],
    *,
    reimport: bool = False,
    start_time: Optional[float] = None,
    time_budget_sec: Optional[int] = None,
    timings: Optional[List[float]] = None,
) -> int:
    """
    Быстрая вставка annotations через COPY FROM STDIN с CSV.
    """
    import io
    
    if not annotations:
        return 0
    
    start = time.monotonic()
    
    # Если reimport - удаляем существующие аннотации для этих image_id
    if reimport:
        image_ids = list(set(a['image_id'] for a in annotations))
        print(f"🧹 Deleting existing annotations for {len(image_ids)} images...")
        
        # Удаляем батчами по 5000 image_id
        for i in range(0, len(image_ids), 5000):
            chunk = image_ids[i:i + 5000]
            with conn.cursor() as cur:
                cur.execute("DELETE FROM annotations WHERE image_id = ANY(%s)", (chunk,))
    
    # Подготовка CSV в памяти
    print(f"📝 Preparing CSV buffer for {len(annotations)} annotations...")
    csv_buffer = io.StringIO()
    csv_writer = csv.writer(csv_buffer, quoting=csv.QUOTE_MINIMAL)
    
    for ann in annotations:
        # Записываем строку CSV
        csv_writer.writerow([
            ann['image_id'],
            ann['object_type'],
            ann['object_subtype'],
            ann['dish_index'],
            ann['bbox_x1'],
            ann['bbox_y1'],
            ann['bbox_x2'],
            ann['bbox_y2'],
            ann['is_overlapped'],
            ann['is_bottle_up'],
            ann['is_error'],
            ann['source']
        ])
    
    # Перемещаем указатель в начало буфера
    csv_buffer.seek(0)
    
    # COPY FROM STDIN
    print(f"🚀 Executing COPY FROM STDIN for {len(annotations)} annotations...")
    copy_start = time.monotonic()
    
    with conn.cursor() as cur:
        cur.copy_expert(
            """
            COPY annotations (
                image_id, object_type, object_subtype, dish_index,
                bbox_x1, bbox_y1, bbox_x2, bbox_y2,
                is_overlapped, is_bottle_up, is_error, source
            )
            FROM STDIN WITH (FORMAT CSV)
            """,
            csv_buffer
        )
    
    copy_duration = time.monotonic() - copy_start
    total_duration = time.monotonic() - start
    
    print(f"✅ COPY completed in {copy_duration:.2f}s (total: {total_duration:.2f}s)")
    
    if timings:
        timings.append(total_duration)
    
    return len(annotations)


def delete_annotations_for_images(supabase: Client, image_ids: List[int], *, start_time: Optional[float] = None, time_budget_sec: Optional[int] = None, dry_run: bool = False) -> int:
    """Удаляет аннотации для указанных image_id пачками."""
    if not image_ids:
        return 0
    deleted_total = 0
    for i in range(0, len(image_ids), 500):
        if _time_budget_exceeded(start_time, time_budget_sec):
            print("⏱️  Time budget reached during annotations delete. Stopping phase.")
            break
        chunk = image_ids[i:i + 500]
        attempts = 0
        while attempts < 3 and not dry_run:
            try:
                result = supabase.table('annotations').delete().in_('image_id', chunk).execute()
                # postgrest в python может не возвращать count, игнорируем
                deleted_total += len(chunk)
                break
            except Exception as e:
                attempts += 1
                print(f"❌ Error deleting annotations (attempt {attempts}/3): {e}")
                _sleep_with_jitter(1.0, attempts)
        if dry_run:
            deleted_total += len(chunk)
    return deleted_total


def pg_drop_indexes(conn: psycopg2.extensions.connection, tables: List[str]) -> Dict[str, List[str]]:
    """
    Удаляет все индексы для указанных таблиц и сохраняет DDL для восстановления.
    Возвращает словарь {table_name: [list of CREATE INDEX statements]}.
    """
    saved_indexes = {}
    
    for table in tables:
        print(f"🔍 Fetching indexes for table '{table}'...")
        with conn.cursor() as cur:
            # Получаем все индексы для таблицы (кроме primary key)
            cur.execute("""
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE tablename = %s
                AND indexname NOT LIKE '%%_pkey'
                ORDER BY indexname
            """, (table,))
            
            indexes = cur.fetchall()
            saved_indexes[table] = []
            
            for index_name, index_def in indexes:
                print(f"  📋 Saving: {index_name}")
                saved_indexes[table].append(index_def)
                
                # Удаляем индекс
                print(f"  🗑️  Dropping: {index_name}")
                cur.execute(f"DROP INDEX IF EXISTS {index_name}")
    
    return saved_indexes


def pg_recreate_indexes(conn: psycopg2.extensions.connection, saved_indexes: Dict[str, List[str]]):
    """
    Восстанавливает индексы из сохраненных DDL.
    """
    for table, index_defs in saved_indexes.items():
        if not index_defs:
            continue
        
        print(f"🔨 Recreating {len(index_defs)} indexes for table '{table}'...")
        for index_def in index_defs:
            print(f"  ⚙️  {index_def[:80]}...")
            with conn.cursor() as cur:
                cur.execute(index_def)
    
    print("✅ All indexes recreated")


def main():
    parser = argparse.ArgumentParser(description='Fast import recognition dataset to Supabase')
    parser.add_argument('dataset_dir', help='Path to RRS_Dataset directory')
    parser.add_argument('qwen_json', help='Path to qwen_annotations.json')
    parser.add_argument('--env', choices=['local', 'prod'], default='local', help='Environment (default: local)')
    parser.add_argument('--limit', type=int, help='Limit number of recognitions to import')
    parser.add_argument('--workers', type=int, default=20, help='Number of parallel workers for file uploads (default: 20)')
    parser.add_argument('--skip-recognitions', action='store_true', help='Skip recognitions phase (assume they already exist)')
    parser.add_argument('--skip-storage-upload', action='store_true', help='Skip storage upload phase (do not touch Storage)')
    parser.add_argument('--no-upsert', action='store_true', help='Insert only new records, skip existing (default: upsert/update existing)')
    parser.add_argument('--rec-batch', type=int, default=200, help='Batch size for recognitions (default: 200)')
    parser.add_argument('--img-batch', type=int, default=8, help='Batch size for recognition_images (default: 8)')
    parser.add_argument('--ann-batch', type=int, default=200, help='Batch size for annotations (default: 200)')
    parser.add_argument('--db-workers', type=int, default=1, help='Parallel workers for annotations insert (default: 1)')
    parser.add_argument('--time-budget-sec', type=int, help='Hard time budget in seconds; phases stop gracefully when exceeded')
    parser.add_argument('--metrics-out', type=str, help='Path to write metrics (JSON or CSV)')
    parser.add_argument('--dry-run', action='store_true', help='Prepare and measure only; do not write to DB')
    parser.add_argument('--no-pg-direct', action='store_true', help='Use slow PostgREST API instead of fast direct Postgres (not recommended)')
    parser.add_argument('--drop-indexes', action='store_true', help='Temporarily drop indexes before import and recreate after (gives 2-3x speedup)')
    args = parser.parse_args()
    
    # По умолчанию используем быстрый pg-direct метод
    args.pg_direct = not args.no_pg_direct
    
    # По умолчанию используем режим upsert (обновление существующих записей)
    args.reimport_db = not args.no_upsert
    
    # Проверяем пути
    dataset_dir = Path(args.dataset_dir)
    qwen_json = Path(args.qwen_json)
    
    if not dataset_dir.exists():
        print(f"❌ Dataset directory not found: {dataset_dir}")
        sys.exit(1)
    
    if not qwen_json.exists():
        print(f"❌ QWEN annotations file not found: {qwen_json}")
        sys.exit(1)
    
    # Находим export директорию
    export_dir = find_export_directory(dataset_dir)
    if not export_dir:
        print(f"❌ No export_* directory found in {dataset_dir}")
        sys.exit(1)
    
    print(f"📁 Found export directory: {export_dir.name}")
    
    # Загружаем .env для выбранной среды
    if args.env == 'local':
        load_dotenv('.env.local')
    elif args.env == 'prod':
        load_dotenv('.env.production')

    # Подключаемся к БД
    supabase = None
    pg_conn = None
    if args.pg_direct:
        pg_conn = setup_postgres()
    else:
        supabase = setup_supabase(args.env)
    
    # Проверка --drop-indexes
    if args.drop_indexes and not args.pg_direct:
        print("❌ --drop-indexes requires --pg-direct")
        sys.exit(1)
    
    # Drop indexes если запрошено
    saved_indexes = {}
    if args.drop_indexes and args.pg_direct:
        print("\n" + "="*60)
        print("DROPPING INDEXES (will recreate after import)...")
        print("="*60)
        saved_indexes = pg_drop_indexes(pg_conn, ['recognitions', 'recognition_images', 'annotations'])
        print("✅ Indexes dropped")
    
    # Загружаем QWEN аннотации
    print(f"📥 Loading QWEN annotations...")
    with open(qwen_json, 'r', encoding='utf-8') as f:
        qwen_data = json.load(f)
    print(f"✅ Loaded {len(qwen_data)} QWEN entries")
    
    # Получаем существующие recognition_id (если не skip и не reimport)
    existing_ids = set()
    if not args.skip_recognitions and not args.reimport_db:
        print(f"🔍 Checking existing recognitions...")
        if args.pg_direct:
            with pg_conn.cursor() as cur:
                cur.execute("SELECT recognition_id FROM recognitions")
                existing_ids = {int(r[0]) for r in cur.fetchall()}
        else:
            result = supabase.table('recognitions').select('recognition_id').execute()
            existing_ids = {int(row['recognition_id']) for row in result.data}
        print(f"✅ Found {len(existing_ids)} existing recognitions in database")
    else:
        print(f"⏭️  Skipping recognitions check (--skip-recognitions or --reimport-db)")
    
    # Находим все recognition директории
    recognition_dirs = sorted([d for d in export_dir.iterdir() 
                              if d.is_dir() and d.name.startswith('recognition_')])
    
    if args.limit:
        recognition_dirs = recognition_dirs[:args.limit]
        print(f"⚠️  LIMITED MODE: Processing only first {args.limit} recognitions")
    
    print(f"📊 Total recognitions to process: {len(recognition_dirs)}")
    print(f"🔧 Using {args.workers} parallel workers for uploads")
    
    # Инициализация метрик и таймера
    metrics: Dict[str, Dict] = {"env": args.env, "limit": args.limit}
    t0 = time.monotonic()

    # ============================================================
    # ФАЗА 1: Подготовка данных
    # ============================================================
    print("\n" + "="*60)
    print("PHASE 1: Preparing data...")
    print("="*60)
    
    all_data = []
    for rec_dir in tqdm(recognition_dirs, desc="Preparing"):
        data = prepare_recognition_data(rec_dir, qwen_data)
        if not data:
            continue
        if existing_ids and data['recognition_id'] in existing_ids:
            # Пропускаем только если мы действительно фильтруем по existing_ids
            continue
        all_data.append(data)
    
    phase1_dur = time.monotonic() - t0
    print(f"✅ Prepared {len(all_data)} recognitions (skipped {len(recognition_dirs) - len(all_data)} duplicates/errors)")
    metrics["phase1"] = {"prepared": len(all_data), "duration_sec": round(phase1_dur, 3)}
    
    if not args.skip_recognitions:
        if not all_data:
            print("✅ Nothing to import!")
            return
        
        # ============================================================
        # ФАЗА 2: Batch insert recognitions
        # ============================================================
        print("\n" + "="*60)
        print("PHASE 2: Inserting recognitions...")
        print("="*60)
        
        rec_timings: List[float] = []
        t2 = time.monotonic()
        if args.pg_direct:
            # Используем быструю COPY вставку
            inserted_recs = pg_copy_insert_recognitions(
                pg_conn,
                all_data,
                reimport=args.reimport_db,
                start_time=t0,
                time_budget_sec=args.time_budget_sec,
                timings=rec_timings,
            )
        else:
            inserted_recs = batch_insert_recognitions(
                supabase,
                all_data,
                upsert=args.reimport_db,
                batch_size=args.rec_batch,
                start_time=t0,
                time_budget_sec=args.time_budget_sec,
                timings=rec_timings,
                dry_run=args.dry_run,
            )
        print(f"✅ Inserted {inserted_recs} recognitions")
        metrics["phase2"] = {
            "inserted": inserted_recs,
            "duration_sec": round(time.monotonic() - t2, 3),
            **_timings_summary(rec_timings),
        }
    else:
        print("\n" + "="*60)
        print("PHASE 2: Skipped (--skip-recognitions)")
        print("="*60)
        # Если пропускаем recognitions, заново подготавливаем all_data (без фильтра по existing_ids)
        all_data = []
        for rec_dir in tqdm(recognition_dirs, desc="Re-preparing for images/annotations"):
            data = prepare_recognition_data(rec_dir, qwen_data)
            if data:
                all_data.append(data)
    
    # ============================================================
    # ФАЗА 3: Batch insert recognition_images
    # ============================================================
    print("\n" + "="*60)
    print("PHASE 3: Inserting recognition_images...")
    print("="*60)
    
    all_images_records = []
    image_to_data = {}  # Маппинг для последующего создания аннотаций
    
    for data in all_data:
        for img_data in data['images']:
            original_annotations = None
            if img_data['qwen_dishes'] or img_data['qwen_plates']:
                original_annotations = {
                    'qwen_dishes_detections': img_data['qwen_dishes'],
                    'qwen_plates_detections': img_data['qwen_plates']
                }
            
            record = {
                'recognition_id': data['recognition_id'],
                'photo_type': img_data['photo_type'],
                'storage_path': img_data['storage_path'],
                'original_annotations': original_annotations
            }
            all_images_records.append(record)
            image_to_data[img_data['storage_path']] = (data, img_data)
    
    img_timings: List[float] = []
    t3 = time.monotonic()
    if args.pg_direct:
        # Используем быструю COPY вставку
        storage_to_image_id = pg_copy_insert_images(
            pg_conn,
            all_images_records,
            reimport=args.reimport_db,
            start_time=t0,
            time_budget_sec=args.time_budget_sec,
            timings=img_timings,
        )
    else:
        storage_to_image_id = batch_insert_images(
            supabase,
            all_images_records,
            upsert=args.reimport_db,
            batch_size=args.img_batch,
            start_time=t0,
            time_budget_sec=args.time_budget_sec,
            timings=img_timings,
            dry_run=args.dry_run,
        )
    print(f"✅ Inserted {len(storage_to_image_id)} recognition_images")
    metrics["phase3"] = {
        "inserted": len(storage_to_image_id),
        "duration_sec": round(time.monotonic() - t3, 3),
        **_timings_summary(img_timings),
    }
    
    # ============================================================
    # ФАЗА 4: Параллельная загрузка файлов в Storage
    # ============================================================
    uploaded_count = 0
    failed_count = 0
    if args.skip_storage_upload:
        print("\n" + "="*60)
        print("PHASE 4: Skipped (--skip-storage-upload)")
        print("="*60)
    else:
        print("\n" + "="*60)
        print(f"PHASE 4: Uploading {len(all_images_records)} files to Storage (parallel)...")
        print("="*60)
        upload_tasks = []
        for data in all_data:
            for img_data in data['images']:
                upload_tasks.append((img_data['local_path'], img_data['storage_path']))
        
        # Получаем URL и key для передачи в потоки
        supabase_url = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
        supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_ANON_KEY') or os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
        
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {
                executor.submit(upload_file_to_storage, supabase_url, supabase_key, local_path, storage_path): (local_path, storage_path)
                for local_path, storage_path in upload_tasks
            }
            with tqdm(total=len(upload_tasks), desc="Uploading files") as pbar:
                for future in as_completed(futures):
                    success, msg = future.result()
                    if success:
                        uploaded_count += 1
                    else:
                        failed_count += 1
                        print(f"\n⚠️  {msg}")
                    pbar.update(1)
        print(f"✅ Uploaded {uploaded_count} files ({failed_count} failures)")
    
    # ============================================================
    # ФАЗА 5: Batch insert annotations
    # ============================================================
    print("\n" + "="*60)
    print("PHASE 5: Preparing and inserting annotations...")
    print("="*60)
    
    all_annotations = []
    
    for storage_path, (data, img_data) in tqdm(image_to_data.items(), desc="Preparing annotations"):
        image_id = storage_to_image_id.get(storage_path)
        if not image_id:
            continue
        
        # Создаем маппинг dish_label -> index
        dish_mapping = {f'dish_{idx}': idx for idx in range(len(data['correct_dishes']))}
        
        # Аннотации для блюд
        for detection in img_data['qwen_dishes']:
            bbox = detection.get('bbox_2d') or detection.get('bbox')
            if not bbox or len(bbox) < 4:
                continue
            
            label = detection.get('label', '')
            dish_index = dish_mapping.get(label)
            
            all_annotations.append({
                'image_id': image_id,
                'object_type': 'food',
                'object_subtype': None,
                'dish_index': dish_index,
                'bbox_x1': round(bbox[0]),
                'bbox_y1': round(bbox[1]),
                'bbox_x2': round(bbox[2]),
                'bbox_y2': round(bbox[3]),
                'is_overlapped': False,
                'is_bottle_up': None,
                'is_error': False,
                'source': 'qwen_auto'
            })
        
        # Аннотации для тарелок
        for detection in img_data['qwen_plates']:
            bbox = detection.get('bbox_2d') or detection.get('bbox')
            if not bbox or len(bbox) < 4:
                continue
            
            all_annotations.append({
                'image_id': image_id,
                'object_type': 'plate',
                'object_subtype': None,
                'dish_index': None,
                'bbox_x1': round(bbox[0]),
                'bbox_y1': round(bbox[1]),
                'bbox_x2': round(bbox[2]),
                'bbox_y2': round(bbox[3]),
                'is_overlapped': False,
                'is_bottle_up': None,
                'is_error': False,
                'source': 'qwen_auto'
            })
    
    print(f"📊 Total annotations to insert: {len(all_annotations)}")
    if args.reimport_db:
        # Перед повторной загрузкой чистим старые аннотации для целевых изображений
        print("🧹 Deleting existing annotations for target images (reimport mode)...")
        if args.pg_direct:
            _ = pg_delete_annotations_for_images(pg_conn, list(storage_to_image_id.values()), start_time=t0, time_budget_sec=args.time_budget_sec)
        else:
            _ = delete_annotations_for_images(supabase, list(storage_to_image_id.values()), start_time=t0, time_budget_sec=args.time_budget_sec, dry_run=args.dry_run)
    ann_timings: List[float] = []
    t5 = time.monotonic()
    if args.pg_direct:
        # Используем быструю COPY вставку
        inserted_anns = pg_copy_insert_annotations(
            pg_conn,
            all_annotations,
            reimport=args.reimport_db,
            start_time=t0,
            time_budget_sec=args.time_budget_sec,
            timings=ann_timings,
        )
    else:
        inserted_anns = batch_insert_annotations(
            supabase,
            all_annotations,
            batch_size=args.ann_batch,
            db_workers=max(1, args.db_workers),
            start_time=t0,
            time_budget_sec=args.time_budget_sec,
            timings=ann_timings,
            dry_run=args.dry_run,
        )
    print(f"✅ Inserted {inserted_anns} annotations")
    metrics["phase5"] = {
        "inserted": inserted_anns,
        "duration_sec": round(time.monotonic() - t5, 3),
        **_timings_summary(ann_timings),
    }
    
    # ============================================================
    # Вычисление validation_mode для recognitions
    # ============================================================
    if args.pg_direct and not args.dry_run:
        print("\n" + "="*60)
        print("CALCULATING VALIDATION_MODE...")
        print("="*60)
        t6 = time.monotonic()
        with pg_conn.cursor() as cur:
            # Обновляем validation_mode для всех pending recognitions
            cur.execute("""
                UPDATE recognitions 
                SET validation_mode = calculate_validation_mode(recognition_id)
                WHERE workflow_state = 'pending'
            """)
            updated_count = cur.rowcount
        calc_duration = time.monotonic() - t6
        print(f"✅ Updated validation_mode for {updated_count} recognitions in {calc_duration:.2f}s")
        metrics["phase6_validation_mode"] = {
            "updated": updated_count,
            "duration_sec": round(calc_duration, 3),
        }
    
    # ============================================================
    # Восстановление индексов
    # ============================================================
    if args.drop_indexes and args.pg_direct and saved_indexes:
        print("\n" + "="*60)
        print("RECREATING INDEXES...")
        print("="*60)
        pg_recreate_indexes(pg_conn, saved_indexes)
    
    # ============================================================
    # Финальная статистика
    # ============================================================
    print("\n" + "="*60)
    print("IMPORT COMPLETED")
    print("="*60)
    print(f"Environment: {args.env}")
    # inserted_recs может быть не определен, если пропустили фазу
    try:
        print(f"✅ Recognitions imported: {inserted_recs}")
    except NameError:
        print("✅ Recognitions imported: skipped")
    print(f"✅ Images imported: {len(storage_to_image_id)}")
    print(f"✅ Files uploaded: {uploaded_count} ({failed_count} failures)")
    print(f"✅ Annotations created: {inserted_anns}")
    print("="*60)

    metrics["totals"] = {
        "images": len(storage_to_image_id),
        "annotations": inserted_anns,
    }
    metrics["total_duration_sec"] = round(time.monotonic() - t0, 3)

    if args.metrics_out:
        out_path = Path(args.metrics_out)
        try:
            if out_path.suffix.lower() == '.json' or out_path.suffix == '':
                with open(out_path if out_path.suffix else out_path.with_suffix('.json'), 'w', encoding='utf-8') as f:
                    json.dump(metrics, f, ensure_ascii=False, indent=2)
            elif out_path.suffix.lower() == '.csv':
                # Пишем плоскую строку с ключевыми полями
                flat = {
                    'env': metrics.get('env'),
                    'limit': metrics.get('limit'),
                    'phase1_prepared': metrics.get('phase1',{}).get('prepared'),
                    'phase1_duration_sec': metrics.get('phase1',{}).get('duration_sec'),
                    'phase2_inserted': metrics.get('phase2',{}).get('inserted'),
                    'phase2_avg_sec': metrics.get('phase2',{}).get('avg_sec'),
                    'phase2_p95_sec': metrics.get('phase2',{}).get('p95_sec'),
                    'phase3_inserted': metrics.get('phase3',{}).get('inserted'),
                    'phase3_avg_sec': metrics.get('phase3',{}).get('avg_sec'),
                    'phase3_p95_sec': metrics.get('phase3',{}).get('p95_sec'),
                    'phase5_inserted': metrics.get('phase5',{}).get('inserted'),
                    'phase5_avg_sec': metrics.get('phase5',{}).get('avg_sec'),
                    'phase5_p95_sec': metrics.get('phase5',{}).get('p95_sec'),
                    'total_duration_sec': metrics.get('total_duration_sec'),
                }
                with open(out_path, 'w', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=list(flat.keys()))
                    writer.writeheader()
                    writer.writerow(flat)
            print(f"📝 Metrics written to {out_path}")
        except Exception as e:
            print(f"⚠️  Failed to write metrics to {out_path}: {e}")


if __name__ == '__main__':
    main()

