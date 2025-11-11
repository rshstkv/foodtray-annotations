#!/usr/bin/env python3
"""Пересчитать validation_mode для всех recognitions"""

import os
from supabase import create_client

# Load env
from dotenv import load_dotenv
load_dotenv('.env.local')

url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

client = create_client(url, key)

# Получить все pending recognitions
response = client.table('recognitions').select('recognition_id').eq('workflow_state', 'pending').execute()

print(f"Found {len(response.data)} pending recognitions")

# Пересчитать validation_mode для каждого
for rec in response.data:
    rec_id = rec['recognition_id']
    
    # Вызвать функцию
    try:
        result = client.rpc('calculate_validation_mode', {'p_recognition_id': rec_id}).execute()
        new_mode = result.data if isinstance(result.data, str) else result.data[0]
    except Exception as e:
        print(f"  {rec_id}: ERROR - {e}")
        continue
    
    # Обновить
    client.table('recognitions').update({'validation_mode': new_mode}).eq('recognition_id', rec_id).execute()
    print(f"  {rec_id}: {new_mode}")

# Показать статистику
stats = client.table('recognitions').select('validation_mode').eq('workflow_state', 'pending').execute()

quick_count = sum(1 for r in stats.data if r['validation_mode'] == 'quick')
edit_count = sum(1 for r in stats.data if r['validation_mode'] == 'edit')

print(f"\nРезультат:")
print(f"  quick: {quick_count}")
print(f"  edit: {edit_count}")

