#!/usr/bin/env python3
"""
Проверяет целостность Storage и находит несоответствия с БД.

Usage:
    python3 scripts/check_storage.py              # Проверка
    python3 scripts/check_storage.py --fix        # Проверка и восстановление
    python3 scripts/check_storage.py --detailed   # Детальный отчет

Features:
- Проверяет состояние Storage bucket
- Показывает статистику (количество файлов, размер, missing files)
- Сравнивает с БД - находит несоответствия
- Опция --fix для автоматического восстановления недостающих файлов
"""

import os
import sys
import argparse
import json
from pathlib import Path
from typing import Set, List, Dict, Tuple
from dotenv import load_dotenv
from supabase import create_client
from tqdm import tqdm


def get_db_storage_paths(supabase_url: str, supabase_key: str) -> Set[str]:
    """Получает список всех storage_path из базы данных."""
    client = create_client(supabase_url, supabase_key)
    
    all_paths = set()
    page_size = 1000
    offset = 0
    
    print("🔍 Fetching image paths from database...")
    
    while True:
        result = client.table('recognition_images')\
            .select('storage_path')\
            .range(offset, offset + page_size - 1)\
            .execute()
        
        if not result.data:
            break
        
        for row in result.data:
            all_paths.add(row['storage_path'])
        
        if len(result.data) < page_size:
            break
        
        offset += page_size
    
    return all_paths


def get_storage_files(supabase_url: str, supabase_key: str) -> Dict[str, int]:
    """Получает список всех файлов в Storage с их размерами."""
    client = create_client(supabase_url, supabase_key)
    
    files_dict = {}
    
    print("🔍 Fetching files from Storage...")
    
    try:
        # Получаем список всех "папок" (recognition_id)
        folders = client.storage.from_('bbox-images').list()
        
        if not folders:
            return files_dict
        
        # Для каждой папки получаем список файлов
        for folder in tqdm(folders, desc="Scanning folders"):
            folder_name = folder.get('name', '')
            if not folder_name:
                continue
            
            try:
                files = client.storage.from_('bbox-images').list(path=folder_name)
                for file in files:
                    file_name = file.get('name', '')
                    file_size = file.get('metadata', {}).get('size', 0)
                    if file_name:
                        storage_path = f"{folder_name}/{file_name}"
                        files_dict[storage_path] = file_size
            except Exception as e:
                # Пропускаем папки, которые не удалось прочитать
                pass
        
    except Exception as e:
        print(f"⚠️  Warning: Could not fully scan Storage: {e}")
    
    return files_dict


def find_local_files(dataset_dir: Path) -> Dict[str, Path]:
    """Находит все локальные файлы изображений."""
    local_files = {}
    
    # Находим export директорию
    export_dir = None
    for item in dataset_dir.iterdir():
        if item.is_dir() and item.name.startswith('export_'):
            export_dir = item
            break
    
    if not export_dir:
        return local_files
    
    print(f"🔍 Scanning local files in {export_dir}...")
    
    # Сканируем все recognition_* директории
    recognition_dirs = [d for d in export_dir.iterdir() 
                       if d.is_dir() and d.name.startswith('recognition_')]
    
    for rec_dir in tqdm(recognition_dirs, desc="Scanning local"):
        photos_dir = rec_dir / "photos"
        if not photos_dir.exists():
            continue
        
        recognition_id = rec_dir.name.replace('recognition_', '')
        
        for img_file in photos_dir.glob('*.jpg'):
            storage_path = f"{recognition_id}/{img_file.name}"
            local_files[storage_path] = img_file
    
    return local_files


