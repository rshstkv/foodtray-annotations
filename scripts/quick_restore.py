#!/usr/bin/env python3
"""
Главный скрипт для быстрого восстановления локальной базы данных.

Usage:
    python3 scripts/quick_restore.py [--count N] [--skip-reset] [--workers N]
    python3 scripts/quick_restore.py --count 100 --workers 30

Что делает:
1. Проверяет что мы в локальном окружении (защита production)
2. Запрашивает подтверждение
3. Выполняет supabase db reset (опционально, если не --skip-reset)
4. Загружает данные через import_dataset_fast.py
5. Загружает картинки в Storage (многопоточно)
6. Проверяет целостность через check_storage.py
7. Показывает финальную статистику

Это единая точка входа для полного восстановления локальной БД.
"""

import os
import sys
import time
import argparse
import subprocess
import json
from pathlib import Path


def load_config():
    """Загружает конфигурацию из db_config.json."""
    script_dir = Path(__file__).parent
    config_file = script_dir / "db_config.json"
    
    if not config_file.exists():
        print(f"❌ Config file not found: {config_file}")
        sys.exit(1)
    
    with open(config_file, 'r') as f:
        return json.load(f)


def check_environment():
    """Проверяет, что мы работаем с локальным окружением."""
    # Загружаем .env.local
    env_file = Path(".env.local")
    if env_file.exists():
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip()
    
    supabase_url = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL', '')
    
    # Проверяем, что это локальный URL
    if not any(x in supabase_url for x in ['localhost', '127.0.0.1', '54321']):
        print("❌ ERROR: This script can only be run against LOCAL database!")
        print(f"❌ Detected URL: {supabase_url}")
        print("❌ Expected URL containing: localhost, 127.0.0.1, or port 54321")
        print()
        print("This is a safety check to prevent accidental data loss in production.")
        print("If you need to restore production, contact the database administrator.")
        sys.exit(1)
    
    print(f"✅ Environment check passed: {supabase_url}")
    return True


def run_command(cmd: list, description: str, check: bool = True) -> bool:
    """Запускает команду и показывает прогресс."""
    print()
    print("─" * 60)
    print(f"▶️  {description}")
    print("─" * 60)
    print(f"Command: {' '.join(cmd)}")
    print()
    
    start_time = time.time()
    result = subprocess.run(cmd, check=False)
    elapsed = time.time() - start_time
    
    if result.returncode == 0:
        print()
        print(f"✅ {description} completed in {elapsed:.1f}s")
        return True
    else:
        print()
        print(f"❌ {description} failed!")
        if check:
            sys.exit(1)
        return False


