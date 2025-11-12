import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')

supabase = create_client(
    os.environ.get('NEXT_PUBLIC_SUPABASE_URL'),
    os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
)

user_id = 'c9fdae31-7e25-4c82-97e6-cce0bd11bbdd'

# Simulate API query
query_result = supabase.table('tasks').select('''
    *,
    recognition:recognitions(recognition_id, recognition_date, correct_dishes, menu_all)
''').eq('assigned_to', user_id).order('created_at', desc=True).limit(3).execute()

print(f"✅ Query successful!")
print(f"📊 Returned {len(query_result.data)} tasks")

if query_result.data:
    task = query_result.data[0]
    print(f"\n📦 Sample task keys: {list(task.keys())}")
    print(f"   ID: {task['id'][:16]}...")
    print(f"   Recognition: {task.get('recognition', {}).get('recognition_id') if task.get('recognition') else None}")
    print(f"   Status: {task['status']}")
    print(f"   Scopes: {task.get('scopes')}")

