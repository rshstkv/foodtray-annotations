import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')

supabase = create_client(
    os.environ.get('NEXT_PUBLIC_SUPABASE_URL'),
    os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
)

# Try different FK names
user_id = 'c9fdae31-7e25-4c82-97e6-cce0bd11bbdd'

attempts = [
    'tasks_assigned_to_fkey',
    'assigned_to_fkey',
    'tasks_assigned_to_profiles_fkey',
    'fk_tasks_assigned_to',
    # Or just use column name
    None  # Will try without hint
]

for fk_name in attempts:
    try:
        if fk_name:
            query = f"assigned_user:profiles!{fk_name}(id, email)"
        else:
            query = "assigned_user:profiles(id, email)"
        
        result = supabase.table('tasks').select(f'id, {query}').eq('assigned_to', user_id).limit(1).execute()
        print(f"✅ FK '{fk_name or 'auto'}' works! Found {len(result.data)} tasks")
        if result.data:
            print(f"   Data: {result.data[0]}")
        break
    except Exception as e:
        print(f"❌ FK '{fk_name or 'auto'}' failed: {str(e)[:100]}")