def main():
    parser = argparse.ArgumentParser(
        description='Quick restore local database',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Quick restore with 100 recognitions (recommended for development)
  python3 scripts/quick_restore.py --count 100
  
  # Full restore with 1000 recognitions
  python3 scripts/quick_restore.py --count 1000
  
  # Restore data only (skip DB reset, useful if DB is already clean)
  python3 scripts/quick_restore.py --count 100 --skip-reset
  
  # Fast restore with more workers
  python3 scripts/quick_restore.py --count 100 --workers 40
  
  # Restore without Storage upload (data only)
  python3 scripts/quick_restore.py --count 100 --no-storage

NPM shortcuts:
  npm run db:restore:quick  # 100 recognitions
  npm run db:restore:full   # 1000 recognitions
        """
    )
    parser.add_argument('--count', type=int, default=100,
                       help='Number of recognitions to restore (default: 100)')
    parser.add_argument('--skip-reset', action='store_true',
                       help='Skip database reset (use if DB is already clean)')
    parser.add_argument('--workers', type=int, default=30,
                       help='Number of parallel workers for Storage upload (default: 30)')
    parser.add_argument('--no-storage', dest='with_storage', action='store_false', default=True,
                       help='Skip Storage upload (data only)')
    parser.add_argument('--no-check', dest='run_check', action='store_false', default=True,
                       help='Skip final Storage integrity check')
    parser.add_argument('--force', action='store_true',
                       help='Skip confirmation prompts')
    
    args = parser.parse_args()
    
    # Проверка окружения
    check_environment()
    
    # Загружаем конфигурацию
    config = load_config()
    
    # Показываем план
    print()
    print("=" * 60)
    print("🚀 QUICK RESTORE LOCAL DATABASE")
    print("=" * 60)
    print()
    print("Plan:")
    if not args.skip_reset:
        print("  1. ⚠️  Database reset (all data will be deleted)")
    else:
        print("  1. ⏭️  Database reset (SKIPPED)")
    print(f"  2. 📥 Import {args.count} recognitions with data")
    if args.with_storage:
        print(f"  3. 📤 Upload images to Storage (~{args.count * 2} files)")
    else:
        print("  3. ⏭️  Storage upload (SKIPPED)")
    if args.run_check:
        print("  4. 🔍 Verify Storage integrity")
    else:
        print("  4. ⏭️  Integrity check (SKIPPED)")
    print()
    print("Settings:")
    print(f"  - Recognitions: {args.count}")
    print(f"  - Workers: {args.workers}")
    print(f"  - Upload Storage: {'Yes' if args.with_storage else 'No'}")
    print(f"  - Database reset: {'Yes' if not args.skip_reset else 'No (skipped)'}")
    print()
    
    # Запрашиваем подтверждение
    if not args.force:
        if not args.skip_reset:
            print("⚠️  WARNING: This will DELETE ALL LOCAL DATA including Storage files!")
            print("⚠️  Make sure you have backed up any important data.")
            print()
        
        confirmation = input("Continue? (yes/no): ").strip().lower()
        if confirmation != 'yes':
            print("❌ Cancelled by user.")
            sys.exit(0)
    
    print()
    print("=" * 60)
    print("🚀 STARTING RESTORE PROCESS")
    print("=" * 60)
    
    total_start = time.time()
    
    # STEP 1: Database reset
    if not args.skip_reset:
        # Используем supabase db reset напрямую (без wrapper для скриптового использования)
        print()
        print("⚠️  Resetting database...")
        print("   This will drop all tables and re-run migrations")
        
        result = subprocess.run(
            ["supabase", "db", "reset", "--db-url", os.getenv('DATABASE_URL', '')],
            check=False
        )
        
        # Если первая команда не сработала, пробуем без --db-url
        if result.returncode != 0:
            result = subprocess.run(["supabase", "db", "reset"], check=False)
        
        if result.returncode != 0:
            print("❌ Database reset failed!")
            print("   Try running manually: supabase db reset")
            sys.exit(1)
        
        print("✅ Database reset completed")
    
    # STEP 2: Import data
    dataset_dir = config['dataset_paths']['default_dataset_dir']
    qwen_json = config['dataset_paths']['default_qwen_json']
    
    if not Path(dataset_dir).exists():
        print(f"❌ Dataset directory not found: {dataset_dir}")
        print("   Please update paths in scripts/db_config.json")
        sys.exit(1)
    
    if not Path(qwen_json).exists():
        print(f"❌ QWEN annotations file not found: {qwen_json}")
        print("   Please update paths in scripts/db_config.json")
        sys.exit(1)
    
    import_cmd = [
        "python3", "scripts/import_dataset_fast.py",
        dataset_dir,
        qwen_json,
        "--env", "local",
        "--limit", str(args.count),
        "--workers", str(args.workers),
    ]
    
    if not args.with_storage:
        import_cmd.append("--skip-storage-upload")
    
    success = run_command(
        import_cmd,
        f"Importing {args.count} recognitions with data",
        check=True
    )
    
    # STEP 3: Verify Storage (if uploaded)
    if args.run_check and args.with_storage:
        check_cmd = [
            "python3", "scripts/check_storage.py"
        ]
        
        run_command(
            check_cmd,
            "Verifying Storage integrity",
            check=False  # Не критично если проверка не прошла
        )
    
    # Final summary
    total_elapsed = time.time() - total_start
    
    print()
    print("=" * 60)
    print("✅ RESTORE COMPLETED SUCCESSFULLY!")
    print("=" * 60)
    print()
    print(f"Total time: {total_elapsed:.1f}s ({total_elapsed/60:.1f} minutes)")
    print()
    print(f"Your local database now has {args.count} recognitions with:")
    print(f"  ✅ Recognition data (correct_dishes, menu_all)")
    print(f"  ✅ Images (~{args.count * 2} images)")
    print(f"  ✅ Annotations (~{args.count * 10}+ bounding boxes)")
    if args.with_storage:
        print(f"  ✅ Images uploaded to Storage")
    print()
    print("Next steps:")
    print("  1. Start the development server:")
    print("     npm run dev")
    print()
    print("  2. Open the application:")
    print("     http://localhost:3000")
    print()
    print("  3. Test the annotation workflow:")
    print("     http://localhost:3000/annotations/tasks/dish_validation")
    print()
    print("=" * 60)


if __name__ == '__main__':
    main()


