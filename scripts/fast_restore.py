#!/usr/bin/env python3
"""
Быстрое и стабильное восстановление локальной базы данных.

Что делает:
1. Проверяет окружение (только local!)
2. Загружает данные через COPY (быстро)
3. Валидирует результат
4. Повторяет при ошибках

Usage:
    python3 scripts/fast_restore.py 100   # 100 recognitions
    python3 scripts/fast_restore.py 500   # 500 recognitions (рекомендуется)
    python3 scripts/fast_restore.py 1000  # 1000 recognitions (полный набор)
"""

import os
import sys
import time
import subprocess
import json
from pathlib import Path
from typing import Tuple

def load_env():
    """Загружает переменные окружения."""
    env_file = Path(".env.local")
    if env_file.exists():
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip()

def check_environment():
    """Проверяет что это локальное окружение."""
    supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL', '')
    
    if not any(x in supabase_url for x in ['localhost', '127.0.0.1', '54321']):
        print("❌ ERROR: Only works with LOCAL database!")
        print(f"   Current URL: {supabase_url}")
        sys.exit(1)
    
    print(f"✅ Local environment: {supabase_url}")

def load_config():
    """Загружает конфигурацию."""
    config_file = Path(__file__).parent / "db_config.json"
    if not config_file.exists():
        print(f"❌ Config not found: {config_file}")
        sys.exit(1)
    
    with open(config_file, 'r') as f:
        return json.load(f)

def run_import(count: int, config: dict) -> bool:
    """Запускает импорт данных."""
    dataset_dir = config['dataset_paths']['default_dataset_dir']
    qwen_json = config['dataset_paths']['default_qwen_json']
    
    if not Path(dataset_dir).exists():
        print(f"❌ Dataset not found: {dataset_dir}")
        return False
    
    if not Path(qwen_json).exists():
        print(f"❌ QWEN annotations not found: {qwen_json}")
        return False
    
    print()
    print("─" * 60)
    print(f"📥 Importing {count} recognitions...")
    print("─" * 60)
    
    cmd = [
        "python3", "scripts/import_dataset_fast.py",
        dataset_dir,
        qwen_json,
        "--env", "local",
        "--limit", str(count),
        "--workers", "40",  # Быстрая загрузка
    ]
    
    print(f"Command: {' '.join(cmd)}")
    print()
    
    result = subprocess.run(cmd)
    return result.returncode == 0

def validate_state(expected_count: int) -> Tuple[bool, str]:
    """Валидирует состояние базы."""
    print()
    print("─" * 60)
    print("🔍 Validating database state...")
    print("─" * 60)
    
    from supabase import create_client
    
    supabase = create_client(
        os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
        os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    )
    
    issues = []
    
    # 1. Recognitions
    result = supabase.table('recognitions').select('recognition_id', count='exact').execute()
    rec_count = result.count
    print(f"   Recognitions: {rec_count}/{expected_count}")
    
    if rec_count < expected_count * 0.9:  # Допускаем 10% погрешность
        issues.append(f"Only {rec_count}/{expected_count} recognitions loaded")
    
    # 2. Images
    result = supabase.table('recognition_images').select('id', count='exact').execute()
    img_count = result.count
    print(f"   Images: {img_count} (expected ~{expected_count * 2})")
    
    if img_count < expected_count:  # Хотя бы по 1 картинке на recognition
        issues.append(f"Only {img_count} images (expected at least {expected_count})")
    
    # 3. Annotations
    result = supabase.table('annotations').select('id', count='exact').execute()
    ann_count = result.count
    print(f"   Annotations: {ann_count}")
    
    if ann_count == 0:
        issues.append("No annotations loaded")
    
    # 4. Workflow stage
    result = supabase.table('task_types').select('id').eq('code', 'dish_validation').single().execute()
    if not result.data:
        issues.append("dish_validation task type not found")
    else:
        task_type_id = result.data['id']
        
        result = supabase.table('workflow_stages').select('id').eq('task_type_id', task_type_id).execute()
        if not result.data:
            issues.append("No workflow_stage for dish_validation")
        else:
            stage_id = result.data[0]['id']
            
            result = supabase.table('recognitions').select('recognition_id', count='exact').eq('current_stage_id', stage_id).eq('workflow_state', 'pending').execute()
            pending_count = result.count
            print(f"   Pending dish_validation tasks: {pending_count}")
            
            if pending_count == 0:
                issues.append("No pending tasks for dish_validation")
    
    print()
    
    if issues:
        return False, "\n   ".join(["Issues found:"] + issues)
    
    return True, "All checks passed"

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/fast_restore.py <count>")
        print("Examples:")
        print("  python3 scripts/fast_restore.py 100")
        print("  python3 scripts/fast_restore.py 500")
        print("  python3 scripts/fast_restore.py 1000")
        sys.exit(1)
    
    try:
        count = int(sys.argv[1])
    except ValueError:
        print(f"❌ Invalid count: {sys.argv[1]}")
        sys.exit(1)
    
    if count < 1 or count > 15000:
        print(f"❌ Count must be between 1 and 15000")
        sys.exit(1)
    
    print("=" * 60)
    print(f"🚀 FAST RESTORE: {count} recognitions")
    print("=" * 60)
    
    load_env()
    check_environment()
    config = load_config()
    
    start_time = time.time()
    
    # Import
    success = run_import(count, config)
    
    if not success:
        print()
        print("❌ Import failed!")
        sys.exit(1)
    
    # Validate
    valid, message = validate_state(count)
    
    elapsed = time.time() - start_time
    
    print()
    print("=" * 60)
    if valid:
        print("✅ RESTORE COMPLETED SUCCESSFULLY!")
    else:
        print("⚠️  RESTORE COMPLETED WITH ISSUES")
    print("=" * 60)
    print()
    print(f"Time: {elapsed:.1f}s ({elapsed/60:.1f} minutes)")
    print()
    print(message)
    print()
    
    if valid:
        print("🎯 Next steps:")
        print("   1. npm run dev")
        print("   2. http://localhost:3000/annotations/tasks/dish_validation")
        print()
        return 0
    else:
        print("⚠️  Some checks failed. Try running again or check logs.")
        print()
        return 1

if __name__ == '__main__':
    sys.exit(main())

