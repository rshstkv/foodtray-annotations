#!/usr/bin/env python3
"""
Скрипт для импорта датасета bounding box аннотаций в Supabase.
Читает данные из директории export и qwen_annotations.json,
загружает изображения в Storage и создает записи в БД.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import re

from supabase import create_client, Client
from dotenv import load_dotenv
from tqdm import tqdm

# Загружаем переменные окружения
load_dotenv('.env.local')

# Настройки Supabase
SUPABASE_URL = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_ANON_KEY') or os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY) must be set in .env.local")
    sys.exit(1)

# Создаем клиент Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def extract_recognition_id_from_path(path: str) -> Optional[str]:
    """Извлекает recognition_id из пути к файлу."""
    match = re.search(r'recognition_(\d+)', path)
    if match:
        return match.group(1)
    return None


def extract_photo_type_from_filename(filename: str) -> Optional[str]:
    """Извлекает тип фото (Main или Qualifying) из имени файла."""
    if '_Main.' in filename:
        return 'Main'
    elif '_Qualifying.' in filename:
        return 'Qualifying'
    return None


def extract_date_from_filename(filename: str) -> Optional[str]:
    """Извлекает дату из имени файла в формате YYYY-MM-DD."""
    match = re.search(r'(\d{4}-\d{2}-\d{2})', filename)
    if match:
        return match.group(1)
    return None


def load_json_file(filepath: Path) -> Optional[dict]:
    """Загружает JSON файл."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading {filepath}: {e}")
        return None


def upload_image_to_storage(local_path: Path, storage_path: str) -> bool:
    """Загружает изображение в Supabase Storage."""
    try:
        with open(local_path, 'rb') as f:
            image_data = f.read()
        
        # Загружаем в bucket (новый API supabase-py v2.23+)
        result = supabase.storage.from_('bbox-images').upload(
            storage_path,
            image_data,
            file_options={"content-type": "image/jpeg", "upsert": "true"}
        )
        return True
    except Exception as e:
        print(f"Error uploading image {local_path} to {storage_path}: {e}")
        return False


def check_recognition_exists(recognition_id: str) -> bool:
    """Проверяет существование recognition в БД."""
    try:
        result = supabase.table('recognitions_raw').select('recognition_id').eq('recognition_id', recognition_id).execute()
        return len(result.data) > 0
    except Exception as e:
        print(f"Error checking recognition {recognition_id}: {e}")
        return False


def insert_recognition_raw(recognition_id: str, recognition_date: str, export_version: str,
                           correct_dishes: dict, menu_all: dict) -> bool:
    """Вставляет запись в recognitions_raw."""
    try:
        data = {
            'recognition_id': recognition_id,
            'recognition_date': recognition_date,
            'export_version': export_version,
            'correct_dishes': correct_dishes,
            'menu_all': menu_all
        }
        supabase.table('recognitions_raw').insert(data).execute()
        return True
    except Exception as e:
        print(f"Error inserting recognition_raw {recognition_id}: {e}")
        return False


def insert_recognition_image_raw(recognition_id: str, image_path: str, photo_type: str,
                                 storage_path: str, qwen_dishes: Optional[List],
                                 qwen_plates: Optional[List]) -> Optional[int]:
    """Вставляет запись в recognition_images_raw и возвращает id."""
    try:
        data = {
            'recognition_id': recognition_id,
            'image_path': image_path,
            'photo_type': photo_type,
            'storage_path': storage_path,
            'qwen_dishes_detections': qwen_dishes,
            'qwen_plates_detections': qwen_plates
        }
        result = supabase.table('recognition_images_raw').insert(data).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]['id']
        return None
    except Exception as e:
        print(f"Error inserting recognition_image_raw {image_path}: {e}")
        return None


def insert_recognition(recognition_id: str, recognition_date: str, correct_dishes: dict) -> bool:
    """Вставляет запись в recognitions."""
    try:
        data = {
            'recognition_id': recognition_id,
            'recognition_date': recognition_date,
            'status': 'not_started',
            'is_mistake': False,
            'correct_dishes': correct_dishes,
            'annotator_notes': None
        }
        supabase.table('recognitions').insert(data).execute()
        return True
    except Exception as e:
        print(f"Error inserting recognition {recognition_id}: {e}")
        return False