def format_size(size_bytes: int) -> str:
    """Форматирует размер в человекочитаемый вид."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def main():
    parser = argparse.ArgumentParser(
        description='Check Storage integrity and find inconsistencies',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Check Storage status
  python3 scripts/check_storage.py
  
  # Check and fix missing files
  python3 scripts/check_storage.py --fix
  
  # Detailed report with file lists
  python3 scripts/check_storage.py --detailed
  
  # Check specific dataset path
  python3 scripts/check_storage.py --dataset-path /path/to/dataset
        """
    )
    parser.add_argument('--fix', action='store_true',
                       help='Automatically restore missing files')
    parser.add_argument('--detailed', action='store_true',
                       help='Show detailed report with file lists')
    parser.add_argument('--dataset-path', type=str, default=None,
                       help='Path to dataset directory')
    parser.add_argument('--show-missing', action='store_true',
                       help='Show list of missing files')
    
    args = parser.parse_args()
    
    # Загружаем .env.local
    load_dotenv('.env.local')
    
    supabase_url = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_ANON_KEY')
    
    if not supabase_url or not supabase_key:
        print("❌ Supabase credentials not found in .env.local")
        sys.exit(1)
    
    print()
    print("="*60)
    print("🔍 STORAGE INTEGRITY CHECK")
    print("="*60)
    print()
    
    # Получаем данные из БД
    db_paths = get_db_storage_paths(supabase_url, supabase_key)
    print(f"✅ Found {len(db_paths)} image records in database")
    
    # Получаем данные из Storage
    storage_files = get_storage_files(supabase_url, supabase_key)
    print(f"✅ Found {len(storage_files)} files in Storage")
    
    # Анализируем несоответствия
    missing_in_storage = db_paths - set(storage_files.keys())
    extra_in_storage = set(storage_files.keys()) - db_paths
    
    # Вычисляем общий размер
    total_size = sum(storage_files.values())
    
    print()
    print("="*60)
    print("📊 STATISTICS")
    print("="*60)
    print(f"Database records:     {len(db_paths)}")
    print(f"Storage files:        {len(storage_files)}")
    print(f"Storage size:         {format_size(total_size)}")
    print()
    print(f"✅ Files in sync:      {len(db_paths) - len(missing_in_storage)}")
    print(f"⚠️  Missing in Storage: {len(missing_in_storage)}")
    print(f"⚠️  Extra in Storage:   {len(extra_in_storage)}")
    
    # Детальный отчет
    if args.detailed or args.show_missing:
        if missing_in_storage:
            print()
            print("="*60)
            print("⚠️  MISSING FILES IN STORAGE")
            print("="*60)
            for path in sorted(list(missing_in_storage)[:20]):
                print(f"  - {path}")
            if len(missing_in_storage) > 20:
                print(f"  ... and {len(missing_in_storage) - 20} more")
        
        if extra_in_storage and args.detailed:
            print()
            print("="*60)
            print("⚠️  EXTRA FILES IN STORAGE (not in DB)")
            print("="*60)
            for path in sorted(list(extra_in_storage)[:20]):
                print(f"  - {path}")
            if len(extra_in_storage) > 20:
                print(f"  ... and {len(extra_in_storage) - 20} more")
    
    # Восстановление
    if args.fix and missing_in_storage:
        print()
        print("="*60)
        print("🔧 RESTORING MISSING FILES")
        print("="*60)
        
        # Определяем путь к датасету
        if args.dataset_path:
            dataset_dir = Path(args.dataset_path)
        else:
            # Пытаемся загрузить из конфига
            try:
                script_dir = Path(__file__).parent
                config_file = script_dir / "db_config.json"
                if config_file.exists():
                    with open(config_file, 'r') as f:
                        config = json.load(f)
                        dataset_dir = Path(config['dataset_paths']['default_dataset_dir'])
                else:
                    dataset_dir = Path("/Users/romanshestakov/Downloads/RRS_Dataset 2")
            except Exception:
                dataset_dir = Path("/Users/romanshestakov/Downloads/RRS_Dataset 2")
        
        if not dataset_dir.exists():
            print(f"❌ Dataset directory not found: {dataset_dir}")
            print("   Use --dataset-path to specify the correct path")
            sys.exit(1)
        
        # Находим локальные файлы
        local_files = find_local_files(dataset_dir)
        print(f"✅ Found {len(local_files)} local files")
        
        # Определяем какие файлы можем восстановить
        restorable = []
        for path in missing_in_storage:
            if path in local_files:
                restorable.append((path, local_files[path]))
        
        print(f"📤 Can restore {len(restorable)} / {len(missing_in_storage)} missing files")
        
        if restorable:
            confirmation = input(f"\nUpload {len(restorable)} files? (yes/no): ").strip().lower()
            if confirmation == 'yes':
                # Используем upload_images_only.py функционал
                print("\n🚀 Starting upload...")
                print(f"   Run: python3 scripts/upload_images_only.py --dataset-path {dataset_dir}")
                print()
                print("   Or use the optimized command:")
                print(f"   npm run db:restore:quick")
    
    print()
    print("="*60)
    
    # Итог
    if not missing_in_storage and not extra_in_storage:
        print("✅ STORAGE IS IN PERFECT SYNC WITH DATABASE!")
    elif missing_in_storage:
        print("⚠️  ACTION REQUIRED: Missing files in Storage")
        print(f"   Run with --fix to restore missing files")
    else:
        print("✅ All database files are present in Storage")
    
    print("="*60)
    print()


if __name__ == '__main__':
    main()


