#!/usr/bin/env python3
"""
Скрипт для очистки дубликатов в recognition_images

Для каждой группы дубликатов (recognition_id + photo_type):
1. Оставляет запись с минимальным id
2. Переназначает все annotations на оставленную запись
3. Удаляет остальные записи

ВАЖНО: Работает только с ТОЧНЫМИ дубликатами (recognition_id + photo_type)!

Usage:
    # Сначала dry-run для проверки
    python3 scripts/cleanup_image_duplicates.py --env prod --dry-run
    
    # Затем выполнение
    python3 scripts/cleanup_image_duplicates.py --env prod
"""

import os
import sys
import argparse
from collections import defaultdict

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


def find_duplicates(images):
    """Находит дубликаты."""
    print("\n🔍 Ищем дубликаты...")
    
    # Группируем по recognition_id + photo_type
    groups = defaultdict(list)
    for img in images:
        key = (img['recognition_id'], img['photo_type'])
        groups[key].append(img)
    
    # Находим дубликаты
    duplicates = {k: v for k, v in groups.items() if len(v) > 1}
    
    if not duplicates:
        print("✅ Дубликатов не найдено!")
        return []
    
    total_to_delete = sum(len(v) - 1 for v in duplicates.values())
    print(f"📊 Найдено {len(duplicates)} групп дубликатов")
    print(f"📊 Записей к удалению: {total_to_delete}")
    
    return duplicates


def plan_cleanup(duplicates):
    """Создает план очистки."""
    cleanup_plan = []
    
    for (rec_id, photo_type), imgs in duplicates.items():
        # Сортируем по id и оставляем самый старый
        imgs_sorted = sorted(imgs, key=lambda x: x['id'])
        keep_id = imgs_sorted[0]['id']
        delete_ids = [img['id'] for img in imgs_sorted[1:]]
        
        cleanup_plan.append({
            'recognition_id': rec_id,
            'photo_type': photo_type,
            'keep_id': keep_id,
            'delete_ids': delete_ids
        })
    
    return cleanup_plan


def execute_cleanup(supabase: Client, cleanup_plan, dry_run=True):
    """Выполняет очистку."""
    if dry_run:
        print(f"\n{'='*80}")
        print("DRY RUN MODE - Изменения НЕ будут применены!")
        print(f"{'='*80}")
    else:
        print(f"\n{'='*80}")
        print("⚠️  ВЫПОЛНЯЕМ ОЧИСТКУ!")
        print(f"{'='*80}")
        response = input("Продолжить? (yes/no): ")
        if response.lower() != 'yes':
            print("❌ Отменено пользователем")
            sys.exit(0)
    
    total_annotations_moved = 0
    total_images_deleted = 0
    
    for plan in tqdm(cleanup_plan, desc="Cleaning up"):
        keep_id = plan['keep_id']
        delete_ids = plan['delete_ids']
        
        # 1. Переназначаем аннотации
        for delete_id in delete_ids:
            # Считаем сколько аннотаций
            result = supabase.table('annotations')\
                .select('id', count='exact')\
                .eq('image_id', delete_id)\
                .limit(1)\
                .execute()
            
            ann_count = result.count or 0
            
            if ann_count > 0:
                if not dry_run:
                    # Переназначаем
                    supabase.table('annotations')\
                        .update({'image_id': keep_id})\
                        .eq('image_id', delete_id)\
                        .execute()
                
                total_annotations_moved += ann_count
        
        # 2. Удаляем дубликаты
        if not dry_run:
            for delete_id in delete_ids:
                supabase.table('recognition_images')\
                    .delete()\
                    .eq('id', delete_id)\
                    .execute()
        
        total_images_deleted += len(delete_ids)
    
    print(f"\n{'='*80}")
    if dry_run:
        print("ПЛАН ОЧИСТКИ:")
    else:
        print("РЕЗУЛЬТАТ ОЧИСТКИ:")
    print(f"{'='*80}")
    print(f"Аннотаций переназначено: {total_annotations_moved}")
    print(f"Изображений удалено: {total_images_deleted}")
    print(f"{'='*80}\n")


def main():
    parser = argparse.ArgumentParser(description='Cleanup duplicate recognition_images')
    parser.add_argument('--env', choices=['local', 'prod'], default='local', help='Environment (default: local)')
    parser.add_argument('--dry-run', action='store_true', help='Show plan without making changes')
    args = parser.parse_args()
    
    # Предупреждение для продакшена
    if args.env == 'prod' and not args.dry_run:
        print("⚠️" * 40)
        print("⚠️  ВНИМАНИЕ! Вы собираетесь изменить ПРОДАКШН базу данных!")
        print("⚠️  Рекомендуется сначала выполнить с флагом --dry-run")
        print("⚠️" * 40)
    
    # Подключаемся к Supabase
    supabase = setup_supabase(args.env)
    
    # Загружаем все изображения
    images = fetch_all_images(supabase)
    
    # Находим дубликаты
    duplicates = find_duplicates(images)
    
    if not duplicates:
        return
    
    # Создаем план очистки
    cleanup_plan = plan_cleanup(duplicates)
    
    # Показываем примеры
    print(f"\nПримеры дубликатов (первые 5):")
    for i, plan in enumerate(cleanup_plan[:5]):
        print(f"{i+1}. {plan['recognition_id']}/{plan['photo_type']}: "
              f"keep={plan['keep_id']}, delete={plan['delete_ids']}")
    
    # Выполняем очистку
    execute_cleanup(supabase, cleanup_plan, dry_run=args.dry_run)
    
    if args.dry_run:
        print("ℹ️  Для выполнения очистки запустите без флага --dry-run")


if __name__ == '__main__':
    main()

