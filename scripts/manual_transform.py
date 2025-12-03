#!/usr/bin/env python3
"""
Manually run transform functions for existing data.
Useful when transform failed during load.
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.ingest.config import IngestConfig
from scripts.ingest.database import DatabaseManager

def manual_transform(production=False):
    """Run transform functions manually."""
    print('🔄 Запуск transform функций...')
    print()
    
    # Initialize config
    config = IngestConfig.from_env(use_production=production)
    db = DatabaseManager(config)
    
    try:
        # Test connection
        if not db.test_connection():
            print("❌ Не удалось подключиться к БД")
            return 1
        
        print(f"✅ Подключено к {config.environment}")
        print()
        
        # Run transforms
        print("Выполняю transform_recognitions_and_images()...")
        rec_count, img_count, menu_count = db.transform_recognitions_and_images()
        print(f"  ✓ Recognitions: {rec_count}, Images: {img_count}, Menu items: {menu_count}")
        
        print("\nВыполняю transform_recipes()...")
        recipe_count, line_count, opt_count = db.transform_recipes()
        print(f"  ✓ Recipes: {recipe_count}, Lines: {line_count}, Options: {opt_count}")
        
        print("\nВыполняю transform_initial_items_and_annotations()...")
        item_count, ann_count = db.transform_initial_items_and_annotations()
        print(f"  ✓ Items: {item_count}, Annotations: {ann_count}")
        
        print()
        print("✅ Все transform функции выполнены успешно!")
        
        return 0
        
    except Exception as e:
        print(f"\n❌ Ошибка: {e}")
        return 1
    finally:
        db.close()

if __name__ == '__main__':
    production = '--production' in sys.argv
    if production:
        print("⚠️  PRODUCTION MODE")
        confirm = input("Введите 'CONFIRM' для продолжения: ")
        if confirm != 'CONFIRM':
            print("Отменено")
            sys.exit(1)
        print()
    
    sys.exit(manual_transform(production=production))





