#!/usr/bin/env python3
"""
Проверка целостности данных в продакшене.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.ingest.config import IngestConfig
from scripts.ingest.database import DatabaseManager

def check_integrity(production=False):
    """Проверка целостности данных."""
    env_name = "PRODUCTION" if production else "STAGING"
    print(f"🔍 Проверка целостности данных ({env_name})")
    print()
    
    config = IngestConfig.from_env(use_production=production)
    db = DatabaseManager(config)
    
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # 1. Проверяем raw vs domain
                print("📊 Сравнение raw и domain слоёв:")
                cur.execute("SELECT COUNT(*) FROM raw.recognition_files")
                raw_count = cur.fetchone()[0]
                
                cur.execute("SELECT COUNT(*) FROM recognitions")
                domain_count = cur.fetchone()[0]
                
                print(f"   raw.recognition_files: {raw_count:,}")
                print(f"   domain.recognitions:   {domain_count:,}")
                
                if raw_count != domain_count:
                    print(f"   ⚠️  НЕСООТВЕТСТВИЕ: {raw_count - domain_count} записей не трансформированы!")
                else:
                    print(f"   ✅ Все записи трансформированы")
                print()
                
                # 2. Проверяем изображения
                print("🖼️  Проверка изображений:")
                cur.execute("SELECT COUNT(*) FROM images")
                images_count = cur.fetchone()[0]
                expected_images = domain_count * 2
                
                print(f"   Изображений в БД: {images_count:,}")
                print(f"   Ожидается (2 на recognition): {expected_images:,}")
                
                if images_count != expected_images:
                    print(f"   ⚠️  Недостаёт: {expected_images - images_count} изображений")
                else:
                    print(f"   ✅ Все изображения на месте")
                print()
                
                # 3. Проверяем рецепты
                print("📋 Проверка рецептов:")
                cur.execute("SELECT COUNT(*) FROM raw.recipes")
                raw_recipes = cur.fetchone()[0]
                
                cur.execute("SELECT COUNT(*) FROM recipes")
                domain_recipes = cur.fetchone()[0]
                
                print(f"   raw.recipes:     {raw_recipes:,}")
                print(f"   domain.recipes:  {domain_recipes:,}")
                
                if raw_recipes != domain_recipes:
                    print(f"   ⚠️  НЕСООТВЕТСТВИЕ: {raw_recipes - domain_recipes} рецептов не трансформированы!")
                else:
                    print(f"   ✅ Все рецепты трансформированы")
                print()
                
                # 4. Проверяем Qwen аннотации
                print("🤖 Проверка Qwen аннотаций:")
                cur.execute("SELECT COUNT(*) FROM raw.qwen_annotations")
                qwen_count = cur.fetchone()[0]
                
                cur.execute("SELECT COUNT(DISTINCT recognition_id) FROM raw.qwen_annotations")
                qwen_recognitions = cur.fetchone()[0]
                
                print(f"   Всего аннотаций: {qwen_count:,}")
                print(f"   Для распознаваний: {qwen_recognitions:,} из {domain_count:,}")
                
                coverage = (qwen_recognitions / domain_count * 100) if domain_count > 0 else 0
                print(f"   Покрытие: {coverage:.1f}%")
                print()
                
                # 5. Проверяем active_menu
                print("📱 Проверка active_menu:")
                cur.execute("""
                    SELECT COUNT(*) 
                    FROM raw.recognition_files 
                    WHERE active_menu IS NOT NULL
                """)
                has_menu = cur.fetchone()[0]
                
                cur.execute("SELECT COUNT(DISTINCT recognition_id) FROM recognition_active_menu_items")
                menu_items_recognitions = cur.fetchone()[0]
                
                print(f"   С active_menu в raw: {has_menu:,}")
                print(f"   Трансформировано в domain: {menu_items_recognitions:,}")
                
                if has_menu != menu_items_recognitions:
                    diff = has_menu - menu_items_recognitions
                    print(f"   ⚠️  НЕ ТРАНСФОРМИРОВАНО: {diff} распознаваний с active_menu!")
                    
                    # Находим какие именно
                    cur.execute("""
                        SELECT rf.recognition_id
                        FROM raw.recognition_files rf
                        WHERE rf.active_menu IS NOT NULL
                          AND NOT EXISTS (
                            SELECT 1 FROM recognition_active_menu_items m
                            WHERE m.recognition_id = rf.recognition_id
                          )
                        ORDER BY rf.recognition_id
                        LIMIT 10
                    """)
                    missing_ids = [row[0] for row in cur.fetchall()]
                    print(f"   Примеры ID без menu_items: {missing_ids}")
                else:
                    print(f"   ✅ Все active_menu трансформированы")
                print()
                
                # 6. Проверяем пробелы в ID
                print("🔢 Проверка пробелов в ID:")
                cur.execute("""
                    SELECT MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as count
                    FROM recognitions
                """)
                min_id, max_id, count = cur.fetchone()
                expected_count = max_id - min_id + 1
                
                print(f"   Диапазон ID: {min_id:,} - {max_id:,}")
                print(f"   Ожидается записей: {expected_count:,}")
                print(f"   Фактически: {count:,}")
                
                if expected_count != count:
                    gaps = expected_count - count
                    print(f"   ⚠️  ПРОБЕЛЫ: {gaps} ID отсутствует")
                else:
                    print(f"   ✅ Нет пробелов в ID")
                
        return 0
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        db.close()

if __name__ == '__main__':
    production = '--production' in sys.argv
    sys.exit(check_integrity(production=production))

