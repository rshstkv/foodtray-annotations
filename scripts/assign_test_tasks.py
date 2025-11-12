#!/usr/bin/env python3
"""
Назначить тестовые задачи для recognitions
"""
import os
import sys
from pathlib import Path
from supabase import create_client

def main():
    # Load .env.local
    env_path = Path(__file__).parent.parent / '.env.local'
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key_raw, val = line.strip().split('=', 1)
                    key_clean = key_raw.strip()
                    val_clean = val.strip().strip('"').strip("'")
                    os.environ[key_clean] = val_clean
    
    # Получить Supabase credentials
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not key:
        print("❌ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    
    supabase = create_client(url, key)
    
    # Получить первого пользователя (админа)
    users = supabase.table("profiles").select("id, email").limit(1).execute()
    
    if not users.data:
        print("❌ No users found. Create admin first:")
        print("   node scripts/create_admin.mjs")
        sys.exit(1)
    
    user_id = users.data[0]["id"]
    user_email = users.data[0]["email"]
    
    print(f"✓ Found user: {user_email}")
    
    # Получить recognitions без задач
    recognitions = supabase.table("recognitions")\
        .select("recognition_id")\
        .limit(50)\
        .execute()
    
    if not recognitions.data:
        print("❌ No recognitions found. Run import first.")
        sys.exit(1)
    
    print(f"✓ Found {len(recognitions.data)} recognitions")
    
    # Создать задачи
    tasks = []
    for i, rec in enumerate(recognitions.data):
        priority = 1 if i < 20 else (2 if i < 35 else 3)
        
        tasks.append({
            "recognition_id": rec["recognition_id"],
            "assigned_to": user_id,
            "priority": priority,
            "task_scope": {
                "steps": [
                    {
                        "id": "validate_dishes",
                        "name": "Проверка блюд",
                        "type": "validation",
                        "required": True,
                        "allow_drawing": True,
                        "checks": ["dish_count_matches_receipt"]
                    },
                    {
                        "id": "validate_buzzers",
                        "name": "Проверка buzzers",
                        "type": "validation",
                        "required": True,
                        "allow_drawing": True,
                        "checks": ["buzzer_present"]
                    },
                    {
                        "id": "validate_plates",
                        "name": "Проверка тарелок",
                        "type": "validation",
                        "required": False,
                        "allow_drawing": True,
                        "checks": []
                    }
                ]
            },
            "progress": {
                "current_step_index": 0,
                "steps": [
                    {"id": "validate_dishes", "status": "pending"},
                    {"id": "validate_buzzers", "status": "pending"},
                    {"id": "validate_plates", "status": "pending"}
                ]
            },
            "status": "pending"
        })
    
    result = supabase.table("tasks").insert(tasks).execute()
    
    print(f"✅ Created {len(result.data)} tasks for {user_email}")
    print(f"   Priority 1 (quick): {sum(1 for t in tasks if t['priority'] == 1)}")
    print(f"   Priority 2 (medium): {sum(1 for t in tasks if t['priority'] == 2)}")
    print(f"   Priority 3 (heavy): {sum(1 for t in tasks if t['priority'] == 3)}")

if __name__ == "__main__":
    main()

