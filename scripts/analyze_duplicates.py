#!/usr/bin/env python3
"""
Скрипт для анализа дубликатов в recognition_images

Показывает:
- Сколько дубликатов по recognition_id + photo_type
- Какие именно записи дублируются
- Статистику по аннотациям

Usage:
    python3 scripts/analyze_duplicates.py --env prod
"""

import os
import sys
import argparse
from collections import defaultdict

from supabase import create_client, Client
from dotenv import load_dotenv


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


def fetch_all_images(supabase: Client):
    """Загружает все изображения из БД."""
    print("\n📥 Загружаем recognition_images...")
    all_images = []
    last_id = 0
    batch_size = 1000
    
    while True:
        result = supabase.table('recognition_images')\
            .select('id, recognition_id, photo_type, storage_path')\
            .gt('id', last_id)\
            .order('id')\
            .limit(batch_size)\
            .execute()
        
        if not result.data:
            break
        
        all_images.extend(result.data)
        last_id = result.data[-1]['id']
        print(f"  Загружено: {len(all_images)} images...", end='\r')
        
        if len(result.data) < batch_size:
            break
    
    print(f"\n✅ Загружено {len(all_images)} images")
    return all_images


def analyze_duplicates(images):
    """Анализирует дубликаты."""
    print("\n🔍 Анализируем дубликаты...")
    
    # Группируем по recognition_id + photo_type
    groups = defaultdict(list)
    for img in images:
        key = (img['recognition_id'], img['photo_type'])
        groups[key].append(img)
    
    # Находим дубликаты
    duplicates = {k: v for k, v in groups.items() if len(v) > 1}
    
    print(f"\n{'='*80}")
    print("СТАТИСТИКА")
    print(f"{'='*80}")
    print(f"Всего recognition_images: {len(images)}")
    print(f"Уникальных (recognition_id, photo_type): {len(groups)}")
    print(f"Групп с дубликатами: {len(duplicates)}")
    
    if len(duplicates) > 0:
        total_duplicate_records = sum(len(v) - 1 for v in duplicates.values())
        print(f"Записей-дубликатов (можно удалить): {total_duplicate_records}")
        print(f"Ожидаемое количество после очистки: {len(images) - total_duplicate_records}")
    
    return duplicates


def show_duplicate_examples(duplicates, limit=10):
    """Показывает примеры дубликатов."""
    if not duplicates:
        print("\n✅ Дубликатов не найдено!")
        return
    
    print(f"\n{'='*80}")
    print(f"ПРИМЕРЫ ДУБЛИКАТОВ (первые {limit})")
    print(f"{'='*80}")
    
    for i, ((rec_id, photo_type), imgs) in enumerate(list(duplicates.items())[:limit]):
        print(f"\n{i+1}. recognition_id={rec_id}, photo_type={photo_type}")
        print(f"   Количество дубликатов: {len(imgs)}")
        print(f"   IDs: {[img['id'] for img in imgs]}")
        print(f"   Oldest (keep): {min(img['id'] for img in imgs)}")
        print(f"   To delete: {[img['id'] for img in imgs if img['id'] != min(img['id'] for img in imgs)]}")


def check_annotations(supabase: Client, duplicates):
    """Проверяет аннотации для дубликатов."""
    if not duplicates:
        return
    
    print(f"\n{'='*80}")
    print("ПРОВЕРКА АННОТАЦИЙ")
    print(f"{'='*80}")
    
    # Берем первые 5 групп дубликатов для анализа
    sample_groups = list(duplicates.values())[:5]
    
    for group in sample_groups:
        rec_id = group[0]['recognition_id']
        photo_type = group[0]['photo_type']
        
        print(f"\nrecognition_id={rec_id}, photo_type={photo_type}:")
        for img in group:
            # Считаем аннотации для каждого image_id
            result = supabase.table('annotations')\
                .select('id', count='exact')\
                .eq('image_id', img['id'])\
                .limit(1)\
                .execute()
            
            ann_count = result.count or 0
            print(f"  ID {img['id']:6}: {ann_count:4} annotations")


def main():
    parser = argparse.ArgumentParser(description='Analyze duplicates in recognition_images')
    parser.add_argument('--env', choices=['local', 'prod'], default='local', help='Environment (default: local)')
    args = parser.parse_args()
    
    # Подключаемся к Supabase
    supabase = setup_supabase(args.env)
    
    # Загружаем все изображения
    images = fetch_all_images(supabase)
    
    # Анализируем дубликаты
    duplicates = analyze_duplicates(images)
    
    # Показываем примеры
    show_duplicate_examples(duplicates, limit=10)
    
    # Проверяем аннотации
    check_annotations(supabase, duplicates)
    
    print(f"\n{'='*80}")
    if duplicates:
        print("⚠️  Найдены дубликаты!")
        print("Используйте scripts/cleanup_image_duplicates.py для очистки")
    else:
        print("✅ Дубликатов не найдено!")
    print(f"{'='*80}\n")


if __name__ == '__main__':
    main()

