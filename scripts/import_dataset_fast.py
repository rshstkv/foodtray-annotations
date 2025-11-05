#!/usr/bin/env python3
"""
УНИВЕРСАЛЬНЫЙ скрипт импорта датасета с параллельной обработкой.
Работает одинаково для локальной и продакшн БД.

Что загружает:
- recognitions (включая menu_all из *_AM.json файлов)
- recognition_images (включая original_annotations для Undo)
- Файлы в Supabase Storage (многопоточно)
- annotations (bbox аннотации)

Устойчив к повторным запускам - пропускает существующие recognition_id.

Usage:
    python import_dataset_fast.py <dataset_dir> <qwen_json> [--env local|prod] [--limit N] [--workers N]

Examples:
    # Локальная база (разработка/тесты)
    python import_dataset_fast.py "/path/to/RRS_Dataset 2" /path/to/qwen_annotations.json --env local --workers 10
    
    # Продакшн база
    python import_dataset_fast.py "/path/to/RRS_Dataset 2" /path/to/qwen_annotations.json --env prod --workers 50
    
    # Тест с ограничением
    python import_dataset_fast.py "/path/to/RRS_Dataset 2" /path/to/qwen_annotations.json --env local --limit 10
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


def upload_file_to_storage(supabase: Client, local_path: Path, storage_path: str) -> Tuple[bool, str]:
    """Загружает один файл в Storage."""
    try:
        with open(local_path, 'rb') as f:
            supabase.storage().from_('bbox-images').upload(
                storage_path,
                f.read(),
                {'content-type': 'image/jpeg'}
            )
        return True, storage_path
    except Exception as e:
        if 'duplicate' not in str(e).lower() and 'already exists' not in str(e).lower():
            return False, f"Error uploading {storage_path}: {e}"
        return True, storage_path  # Считаем дубликат успехом


def batch_insert_recognitions(supabase: Client, recognitions_data: List[Dict]) -> int:
    """Batch insert recognitions в пачках."""
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
    
    # Вставляем пачками по 500
    batch_size = 500
    total_inserted = 0
    
    for i in tqdm(range(0, len(records), batch_size), desc="Inserting recognitions"):
        batch = records[i:i + batch_size]
        try:
            supabase.table('recognitions').insert(batch).execute()
            total_inserted += len(batch)
        except Exception as e:
            print(f"❌ Error inserting batch {i//batch_size}: {e}")
    
    return total_inserted


def batch_insert_images(supabase: Client, images_records: List[Dict]) -> Dict[str, int]:
    """Batch insert recognition_images в пачках и возвращает маппинг storage_path -> image_id."""
    # Вставляем пачками по 1000
    batch_size = 1000
    mapping = {}
    
    for i in tqdm(range(0, len(images_records), batch_size), desc="Inserting images"):
        batch = images_records[i:i + batch_size]
        try:
            result = supabase.table('recognition_images').insert(batch).execute()
            
            # Создаем маппинг storage_path -> image_id
            for record in result.data:
                mapping[record['storage_path']] = record['id']
        except Exception as e:
            print(f"❌ Error inserting batch {i//batch_size}: {e}")
    
    return mapping


def batch_insert_annotations(supabase: Client, annotations: List[Dict]) -> int:
    """Batch insert annotations."""
    if not annotations:
        return 0
    
    # Разбиваем на пачки по 1000 для избежания таймаута
    batch_size = 1000
    total_inserted = 0
    
    for i in range(0, len(annotations), batch_size):
        batch = annotations[i:i + batch_size]
        try:
            supabase.table('annotations').insert(batch).execute()
            total_inserted += len(batch)
        except Exception as e:
            print(f"❌ Error batch inserting annotations batch {i//batch_size}: {e}")
    
    return total_inserted


def main():
    parser = argparse.ArgumentParser(description='Fast import recognition dataset to Supabase')
    parser.add_argument('dataset_dir', help='Path to RRS_Dataset directory')
    parser.add_argument('qwen_json', help='Path to qwen_annotations.json')
    parser.add_argument('--env', choices=['local', 'prod'], default='local', help='Environment (default: local)')
    parser.add_argument('--limit', type=int, help='Limit number of recognitions to import')
    parser.add_argument('--workers', type=int, default=20, help='Number of parallel workers for file uploads (default: 20)')
    args = parser.parse_args()
    
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
    
    # Подключаемся к Supabase
    supabase = setup_supabase(args.env)
    
    # Загружаем QWEN аннотации
    print(f"📥 Loading QWEN annotations...")
    with open(qwen_json, 'r', encoding='utf-8') as f:
        qwen_data = json.load(f)
    print(f"✅ Loaded {len(qwen_data)} QWEN entries")
    
    # Получаем существующие recognition_id
    print(f"🔍 Checking existing recognitions...")
    result = supabase.table('recognitions').select('recognition_id').execute()
    existing_ids = {int(row['recognition_id']) for row in result.data}
    print(f"✅ Found {len(existing_ids)} existing recognitions in database")
    
    # Находим все recognition директории
    recognition_dirs = sorted([d for d in export_dir.iterdir() 
                              if d.is_dir() and d.name.startswith('recognition_')])
    
    if args.limit:
        recognition_dirs = recognition_dirs[:args.limit]
        print(f"⚠️  LIMITED MODE: Processing only first {args.limit} recognitions")
    
    print(f"📊 Total recognitions to process: {len(recognition_dirs)}")
    print(f"🔧 Using {args.workers} parallel workers for uploads")
    
    # ============================================================
    # ФАЗА 1: Подготовка данных
    # ============================================================
    print("\n" + "="*60)
    print("PHASE 1: Preparing data...")
    print("="*60)
    
    all_data = []
    for rec_dir in tqdm(recognition_dirs, desc="Preparing"):
        data = prepare_recognition_data(rec_dir, qwen_data)
        if data and data['recognition_id'] not in existing_ids:
            all_data.append(data)
    
    print(f"✅ Prepared {len(all_data)} recognitions (skipped {len(recognition_dirs) - len(all_data)} duplicates/errors)")
    
    if not all_data:
        print("✅ Nothing to import!")
        return
    
    # ============================================================
    # ФАЗА 2: Batch insert recognitions
    # ============================================================
    print("\n" + "="*60)
    print("PHASE 2: Inserting recognitions...")
    print("="*60)
    
    inserted_recs = batch_insert_recognitions(supabase, all_data)
    print(f"✅ Inserted {inserted_recs} recognitions")
    
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
    
    storage_to_image_id = batch_insert_images(supabase, all_images_records)
    print(f"✅ Inserted {len(storage_to_image_id)} recognition_images")
    
    # ============================================================
    # ФАЗА 4: Параллельная загрузка файлов в Storage
    # ============================================================
    print("\n" + "="*60)
    print(f"PHASE 4: Uploading {len(all_images_records)} files to Storage (parallel)...")
    print("="*60)
    
    upload_tasks = []
    for data in all_data:
        for img_data in data['images']:
            upload_tasks.append((img_data['local_path'], img_data['storage_path']))
    
    uploaded_count = 0
    failed_count = 0
    
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(upload_file_to_storage, supabase, local_path, storage_path): (local_path, storage_path)
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
    inserted_anns = batch_insert_annotations(supabase, all_annotations)
    print(f"✅ Inserted {inserted_anns} annotations")
    
    # ============================================================
    # Финальная статистика
    # ============================================================
    print("\n" + "="*60)
    print("IMPORT COMPLETED")
    print("="*60)
    print(f"Environment: {args.env}")
    print(f"✅ Recognitions imported: {inserted_recs}")
    print(f"✅ Images imported: {len(storage_to_image_id)}")
    print(f"✅ Files uploaded: {uploaded_count} ({failed_count} failures)")
    print(f"✅ Annotations created: {inserted_anns}")
    print("="*60)


if __name__ == '__main__':
    main()

