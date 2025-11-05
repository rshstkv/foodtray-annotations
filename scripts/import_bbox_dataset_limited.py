#!/usr/bin/env python3
"""
Скрипт для импорта ПЕРВЫХ N recognition для тестирования.
Использует тот же код что и import_bbox_dataset.py
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

# Импортируем все из основного скрипта
from import_bbox_dataset import *

def main():
    """Основная функция импорта (только первые N)."""
    # Параметры
    if len(sys.argv) < 3:
        print("Usage: python import_bbox_dataset_limited.py <export_dir> <qwen_annotations_json> [limit]")
        print("Example: python import_bbox_dataset_limited.py /path/to/export /path/to/qwen.json 10")
        sys.exit(1)
    
    export_dir = Path(sys.argv[1])
    qwen_json_path = Path(sys.argv[2])
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 10  # По умолчанию 10
    
    if not export_dir.exists():
        print(f"Error: Export directory {export_dir} does not exist")
        sys.exit(1)
    
    if not qwen_json_path.exists():
        print(f"Error: QWEN annotations file {qwen_json_path} does not exist")
        sys.exit(1)
    
    # Генерируем export_version
    export_version = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    print(f"⚠️  LIMITED IMPORT MODE - first {limit} recognitions only")
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
    all_recognition_dirs = sorted([d for d in export_dir.iterdir() 
                                   if d.is_dir() and d.name.startswith('recognition_')])
    
    # ОГРАНИЧИВАЕМ количество
    recognition_dirs = all_recognition_dirs[:limit]
    
    print(f"Found {len(all_recognition_dirs)} total recognition directories")
    print(f"⚠️  Will import only first {len(recognition_dirs)}")
    
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
    print("IMPORT COMPLETED (LIMITED)")
    print("="*60)
    print(f"Total recognitions processed: {stats['total']}")
    print(f"Successfully imported: {stats['success']}")
    print(f"Skipped (duplicates): {stats['duplicates']}")
    print(f"Errors: {stats['errors']}")
    print(f"Total annotations inserted: {stats['annotations_inserted']}")
    print("="*60)


if __name__ == '__main__':
    main()





