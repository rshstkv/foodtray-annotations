#!/usr/bin/env python3
"""
Загрузить изображения в storage для recognitions, которые уже есть в продакшн базе
Версия 2: проверяет какие файлы реально отсутствуют в storage
"""
import os
import sys
import time
from pathlib import Path
from tqdm import tqdm
from supabase import create_client

def main():
    # Параметры
    DEFAULT_DATASET = Path("/Users/romanshestakov/Downloads/RRS_Dataset 2")
    
    # Проверяем аргументы
    if len(sys.argv) < 2:
        if DEFAULT_DATASET.exists():
            print(f"Using default dataset path: {DEFAULT_DATASET}")
            dataset_dir = DEFAULT_DATASET
        else:
            print("Usage: python3 upload_missing_images_v2.py <dataset_dir> [--limit N]")
            print(f"Default dataset path not found: {DEFAULT_DATASET}")
            sys.exit(1)
    else:
        dataset_dir = Path(sys.argv[1])
    
    limit = None
    if '--limit' in sys.argv:
        idx = sys.argv.index('--limit')
        if idx + 1 < len(sys.argv):
            limit = int(sys.argv[idx + 1])
    
    # Load .env.production
    env_path = Path(__file__).parent.parent / '.env.production'
    if not env_path.exists():
        print(f"❌ .env.production not found: {env_path}")
        sys.exit(1)
    
    print(f"📄 Loading environment from: {env_path}")
    with open(env_path) as f:
        for line in f:
            if '=' in line and not line.strip().startswith('#'):
                key_raw, val = line.strip().split('=', 1)
                key_clean = key_raw.strip()
                val_clean = val.strip().strip('"').strip("'")
                os.environ[key_clean] = val_clean
    
    # Supabase setup
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not all([url, key]):
        print("❌ Missing env vars in .env.production")
        print(f"   NEXT_PUBLIC_SUPABASE_URL: {'✓' if url else '✗'}")
        print(f"   SUPABASE_SERVICE_ROLE_KEY: {'✓' if key else '✗'}")
        sys.exit(1)
    
    print(f"🔗 Connecting to: {url}")
    supabase = create_client(url, key)
    
    print("=" * 60)
    print("📤 UPLOAD MISSING IMAGES TO STORAGE (v2)")
    print("=" * 60)
    
    # Find export directory
    export_dirs = list(dataset_dir.glob("export_*"))
    if not export_dirs:
        print(f"❌ No export_* directories in {dataset_dir}")
        sys.exit(1)
    
    export_dir = sorted(export_dirs)[-1]
    print(f"📁 Using dataset: {export_dir.name}")
    
    # 1. Get images from DB
    print("\n📥 Fetching images from database...")
    result = supabase.table('images').select('recognition_id, image_type, storage_path').execute()
    db_images = result.data
    
    print(f"✅ Found {len(db_images)} images in DB")
    
    if limit:
        db_images = db_images[:limit]
        print(f"⚠️  LIMITED to {limit} images")
    
    # 2. Check which files exist in storage
    print("\n🔍 Checking storage...")
    missing_images = []
    checked = 0
    
    for img in tqdm(db_images, desc="Checking storage"):
        try:
            # Try to get file info
            storage_path = img['storage_path']
            # Remove 'recognitions/' prefix for storage API
            file_path = storage_path.replace('recognitions/', '')
            
            result = supabase.storage.from_('recognition-images').list(
                path=file_path.rsplit('/', 1)[0]
            )
            
            # Check if file exists in list
            filename = file_path.rsplit('/', 1)[1]
            exists = any(f['name'] == filename for f in result)
            
            if not exists:
                missing_images.append(img)
            
            checked += 1
            
            # Rate limit
            if checked % 50 == 0:
                time.sleep(0.5)
                
        except Exception as e:
            # If error, assume missing
            missing_images.append(img)
    
    print(f"✅ Checked {len(db_images)} images")
    print(f"⚠️  Missing: {len(missing_images)}")
    
    if not missing_images:
        print("\n✅ All images already uploaded!")
        sys.exit(0)
    
    # 3. Find local files for missing images
    print("\n🔍 Finding local files...")
    upload_tasks = []
    not_found_locally = []
    
    images_by_rec = {}
    for img in missing_images:
        rec_id = img['recognition_id']
        if rec_id not in images_by_rec:
            images_by_rec[rec_id] = []
        images_by_rec[rec_id].append(img)
    
    for rec_id, images in tqdm(images_by_rec.items(), desc="Scanning"):
        rec_dir = export_dir / rec_id
        
        if not rec_dir.exists():
            not_found_locally.extend(images)
            continue
        
        photos_dir = rec_dir / 'photos'
        if not photos_dir.exists():
            not_found_locally.extend(images)
            continue
        
        for img in images:
            image_type = img['image_type']
            storage_path = img['storage_path']
            
            # Find image file
            pattern = f"{rec_id}_*_{'Main' if image_type == 'main' else 'Qualifying'}.jpg"
            image_files = list(photos_dir.glob(pattern))
            
            if not image_files:
                not_found_locally.append(img)
                continue
            
            local_path = image_files[0]
            
            upload_tasks.append({
                'local_path': str(local_path),
                'storage_path': storage_path,
                'recognition_id': rec_id,
                'image_type': image_type
            })
    
    print(f"✅ Found {len(upload_tasks)} files to upload")
    
    if not_found_locally:
        print(f"⚠️  {len(not_found_locally)} files not found locally")
    
    if not upload_tasks:
        print("\n❌ No files to upload!")
        sys.exit(0)
    
    # 4. Upload sequentially with retry
    print(f"\n📤 Uploading {len(upload_tasks)} images...")
    print("   Sequential upload (more reliable but slower)")
    
    uploaded = 0
    failed = []
    
    for task in tqdm(upload_tasks, desc="Uploading"):
        max_retries = 5
        success = False
        
        for attempt in range(max_retries):
            try:
                with open(task['local_path'], 'rb') as f:
                    supabase.storage.from_('recognition-images').upload(
                        task['storage_path'],
                        f,
                        {'content-type': 'image/jpeg', 'upsert': 'true'}
                    )
                uploaded += 1
                success = True
                break
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep(2)
                    continue
                failed.append(f"{task['storage_path']}: {e}")
        
        if not success:
            failed.append(f"{task['storage_path']}: Max retries exceeded")
        
        # Small delay between uploads
        time.sleep(0.1)
    
    print("\n" + "=" * 60)
    print("✅ UPLOAD COMPLETE!")
    print("=" * 60)
    print(f"   Uploaded: {uploaded}/{len(upload_tasks)}")
    
    if failed:
        print(f"   Failed: {len(failed)}")
        print("\nFailed uploads:")
        for err in failed[:20]:
            print(f"   - {err}")
        if len(failed) > 20:
            print(f"   ... and {len(failed) - 20} more")
    
    if not_found_locally:
        print(f"\n⚠️  Not found locally: {len(not_found_locally)}")

if __name__ == "__main__":
    main()

