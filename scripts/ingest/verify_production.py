#!/usr/bin/env python3
"""
Проверка корректности данных в production
"""

import sys
from pathlib import Path
from collections import defaultdict

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from ingest.config import IngestConfig
from ingest.database import DatabaseManager
from ingest.logger import get_logger


def verify_production_data():
    """Проверяет корректность загруженных данных на production"""
    logger = get_logger()
    config = IngestConfig.from_env(use_production=True)
    db = DatabaseManager(config)
    
    print("=" * 70)
    print("ПРОВЕРКА ДАННЫХ В PRODUCTION")
    print("=" * 70)
    print()
    
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            # 1. Проверка на дубликаты в raw слое
            print("📊 1. ПРОВЕРКА ДУБЛЕЙ В RAW СЛОЕ")
            print("-" * 70)
            
            cur.execute("""
                SELECT 
                    COUNT(*) as total,
                    COUNT(DISTINCT recognition_id) as unique_count
                FROM raw.recognition_files
            """)
            total, unique = cur.fetchone()
            duplicates = total - unique
            
            if duplicates == 0:
                print(f"✅ raw.recognition_files: {total} записей, дублей НЕТ")
            else:
                print(f"❌ raw.recognition_files: {total} записей, НАЙДЕНО {duplicates} ДУБЛЕЙ!")
            
            cur.execute("""
                SELECT 
                    COUNT(*) as total,
                    COUNT(DISTINCT recognition_id) as unique_count
                FROM raw.recipes
            """)
            total, unique = cur.fetchone()
            duplicates = total - unique
            
            if duplicates == 0:
                print(f"✅ raw.recipes: {total} записей, дублей НЕТ")
            else:
                print(f"❌ raw.recipes: {total} записей, НАЙДЕНО {duplicates} ДУБЛЕЙ!")
            
            print()
            
            # 2. Проверка соответствия raw -> domain
            print("🔄 2. ПРОВЕРКА RAW -> DOMAIN ТРАНСФОРМАЦИИ")
            print("-" * 70)
            
            cur.execute("""
                SELECT 
                    (SELECT COUNT(*) FROM raw.recognition_files) as raw_recs,
                    (SELECT COUNT(*) FROM public.recognitions) as domain_recs,
                    (SELECT COUNT(*) FROM public.images) as images,
                    (SELECT COUNT(*) FROM public.recipes) as recipes,
                    (SELECT COUNT(*) FROM raw.qwen_annotations) as qwen_ann,
                    (SELECT COUNT(*) FROM public.initial_annotations) as initial_ann,
                    (SELECT COUNT(*) FROM public.initial_tray_items) as initial_items
            """)
            raw_recs, domain_recs, images, recipes, qwen_ann, initial_ann, initial_items = cur.fetchone()
            
            print(f"Raw слой:")
            print(f"  - recognition_files: {raw_recs}")
            print(f"  - qwen_annotations: {qwen_ann}")
            print()
            print(f"Domain слой:")
            print(f"  - recognitions: {domain_recs}")
            print(f"  - images: {images} (ожидается {raw_recs * 2})")
            print(f"  - recipes: {recipes}")
            print(f"  - initial_tray_items: {initial_items}")
            print(f"  - initial_annotations: {initial_ann}")
            print()
            
            # Проверяем что каждый recognition имеет 2 изображения
            expected_images = raw_recs * 2
            if images == expected_images:
                print(f"✅ Количество изображений корректно: {images} = {raw_recs} × 2")
            else:
                print(f"⚠️  Изображений {images}, ожидалось {expected_images}")
            print()
            
            # 3. Проверка на дубли аннотаций в domain слое
            print("🔍 3. ПРОВЕРКА ДУБЛЕЙ АННОТАЦИЙ")
            print("-" * 70)
            
            # Найдём recognitions с дублирующимися аннотациями
            cur.execute("""
                SELECT 
                    i.recognition_id,
                    i.camera_number,
                    COUNT(ia.id) as annotation_count
                FROM images i
                LEFT JOIN initial_annotations ia ON ia.image_id = i.id
                GROUP BY i.recognition_id, i.camera_number
                HAVING COUNT(ia.id) > 20
                ORDER BY annotation_count DESC
                LIMIT 5
            """)
            suspicious = cur.fetchall()
            
            if not suspicious:
                print("✅ Подозрительных дублей не найдено")
            else:
                print("⚠️  Найдены recognition с большим количеством аннотаций:")
                for rec_id, camera, count in suspicious:
                    print(f"   - Recognition #{rec_id}, camera{camera}: {count} аннотаций")
            print()
            
            # 4. Проверка случайных recognitions
            print("🎲 4. ДЕТАЛЬНАЯ ПРОВЕРКА СЛУЧАЙНЫХ RECOGNITIONS")
            print("-" * 70)
            
            cur.execute("""
                SELECT id
                FROM public.recognitions
                ORDER BY RANDOM()
                LIMIT 3
            """)
            sample_ids = [row[0] for row in cur.fetchall()]
            
            for rec_id in sample_ids:
                # Получаем информацию о recognition
                cur.execute("""
                    SELECT 
                        i.id as image_id,
                        i.camera_number,
                        COUNT(ia.id) as ann_count
                    FROM images i
                    LEFT JOIN initial_annotations ia ON ia.image_id = i.id
                    WHERE i.recognition_id = %s
                    GROUP BY i.id, i.camera_number
                    ORDER BY i.camera_number
                """, (rec_id,))
                images_data = cur.fetchall()
                
                print(f"\nRecognition #{rec_id}:")
                for img_id, camera, ann_count in images_data:
                    print(f"  camera{camera} (image_id={img_id}): {ann_count} аннотаций")
                
                # Получаем items
                cur.execute("""
                    SELECT COUNT(*)
                    FROM initial_tray_items
                    WHERE recognition_id = %s
                """, (rec_id,))
                items_count = cur.fetchone()[0]
                print(f"  initial_tray_items: {items_count}")
            
            print()
            
            # 5. Проверка constraint
            print("🔒 5. ПРОВЕРКА UNIQUE CONSTRAINTS")
            print("-" * 70)
            
            cur.execute("""
                SELECT constraint_name
                FROM information_schema.table_constraints
                WHERE table_schema = 'raw' 
                AND table_name = 'recognition_files'
                AND constraint_name = 'raw_recognition_files_recognition_id_unique'
            """)
            constraint = cur.fetchone()
            
            if constraint:
                print(f"✅ Constraint 'raw_recognition_files_recognition_id_unique' установлен")
                print("   Попытка вставки дубликата будет заблокирована")
            else:
                print(f"❌ Constraint НЕ установлен - возможны дубли!")
            
            print()
            
            # 6. Итоговая статистика
            print("=" * 70)
            print("📈 ИТОГОВАЯ СТАТИСТИКА")
            print("=" * 70)
            
            cur.execute("""
                SELECT 
                    (SELECT COUNT(*) FROM raw.recognition_files) as raw_recs,
                    (SELECT COUNT(*) FROM public.recognitions) as domain_recs,
                    (SELECT COUNT(*) FROM public.images) as images,
                    (SELECT COUNT(*) FROM public.recipes) as recipes,
                    (SELECT COUNT(*) FROM raw.qwen_annotations) as qwen_raw,
                    (SELECT COUNT(*) FROM public.initial_annotations) as qwen_domain,
                    (SELECT COUNT(*) FROM public.initial_tray_items) as items
            """)
            stats = cur.fetchone()
            
            print(f"""
Загружено данных:
  Recognitions: {stats[1]} (raw: {stats[0]})
  Images: {stats[2]}
  Recipes: {stats[3]}
  Qwen annotations: {stats[5]} (raw: {stats[4]})
  Initial tray items: {stats[6]}
""")
            
            # Проверка целостности
            issues = []
            if stats[0] != stats[1]:
                issues.append(f"raw.recognition_files ({stats[0]}) != recognitions ({stats[1]})")
            if stats[2] != stats[0] * 2:
                issues.append(f"images ({stats[2]}) != recognitions × 2 ({stats[0] * 2})")
            
            if issues:
                print("⚠️  ОБНАРУЖЕНЫ ПРОБЛЕМЫ:")
                for issue in issues:
                    print(f"   - {issue}")
            else:
                print("✅ Все проверки пройдены успешно!")
    
    db.close()


if __name__ == "__main__":
    verify_production_data()

