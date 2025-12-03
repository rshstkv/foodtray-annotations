#!/usr/bin/env python3
"""
Clean orphaned records from raw layer that are not in domain layer.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.ingest.config import IngestConfig
from scripts.ingest.database import DatabaseManager

def clean_orphaned_raw(production=False):
    """Clean orphaned records."""
    print('🧹 Очистка "зависших" записей из raw слоя...')
    print()
    
    config = IngestConfig.from_env(use_production=production)
    db = DatabaseManager(config)
    
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Find orphaned records
                cur.execute("""
                    SELECT recognition_id 
                    FROM raw.recognition_files 
                    WHERE recognition_id NOT IN (SELECT id FROM recognitions)
                    ORDER BY recognition_id
                """)
                orphaned = cur.fetchall()
                
                if not orphaned:
                    print("✅ Нет зависших записей. Всё чисто!")
                    return 0
                
                orphaned_ids = [row[0] for row in orphaned]
                print(f"⚠️  Найдено {len(orphaned_ids)} зависших записей в raw слое:")
                print(f"   IDs: {orphaned_ids[:10]}{'...' if len(orphaned_ids) > 10 else ''}")
                print()
                print("   Эти записи:")
                print("   - Загружены в raw.recognition_files")
                print("   - НЕ трансформированы в domain.recognitions")
                print("   - Блокируют повторную загрузку")
                print()
                
                # Delete orphaned records
                print("Удаляю зависшие записи из raw слоя...")
                
                # Delete from raw.qwen_annotations (если есть)
                cur.execute("""
                    DELETE FROM raw.qwen_annotations 
                    WHERE recognition_id = ANY(%s)
                """, (orphaned_ids,))
                qwen_deleted = cur.rowcount
                
                # Delete from raw.recipes
                cur.execute("""
                    DELETE FROM raw.recipes 
                    WHERE recognition_id = ANY(%s)
                """, (orphaned_ids,))
                recipes_deleted = cur.rowcount
                
                # Delete from raw.recognition_files
                cur.execute("""
                    DELETE FROM raw.recognition_files 
                    WHERE recognition_id = ANY(%s)
                """, (orphaned_ids,))
                files_deleted = cur.rowcount
                
                conn.commit()
                
                print()
                print(f"✅ Удалено:")
                print(f"   - recognition_files: {files_deleted}")
                print(f"   - recipes: {recipes_deleted}")
                print(f"   - qwen_annotations: {qwen_deleted}")
                print()
                print("🎉 Теперь можно безопасно повторить загрузку!")
                
        return 0
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return 1
    finally:
        db.close()

if __name__ == '__main__':
    production = '--production' in sys.argv
    if production:
        print("⚠️  PRODUCTION MODE")
        confirm = input("Введите 'CONFIRM' для удаления зависших записей: ")
        if confirm != 'CONFIRM':
            print("Отменено")
            sys.exit(1)
        print()
    
    sys.exit(clean_orphaned_raw(production=production))



