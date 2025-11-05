#!/usr/bin/env python3
"""
Скрипт для загрузки menu_all из файлов *_AM.json напрямую в recognitions.menu_all

Устойчив к повторным запускам - проверяет какие recognition уже имеют menu_all.

Usage:
    python3 scripts/load_menu_all_direct.py \
        --dataset "/Users/romanshestakov/Downloads/RRS_Dataset 2" \
        --env prod
"""

import json
import os
import sys
import argparse
from pathlib import Path
from typing import Set

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


def find_export_directory(dataset_dir: Path) -> Path:
    """Находит директорию export_* внутри dataset_dir."""
    for item in dataset_dir.iterdir():
        if item.is_dir() and item.name.startswith('export_'):
            return item
    raise FileNotFoundError(f"No export_* directory found in {dataset_dir}")


def apply_migration(supabase: Client) -> None:
    """Применяет миграцию для добавления menu_all колонки."""
    print("\n🔧 Применяем миграцию...")
    
    migration_sql = """
    ALTER TABLE recognitions ADD COLUMN IF NOT EXISTS menu_all JSONB;
    CREATE INDEX IF NOT EXISTS idx_recognitions_menu_all ON recognitions USING GIN (menu_all);
    """
    
    try:
        # PostgREST API не поддерживает прямой SQL, поэтому проверим через SELECT
        result = supabase.table('recognitions').select('menu_all').limit(1).execute()
        print("✅ Колонка menu_all уже существует")
    except Exception as e:
        print(f"⚠️  Ошибка проверки: {e}")
        print("⚠️  Миграцию нужно применить вручную через Supabase Dashboard")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description='Load menu_all from *_AM.json files to recognitions')
    parser.add_argument('--dataset', required=True, help='Path to RRS_Dataset directory')
    parser.add_argument('--env', choices=['local', 'prod'], default='local', help='Environment (default: local)')
    parser.add_argument('--batch-size', type=int, default=100, help='Batch size for updates (default: 100)')
    args = parser.parse_args()
    
    dataset_dir = Path(args.dataset)
    if not dataset_dir.exists():
        print(f"❌ Dataset directory not found: {dataset_dir}")
        sys.exit(1)
    
    # Находим export директорию
    export_dir = find_export_directory(dataset_dir)
    print(f"📁 Found export directory: {export_dir.name}")
    
    # Подключаемся к Supabase
    supabase = setup_supabase(args.env)
    
    # Применяем миграцию
    apply_migration(supabase)
    
    # Загружаем recognitions из БД (ВСЕ СРАЗУ)
    print("\n📥 Загружаем recognitions из БД...")
    all_recognitions = []
    last_id = 0
    batch_size = 1000
    
    while True:
        result = supabase.table('recognitions')\
            .select('recognition_id, menu_all')\
            .gt('recognition_id', last_id)\
            .order('recognition_id')\
            .limit(batch_size)\
            .execute()
        
        if not result.data:
            break
        
        all_recognitions.extend(result.data)
        last_id = result.data[-1]['recognition_id']
        print(f"  Загружено: {len(all_recognitions)} recognitions...", end='\r')
        
        if len(result.data) < batch_size:
            break
    
    print(f"\n✅ Загружено {len(all_recognitions)} recognitions")
    
    # Разделяем на те, у кого уже есть menu_all и у кого нет
    with_menu = [r for r in all_recognitions if r.get('menu_all')]
    without_menu = [r for r in all_recognitions if not r.get('menu_all')]
    
    print(f"📊 С menu_all: {len(with_menu)}, Без menu_all: {len(without_menu)}")
    
    if len(without_menu) == 0:
        print("✅ Все recognitions уже имеют menu_all!")
        return
    
    # Создаем Set для быстрой проверки
    need_update_ids = {r['recognition_id'] for r in without_menu}
    
    # Загружаем menu_all из файлов
    print(f"\n🔨 Загружаем menu_all из файлов для {len(need_update_ids)} recognitions...")
    updates = []
    processed = 0
    not_found = 0
    
    for rec_id in tqdm(need_update_ids, desc="Reading files"):
        processed += 1
        
        rec_dir = export_dir / f"recognition_{rec_id}"
        if not rec_dir.exists():
            not_found += 1
            continue
        
        # Ищем файл *_AM.json
        am_files = list(rec_dir.glob('*_AM.json'))
        if not am_files:
            not_found += 1
            continue
        
        # Читаем menu_all
        try:
            with open(am_files[0], 'r', encoding='utf-8') as f:
                menu_all = json.load(f)
            
            updates.append({
                'recognition_id': rec_id,
                'menu_all': menu_all
            })
        except Exception as e:
            print(f"\n⚠️ Ошибка чтения {am_files[0]}: {e}")
            not_found += 1
    
    print(f"\n✅ Подготовлено {len(updates)} updates")
    if not_found > 0:
        print(f"⚠️  {not_found} recognitions не найдены или ошибка чтения")
    
    if len(updates) == 0:
        print("❌ Нет данных для обновления!")
        return
    
    # Batch update
    print(f"\n💾 Обновляем recognitions (batch size: {args.batch_size})...")
    total_updated = 0
    
    for i in tqdm(range(0, len(updates), args.batch_size), desc="Updating"):
        batch = updates[i:i + args.batch_size]
        
        # Обновляем по одному (PostgREST не поддерживает bulk update с разными значениями)
        for update in batch:
            try:
                supabase.table('recognitions')\
                    .update({'menu_all': update['menu_all']})\
                    .eq('recognition_id', update['recognition_id'])\
                    .execute()
                total_updated += 1
            except Exception as e:
                print(f"\n❌ Ошибка обновления {update['recognition_id']}: {e}")
    
    print(f"\n{'='*60}")
    print("✅ ГОТОВО!")
    print(f"{'='*60}")
    print(f"Обработано recognitions: {processed}")
    print(f"Обновлено: {total_updated}")
    print(f"Не найдено: {not_found}")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()