def insert_recognition_image(recognition_id: str, photo_type: str, storage_path: str,
                             width: Optional[int] = None, height: Optional[int] = None,
                             qwen_dishes: Optional[List] = None, qwen_plates: Optional[List] = None) -> Optional[int]:
    """Вставляет запись в recognition_images и возвращает id."""
    try:
        # Формируем original_annotations для возможности восстановления
        original_annotations = None
        if qwen_dishes or qwen_plates:
            original_annotations = {
                'qwen_dishes_detections': qwen_dishes or [],
                'qwen_plates_detections': qwen_plates or []
            }
        
        data = {
            'recognition_id': recognition_id,
            'photo_type': photo_type,
            'storage_path': storage_path,
            'image_width': width,
            'image_height': height,
            'original_annotations': original_annotations
        }
        result = supabase.table('recognition_images').insert(data).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]['id']
        return None
    except Exception as e:
        print(f"Error inserting recognition_image: {e}")
        return None


def insert_annotations(image_id: int, detections: List[dict], object_type: str,
                      dish_index_mapping: Optional[Dict[str, int]] = None) -> int:
    """Вставляет аннотации для изображения. Возвращает количество вставленных."""
    count = 0
    for detection in detections:
        try:
            bbox = detection['bbox_2d']
            label = detection.get('label', '')
            
            # Определяем dish_index для food objects
            dish_idx = None
            if object_type == 'food' and dish_index_mapping and label in dish_index_mapping:
                dish_idx = dish_index_mapping[label]
            
            data = {
                'image_id': image_id,
                'object_type': object_type,
                'object_subtype': None,
                'dish_index': dish_idx,
                'bbox_x1': bbox[0],
                'bbox_y1': bbox[1],
                'bbox_x2': bbox[2],
                'bbox_y2': bbox[3],
                'is_overlapped': False,
                'is_bottle_up': None,
                'source': 'qwen_auto'
            }
            supabase.table('annotations').insert(data).execute()
            count += 1
        except Exception as e:
            print(f"Error inserting annotation: {e}")
    return count


def process_recognition(recognition_dir: Path, qwen_data: Dict, export_version: str,
                       stats: Dict) -> Tuple[bool, str]:
    """
    Обрабатывает одну директорию recognition.
    Возвращает (success, reason).
    """
    recognition_id = recognition_dir.name.replace('recognition_', '')
    
    # Проверяем дедубликацию
    if check_recognition_exists(recognition_id):
        return False, 'duplicate'
    
    # Ищем файлы
    correct_dishes_files = list(recognition_dir.glob('*_correct_dishes.json'))
    am_files = list(recognition_dir.glob('*_AM.json'))
    photo_dir = recognition_dir / 'photos'
    
    if not correct_dishes_files or not am_files:
        return False, 'missing_files'
    
    if not photo_dir.exists():
        return False, 'no_photos'
    
    # Загружаем JSON
    correct_dishes = load_json_file(correct_dishes_files[0])
    menu_all = load_json_file(am_files[0])
    
    if not correct_dishes or not menu_all:
        return False, 'json_error'
    
    # Извлекаем дату
    recognition_date = extract_date_from_filename(correct_dishes_files[0].name)
    if not recognition_date:
        recognition_date = '2025-10-11'  # fallback
    
    # Вставляем в recognitions_raw
    if not insert_recognition_raw(recognition_id, recognition_date, export_version,
                                  correct_dishes, menu_all):
        return False, 'db_error'
    
    # Вставляем в recognitions
    if not insert_recognition(recognition_id, recognition_date, correct_dishes):
        return False, 'db_error'
    
    # Создаем маппинг dish_label -> index для correct_dishes
    dish_index_mapping = {}
    for idx, dish in enumerate(correct_dishes):
        dish_index_mapping[f'dish_{idx}'] = idx
    
    # Обрабатываем изображения
    image_files = list(photo_dir.glob('*.jpg')) + list(photo_dir.glob('*.jpeg'))
    
    for image_file in image_files:
        photo_type = extract_photo_type_from_filename(image_file.name)
        if not photo_type:
            continue
        
        # Путь в storage
        storage_path = f"{recognition_id}/{photo_type}.jpg"
        
        # Загружаем в Storage
        if not upload_image_to_storage(image_file, storage_path):
            continue
        
        # Ищем аннотации QWEN для этого изображения
        # Пути в qwen_data могут быть в формате "data/recognition_XXX/photos/..."
        qwen_key = None
        for key in qwen_data.keys():
            if recognition_id in key and photo_type in key:
                qwen_key = key
                break
        
        qwen_dishes = None
        qwen_plates = None
        
        if qwen_key and qwen_key in qwen_data:
            qwen_entry = qwen_data[qwen_key]
            qwen_dishes = qwen_entry.get('dishes', {}).get('qwen_detections', [])
            qwen_plates = qwen_entry.get('plates', {}).get('qwen_detections', [])
        
        # Вставляем в recognition_images_raw
        insert_recognition_image_raw(recognition_id, qwen_key or f"unknown/{image_file.name}",
                                    photo_type, storage_path, qwen_dishes, qwen_plates)
        
        # Вставляем в recognition_images с original_annotations
        image_id = insert_recognition_image(recognition_id, photo_type, storage_path, 
                                           qwen_dishes=qwen_dishes, qwen_plates=qwen_plates)
        
        if image_id:
            # Вставляем аннотации
            if qwen_dishes:
                annotations_count = insert_annotations(image_id, qwen_dishes, 'food', dish_index_mapping)
                stats['annotations_inserted'] += annotations_count
            
            if qwen_plates:
                annotations_count = insert_annotations(image_id, qwen_plates, 'plate')
                stats['annotations_inserted'] += annotations_count
    
    return True, 'success'


