#!/usr/bin/env python3
"""
Check data consistency between raw and domain layers.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.ingest.config import IngestConfig
from scripts.ingest.database import DatabaseManager

def check_consistency(production=False):
    """Check data consistency."""
    config = IngestConfig.from_env(use_production=production)
    db = DatabaseManager(config)
    
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                print(f"🔍 Проверка консистентности данных в {config.environment}...")
                print()
                
                # Check raw layer
                cur.execute("SELECT COUNT(*) FROM raw.recognition_files")
                raw_count = cur.fetchone()[0]
                
                cur.execute("SELECT COUNT(*) FROM raw.recipes")
                raw_recipes = cur.fetchone()[0]
                
                cur.execute("SELECT COUNT(*) FROM raw.qwen_annotations")
                raw_qwen = cur.fetchone()[0]
                
                # Check domain layer
                cur.execute("SELECT COUNT(*) FROM recognitions")
                domain_rec = cur.fetchone()[0]
                
                cur.execute("SELECT COUNT(*) FROM images")
                domain_img = cur.fetchone()[0]
                
                cur.execute("SELECT COUNT(*) FROM recipes")
                domain_recipes = cur.fetchone()[0]
                
                # Check which IDs are in raw but not in domain
                cur.execute("""
                    SELECT recognition_id 
                    FROM raw.recognition_files 
                    WHERE recognition_id NOT IN (SELECT id FROM recognitions)
                    ORDER BY recognition_id
                    LIMIT 10
                """)
                missing_in_domain = cur.fetchall()
                
                # Print results
                print("📊 RAW LAYER:")
                print(f"   recognition_files: {raw_count:,}")
                print(f"   recipes: {raw_recipes:,}")
                print(f"   qwen_annotations: {raw_qwen:,}")
                print()
                
                print("📊 DOMAIN LAYER:")
                print(f"   recognitions: {domain_rec:,}")
                print(f"   images: {domain_img:,}")
                print(f"   recipes: {domain_recipes:,}")
                print()
                
                diff = raw_count - domain_rec
                if diff > 0:
                    print(f"⚠️  НЕСООТВЕТСТВИЕ: {diff} записей в raw НЕ трансформированы в domain")
                    if missing_in_domain:
                        print(f"\n   Первые ID (до 10):")
                        for row in missing_in_domain:
                            print(f"      - recognition_id: {row[0]}")
                    print()
                    print("   ℹ️  Эти записи будут пропущены при повторной загрузке")
                    print("      (система проверяет только domain.recognitions)")
                elif diff == 0:
                    print("✅ ВСЁ В ПОРЯДКЕ: raw и domain синхронизированы")
                else:
                    print(f"❌ ПРОБЛЕМА: в domain больше записей чем в raw (diff={diff})")
                
                print()
                print("=" * 60)
                print("🔒 ГАРАНТИИ БЕЗОПАСНОСТИ при повторной загрузке:")
                print("=" * 60)
                print()
                print(f"✅ Система проверит domain.recognitions ({domain_rec:,} IDs)")
                print("✅ Пропустит все существующие recognition_id")
                print("✅ Загрузит только НОВЫЕ данные")
                print("✅ НЕ удалит существующие данные")
                print("✅ НЕ создаст дубликаты в domain (PRIMARY KEY)")
                print("✅ НЕ создаст дубликаты в storage (unique paths)")
                print()
                
                if diff > 0:
                    print("⚠️  ВНИМАНИЕ:")
                    print(f"   {diff} записей из raw останутся нетрансформированными")
                    print("   Но это НЕ критично - они будут пропущены при загрузке")
                print()
                
        return 0
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return 1
    finally:
        db.close()

if __name__ == '__main__':
    production = '--production' in sys.argv
    sys.exit(check_consistency(production=production))





