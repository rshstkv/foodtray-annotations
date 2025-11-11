#!/usr/bin/env python3
"""
Валидация состояния базы данных после восстановления.

Проверяет:
- Количество recognitions
- Наличие images для каждого recognition
- Наличие annotations
- Наличие menu_all данных
- Картинки в Storage
- Готовность для dish_validation workflow
"""

import os
import sys
from pathlib import Path
from supabase import create_client

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

def main():
    load_env()
    
    supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    supabase_key = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    
    if not supabase_url or not supabase_key:
        print("❌ Missing Supabase credentials in .env.local")
        sys.exit(1)
    
    supabase = create_client(supabase_url, supabase_key)
    
    print("=" * 70)
    print("🔍 VALIDATING DATABASE STATE")
    print("=" * 70)
    print()
    
    # 1. Recognitions
    print("📊 1. Checking recognitions...")
    result = supabase.table('recognitions').select('recognition_id, workflow_state, current_stage_id').execute()
    recognitions = result.data
    print(f"   ✅ Total recognitions: {len(recognitions)}")
    
    if len(recognitions) == 0:
        print("   ❌ No recognitions found! Database is empty.")
        sys.exit(1)
    
    # Группировка по workflow_state
    states = {}
    for r in recognitions:
        state = r.get('workflow_state', 'unknown')
        states[state] = states.get(state, 0) + 1
    
    print("   Workflow states:")
    for state, count in sorted(states.items()):
        print(f"     - {state}: {count}")
    
    print()
    
    # 2. Task Types & Workflow Stages
    print("📋 2. Checking workflow configuration...")
    result = supabase.table('task_types').select('*').eq('is_active', True).execute()
    task_types = result.data
    print(f"   ✅ Active task types: {len(task_types)}")
    
    dish_validation = None
    for tt in task_types:
        print(f"     - {tt['code']}: {tt['name']}")
        if tt['code'] == 'dish_validation':
            dish_validation = tt
    
    if not dish_validation:
        print("   ❌ dish_validation task type not found!")
        sys.exit(1)
    
    print()
    print(f"   ✅ dish_validation found (id: {dish_validation['id']})")
    
    # Проверяем workflow_stage
    result = supabase.table('workflow_stages').select('*').eq('task_type_id', dish_validation['id']).execute()
    stages = result.data
    
    if not stages:
        print("   ❌ No workflow_stage found for dish_validation!")
        sys.exit(1)
    
    stage = stages[0]
    print(f"   ✅ Workflow stage: {stage['name']} (id: {stage['id']})")
    print()
    
    # 3. Recognitions для dish_validation
    print("📝 3. Checking recognitions for dish_validation...")
    result = supabase.table('recognitions').select('recognition_id').eq('current_stage_id', stage['id']).eq('workflow_state', 'pending').execute()
    dv_recognitions = result.data
    
    print(f"   ✅ Pending recognitions for dish_validation: {len(dv_recognitions)}")
    
    if len(dv_recognitions) == 0:
        print("   ⚠️  No pending tasks for dish_validation!")
        print("      This might be expected if all recognitions are at different stages")
    
    print()
    
    # 4. Images
    print("🖼️  4. Checking images...")
    result = supabase.table('recognition_images').select('id, recognition_id, photo_type').execute()
    images = result.data
    print(f"   ✅ Total images: {len(images)}")
    
    # Проверяем coverage
    rec_with_images = len(set(img['recognition_id'] for img in images))
    print(f"   Coverage: {rec_with_images}/{len(recognitions)} recognitions have images")
    
    if rec_with_images < len(recognitions):
        print(f"   ⚠️  {len(recognitions) - rec_with_images} recognitions missing images!")
    
    print()
    
    # 5. Annotations
    print("📐 5. Checking annotations...")
    result = supabase.table('annotations').select('id, image_id, dish_index').execute()
    annotations = result.data
    print(f"   ✅ Total annotations: {len(annotations)}")
    
    # Проверяем coverage
    imgs_with_annotations = len(set(ann['image_id'] for ann in annotations))
    print(f"   Coverage: {imgs_with_annotations}/{len(images)} images have annotations")
    
    if imgs_with_annotations < len(images):
        print(f"   ⚠️  {len(images) - imgs_with_annotations} images missing annotations!")
    
    print()
    
    # 6. Menu data
    print("📜 6. Checking menu_all data...")
    result = supabase.table('recognitions').select('recognition_id, menu_all').not_.is_('menu_all', 'null').execute()
    recs_with_menu = result.data
    print(f"   ✅ Recognitions with menu_all: {len(recs_with_menu)}/{len(recognitions)}")
    
    if len(recs_with_menu) < len(recognitions):
        print(f"   ⚠️  {len(recognitions) - len(recs_with_menu)} recognitions missing menu_all!")
    
    print()
    
    # 7. Storage (sample check)
    print("💾 7. Checking Storage...")
    try:
        # Берем первый recognition с images
        sample_rec = recognitions[0]['recognition_id']
        result = supabase.table('recognition_images').select('storage_path').eq('recognition_id', sample_rec).limit(1).execute()
        
        if result.data and result.data[0].get('storage_path'):
            storage_path = result.data[0]['storage_path']
            
            # Проверяем существование файла
            try:
                bucket_name = storage_path.split('/')[0] if '/' in storage_path else 'bbox-images'
                file_path = storage_path.split('/', 1)[1] if '/' in storage_path else storage_path
                
                files = supabase.storage.from_(bucket_name).list(file_path.rsplit('/', 1)[0] if '/' in file_path else '')
                
                if files:
                    print(f"   ✅ Storage accessible (bucket: {bucket_name})")
                    print(f"   Sample path: {storage_path}")
                else:
                    print(f"   ⚠️  Storage bucket empty or inaccessible")
            except Exception as e:
                print(f"   ⚠️  Could not verify storage: {str(e)}")
        else:
            print("   ⚠️  No storage_path found in sample image")
    except Exception as e:
        print(f"   ⚠️  Storage check failed: {str(e)}")
    
    print()
    
    # Summary
    print("=" * 70)
    print("✅ VALIDATION SUMMARY")
    print("=" * 70)
    print()
    
    if len(recognitions) > 0 and len(dv_recognitions) > 0 and len(images) > 0 and len(annotations) > 0:
        print("✅ Database is ready for dish_validation workflow!")
        print()
        print(f"   - {len(recognitions)} recognitions loaded")
        print(f"   - {len(dv_recognitions)} pending tasks for dish_validation")
        print(f"   - {len(images)} images available")
        print(f"   - {len(annotations)} annotations ready")
        print()
        print("🎯 Next steps:")
        print("   1. Start dev server: npm run dev")
        print("   2. Open: http://localhost:3000/annotations/tasks/dish_validation")
        print()
        return 0
    else:
        print("⚠️  Database has issues:")
        if len(recognitions) == 0:
            print("   ❌ No recognitions")
        if len(dv_recognitions) == 0:
            print("   ⚠️  No pending dish_validation tasks")
        if len(images) == 0:
            print("   ❌ No images")
        if len(annotations) == 0:
            print("   ❌ No annotations")
        print()
        print("Run: python3 scripts/quick_restore.py --count 1000")
        print()
        return 1

if __name__ == '__main__':
    sys.exit(main())

