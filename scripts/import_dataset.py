#!/usr/bin/env python3
"""
Финальный скрипт импорта датасета в Supabase.
Автоматически находит export директорию и избегает дублирования данных.

Usage:
    python import_dataset.py <dataset_dir> <qwen_json> [--env local|prod] [--limit N]

Example:
    python import_dataset.py /Users/user/Downloads/RRS_Dataset /Users/user/Downloads/qwen_annotations.json --env local --limit 30
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set
import re
import argparse

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


def get_existing_recognition_ids(supabase: Client) -> Set[int]:
    """Получает список уже существующих recognition_id из БД."""
    try:
        result = supabase.table('recognitions').select('recognition_id').execute()
        return {int(row['recognition_id']) for row in result.data}
    except Exception as e:
        print(f"⚠️  Error getting existing recognitions: {e}")
        return set()


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


def upload_image_to_storage(supabase: Client, local_path: Path, storage_path: str) -> bool:
    """Загружает изображение в Supabase Storage."""
    try:
        with open(local_path, 'rb') as f:
            supabase.storage.from_('bbox-images').upload(
                storage_path,
                f.read(),
                {'content-type': 'image/jpeg'}
            )
        return True
    except Exception as e:
        if 'duplicate' not in str(e).lower():
            print(f"⚠️  Error uploading {storage_path}: {e}")
        return False


def process_recognition(
    supabase: Client,
    recognition_dir: Path,
    qwen_data: Dict,
    existing_ids: Set[int]
) -> Dict:
    """Обрабатывает один recognition и возвращает статистику."""
    stats = {
        'success': False,
        'skipped': False,
        'error': False,
        'images_uploaded': 0,
        'annotations_created': 0
    }
    
    recognition_id = extract_recognition_id(recognition_dir.name)
    if not recognition_id:
        stats['error'] = True
        return stats
    
    # Проверяем дублирование
    if recognition_id in existing_ids:
        stats['skipped'] = True
        return stats
    
    # Ищем файлы
    dishes_files = list(recognition_dir.glob('*_correct_dishes.json'))
    photos_dir = recognition_dir / 'photos'
    
    if not dishes_files or not photos_dir.exists():
        stats['error'] = True
        return stats
    
    # Читаем данные
    try:
        with open(dishes_files[0], 'r', encoding='utf-8') as f:
            correct_dishes = json.load(f)  # Это массив
    except Exception as e:
        print(f"Error reading JSON for {recognition_id}: {e}")
        stats['error'] = True
        return stats
    
    # Извлекаем дату из имени файла (формат: XXXXX_correct_dishes_2025-09-25.json)
    date_match = re.search(r'(\d{4}-\d{2}-\d{2})', dishes_files[0].name)
    recognition_date = date_match.group(1) if date_match else '2025-10-11'
    
    # Создаем recognition
    try:
        supabase.table('recognitions').insert({
            'recognition_id': recognition_id,
            'recognition_date': recognition_date,
            'status': 'not_started',
            'has_modifications': False,
            'is_mistake': False,
            'correct_dishes': correct_dishes,
            'annotator_notes': None
        }).execute()
    except Exception as e:
        print(f"Error creating recognition {recognition_id}: {e}")
        stats['error'] = True
        return stats
    
    # Создаем маппинг dish_label -> index (dish_0 -> 0, dish_1 -> 1, etc.)
    dish_mapping = {f'dish_{idx}': idx for idx in range(len(correct_dishes))}
    
    # Обрабатываем изображения
    image_files = sorted(photos_dir.glob('*.jpg')) + sorted(photos_dir.glob('*.jpeg'))
    
    for img_file in image_files:
        photo_type = extract_photo_type(img_file.name)
        if not photo_type:
            continue
        
        # Загружаем в storage
        storage_path = f"{recognition_id}/{img_file.name}"
        if upload_image_to_storage(supabase, img_file, storage_path):
            stats['images_uploaded'] += 1
        
        # Ищем QWEN аннотации
        qwen_key = f"data/recognition_{recognition_id}/photos/{img_file.name}"
        qwen_dishes = []
        qwen_plates = []
        
        if qwen_key in qwen_data:
            qwen_entry = qwen_data[qwen_key]
            qwen_dishes = qwen_entry.get('dishes', {}).get('qwen_detections', [])
            qwen_plates = qwen_entry.get('plates', {}).get('qwen_detections', [])
        
        # Создаем запись изображения с original_annotations
        original_annotations = None
        if qwen_dishes or qwen_plates:
            original_annotations = {
                'qwen_dishes_detections': qwen_dishes,
                'qwen_plates_detections': qwen_plates
            }
        
        try:
            result = supabase.table('recognition_images').insert({
                'recognition_id': recognition_id,
                'photo_type': photo_type,
                'storage_path': storage_path,
                'original_annotations': original_annotations
            }).execute()
            
            image_id = result.data[0]['id']
            
            # Создаем аннотации для блюд
            for detection in qwen_dishes:
                bbox = detection.get('bbox_2d') or detection.get('bbox')
                if not bbox or len(bbox) < 4:
                    continue
                
                label = detection.get('label', '')
                dish_index = dish_mapping.get(label)
                
                supabase.table('annotations').insert({
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
                }).execute()
                stats['annotations_created'] += 1
            
            # Создаем аннотации для тарелок
            for detection in qwen_plates:
                bbox = detection.get('bbox_2d') or detection.get('bbox')
                if not bbox or len(bbox) < 4:
                    continue
                
                supabase.table('annotations').insert({
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
                }).execute()
                stats['annotations_created'] += 1
                
        except Exception as e:
            print(f"Error creating image/annotations for {recognition_id}: {e}")
    
    stats['success'] = True
    return stats


def main():
    parser = argparse.ArgumentParser(description='Import recognition dataset to Supabase')
    parser.add_argument('dataset_dir', help='Path to RRS_Dataset directory')
    parser.add_argument('qwen_json', help='Path to qwen_annotations.json')
    parser.add_argument('--env', choices=['local', 'prod'], default='local', help='Environment (default: local)')
    parser.add_argument('--limit', type=int, help='Limit number of recognitions to import')
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
    existing_ids = get_existing_recognition_ids(supabase)
    print(f"✅ Found {len(existing_ids)} existing recognitions in database")
    
    # Находим все recognition директории
    recognition_dirs = sorted([d for d in export_dir.iterdir() 
                              if d.is_dir() and d.name.startswith('recognition_')])
    
    if args.limit:
        recognition_dirs = recognition_dirs[:args.limit]
        print(f"⚠️  LIMITED MODE: Processing only first {args.limit} recognitions")
    
    print(f"📊 Total recognitions to process: {len(recognition_dirs)}")
    
    # Обрабатываем recognitions
    total_stats = {
        'processed': 0,
        'success': 0,
        'skipped': 0,
        'errors': 0,
        'images_uploaded': 0,
        'annotations_created': 0
    }
    
    for rec_dir in tqdm(recognition_dirs, desc="Importing recognitions"):
        stats = process_recognition(supabase, rec_dir, qwen_data, existing_ids)
        total_stats['processed'] += 1
        
        if stats['success']:
            total_stats['success'] += 1
            total_stats['images_uploaded'] += stats['images_uploaded']
            total_stats['annotations_created'] += stats['annotations_created']
        elif stats['skipped']:
            total_stats['skipped'] += 1
        elif stats['error']:
            total_stats['errors'] += 1
    
    # Финальная статистика
    print("\n" + "="*60)
    print("IMPORT COMPLETED")
    print("="*60)
    print(f"Environment: {args.env}")
    print(f"Total processed: {total_stats['processed']}")
    print(f"✅ Successfully imported: {total_stats['success']}")
    print(f"⏭️  Skipped (already exist): {total_stats['skipped']}")
    print(f"❌ Errors: {total_stats['errors']}")
    print(f"📷 Images uploaded: {total_stats['images_uploaded']}")
    print(f"📍 Annotations created: {total_stats['annotations_created']}")
    print("="*60)


if __name__ == '__main__':
    main()