def main():
    """Основная функция импорта."""
    # Параметры
    if len(sys.argv) < 3:
        print("Usage: python import_bbox_dataset.py <export_dir> <qwen_annotations_json>")
        print("Example: python import_bbox_dataset.py /path/to/export_20251010_135307 /path/to/qwen_annotations.json")
        sys.exit(1)
    
    export_dir = Path(sys.argv[1])
    qwen_json_path = Path(sys.argv[2])
    
    if not export_dir.exists():
        print(f"Error: Export directory {export_dir} does not exist")
        sys.exit(1)
    
    if not qwen_json_path.exists():
        print(f"Error: QWEN annotations file {qwen_json_path} does not exist")
        sys.exit(1)
    
    # Генерируем export_version
    export_version = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    print(f"Starting import with export_version: {export_version}")
    print(f"Export dir: {export_dir}")
    print(f"QWEN annotations: {qwen_json_path}")
    
    # Загружаем QWEN аннотации
    print("Loading QWEN annotations...")
    qwen_data = load_json_file(qwen_json_path)
    if not qwen_data:
        print("Error loading QWEN annotations")
        sys.exit(1)
    
    print(f"Loaded {len(qwen_data)} QWEN annotation entries")
    
    # Находим все директории recognition
    recognition_dirs = sorted([d for d in export_dir.iterdir() if d.is_dir() and d.name.startswith('recognition_')])
    
    print(f"Found {len(recognition_dirs)} recognition directories")
    
    # Статистика
    stats = {
        'total': len(recognition_dirs),
        'success': 0,
        'duplicates': 0,
        'errors': 0,
        'annotations_inserted': 0
    }
    
    # Обрабатываем каждую директорию
    print("Processing recognitions...")
    for recognition_dir in tqdm(recognition_dirs, desc="Importing"):
        success, reason = process_recognition(recognition_dir, qwen_data, export_version, stats)
        
        if success:
            stats['success'] += 1
        elif reason == 'duplicate':
            stats['duplicates'] += 1
        else:
            stats['errors'] += 1
    
    # Выводим статистику
    print("\n" + "="*60)
    print("IMPORT COMPLETED")
    print("="*60)
    print(f"Total recognitions processed: {stats['total']}")
    print(f"Successfully imported: {stats['success']}")
    print(f"Skipped (duplicates): {stats['duplicates']}")
    print(f"Errors: {stats['errors']}")
    print(f"Total annotations inserted: {stats['annotations_inserted']}")
    print("="*60)


if __name__ == '__main__':
    main()

