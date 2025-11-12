import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')

supabase = create_client(
    os.environ.get('NEXT_PUBLIC_SUPABASE_URL'),
    os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
)

user_id = 'c9fdae31-7e25-4c82-97e6-cce0bd11bbdd'  # rshstkv@gmail.com

# Test simple query
print("1️⃣  Simple query:")
simple = supabase.table('tasks').select('*').eq('assigned_to', user_id).limit(2).execute()
print(f"   Found: {len(simple.data)} tasks")

# Test with recognition join
print("\n2️⃣  With recognition join:")
try:
    with_rec = supabase.table('tasks').select('''
        *,
        recognition:recognitions(recognition_id, recognition_date, correct_dishes)
    ''').eq('assigned_to', user_id).limit(2).execute()
    print(f"   Found: {len(with_rec.data)} tasks")
    if with_rec.data:
        print(f"   Has recognition: {with_rec.data[0].get('recognition') is not None}")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Test with profile join
print("\n3️⃣  With profile join:")
try:
    with_profile = supabase.table('tasks').select('''
        *,
        assigned_user:profiles!tasks_assigned_to_fkey(id, email, full_name)
    ''').eq('assigned_to', user_id).limit(2).execute()
    print(f"   Found: {len(with_profile.data)} tasks")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Test full query like API
print("\n4️⃣  Full query (like API):")
try:
    full = supabase.table('tasks').select('''
        *,
        recognition:recognitions(recognition_id, recognition_date, correct_dishes, menu_all),
        assigned_user:profiles!tasks_assigned_to_fkey(id, email, full_name)
    ''').eq('assigned_to', user_id).order('created_at', ascending=False).limit(2).execute()
    print(f"   Found: {len(full.data)} tasks")
    if full.data:
        task = full.data[0]
        print(f"   Keys: {list(task.keys())}")
        print(f"   Has recognition: {task.get('recognition') is not None}")
        print(f"   Has assigned_user: {task.get('assigned_user') is not None}")
except Exception as e:
    print(f"   ❌ Error: {e}")

