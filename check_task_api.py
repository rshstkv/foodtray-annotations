import os
import requests
from dotenv import load_dotenv

load_dotenv('.env.local')

task_id = '7099a97f-807c-4272-83e0-c0dcd98098b8'

# Simulate API call (need admin cookie)
print(f"Checking task API for {task_id[:8]}...")
print(f"URL: http://localhost:3000/api/tasks/{task_id}")
print("\n⚠️  Need to check via browser network tab or fix data in DB")
print("\nChecking DB directly:")

from supabase import create_client

supabase = create_client(
    os.environ.get('NEXT_PUBLIC_SUPABASE_URL'),
    os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
)

task = supabase.table('tasks').select('*').eq('id', task_id).single().execute()
print(f"\n✅ Task found:")
print(f"   Status: {task.data['status']}")
print(f"   task_scope: {task.data.get('task_scope')}")
print(f"   progress: {task.data.get('progress')}")
print(f"   recognition_id: {task.data['recognition_id']}")

# Check recognition
rec = supabase.table('recognitions').select('*').eq('recognition_id', task.data['recognition_id']).single().execute()
print(f"\n📦 Recognition:")
print(f"   correct_dishes type: {type(rec.data.get('correct_dishes'))}, len: {len(rec.data.get('correct_dishes', []))}")
print(f"   menu_all type: {type(rec.data.get('menu_all'))}, has data: {bool(rec.data.get('menu_all'))}")

# Check images
images = supabase.table('images').select('*').eq('recognition_id', task.data['recognition_id']).execute()
print(f"\n🖼️  Images: {len(images.data)} found")

